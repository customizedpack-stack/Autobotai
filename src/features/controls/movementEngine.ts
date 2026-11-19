import { bus } from '../../core/bus/connectorBus';
import { canDrive, useRobotStateStore, type ActuatorRuntime } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import type { Transform } from '../../types/scene';
import { measureDriveGeometry, type DriveGeometry } from '../robot-model/drive';
import { wrapAngle } from '../robot-model/kinematics';
import { axisAngle, compose, multiply, transformDirection } from '../robot-model/mat4';
import { matrixToTransform, transformToMatrix } from '../robot-model/transforms';
import type { CommandType, RobotCommand } from './commands';
import { computeWheelSpeeds, integratePose, limitWheelSpeeds, twistFromIntent, twistFromWheels, type Twist } from './differentialDrive';

/**
 * Kinematic movement engine (no physics).
 *
 * Receives VALIDATED C2 commands, runs a fixed 60 Hz timestep outside React,
 * moves the drive root's live pose and the wheel joints' live positions in
 * robotStateStore. Child components follow through the normal hierarchy.
 * Only one loop can run at a time.
 *
 * Kinematic engine. With the Physics engine selected, the physics controller is
 * registered as the external controller and this loop does not step the robot.
 */

export const STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;

export type CommandStatus = 'executing' | 'completed' | 'stopped' | 'superseded' | 'limited' | 'failed';

interface Pending {
  commandId: string;
  until: number | null;
}

interface JointMove {
  commandId: string;
  target: number;
  maxVelocity: number;
  actuatorId: string;
}

interface Scheduler {
  request: (cb: (now: number) => void) => number;
  cancel: (id: number) => void;
}

const defaultScheduler: Scheduler | null =
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? { request: (cb) => window.requestAnimationFrame(cb), cancel: (id) => window.cancelAnimationFrame(id) }
    : null;

let scheduler: Scheduler | null = defaultScheduler;
let frameId: number | null = null;
let lastFrame = 0;
let accumulator = 0;
let simTime = 0;
let drive: Pending | null = null;
let turn: Pending | null = null;
const jointMoves = new Map<string, JointMove>();
let geometryCache: { key: unknown[]; result: ReturnType<typeof measureDriveGeometry> } | null = null;

function publishStatus(commandId: string, type: CommandType, status: CommandStatus, detail?: string): void {
  bus.publish('command.status', { commandId, type, status, ...(detail ? { detail } : {}) });
}

/** Shared by the physics controller, so both engines report command progress the same way. */
export const publishCommandStatus = publishStatus;

/**
 * Phase 5: an alternative movement controller (the physics simulation). While one is
 * registered, accepted C2 commands go to it and the kinematic loop never runs, so
 * the two engines can never move the robot at the same time.
 */
export interface ExternalMovementController {
  readonly name: 'physics';
  execute: (command: RobotCommand) => void;
}

let external: ExternalMovementController | null = null;

/** Register (or with null, remove) the active alternative controller. Stops kinematic motion first. */
export function setExternalController(controller: ExternalMovementController | null): void {
  stopEverything('stopped');
  simTime = 0;
  external = controller;
}

/** Which engine moves the robot right now. */
export function activeMovementController(): 'kinematic' | 'physics' {
  return external ? external.name : 'kinematic';
}

function driveGeometry(): { geometry: DriveGeometry; rootId: string; leftActuatorMax: number; rightActuatorMax: number; maxLinearSpeed: number; maxAngularSpeed: number; leftActuatorId?: string; rightActuatorId?: string } | { error: string } {
  const { objects, joints, controllers, actuators } = useSceneStore.getState();
  const controller = controllers.find((c) => c.type === 'differentialDrive');
  if (!controller) return { error: 'No drive controller.' };
  const key = [objects, joints, controller];
  if (!geometryCache || geometryCache.key.some((k, i) => k !== key[i])) {
    geometryCache = { key, result: measureDriveGeometry(controller, objects, joints) };
  }
  const result = geometryCache.result;
  if (!result.ok) return { error: result.errors.join(' ') };
  const left = actuators.find((a) => a.jointId === controller.leftJointId);
  const right = actuators.find((a) => a.jointId === controller.rightJointId);
  return {
    geometry: result.geometry,
    rootId: controller.rootComponentId,
    leftActuatorMax: left?.maxVelocity ?? Infinity,
    rightActuatorMax: right?.maxVelocity ?? Infinity,
    maxLinearSpeed: controller.maxLinearSpeed,
    maxAngularSpeed: controller.maxAngularSpeed,
    leftActuatorId: left?.id,
    rightActuatorId: right?.id,
  };
}

/** Move a root transform along a twist for dt seconds (planar: X/Z position, yaw about +Y). */
export function advanceRootTransform(t: Transform, twist: Twist, dt: number): Transform {
  const m = transformToMatrix(t);
  const forward = transformDirection(m, [1, 0, 0]);
  const heading = Math.atan2(-forward[2], forward[0]);
  const next = integratePose({ x: t.position[0], z: t.position[2], heading }, twist, dt);
  const rotated = multiply(axisAngle([0, 1, 0], next.heading - heading), compose([0, 0, 0], t.rotation, t.scale));
  rotated[12] = next.x;
  rotated[13] = t.position[1];
  rotated[14] = next.z;
  return matrixToTransform(rotated);
}

function isActive(): boolean {
  const { intent } = useRobotStateStore.getState().movement;
  return intent.linear !== 0 || intent.angular !== 0 || jointMoves.size > 0;
}

function ensureLoop(): void {
  if (frameId !== null || !scheduler || !isActive()) return;
  lastFrame = -1;
  accumulator = 0;
  const frame = (now: number) => {
    if (lastFrame < 0) lastFrame = now;
    accumulator += Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
    lastFrame = now;
    while (accumulator >= STEP_SECONDS) {
      step(STEP_SECONDS);
      accumulator -= STEP_SECONDS;
    }
    frameId = isActive() && scheduler ? scheduler.request(frame) : null;
  };
  frameId = scheduler.request(frame);
}

function stopLoop(): void {
  if (frameId !== null && scheduler) scheduler.cancel(frameId);
  frameId = null;
}

/** Advance the simulation by dt seconds. Called by the loop; tests may call it directly. */
export function step(dt: number): void {
  // The kinematic engine never steps while another controller is in charge.
  if (external) return;
  const robot = useRobotStateStore.getState();
  if (!canDrive(robot.mode)) return;
  simTime += dt;
  const intent = { ...robot.movement.intent };

  if (drive?.until !== null && drive && simTime >= drive.until!) {
    publishStatus(drive.commandId, 'drive', 'completed');
    drive = null;
    intent.linear = 0;
  }
  if (turn?.until !== null && turn && simTime >= turn.until!) {
    publishStatus(turn.commandId, 'turn', 'completed');
    turn = null;
    intent.angular = 0;
  }

  const rootPoses = { ...robot.rootPoses };
  const jointPositions = { ...robot.jointPositions };
  const actuators: Record<string, ActuatorRuntime> = { ...robot.actuators };
  let movement = { ...robot.movement, intent };

  if (intent.linear !== 0 || intent.angular !== 0) {
    const setup = driveGeometry();
    if ('error' in setup) {
      movement = { ...movement, status: 'stopped', intent: { linear: 0, angular: 0 }, twist: { linear: 0, angular: 0 }, lastError: setup.error };
      drive = null;
      turn = null;
    } else {
      const { geometry, rootId } = setup;
      const requested = twistFromIntent(intent, robot.speedPercent / 100, setup);
      const raw = computeWheelSpeeds(requested, geometry);
      if (!raw.ok) {
        movement = { ...movement, status: 'stopped', intent: { linear: 0, angular: 0 }, lastError: raw.errors.join(' ') };
      } else {
        const { speeds, limited } = limitWheelSpeeds(raw.speeds, setup.leftActuatorMax, setup.rightActuatorMax);
        const twist = twistFromWheels(speeds.leftLinear, speeds.rightLinear, geometry.trackWidth);
        const design = useSceneStore.getState().objects.find((o) => o.id === rootId);
        if (design) rootPoses[rootId] = advanceRootTransform(rootPoses[rootId] ?? design.transform, twist, dt);
        const { left, right } = geometry;
        jointPositions[left.jointId] = wrapAngle((jointPositions[left.jointId] ?? 0) + left.spinSign * speeds.leftAngular * dt);
        jointPositions[right.jointId] = wrapAngle((jointPositions[right.jointId] ?? 0) + right.spinSign * speeds.rightAngular * dt);
        const state = limited ? 'limited' : 'active';
        if (setup.leftActuatorId) actuators[setup.leftActuatorId] = { target: speeds.leftAngular, velocity: speeds.leftAngular, state };
        if (setup.rightActuatorId) actuators[setup.rightActuatorId] = { target: speeds.rightAngular, velocity: speeds.rightAngular, state };
        movement = {
          ...movement,
          status: limited ? 'limited' : 'moving',
          twist,
          wheels: { left: speeds.leftAngular, right: speeds.rightAngular },
          distance: movement.distance + Math.abs(twist.linear) * dt,
        };
      }
    }
  } else if (robot.movement.status === 'moving' || robot.movement.status === 'limited') {
    movement = { ...movement, status: 'idle', twist: { linear: 0, angular: 0 }, wheels: { left: 0, right: 0 } };
    for (const [id, a] of Object.entries(actuators)) if (a.state === 'active' || a.state === 'limited') actuators[id] = { ...a, target: 0, velocity: 0, state: 'idle' };
  }

  // Position-controlled joints move toward their targets at the actuator's maximum speed.
  for (const [jointId, move] of jointMoves) {
    const current = jointPositions[jointId] ?? 0;
    const delta = move.target - current;
    const maxStep = move.maxVelocity * dt;
    if (Math.abs(delta) <= maxStep) {
      jointPositions[jointId] = move.target;
      actuators[move.actuatorId] = { target: move.target, velocity: 0, state: 'holding' };
      jointMoves.delete(jointId);
      publishStatus(move.commandId, 'setJointTarget', 'completed');
    } else {
      jointPositions[jointId] = current + Math.sign(delta) * maxStep;
      actuators[move.actuatorId] = { target: move.target, velocity: Math.sign(delta) * move.maxVelocity, state: 'active' };
    }
  }

  useRobotStateStore.getState().patch({ rootPoses, jointPositions, actuators, movement });
  stepObserver?.(dt);
}

/**
 * Phase 6: called after every kinematic step (the sensor manager samples here, so there
 * is no second loop). Only one observer; null removes it.
 */
let stepObserver: ((dt: number) => void) | null = null;
export function setStepObserver(observer: ((dt: number) => void) | null): void {
  stepObserver = observer;
}

function stopEverything(status: CommandStatus): void {
  if (drive) publishStatus(drive.commandId, 'drive', status);
  if (turn) publishStatus(turn.commandId, 'turn', status);
  for (const move of jointMoves.values()) publishStatus(move.commandId, 'setJointTarget', status);
  drive = null;
  turn = null;
  jointMoves.clear();
  stopLoop();
}

/** Execute an already validated command. */
export function execute(command: RobotCommand): void {
  if (external) {
    external.execute(command);
    return;
  }
  const robot = useRobotStateStore.getState();
  const intent = { ...robot.movement.intent };
  const payload = command.payload as Record<string, unknown>;
  const until = (ms: unknown) => (typeof ms === 'number' ? simTime + ms / 1000 : null);

  switch (command.type) {
    case 'drive': {
      if (drive) publishStatus(drive.commandId, 'drive', 'superseded');
      intent.linear = payload.speed as number;
      drive = intent.linear === 0 ? null : { commandId: command.id, until: until(payload.durationMs) };
      publishStatus(command.id, 'drive', intent.linear === 0 ? 'completed' : 'executing');
      break;
    }
    case 'turn': {
      if (turn) publishStatus(turn.commandId, 'turn', 'superseded');
      intent.angular = payload.rate as number;
      turn = intent.angular === 0 ? null : { commandId: command.id, until: until(payload.durationMs) };
      publishStatus(command.id, 'turn', intent.angular === 0 ? 'completed' : 'executing');
      break;
    }
    case 'setJointTarget': {
      const jointId = payload.jointId as string;
      const target = payload.target as number;
      const previous = jointMoves.get(jointId);
      if (previous) {
        publishStatus(previous.commandId, 'setJointTarget', 'superseded');
        jointMoves.delete(jointId);
      }
      if (payload.mode === 'preview') {
        robot.patch({ jointPositions: { ...robot.jointPositions, [jointId]: target } });
        publishStatus(command.id, 'setJointTarget', 'completed');
        return;
      }
      const actuator = useSceneStore.getState().actuators.find((a) => a.jointId === jointId)!;
      jointMoves.set(jointId, { commandId: command.id, target, maxVelocity: actuator.maxVelocity, actuatorId: actuator.id });
      publishStatus(command.id, 'setJointTarget', 'executing');
      break;
    }
    case 'stop': {
      stopEverything('stopped');
      robot.patch({
        movement: { intent: { linear: 0, angular: 0 }, twist: { linear: 0, angular: 0 }, wheels: { left: 0, right: 0 }, status: 'stopped' },
        actuators: Object.fromEntries(Object.entries(robot.actuators).map(([id, a]) => [id, { ...a, target: 0, velocity: 0, state: 'idle' as const }])),
      });
      publishStatus(command.id, 'stop', 'completed');
      return;
    }
    case 'reset': {
      stopEverything('stopped');
      robot.resetRuntime();
      simTime = 0;
      publishStatus(command.id, 'reset', 'completed');
      return;
    }
  }
  robot.patch({ movement: { intent, lastCommand: { id: command.id, type: command.type }, lastError: null } });
  ensureLoop();
}

/** Stop the loop and forget all pending motion (used when leaving Control Mode or closing a project). */
export function shutdown(): void {
  stopEverything('stopped');
  simTime = 0;
  geometryCache = null;
}

/** Tests: replace the frame scheduler (null = no automatic loop; call step() manually). */
export function setScheduler(next: Scheduler | null): void {
  stopLoop();
  scheduler = next;
}

export function isLoopRunning(): boolean {
  return frameId !== null;
}
