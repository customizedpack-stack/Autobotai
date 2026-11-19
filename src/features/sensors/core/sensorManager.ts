import { bus } from '../../../core/bus/connectorBus';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotSensor, SensorType } from '../../../types/sensor';
import { log } from '../../../utils/logger';
import { isLoopRunning, setStepObserver } from '../../controls/movementEngine';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { measureDriveGeometry, type DriveGeometry } from '../../robot-model/drive';
import { sampleDistance } from '../distance/distanceSensor';
import { EncoderState } from '../encoders/wheelEncoder';
import { ImuState, sampleImu } from '../imu/imuSensor';
import { createKinematicSensorSource, type KinematicSensorSource } from '../sources/kinematicSource';
import { sensorStream } from '../stream/sensorStream';
import { useSensorStore } from './sensorStore';
import type { EncoderReading, OdometryEstimate, ReadingBase, SensorReading, SensorSource, SensorSourceKind } from './sensorTypes';

/**
 * Sensor manager (Phase 6): the single owner of sensor sampling.
 *
 * - No loop of its own. The active engine calls tick(dt) after each of its steps:
 *   the physics simulation manager after every 1/60 s physics tick, the kinematic
 *   movement engine after every kinematic step (through its step observer).
 * - Every sensor has an update rate (10/20/30/60 Hz); it is sampled when its next
 *   sample time is reached in simulated time. Encoders also integrate every tick so
 *   rotation is counted continuously.
 * - Readings go to the C3 Sensor Stream; the UI snapshot is refreshed at most 10×/s.
 * - Physics paused → no ticks → no new readings (they are marked stale). Physics
 *   stopped or Build Mode → the stream is off and readings are cleared.
 * - Kinematic: distance sensors report "needs the Physics engine"; encoders and the
 *   IMU follow the kinematic pose. While the kinematic robot stands still there are
 *   no steps, so a read samples the resting state directly.
 */

interface Runtime {
  config: RobotSensor;
  period: number;
  nextDue: number;
  sequence: number;
  encoder?: EncoderState;
  /** Encoder rate from the last tick (kinematic: computed from angle changes). */
  tickRate?: number;
  imu?: ImuState;
  lastValid: boolean | null;
  lastError?: string;
  lastSampleHost: number;
}

let source: SensorSource | null = null;
let session = 0;
let time = 0;
let seenGeneration = -1;
const runtimes = new Map<string, Runtime>();
let lastUiFlush = 0;
let uiDirty = false;
let odometry: (OdometryEstimate & { leftRaw?: number; rightRaw?: number; started: boolean }) | null = null;
let driveCache: { key: unknown[]; geometry: DriveGeometry | null; leftJointId?: string; rightJointId?: string; rootId?: string } | null = null;

const now = () => performance.now();
const periodOf = (config: RobotSensor) => 1 / config.rateHz;

function eventBase(r: Runtime) {
  return { sensorId: r.config.id, sensorType: r.config.type as SensorType, timestamp: now(), session, source: source?.kind ?? null };
}

function emit(r: Runtime, event: 'started' | 'stopped' | 'enabled' | 'disabled' | 'error' | 'recovered' | 'reset', detail?: string): void {
  const reading = sensorStream.latest(r.config.id) ?? null;
  bus.publish('sensor.event', { ...eventBase(r), event, valid: reading?.valid ?? false, reading, ...(detail ? { detail } : {}) });
}

function streamState(): 'off' | 'running' | 'paused' {
  if (!source) return 'off';
  if (source.kind === 'physics' && useSimulationStore.getState().state === 'paused') return 'paused';
  return 'running';
}

// ── Configuration (from the robot model) ──

function makeRuntime(config: RobotSensor): Runtime {
  return {
    config,
    period: periodOf(config),
    nextDue: time,
    sequence: 0,
    ...(config.type === 'encoder' ? { encoder: new EncoderState() } : {}),
    ...(config.type === 'imu' ? { imu: new ImuState() } : {}),
    lastValid: null,
    lastSampleHost: 0,
  };
}

/** Bring runtimes in line with the saved sensor list. No duplicates: one runtime per id. */
function syncConfigs(sensors: readonly RobotSensor[]): void {
  const ids = new Set(sensors.map((s) => s.id));
  for (const [id, r] of runtimes) {
    if (ids.has(id)) continue;
    runtimes.delete(id);
    sensorStream.clear(id);
    if (source) emit(r, 'stopped', 'Sensor removed.');
  }
  for (const config of sensors) {
    const existing = runtimes.get(config.id);
    if (!existing) {
      const r = makeRuntime(config);
      runtimes.set(config.id, r);
      if (source && config.enabled) {
        emit(r, 'started');
        sampleNow(r, { atRest: source.kind === 'kinematic' && !isLoopRunning() });
      }
      continue;
    }
    if (existing.config === config) continue;
    const before = existing.config;
    existing.config = config;
    existing.period = periodOf(config);
    // A moved sensor or a different joint starts a fresh history.
    const geometryChanged = JSON.stringify({ ...before, name: '', enabled: true, rateHz: 0 }) !== JSON.stringify({ ...config, name: '', enabled: true, rateHz: 0 });
    if (geometryChanged) {
      existing.imu?.reset();
      existing.encoder?.rebase(source && existing.config.type === 'encoder' ? source.jointAngle(existing.config.jointId) : null);
    }
    if (before.enabled !== config.enabled && source) {
      if (config.enabled) {
        existing.encoder?.rebase(source && existing.config.type === 'encoder' ? source.jointAngle(existing.config.jointId) : null);
        existing.imu?.reset();
        existing.nextDue = time;
        emit(existing, 'enabled');
        sampleNow(existing, { atRest: source.kind === 'kinematic' && !isLoopRunning() });
      } else {
        publishDisabled(existing);
        emit(existing, 'disabled');
      }
    }
  }
  driveCache = null;
  markUi(true);
}

// ── Sampling ──

function base(r: Runtime): Omit<ReadingBase, 'type' | 'valid'> {
  r.sequence += 1;
  return { sensorId: r.config.id, timestamp: now(), simTime: time, source: source?.kind ?? 'kinematic', stale: false, sequence: r.sequence };
}

function publishDisabled(r: Runtime): void {
  const reading = sensorStream.latest(r.config.id);
  const b = base(r);
  const disabled = { ...(reading ?? {}), ...b, type: r.config.type, valid: false, error: 'Sensor is disabled.' } as SensorReading;
  sensorStream.publish(disabled);
  r.lastValid = false;
  r.lastError = 'Sensor is disabled.';
  markUi(true);
}

function drive(): { geometry: DriveGeometry | null; leftJointId?: string; rightJointId?: string; rootId?: string } {
  const { objects, joints, controllers } = useSceneStore.getState();
  const controller = controllers.find((c) => c.type === 'differentialDrive');
  const key = [objects, joints, controller];
  if (!driveCache || driveCache.key.some((k, i) => k !== key[i])) {
    const result = controller ? measureDriveGeometry(controller, objects, joints) : null;
    driveCache = {
      key,
      geometry: result?.ok ? result.geometry : null,
      leftJointId: controller?.leftJointId,
      rightJointId: controller?.rightJointId,
      rootId: controller?.rootComponentId,
    };
  }
  return driveCache;
}

function sampleEncoder(r: Runtime, b: Omit<ReadingBase, 'type' | 'valid'>, atRest: boolean): EncoderReading {
  const config = r.config as Extract<RobotSensor, { type: 'encoder' }>;
  const state = r.encoder!;
  const sign = config.invert ? -1 : 1;
  const angle = source!.jointAngle(config.jointId);
  const reading = {
    ...b,
    type: 'encoder' as const,
    jointId: config.jointId,
    ticksPerRevolution: config.ticksPerRevolution,
  };
  if (angle === null) {
    return { ...reading, valid: false, error: 'The wheel joint of this encoder is not in the simulation.', angle: 0, angleDelta: 0, angularVelocity: 0, revolutions: 0, ticks: 0, distance: null };
  }
  // `|| 0` turns −0 (an inverted zero) into 0.
  const value = sign * state.raw || 0;
  const delta = sign * (state.raw - state.rawAtLastReading);
  state.rawAtLastReading = state.raw;
  const measuredRate = atRest ? 0 : (source!.jointRate(config.jointId) ?? r.tickRate ?? 0);
  const revolutions = value / (2 * Math.PI);
  const { geometry, leftJointId, rightJointId } = drive();
  const radius = geometry && (config.jointId === leftJointId || config.jointId === rightJointId) ? geometry.wheelRadius : null;
  return {
    ...reading,
    valid: true,
    angle: value,
    angleDelta: delta || 0,
    angularVelocity: sign * measuredRate || 0,
    revolutions,
    ticks: Math.trunc(revolutions * config.ticksPerRevolution),
    distance: radius === null ? null : value * radius,
  };
}

function sampleNow(r: Runtime, options: { atRest?: boolean } = {}): void {
  if (!source || !r.config.enabled) return;
  const b = base(r);
  let reading: SensorReading;
  switch (r.config.type) {
    case 'distance':
      reading = sampleDistance(r.config, source, b);
      break;
    case 'encoder':
      reading = sampleEncoder(r, b, options.atRest === true);
      break;
    case 'imu':
      reading = sampleImu(r.config, source, r.imu!, b, options);
      break;
  }
  r.lastSampleHost = b.timestamp;
  sensorStream.publish(reading);
  // Report errors once when they appear and once when they clear (warming up is not an error).
  const realError = !reading.valid && !reading.error?.startsWith('Warming up');
  if (realError && (r.lastValid !== false || r.lastError !== reading.error)) {
    emit(r, 'error', reading.error);
    log.warning('sensor', `Sensor "${r.config.name}": ${reading.error}`);
  } else if (reading.valid && r.lastValid === false && r.lastError && !r.lastError.startsWith('Warming up')) {
    emit(r, 'recovered');
  }
  r.lastValid = reading.valid;
  r.lastError = reading.error;
  markUi(false);
}

function updateOdometry(): void {
  if (!source || !odometry) return;
  const { geometry, leftJointId, rightJointId } = drive();
  const encoderFor = (jointId?: string) => [...runtimes.values()].find((r) => r.config.type === 'encoder' && r.config.enabled && (r.config as { jointId: string }).jointId === jointId);
  const left = encoderFor(leftJointId);
  const right = encoderFor(rightJointId);
  if (!geometry || !left?.encoder || !right?.encoder) {
    odometry = { ...odometry, available: false, reason: !geometry ? 'This robot has no working differential drive.' : 'Odometry needs enabled encoders on both drive wheels.' };
    return;
  }
  const lRaw = left.encoder.raw;
  const rRaw = right.encoder.raw;
  if (!odometry.started || odometry.leftRaw === undefined || odometry.rightRaw === undefined) {
    odometry = { ...odometry, started: true, leftRaw: lRaw, rightRaw: rRaw, available: true, reason: undefined };
    return;
  }
  const dl = (lRaw - odometry.leftRaw) * geometry.left.spinSign * geometry.wheelRadius;
  const dr = (rRaw - odometry.rightRaw) * geometry.right.spinSign * geometry.wheelRadius;
  const d = (dl + dr) / 2;
  const dHeading = (dr - dl) / geometry.trackWidth;
  const mid = odometry.heading + dHeading / 2;
  odometry = {
    ...odometry,
    available: true,
    reason: undefined,
    leftRaw: lRaw,
    rightRaw: rRaw,
    leftDistance: odometry.leftDistance + dl,
    rightDistance: odometry.rightDistance + dr,
    distance: odometry.distance + d,
    heading: odometry.heading + dHeading,
    x: odometry.x + d * Math.cos(mid),
    z: odometry.z - d * Math.sin(mid),
  };
}

function startOdometry(): void {
  // Start from the drive root's current pose (the same place the robot really is).
  const { rootId } = drive();
  const pose = rootId && source ? source.partPose(rootId) : null;
  let x = 0;
  let z = 0;
  let heading = 0;
  if (pose) {
    x = pose.position[0];
    z = pose.position[2];
    const q = pose.rotation;
    const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
    const fz = 2 * (q.x * q.z - q.w * q.y);
    heading = Math.atan2(-fz, fx);
  }
  odometry = { available: false, started: false, leftDistance: 0, rightDistance: 0, distance: 0, heading, x, z };
}

/** The robot jumped (start, reset, rebuild): restart every history. Counters go back to zero. */
function restartHistories(reason: string): void {
  for (const r of runtimes.values()) {
    r.encoder?.reset();
    r.encoder?.rebase(source && r.config.type === 'encoder' ? source.jointAngle(r.config.jointId) : null);
    r.imu?.reset();
    r.nextDue = time;
    if (source && r.config.enabled) emit(r, 'reset', reason);
  }
  startOdometry();
}

// ── Engine hooks ──

/** Advance sensor time by one engine step and take the samples that are due. */
export function tick(dt: number): void {
  if (!source || !(dt > 0)) return;
  if (source.generation() !== seenGeneration) {
    seenGeneration = source.generation();
    restartHistories('The robot was reset or the world was rebuilt.');
  }
  time += dt;
  for (const r of runtimes.values()) {
    if (!r.config.enabled || r.config.type !== 'encoder' || !r.encoder) continue;
    const angle = source.jointAngle(r.config.jointId);
    if (angle === null) continue;
    const before = r.encoder.raw;
    r.encoder.update(angle);
    r.tickRate = (r.encoder.raw - before) / dt;
  }
  updateOdometry();
  for (const r of runtimes.values()) {
    if (!r.config.enabled || time + 1e-9 < r.nextDue) continue;
    sampleNow(r);
    r.nextDue = r.nextDue + r.period > time ? r.nextDue + r.period : time + r.period;
  }
}

/** Refresh the UI snapshot (throttled to 10 Hz unless forced). Engines call it once per frame. */
export function flush(force = false): void {
  if (!uiDirty && !force) return;
  const t = now();
  if (!force && t - lastUiFlush < 100) return;
  lastUiFlush = t;
  uiDirty = false;
  const readings: Record<string, SensorReading> = {};
  for (const id of runtimes.keys()) {
    const reading = sensorStream.latest(id);
    if (reading) readings[id] = withStale(runtimes.get(id)!, reading);
  }
  useSensorStore.getState().set({ stream: streamState(), source: source?.kind ?? null, session, readings, odometry: odometry ? publicOdometry() : null });
}

function markUi(force: boolean): void {
  uiDirty = true;
  if (force || !source) flush(true);
}

function publicOdometry(): OdometryEstimate {
  const { leftRaw: _l, rightRaw: _r, started: _s, ...rest } = odometry!;
  void _l;
  void _r;
  void _s;
  return rest;
}

function withStale(r: Runtime, reading: SensorReading): SensorReading {
  let stale = false;
  if (!source) stale = true;
  else if (source.kind === 'physics' && useSimulationStore.getState().state !== 'running') stale = true;
  else if (source.kind === 'physics' || isLoopRunning()) stale = now() - reading.timestamp > 2000 * r.period + 100;
  return stale === reading.stale ? reading : { ...reading, stale };
}

/** Start sampling from an engine. Any previous source is detached first (never two). */
export function attachSource(next: SensorSource): void {
  if (source) detachSource('Switching sensor source.');
  source = next;
  session += 1;
  time = 0;
  seenGeneration = next.generation();
  sensorStream.clear();
  for (const r of runtimes.values()) {
    r.sequence = 0;
    r.lastValid = null;
    r.lastError = undefined;
  }
  restartHistories('Sensors started.');
  if (next.kind === 'kinematic') setStepObserver(onKinematicStep);
  bus.publish('sensor.stream', { state: streamState(), source: next.kind, session, sensors: runtimes.size });
  for (const r of runtimes.values()) if (r.config.enabled) emit(r, 'started');
  // Kinematic robots that stand still have no steps: take the first samples now.
  if (next.kind === 'kinematic') for (const r of runtimes.values()) sampleNow(r, { atRest: !isLoopRunning() });
  for (const r of runtimes.values()) if (!r.config.enabled) publishDisabled(r);
  flush(true);
}

/** Stop sampling: readings are cleared, no sensor produces data any more. */
export function detachSource(reason = 'Sensors stopped.'): void {
  if (!source) return;
  for (const r of runtimes.values()) if (r.config.enabled) emit(r, 'stopped', reason);
  if (source.kind === 'kinematic') setStepObserver(null);
  const kind = source.kind;
  source = null;
  odometry = null;
  sensorStream.clear();
  bus.publish('sensor.stream', { state: 'off', source: kind, session, sensors: runtimes.size });
  flush(true);
}

function onKinematicStep(dt: number): void {
  tick(dt);
  flush();
}

// ── Queries (UI and the Code Studio sensor API) ──

export function activeSource(): SensorSourceKind | null {
  return source?.kind ?? null;
}

export function sensorSession(): number {
  return session;
}

export function sensorConfigs(): RobotSensor[] {
  return [...runtimes.values()].map((r) => r.config);
}

export function sensorConfig(id: string): RobotSensor | undefined {
  return runtimes.get(id)?.config;
}

/**
 * Latest reading of a sensor, with its stale flag up to date. A resting kinematic
 * robot is sampled now (nothing can have changed since its last step).
 * Returns undefined only for an unknown sensor id.
 */
export function readSensor(id: string): SensorReading | undefined {
  const r = runtimes.get(id);
  if (!r) return undefined;
  if (!source) {
    const reason = useRobotStateStore.getState().mode === 'build' ? 'Sensors run in Control Mode and Code Studio.' : 'Start the physics simulation to read sensors.';
    return offReading(r, reason);
  }
  if (!r.config.enabled) return sensorStream.latest(id) ?? offReading(r, 'Sensor is disabled.');
  if (source.kind === 'kinematic' && !isLoopRunning() && now() - r.lastSampleHost > 1000 * r.period) sampleNow(r, { atRest: true });
  const reading = sensorStream.latest(id);
  return reading ? withStale(r, reading) : offReading(r, 'No reading yet: the first sample comes with the next simulation step.');
}

function offReading(r: Runtime, error: string): SensorReading {
  const b = { sensorId: r.config.id, timestamp: now(), simTime: time, source: source?.kind ?? 'kinematic', stale: true, sequence: 0, valid: false, error } as const;
  switch (r.config.type) {
    case 'distance':
      return { ...b, type: 'distance', distance: null, detected: false, status: 'no-hit', minRange: r.config.minRange, maxRange: r.config.maxRange, origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, rays: [] };
    case 'encoder':
      return { ...b, type: 'encoder', jointId: r.config.jointId, angle: 0, angleDelta: 0, angularVelocity: 0, revolutions: 0, ticks: 0, ticksPerRevolution: r.config.ticksPerRevolution, distance: null };
    case 'imu': {
      const zero = { x: 0, y: 0, z: 0 };
      return { ...b, type: 'imu', orientation: { x: 0, y: 0, z: 0, w: 1 }, euler: { roll: 0, pitch: 0, yaw: 0 }, angularVelocity: zero, linearAcceleration: zero, specificForce: zero, frame: r.config.frame };
    }
  }
}

/** Encoder counter back to zero (runtime only; the saved project does not change). */
export function resetEncoder(id: string): { ok: true } | { ok: false; error: string } {
  const r = runtimes.get(id);
  if (!r) return { ok: false, error: `No sensor with id "${id}".` };
  if (r.config.type !== 'encoder' || !r.encoder) return { ok: false, error: `"${id}" is not a wheel encoder.` };
  r.encoder.reset();
  if (source && r.config.enabled) sampleNow(r, { atRest: source.kind === 'kinematic' && !isLoopRunning() });
  emit(r, 'reset', 'Encoder counter reset.');
  log.info('sensor', `Encoder "${r.config.name}" reset to 0.`);
  markUi(true);
  return { ok: true };
}

export function resetAllEncoders(): void {
  for (const r of runtimes.values()) if (r.config.type === 'encoder') resetEncoder(r.config.id);
  startOdometry();
  flush(true);
}

export function currentOdometry(): OdometryEstimate | null {
  return odometry ? publicOdometry() : null;
}

// ── Wiring ──

let kinematicSource: KinematicSensorSource | null = null;
let connected = false;

/**
 * Kinematic sensors run while Control Mode or Code Studio is open with the Kinematic
 * engine. The physics simulation manager attaches and detaches its own source.
 */
function syncKinematic(): void {
  const mode = useRobotStateStore.getState().mode;
  const engine = useSimulationStore.getState().engine;
  const wanted = mode !== 'build' && engine === 'kinematic';
  if (wanted && source?.kind !== 'kinematic') {
    kinematicSource = createKinematicSensorSource();
    attachSource(kinematicSource);
  } else if (!wanted && source?.kind === 'kinematic') {
    detachSource(mode === 'build' ? 'Back in Build Mode.' : 'Switched to the Physics engine.');
  }
}

export function connectSensorManager(): void {
  if (connected) return;
  connected = true;
  syncConfigs(useSceneStore.getState().sensors);
  useSceneStore.subscribe((state, prev) => {
    if (state.sensors !== prev.sensors) syncConfigs(state.sensors);
    if (state.projectId !== prev.projectId) detachSource('Project closed.');
  });
  bus.subscribe('robot.modeChanged', () => syncKinematic());
  bus.subscribe('simulation.changed', ({ engine, state, previousState }) => {
    if (engine === 'kinematic') syncKinematic();
    else if (source?.kind === 'kinematic') detachSource('Switched to the Physics engine.');
    if (source?.kind === 'physics' && state !== previousState) {
      bus.publish('sensor.stream', { state: streamState(), source: 'physics', session, sensors: runtimes.size });
      flush(true);
    }
  });
  // A kinematic Reset makes the robot jump back to its design pose: restart histories.
  bus.subscribe('command.status', ({ type, status }) => {
    if (type !== 'reset' || status !== 'completed' || source?.kind !== 'kinematic' || !kinematicSource) return;
    kinematicSource.bump();
    seenGeneration = kinematicSource.generation();
    restartHistories('The robot was reset to its design pose.');
    for (const r of runtimes.values()) sampleNow(r, { atRest: true });
    flush(true);
  });
  // When the kinematic robot comes to rest there are no more steps: record the resting state once.
  useRobotStateStore.subscribe((state, prev) => {
    if (source?.kind !== 'kinematic' || state.movement.status === prev.movement.status) return;
    if (state.movement.status === 'idle' || state.movement.status === 'stopped') {
      for (const r of runtimes.values()) if (r.config.type === 'imu' || r.config.type === 'encoder') sampleNow(r, { atRest: true });
      flush(true);
    }
  });
  syncKinematic();
}

connectSensorManager();
