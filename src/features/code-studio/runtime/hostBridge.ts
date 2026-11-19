import { bus } from '../../../core/bus/connectorBus';
import { robotControl } from '../../controls/robotControlApi';
import type { SubmitResult } from '../../controls/commandBus';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { log } from '../../../utils/logger';
import type { ExecutionLimits } from './executionLimits';
import { validateArgs, type SandboxArgs, type SandboxOp } from './messageProtocol';
import { SandboxSensorBridge, type SensorOp, type SensorPush } from '../../sensors/api/sandboxSensorBridge';
import { SandboxCameraBridge, type CameraOp, type CameraPush } from '../../camera/api/sandboxCameraBridge';
import { DEFAULT_LIMITS } from './executionLimits';

/**
 * Host side of the restricted API bridge.
 *
 * Every request from a program is checked here and then executed through the
 * EXISTING Robot Control API (source 'code'), so it passes C2 validation and
 * appears in Bus Events like any other command. The bridge never writes to
 * robotStateStore or calls the movement engine directly.
 *
 * Promises returned to the program:
 * - timed drive / turn and joint targets resolve when the move has finished
 *   (C2 'command.status' completed / stopped / superseded);
 * - untimed drive / turn resolve as soon as C2 accepts them;
 * - C2 rejections reject with the C2 message.
 *
 * Pause: the bridge records what this session's robot was doing, stops the
 * robot through the API, holds new requests, and on resume re-issues the
 * remaining motion (timed moves continue for the time that was left).
 */

export class BridgeError extends Error {
  readonly kind: 'command' | 'validation';
  constructor(message: string, kind: 'command' | 'validation' = 'command') {
    super(message);
    this.name = 'RobotCommandError';
    this.kind = kind;
  }
}

/** Read-only operations: answered at once, also while paused (they never move the robot). */
const READ_ONLY_OPS = new Set<SandboxOp>(['getState', 'joints', 'joint.info', 'sensor.list', 'sensor.read', 'sensor.subscribe', 'sensor.unsubscribe', 'sensor.resetEncoder', 'sensor.odometry', 'camera.list', 'camera.state', 'camera.capture', 'camera.subscribe', 'camera.unsubscribe']);

/** Phase 6: sensor operations, handled by the run's SandboxSensorBridge (C3). */
const SENSOR_OPS = new Set<SandboxOp>(['sensor.list', 'sensor.read', 'sensor.subscribe', 'sensor.unsubscribe', 'sensor.resetEncoder', 'sensor.odometry']);

/** Phase 8: camera operations, handled by the run's SandboxCameraBridge (C3). */
const CAMERA_OPS = new Set<SandboxOp>(['camera.list', 'camera.state', 'camera.capture', 'camera.subscribe', 'camera.unsubscribe']);

/** Requests that would move the robot. A stop() during a pause supersedes the ones still held. */
const MOTION_OPS = new Set<SandboxOp>(['drive.forward', 'drive.backward', 'drive.set', 'turn.left', 'turn.right', 'turn.set', 'joint.setTarget', 'joint.preview']);

/** Operations that count as robot commands for the rate limit. */
const COMMAND_OPS = new Set<SandboxOp>(['drive.forward', 'drive.backward', 'drive.set', 'turn.left', 'turn.right', 'turn.set', 'stop', 'reset', 'joint.setTarget', 'joint.preview', 'setSpeedPercent']);

interface Motion {
  /** C2 command currently carrying this motion. */
  commandId: string;
  /** Signed amount: drive speed or turn rate (−1 … 1), or a joint target. */
  value: number;
  /** Total duration for timed moves (ms). */
  durationMs?: number;
  /** Running time already spent before the latest (re)start, ms. */
  spentMs: number;
  /** When the latest (re)start happened. */
  startedAt: number;
  /** Settles the program's promise when the motion ends (timed moves and joint targets). */
  settle?: { resolve: (v: unknown) => void; reject: (e: Error) => void };
}

interface PendingWait {
  remainingMs: number;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (v: unknown) => void;
}

interface Queued {
  op: SandboxOp;
  args: SandboxArgs;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface JointWaiter {
  jointId: string;
  resolve: (v: unknown) => void;
}

export interface HostBridgeOptions {
  sessionId: string;
  limits: Pick<ExecutionLimits, 'maxCommandsPerSecond' | 'maxWaitMs'> &
    Partial<
      Pick<
        ExecutionLimits,
        | 'maxPausedRequests'
        | 'maxSensorReadsPerSecond'
        | 'maxSensorSubscriptions'
        | 'maxSensorHz'
        | 'maxEncoderResetsPerSecond'
        | 'maxCameraCapturesPerSecond'
        | 'maxCameraPendingCaptures'
        | 'maxCameraSubscriptions'
        | 'maxCameraHz'
        | 'maxCameraBytesPerSecond'
      >
    >;
  now?: () => number;
  /** Phase 6: sends a host → worker message (sensor readings, Phase 8 camera frames, for subscriptions). */
  push?: (message: SensorPush | CameraPush) => void;
}

export class HostBridge {
  readonly sessionId: string;
  private readonly limits: HostBridgeOptions['limits'];
  private readonly now: () => number;
  private paused = false;
  private disposed = false;
  private drive: Motion | null = null;
  private turn: Motion | null = null;
  private readonly joints = new Map<string, Motion>();
  private readonly waits = new Set<PendingWait>();
  private readonly queue: Queued[] = [];
  private readonly jointWaiters = new Set<JointWaiter>();
  private readonly commandTimes: number[] = [];
  private readonly unsubscribers: (() => void)[] = [];
  private limitedWarned = false;
  /** C2 stop command issued during the current pause (later stops in the same pause are merged into it). */
  private pausedStopCommandId: string | null = null;
  private readonly maxPausedRequests: number;
  /** Phase 6: this run's sensor access (reads and subscriptions). */
  readonly sensors: SandboxSensorBridge;
  /** Phase 8: this run's camera access (captures and subscriptions). */
  readonly cameras: SandboxCameraBridge;

  constructor(options: HostBridgeOptions) {
    this.sessionId = options.sessionId;
    this.limits = options.limits;
    this.now = options.now ?? (() => performance.now());
    this.maxPausedRequests = options.limits.maxPausedRequests ?? 50;
    this.sensors = new SandboxSensorBridge({
      sessionId: this.sessionId,
      limits: {
        maxSensorReadsPerSecond: options.limits.maxSensorReadsPerSecond ?? DEFAULT_LIMITS.maxSensorReadsPerSecond,
        maxSensorSubscriptions: options.limits.maxSensorSubscriptions ?? DEFAULT_LIMITS.maxSensorSubscriptions,
        maxSensorHz: options.limits.maxSensorHz ?? DEFAULT_LIMITS.maxSensorHz,
        maxEncoderResetsPerSecond: options.limits.maxEncoderResetsPerSecond ?? DEFAULT_LIMITS.maxEncoderResetsPerSecond,
      },
      push: options.push ?? (() => undefined),
      now: this.now,
    });
    this.cameras = new SandboxCameraBridge({
      sessionId: this.sessionId,
      limits: {
        maxCameraCapturesPerSecond: options.limits.maxCameraCapturesPerSecond ?? DEFAULT_LIMITS.maxCameraCapturesPerSecond,
        maxCameraPendingCaptures: options.limits.maxCameraPendingCaptures ?? DEFAULT_LIMITS.maxCameraPendingCaptures,
        maxCameraSubscriptions: options.limits.maxCameraSubscriptions ?? DEFAULT_LIMITS.maxCameraSubscriptions,
        maxCameraHz: options.limits.maxCameraHz ?? DEFAULT_LIMITS.maxCameraHz,
        maxCameraBytesPerSecond: options.limits.maxCameraBytesPerSecond ?? DEFAULT_LIMITS.maxCameraBytesPerSecond,
      },
      push: options.push ?? (() => undefined),
      now: this.now,
    });
    this.unsubscribers.push(
      bus.subscribe('command.status', ({ commandId, status }) => this.onStatus(commandId, status)),
      useRobotStateStore.subscribe((state, prev) => {
        if (state.actuators !== prev.actuators) this.checkJointWaiters();
        if (state.movement.status === 'limited' && prev.movement.status !== 'limited' && !this.limitedWarned && this.drive) {
          this.limitedWarned = true;
          log.warning('code', 'Motor speed limited by actuator configuration.', { sessionId: this.sessionId });
        }
      }),
    );
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Requests currently held because the program is paused. */
  get queuedRequests(): number {
    return this.queue.length;
  }

  /** Handle one request from the program. */
  handle(op: SandboxOp, rawArgs: unknown): Promise<unknown> {
    if (this.disposed) return Promise.reject(new BridgeError('The program is no longer running.'));
    const parsed = validateArgs(op, rawArgs);
    if (!parsed.ok) return Promise.reject(new BridgeError(`${op}: ${parsed.reason}`, 'validation'));
    if (this.paused) return this.hold(op, parsed.value);
    return this.execute(op, parsed.value);
  }

  /**
   * While paused nothing that moves the robot is executed. Read-only requests are
   * answered at once; stop() is handled at once (it never enters the queue); everything
   * else waits, in order, until Resume, in a queue that never exceeds its limit.
   */
  private hold(op: SandboxOp, args: SandboxArgs): Promise<unknown> {
    if (READ_ONLY_OPS.has(op)) return this.execute(op, args);
    if (op === 'stop') return this.stopWhilePaused();
    if (this.queue.length >= this.maxPausedRequests) {
      return Promise.reject(
        new BridgeError(`Too many requests while the program is paused (limit ${this.maxPausedRequests}). Resume or stop the program first.`, 'validation'),
      );
    }
    return new Promise((resolve, reject) => this.queue.push({ op, args, resolve, reject }));
  }

  /**
   * stop() during a pause. The robot is already stopped by the pause, so nothing moves.
   * - The first stop of a pause goes through the existing API and C2 (validated and tracked).
   *   Repeated stops in the same pause are merged into it: no new command, no queue growth.
   * - The interrupted motion is settled as "stopped" and forgotten, so Resume cannot restart it.
   * - Motion requests still held from before this stop are superseded by it (settled, removed).
   *   Waits and other held requests keep their order.
   */
  private stopWhilePaused(): Promise<unknown> {
    for (const motion of this.activeMotions()) motion.settle?.resolve({ commandId: motion.commandId, status: 'stopped' });
    this.drive = null;
    this.turn = null;
    this.joints.clear();
    const kept: Queued[] = [];
    for (const item of this.queue) {
      if (MOTION_OPS.has(item.op)) item.resolve({ status: 'superseded', detail: 'Superseded by stop() while paused.' });
      else kept.push(item);
    }
    this.queue.splice(0, this.queue.length, ...kept);
    if (this.pausedStopCommandId) {
      return Promise.resolve({ commandId: this.pausedStopCommandId, status: 'completed', merged: true });
    }
    const result = robotControl.stop('code');
    if (!result.ok) return Promise.reject(this.reportRejected(result, 'stop'));
    this.reportAccepted(result, 'stop');
    this.pausedStopCommandId = result.command.id;
    return Promise.resolve({ commandId: result.command.id, status: 'completed' });
  }

  private execute(op: SandboxOp, args: SandboxArgs): Promise<unknown> {
    if (COMMAND_OPS.has(op) && !this.allowCommand()) {
      return Promise.reject(new BridgeError(`Too many robot commands: the limit is ${this.limits.maxCommandsPerSecond} per second. Add a wait between commands.`));
    }
    if (SENSOR_OPS.has(op)) return this.sensors.handle(op as SensorOp, args);
    if (CAMERA_OPS.has(op)) return this.cameras.handle(op as CameraOp, args);
    const n = (key: string) => args[key] as number | undefined;
    switch (op) {
      case 'drive.forward':
      case 'drive.backward': {
        const amount = Math.abs(n('speed') ?? 1);
        const signed = op === 'drive.forward' ? amount : -amount;
        return this.startMotion('drive', signed, n('durationMs'));
      }
      case 'drive.set':
        return this.startMotion('drive', n('speed')!, undefined);
      case 'turn.left':
      case 'turn.right': {
        const amount = Math.abs(n('rate') ?? 1);
        return this.startMotion('turn', op === 'turn.left' ? amount : -amount, n('durationMs'));
      }
      case 'turn.set':
        return this.startMotion('turn', n('rate')!, undefined);
      case 'stop':
        return this.simple(robotControl.stop('code'), 'stop');
      case 'reset':
        return this.simple(robotControl.reset('code'), 'reset');
      case 'joint.setTarget':
        return this.startJoint(args.jointId as string, n('target')!);
      case 'joint.preview': {
        const jointId = args.jointId as string;
        const missing = this.missingJoint(jointId);
        if (missing) return Promise.reject(missing);
        return this.simple(robotControl.joint(jointId).preview(n('target')!, 'code'), 'setJointTarget');
      }
      case 'joint.wait':
        return this.waitForJoint(args.jointId as string);
      case 'joint.info':
        return this.jointInfo(args.jointId as string);
      case 'joints':
        return Promise.resolve(this.jointList());
      case 'setSpeedPercent': {
        const value = n('value')!;
        if (value < 0 || value > 100) return Promise.reject(new BridgeError('Speed percent must be between 0 and 100.', 'validation'));
        robotControl.setSpeedPercent(value);
        return Promise.resolve({ speedPercent: useRobotStateStore.getState().speedPercent });
      }
      case 'getState':
        // A plain-data snapshot of the existing getState() result (it is copied when sent to the worker).
        return Promise.resolve(robotControl.getState());
      case 'wait':
        return this.wait(n('ms')!);
      default:
        return Promise.reject(new BridgeError(`Unknown operation "${String(op)}".`, 'validation'));
    }
  }

  // ── Rate limit ──
  private allowCommand(): boolean {
    const now = this.now();
    while (this.commandTimes.length > 0 && now - this.commandTimes[0]! >= 1000) this.commandTimes.shift();
    if (this.commandTimes.length >= this.limits.maxCommandsPerSecond) return false;
    this.commandTimes.push(now);
    return true;
  }

  // ── Commands ──
  private reportAccepted(result: SubmitResult, type: string): void {
    log.info('code', `Command accepted: ${type}.`, { sessionId: this.sessionId, commandId: result.command?.id });
  }

  private reportRejected(result: SubmitResult, type: string): BridgeError {
    const message = result.errors.join(' ') || `Command "${type}" was rejected.`;
    log.error('code', `Command rejected: ${type}. ${message}`, { sessionId: this.sessionId, commandId: result.command?.id });
    return new BridgeError(message);
  }

  private simple(result: SubmitResult, type: string): Promise<unknown> {
    if (!result.ok) return Promise.reject(this.reportRejected(result, type));
    this.reportAccepted(result, type);
    return Promise.resolve({ commandId: result.command.id, status: 'completed' });
  }

  private submitMotion(kind: 'drive' | 'turn', value: number, durationMs: number | undefined): SubmitResult {
    const amount = Math.abs(value);
    if (kind === 'drive') {
      if (durationMs === undefined) return robotControl.drive.set(value, 'code');
      return value >= 0 ? robotControl.drive.forward({ speed: amount, durationMs, source: 'code' }) : robotControl.drive.backward({ speed: amount, durationMs, source: 'code' });
    }
    if (durationMs === undefined) return robotControl.turn.set(value, 'code');
    return value >= 0 ? robotControl.turn.left({ speed: amount, durationMs, source: 'code' }) : robotControl.turn.right({ speed: amount, durationMs, source: 'code' });
  }

  private startMotion(kind: 'drive' | 'turn', value: number, durationMs: number | undefined): Promise<unknown> {
    const result = this.submitMotion(kind, value, durationMs);
    if (!result.ok) return Promise.reject(this.reportRejected(result, kind));
    this.reportAccepted(result, kind);
    // Releasing (0) or an untimed motion: done as soon as it is accepted.
    if (value === 0 || durationMs === undefined) {
      this[kind] = value === 0 ? null : { commandId: result.command.id, value, spentMs: 0, startedAt: this.now() };
      return Promise.resolve({ commandId: result.command.id, status: 'accepted' });
    }
    return new Promise((resolve, reject) => {
      this[kind] = { commandId: result.command.id, value, durationMs, spentMs: 0, startedAt: this.now(), settle: { resolve, reject } };
    });
  }

  private missingJoint(jointId: string): BridgeError | null {
    const joint = useSceneStore.getState().joints.find((j) => j.id === jointId);
    return joint ? null : new BridgeError(`Joint "${jointId}" does not exist in this robot.`);
  }

  private startJoint(jointId: string, target: number): Promise<unknown> {
    const missing = this.missingJoint(jointId);
    if (missing) return Promise.reject(missing);
    const result = robotControl.joint(jointId).setTarget(target, 'code');
    if (!result.ok) return Promise.reject(this.reportRejected(result, 'setJointTarget'));
    this.reportAccepted(result, 'setJointTarget');
    return new Promise((resolve, reject) => {
      this.joints.set(jointId, { commandId: result.command.id, value: target, spentMs: 0, startedAt: this.now(), settle: { resolve, reject } });
    });
  }

  private onStatus(commandId: string, status: string): void {
    if (status === 'executing' || status === 'limited') return;
    // While paused, the "stopped" statuses come from our own pause stop; the motions resume later.
    if (this.paused && status === 'stopped') return;
    for (const kind of ['drive', 'turn'] as const) {
      const motion = this[kind];
      if (motion?.commandId !== commandId) continue;
      this[kind] = null;
      if (status === 'failed') motion.settle?.reject(new BridgeError(`The ${kind} command failed.`));
      else motion.settle?.resolve({ commandId, status });
    }
    for (const [jointId, motion] of this.joints) {
      if (motion.commandId !== commandId) continue;
      this.joints.delete(jointId);
      if (status === 'failed') motion.settle?.reject(new BridgeError('The joint command failed.'));
      else motion.settle?.resolve({ commandId, status });
    }
  }

  // ── Joints ──
  private jointMoving(jointId: string): boolean {
    const actuator = useSceneStore.getState().actuators.find((a) => a.jointId === jointId);
    if (!actuator) return false;
    const runtime = useRobotStateStore.getState().actuators[actuator.id];
    return runtime?.state === 'active' || runtime?.state === 'limited';
  }

  private waitForJoint(jointId: string): Promise<unknown> {
    const missing = this.missingJoint(jointId);
    if (missing) return Promise.reject(missing);
    if (!this.jointMoving(jointId) && !this.joints.has(jointId)) return Promise.resolve({ jointId, reached: true });
    return new Promise((resolve) => this.jointWaiters.add({ jointId, resolve }));
  }

  private checkJointWaiters(): void {
    if (this.paused) return;
    for (const waiter of [...this.jointWaiters]) {
      if (!this.jointMoving(waiter.jointId) && !this.joints.has(waiter.jointId)) {
        this.jointWaiters.delete(waiter);
        waiter.resolve({ jointId: waiter.jointId, reached: true });
      }
    }
  }

  private jointList() {
    const { joints, actuators } = useSceneStore.getState();
    return joints
      .filter((j) => j.type !== 'fixed')
      .map((j) => ({ id: j.id, name: j.name, type: j.type, lower: j.limits.lower, upper: j.limits.upper, hasActuator: actuators.some((a) => a.jointId === j.id && a.enabled) }));
  }

  private jointInfo(jointId: string): Promise<unknown> {
    const joint = useSceneStore.getState().joints.find((j) => j.id === jointId);
    if (!joint) return Promise.reject(new BridgeError(`Joint "${jointId}" does not exist in this robot.`));
    const position = useRobotStateStore.getState().jointPositions[jointId] ?? 0;
    const actuator = useSceneStore.getState().actuators.find((a) => a.jointId === jointId);
    return Promise.resolve({
      id: joint.id,
      name: joint.name,
      type: joint.type,
      position,
      lower: joint.limits.lower,
      upper: joint.limits.upper,
      hasActuator: Boolean(actuator?.enabled),
      moving: this.jointMoving(jointId),
    });
  }

  // ── Waits ──
  private wait(ms: number): Promise<unknown> {
    if (ms < 0 || ms > this.limits.maxWaitMs) {
      return Promise.reject(new BridgeError(`wait() takes 0 to ${this.limits.maxWaitMs} ms.`, 'validation'));
    }
    return new Promise((resolve) => {
      const pending: PendingWait = { remainingMs: ms, startedAt: this.now(), timer: null, resolve };
      this.waits.add(pending);
      this.armWait(pending);
    });
  }

  private armWait(pending: PendingWait): void {
    pending.startedAt = this.now();
    pending.timer = setTimeout(() => {
      this.waits.delete(pending);
      pending.resolve({ waited: true });
    }, pending.remainingMs);
  }

  // ── Pause / resume ──
  /** Stop the robot through the API and hold this session's activity. */
  pause(): void {
    if (this.paused || this.disposed) return;
    this.paused = true;
    const now = this.now();
    for (const motion of this.activeMotions()) {
      motion.spentMs += now - motion.startedAt;
    }
    for (const pending of this.waits) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = null;
      pending.remainingMs = Math.max(0, pending.remainingMs - (now - pending.startedAt));
    }
    this.sensors.pause();
    this.cameras.pause();
    robotControl.stop('code');
  }

  /** Continue: re-issue the interrupted motion, restart waits, then run held requests in order. */
  resume(): void {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.pausedStopCommandId = null;
    for (const kind of ['drive', 'turn'] as const) {
      const motion = this[kind];
      if (!motion) continue;
      const remaining = motion.durationMs === undefined ? undefined : Math.max(1, Math.round(motion.durationMs - motion.spentMs));
      const result = this.submitMotion(kind, motion.value, remaining);
      if (!result.ok) {
        this[kind] = null;
        motion.settle?.reject(this.reportRejected(result, kind));
        continue;
      }
      motion.commandId = result.command.id;
      motion.startedAt = this.now();
    }
    for (const [jointId, motion] of this.joints) {
      const result = robotControl.joint(jointId).setTarget(motion.value, 'code');
      if (!result.ok) {
        this.joints.delete(jointId);
        motion.settle?.reject(this.reportRejected(result, 'setJointTarget'));
        continue;
      }
      motion.commandId = result.command.id;
      motion.startedAt = this.now();
    }
    for (const pending of this.waits) this.armWait(pending);
    const held = this.queue.splice(0);
    for (const item of held) this.execute(item.op, item.args).then(item.resolve, item.reject);
    this.checkJointWaiters();
    this.sensors.resume();
    this.cameras.resume();
  }

  private activeMotions(): Motion[] {
    return [this.drive, this.turn, ...this.joints.values()].filter((m): m is Motion => m !== null);
  }

  /** End the session: cancel timers and listeners. Pending program promises are dropped (the worker is gone). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.waits) if (pending.timer) clearTimeout(pending.timer);
    this.waits.clear();
    // Held requests are rejected (not dropped), so no promise is left unresolved.
    for (const item of this.queue.splice(0)) item.reject(new BridgeError('The program is no longer running.'));
    this.jointWaiters.clear();
    this.drive = null;
    this.turn = null;
    this.joints.clear();
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.sensors.dispose();
    this.cameras.dispose();
  }
}
