import { bus } from '../../core/bus/connectorBus';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { log } from '../../utils/logger';
import { dataOf, useBlueprintStore, type HistoryInput } from '../blueprint/blueprintStore';
import { catalogIfLoaded } from '../blueprint/catalog/catalog';
import type { HardwareProfile } from '../blueprint/model/types';
import { onSessionEnd } from '../controls/controlSession';
import { setRunGate, stopProgram, type RunRequest } from '../code-studio/runtime/executionManager';
import { useExecutionStore } from '../code-studio/runtime/executionStore';
import type { ProgramIssue } from '../code-studio/utils/programValidation';
import { setPhysicalSensorOverride } from '../sensors/api/sandboxSensorBridge';
import { checkPhysicalProgram } from './deploy/programCheck';
import { jogCommand, mixDifferential, physicalDistanceMeters, ZERO, type JogDirection, type WheelCommand } from './hal/differentialDrive';
import { useHardwareStore, connectionState, type Telemetry } from './hardwareStore';
import { physicalReadings, readingStatus } from './physicalTelemetry';
import { encode, parseDeviceLine, programHash, PROTOCOL_VERSION, type DeviceMessage } from './protocol/protocol';
import { validateHardware, type DeviceSummary, type ValidationResult } from './safety/validation';
import { SimulatedTransport } from './transport/simulatedDevice';
import type { HardwareTransport, TransportKind } from './transport/types';
import { WebSerialTransport } from './transport/webSerial';

/**
 * Hardware Connection Manager (Phase 10).
 *
 * The only code that talks to a device. It owns the transport, the handshake, the
 * heartbeat, the link watchdog, the arming interlocks and the Physical Hardware
 * Adapter loop. The program sandbox has no access to any of it.
 *
 * Safety model (see docs/hardware/SAFETY-AND-EMERGENCY-STOP.md):
 *  - The device boots disabled and only moves after an explicit ARM with the session id.
 *  - Every motion command is a DRIVE with a 300 ms lease, renewed every 100 ms while
 *    motion is wanted; if the browser stops (closed, crashed, frozen), the lease ends
 *    and the firmware stops the motors; after 1 s without any message it latches a FAULT.
 *  - The browser stops sending motion and closes the link if the device is silent for 1.5 s.
 *  - Nothing re-arms or restarts motion automatically, ever.
 */

export const TIMING = { heartbeatMs: 250, loopMs: 100, leaseMs: 300, linkTimeoutMs: 1500, handshakeMs: 5000, replyMs: 1500 };

let transport: HardwareTransport | null = null;
let session: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let pingSeq = 1;
let driveSeq = 1;
const pingSent = new Map<number, number>();
let lastSent: WheelCommand = ZERO;
let jog: WheelCommand | null = null;
let programStartedAt = 0;
let generation = 0;
let invalidWindow: number[] = [];

type Waiter = { kinds: DeviceMessage['kind'][]; resolve: (m: DeviceMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
let waiters: Waiter[] = [];

const store = () => useHardwareStore.getState();
const profile = (): HardwareProfile | null => useBlueprintStore.getState().blueprint.hardwareProfile ?? null;
const record = (events: HistoryInput[]) => useBlueprintStore.getState().record(events);

function hist(type: HistoryInput['type'], component: string, next = '', note = ''): HistoryInput {
  return { type, component, previous: '', next, note };
}

export function deviceSummary(): DeviceSummary {
  const s = store();
  return {
    connected: s.phase === 'open',
    handshake: s.phase === 'open' && s.device !== null,
    device: s.device?.device ?? null,
    board: s.device?.board ?? null,
    protocol: s.device?.protocol ?? null,
    caps: s.device?.caps ?? [],
    deviceState: s.deviceState,
    fault: s.lastFault?.code ?? null,
  };
}

export function currentValidation(): ValidationResult {
  const sc = useSceneStore.getState();
  const model = { objects: sc.objects, joints: sc.joints, actuators: sc.actuators, controllers: sc.controllers, sensors: sc.sensors };
  return validateHardware({ model, data: dataOf(useBlueprintStore.getState().blueprint), profile: profile(), device: deviceSummary(), catalogById: catalogIfLoaded()?.byId });
}

// ── Sending ──
async function send(line: string): Promise<boolean> {
  if (!transport) return false;
  try {
    await transport.write(line);
    if (!line.startsWith('PING') && !line.startsWith('DRIVE')) store().addLog('tx', line);
    return true;
  } catch (error) {
    store().addLog('error', `Send failed: ${String((error as Error)?.message ?? error)}`);
    return false;
  }
}

function waitFor(kinds: DeviceMessage['kind'][], timeoutMs = TIMING.replyMs): Promise<DeviceMessage> {
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      kinds,
      resolve,
      reject,
      timer: setTimeout(() => {
        waiters = waiters.filter((w) => w !== waiter);
        reject(new Error('The device did not answer in time.'));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });
}

function settleWaiters(message: DeviceMessage): void {
  const w = waiters.find((x) => x.kinds.includes(message.kind) || (message.kind === 'err' && message.seq === null));
  if (!w) return;
  waiters = waiters.filter((x) => x !== w);
  clearTimeout(w.timer);
  if (message.kind === 'err' && !w.kinds.includes('err')) w.reject(new Error(`The device refused: ${message.code.replace(/_/g, ' ')}.`));
  else w.resolve(message);
}

function rejectWaiters(reason: string): void {
  for (const w of waiters) {
    clearTimeout(w.timer);
    w.reject(new Error(reason));
  }
  waiters = [];
}

// ── Connection lifecycle ──
function makeTransport(method: TransportKind): HardwareTransport {
  return method === 'web-serial' ? new WebSerialTransport() : new SimulatedTransport();
}

/** Connect (always from an explicit user action). Resolves true once the firmware handshake succeeded. */
export async function connectHardware(method: TransportKind, options: { reuseGrantedPort?: boolean } = {}): Promise<boolean> {
  const s = store();
  if (s.phase === 'open' || s.phase === 'connecting' || s.phase === 'waiting-permission') return false;
  const gen = ++generation;
  s.set({ phase: method === 'web-serial' && !options.reuseGrantedPort ? 'waiting-permission' : 'connecting', method, error: null, device: null, deviceState: null, telemetry: null, lastFault: null, invalidLines: 0, stopping: false, latencyMs: null, heartbeat: 'off', deployed: null });
  physicalReadings.clear();
  const t = makeTransport(method);
  try {
    await t.open(
      {
        onLine: (line) => {
          if (gen === generation) onLine(line);
        },
        onClose: (reason) => {
          if (gen === generation) linkLost(reason);
        },
        onGarbage: (what) => {
          if (gen === generation) countInvalid(`Ignored ${what} from the device.`);
        },
      },
      options,
    );
  } catch (error) {
    if (gen !== generation) return false;
    store().set({ phase: 'idle', error: String((error as Error)?.message ?? error), reconnectAvailable: method === 'web-serial' });
    log.error('system', `Hardware: ${String((error as Error)?.message ?? error)}`);
    return false;
  }
  if (gen !== generation) {
    void t.close();
    return false;
  }
  transport = t;
  store().set({ phase: 'connecting', transportLabel: t.label, lastRxAt: performance.now() });
  store().addLog('info', `Port open (${t.label}). Waiting for the firmware handshake.`);
  // Opening a USB serial port usually resets the ESP32: give it time to boot, and repeat HELLO until it answers.
  const deadline = performance.now() + TIMING.handshakeMs;
  let hello: DeviceMessage | null = null;
  while (!hello && performance.now() < deadline && gen === generation) {
    const wait = waitFor(['hello_ok'], 1000).catch(() => null);
    await send(encode.hello());
    hello = await wait;
  }
  if (gen !== generation) return false;
  if (!hello || hello.kind !== 'hello_ok') {
    await closeTransport();
    store().set({ phase: 'idle', error: 'Handshake failed: the device did not identify itself. Is the AutoBotAI Explorer Bot firmware installed, and is this the right port?', reconnectAvailable: true });
    return false;
  }
  if (hello.proto !== PROTOCOL_VERSION) {
    await closeTransport();
    store().set({ phase: 'idle', error: `Unsupported firmware protocol ${hello.proto} (this app speaks ${PROTOCOL_VERSION}).`, reconnectAvailable: true });
    return false;
  }
  session = hello.session;
  store().set({
    phase: 'open',
    device: { device: hello.device, board: hello.board, firmware: hello.fw, protocol: hello.proto, caps: hello.caps, encoders: hello.encoders, maxDriveMs: hello.maxDriveMs, heartbeatMs: hello.heartbeatMs },
    deviceState: hello.state,
    lastFault: hello.fault ? { code: hello.fault, at: Date.now() } : null,
    reconnectAvailable: true,
    heartbeat: 'ok',
  });
  startTimers();
  const label = method === 'simulated' ? 'Simulated device (no hardware)' : t.label;
  const events = [hist('hardware.connected', label, hello.device, method === 'simulated' ? 'Simulated device: not physical hardware.' : ''), hist('hardware.firmware', hello.device, `v${hello.fw}`, `Board ${hello.board}, protocol ${hello.proto}.`)];
  // A fault or e-stop that latched while the link was down is only learned from the handshake: record it too.
  if (hello.state === 'fault') events.push(hist('hardware.fault', hello.device, hello.fault || 'unknown', 'Reported by the device at connection. Motors are disabled until the fault is cleared and the robot is armed again.'));
  if (hello.state === 'estop') events.push(hist('hardware.estop', hello.device, 'Active', 'Reported by the device at connection.'));
  record(events);
  log.success('system', `Hardware connected: ${hello.device} (firmware ${hello.fw}) via ${label}. Motors are disabled until you arm.`);
  if (hello.state === 'fault' || hello.state === 'estop') log.warning('system', `The device reports ${hello.state === 'fault' ? `a latched fault (${hello.fault})` : 'an active emergency stop'}. It will not move until that is cleared and it is armed again.`);
  await sendConfig().catch(() => undefined);
  return true;
}

async function closeTransport(): Promise<void> {
  stopTimers();
  const t = transport;
  transport = null;
  session = null;
  rejectWaiters('The connection closed.');
  await t?.close().catch(() => undefined);
}

function endPhysicalActivity(reason: string): void {
  const s = store();
  jog = null;
  if (s.activity === 'program' && useExecutionStore.getState().state !== 'idle') stopProgram(reason);
  if (s.activity !== 'idle') s.set({ activity: 'idle' });
  setPhysicalSensorOverride(null);
  if (s.executionTarget === 'physical') s.set({ executionTarget: 'simulation' });
}

/** Unexpected loss of the link (unplugged, silent, device reset). Never reconnects by itself. */
function linkLost(reason: string): void {
  if (!transport && store().phase !== 'connecting') return;
  const wasOpen = store().phase === 'open';
  endPhysicalActivity('The hardware connection was lost.');
  void closeTransport();
  store().set({ phase: wasOpen ? 'lost' : 'idle', error: reason, heartbeat: wasOpen ? 'lost' : 'off', stopping: false, deviceState: null });
  store().addLog('error', reason);
  if (wasOpen) {
    record([hist('hardware.disconnected', store().device?.device ?? 'Device', 'Lost', reason)]);
    log.error('system', `Hardware: ${reason} The firmware stops the motors on its own when it stops hearing from the browser.`);
  }
}

/** User-initiated disconnect: stop and disarm first (best effort), then close. */
export async function disconnectHardware(reason = 'Disconnected by the user.'): Promise<void> {
  const s = store();
  if (!transport) {
    // Also cancels a pending permission prompt or port open: the attempt is ignored when it finishes.
    generation += 1;
    rejectWaiters(reason);
    s.set({ phase: 'idle', heartbeat: 'off' });
    return;
  }
  generation += 1;
  endPhysicalActivity('Hardware disconnected.');
  if (s.deviceState === 'armed') {
    await send(encode.stop());
    await send(encode.disarm());
  }
  await closeTransport();
  s.set({ phase: 'idle', heartbeat: 'off', deviceState: null, stopping: false, telemetry: null, deployed: null });
  record([hist('hardware.disconnected', s.device?.device ?? 'Device', 'Disconnected', reason)]);
  log.info('system', `Hardware: ${reason}`);
}

/** Reconnect to the same kind of device (explicit user action; never re-arms). */
export async function reconnectHardware(): Promise<boolean> {
  const method = store().method;
  if (!method) return false;
  if (transport) await disconnectHardware('Reconnecting.');
  return connectHardware(method, { reuseGrantedPort: method === 'web-serial' });
}

// ── Incoming lines ──
function countInvalid(what: string): void {
  const now = performance.now();
  invalidWindow = invalidWindow.filter((t) => now - t < 2000);
  invalidWindow.push(now);
  store().set({ invalidLines: store().invalidLines + 1 });
  store().addLog('error', what);
  if (invalidWindow.length > 20) linkLost('Too many invalid messages from the device: the link was closed for safety. Check the port and baud rate (115200).');
}

function onLine(line: string): void {
  const parsed = parseDeviceLine(line);
  if (!parsed.ok) {
    countInvalid(`Rejected device line (${parsed.reason}): ${line.slice(0, 60)}`);
    return;
  }
  const now = performance.now();
  const m = parsed.message;
  store().set({ lastRxAt: now, heartbeat: 'ok' });
  if (m.kind !== 'tel' && m.kind !== 'pong' && m.kind !== 'ack') store().addLog('rx', line);
  settleWaiters(m);
  switch (m.kind) {
    case 'pong': {
      const sent = pingSent.get(m.seq);
      if (sent !== undefined) {
        store().set({ latencyMs: Math.round(now - sent) });
        pingSent.delete(m.seq);
      }
      break;
    }
    case 'tel':
      onTelemetry(m, now);
      break;
    case 'boot':
      if (store().phase === 'open') linkLost(`The device restarted (reset reason: ${m.reset}). Its motors are disabled. Reconnect to continue.`);
      break;
    case 'link_lost':
      linkLost('The device lost the heartbeat and closed the session.');
      break;
    case 'fault':
      store().set({ deviceState: 'fault', lastFault: { code: m.code, at: Date.now() }, stopping: false });
      endPhysicalActivity(`Hardware fault: ${m.code}.`);
      record([hist('hardware.fault', store().device?.device ?? 'Device', m.code, 'Motors disabled by the firmware. Clear the fault and arm again to continue.')]);
      log.error('system', `Hardware fault: ${m.code.replace(/_/g, ' ')}. The firmware disabled the motors.`);
      break;
    case 'estop_active':
      store().set({ deviceState: 'estop', stopping: false });
      endPhysicalActivity('Emergency stop.');
      record([hist('hardware.estop', store().device?.device ?? 'Device', 'Active', m.source === 'button' ? 'Stop button on the robot.' : 'Emergency stop from AutoBotAI.')]);
      log.warning('system', `Emergency stop active${m.source === 'button' ? ' (button on the robot)' : ''}. The motors are disabled.`);
      break;
    case 'armed':
      store().set({ deviceState: 'armed' });
      break;
    case 'disarmed':
    case 'estop_cleared':
    case 'fault_cleared':
      store().set({ deviceState: 'connected', stopping: false });
      break;
    case 'stopped':
      store().set({ stopping: false });
      break;
    default:
      break;
  }
}

function physicalSensorId(): string {
  const bp = useBlueprintStore.getState().blueprint;
  const m = bp.mappings.find((x) => x.snapshot.role === 'distance-sensor');
  const sensors = useSceneStore.getState().sensors;
  const virtual = m && m.targetKind === 'component' ? sensors.find((s) => s.type === 'distance' && (s as { partId?: string }).partId === m.targetId) : undefined;
  return virtual?.id ?? 'distance';
}

let sequence = 0;
function onTelemetry(m: Extract<DeviceMessage, { kind: 'tel' }>, now: number): void {
  const telemetry: Telemetry = { at: now, deviceTime: m.t, enabled: m.enabled, left: m.left, right: m.right, targetLeft: m.targetLeft, targetRight: m.targetRight, distanceMm: m.distanceMm, distanceStatus: m.distanceStatus, program: m.program };
  const patch: Parameters<ReturnType<typeof store>['set']>[0] = { telemetry };
  if (store().deviceState !== m.state) patch.deviceState = m.state;
  store().set(patch);
  const cal = profile()?.calibration ?? { distanceOffsetMm: 0 };
  physicalReadings.publish({
    sensorId: physicalSensorId(),
    type: 'distance',
    source: 'physical',
    timestamp: now,
    deviceTime: m.t,
    value: m.distanceStatus === 'ok' ? physicalDistanceMeters(m.distanceMm, cal) : null,
    unit: 'm',
    valid: m.distanceStatus === 'ok',
    status: readingStatus(m.distanceStatus),
    rawMm: m.distanceMm,
    sequence: ++sequence,
  });
}

// ── Timers: heartbeat, link watchdog, Physical Hardware Adapter ──
function startTimers(): void {
  stopTimers();
  heartbeatTimer = setInterval(() => {
    const s = store();
    if (s.phase !== 'open') return;
    const silent = performance.now() - (s.lastRxAt ?? 0);
    if (silent > TIMING.linkTimeoutMs) {
      linkLost(`No data from the device for ${(silent / 1000).toFixed(1)} s.`);
      return;
    }
    if (silent > TIMING.heartbeatMs * 3 && s.heartbeat !== 'late') s.set({ heartbeat: 'late' });
    const seq = pingSeq++;
    pingSent.set(seq, performance.now());
    if (pingSent.size > 20) pingSent.delete(pingSent.keys().next().value!);
    void send(encode.ping(seq % 999_999_999));
  }, TIMING.heartbeatMs);
  loopTimer = setInterval(adapterStep, TIMING.loopMs);
}

function stopTimers(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (loopTimer) clearInterval(loopTimer);
  heartbeatTimer = loopTimer = null;
  pingSent.clear();
}

/** The wheel command wanted right now (zero unless the user deliberately started motion). */
function desiredCommand(): WheelCommand {
  const s = store();
  const p = profile();
  if (!p || s.deviceState !== 'armed') return ZERO;
  if ((s.activity === 'jog' || s.activity === 'calibration') && jog) return jog;
  if (s.activity === 'program' && s.executionTarget === 'physical') {
    const { movement, speedPercent } = useRobotStateStore.getState();
    return mixDifferential(movement.intent.linear, movement.intent.angular, speedPercent, p);
  }
  return ZERO;
}

/** Physical Hardware Adapter: one step. Sends a leased DRIVE while motion is wanted, one STOP when it ends. */
function adapterStep(): void {
  const s = store();
  if (s.phase !== 'open' || !transport) return;
  const p = profile();
  if (s.activity === 'program' && p && performance.now() - programStartedAt > p.limits.maxRunSeconds * 1000) {
    log.warning('system', `Physical run stopped: the time limit of ${p.limits.maxRunSeconds} s was reached.`);
    endPhysicalActivity(`Time limit of ${p.limits.maxRunSeconds} s reached.`);
  }
  const want = desiredCommand();
  if (want.left !== 0 || want.right !== 0) {
    void send(encode.drive(driveSeq++ % 999_999_999, want.left, want.right, TIMING.leaseMs));
    lastSent = want;
  } else if (lastSent.left !== 0 || lastSent.right !== 0) {
    void send(encode.stop());
    lastSent = ZERO;
  }
}

// ── Commands from the UI ──
async function sendConfig(): Promise<void> {
  const p = profile();
  if (!p || store().deviceState === 'armed') return;
  const wait = waitFor(['config_ok']);
  await send(encode.config({ max: p.limits.maxSpeedPermille, accel: p.limits.accelPermillePerS, invl: p.calibration.invertLeft, invr: p.calibration.invertRight, hz: 10 }));
  await wait;
}

export type ArmResult = { ok: true } | { ok: false; reasons: string[] };

/** Arm the motors: only when every interlock passes AND the user confirmed the robot is safely positioned. */
export async function armHardware(confirmedSafe: boolean): Promise<ArmResult> {
  const reasons: string[] = [];
  if (!confirmedSafe) reasons.push('Confirm that the robot is safely positioned (wheels off the ground for the first tests) and the area is clear.');
  const v = currentValidation();
  if (!v.canArm) reasons.push(...v.items.filter((i) => i.level === 'blocker').map((i) => i.title), ...(v.openWarnings ? [`${v.openWarnings} warning(s) not reviewed and accepted.`] : []));
  if (!session || store().phase !== 'open') reasons.push('No device connected.');
  if (reasons.length) return { ok: false, reasons };
  try {
    await sendConfig();
    const armed = waitFor(['armed']);
    await send(encode.arm(session!));
    await armed;
  } catch (error) {
    return { ok: false, reasons: [String((error as Error)?.message ?? error)] };
  }
  log.warning('system', 'Hardware ARMED: the physical motors can now move. Use the emergency stop if anything unexpected happens.');
  return { ok: true };
}

export async function disarmHardware(): Promise<void> {
  endPhysicalActivity('Disarmed.');
  if (store().deviceState === 'armed') {
    const wait = waitFor(['disarmed']).catch(() => undefined);
    await send(encode.stop());
    await send(encode.disarm());
    await wait;
  }
}

/** Normal stop: zero speed now (the motors stay armed). */
export async function stopHardware(): Promise<void> {
  const s = store();
  endPhysicalActivity('Stopped.');
  if (!transport) return;
  s.set({ stopping: true });
  lastSent = ZERO;
  const wait = waitFor(['stopped']).catch(() => undefined);
  await send(encode.stop());
  await wait;
  store().set({ stopping: false });
}

/** Emergency stop: immediate, latched on the device, needs an explicit reset and a new ARM. */
export async function emergencyStop(): Promise<boolean> {
  endPhysicalActivity('Emergency stop.');
  lastSent = ZERO;
  if (!transport) {
    log.error('system', 'Emergency stop: no device connected. Use the motor-power switch on the robot.');
    return false;
  }
  store().set({ stopping: true });
  const ok = await send(encode.estop());
  if (!ok) log.error('system', 'Emergency stop could not be sent. Use the motor-power switch on the robot.');
  return ok;
}

export async function resetEmergencyStop(): Promise<boolean> {
  if (store().deviceState !== 'estop') return false;
  const wait = waitFor(['estop_cleared']).catch(() => null);
  await send(encode.resetEstop());
  return Boolean(await wait);
}

export async function clearHardwareFault(): Promise<boolean> {
  if (store().deviceState !== 'fault') return false;
  const wait = waitFor(['fault_cleared']).catch(() => null);
  await send(encode.clearFault());
  const ok = Boolean(await wait);
  if (ok) store().set({ lastFault: null });
  return ok;
}

/** Low-speed manual motion while a button is held (Hardware Monitor and calibration). */
export function jogStart(direction: JogDirection, fraction = 0.25, activity: 'jog' | 'calibration' = 'jog'): boolean {
  const p = profile();
  const s = store();
  if (!p || s.deviceState !== 'armed' || (s.activity !== 'idle' && s.activity !== activity)) return false;
  jog = jogCommand(direction, fraction, p);
  s.set({ activity });
  adapterStep();
  return true;
}

export function jogStop(): void {
  const s = store();
  if (s.activity !== 'jog' && s.activity !== 'calibration') return;
  jog = null;
  s.set({ activity: 'idle' });
  adapterStep();
}

/** Calibration test: one wheel or direction at low speed for a fixed short time. */
export function calibrationTest(direction: JogDirection, ms = 1000): Promise<boolean> {
  if (!jogStart(direction, 0.25, 'calibration')) return Promise.resolve(false);
  return new Promise((resolve) =>
    setTimeout(() => {
      jogStop();
      resolve(true);
    }, Math.min(Math.max(ms, 100), 2000)),
  );
}

/** Register the prepared program's hash on the device (deployment is separate from starting it). */
export async function deployPrepared(): Promise<{ ok: boolean; message: string }> {
  const s = store();
  const prepared = s.prepared;
  if (!prepared || !prepared.ok) return { ok: false, message: 'Prepare a program without errors first.' };
  if (s.phase !== 'open') return { ok: false, message: 'Connect the device first.' };
  if (s.deviceState === 'armed') return { ok: false, message: 'Disarm before deploying a program.' };
  try {
    const wait = waitFor(['program_ok']);
    await send(encode.program(prepared.hash));
    const reply = await wait;
    if (reply.kind !== 'program_ok' || reply.hash !== prepared.hash) return { ok: false, message: 'The device did not confirm the program.' };
  } catch (error) {
    return { ok: false, message: String((error as Error)?.message ?? error) };
  }
  s.set({ deployed: { programId: prepared.programId, name: prepared.name, hash: prepared.hash, at: Date.now() } });
  record([hist('program.deployed', prepared.name, prepared.hash, store().method === 'simulated' ? 'Deployed to the simulated device (no hardware).' : 'Registered on the device; the program runs in the browser and sends limited commands.')]);
  return { ok: true, message: `"${prepared.name}" is deployed (${prepared.hash}). It does not move until you arm and press Start.` };
}

/** The Code Studio execution target. Physical needs an explicit confirmation every time. */
export function setExecutionTarget(target: 'simulation' | 'physical', confirmed: boolean): boolean {
  if (target === 'physical' && !confirmed) return false;
  if (target === 'physical' && store().phase !== 'open') return false;
  store().set({ executionTarget: target });
  if (target === 'simulation') setPhysicalSensorOverride(null);
  return true;
}

// ── Program gate and lifecycle (Code Studio) ──
function runGate(request: RunRequest): ProgramIssue[] {
  const s = store();
  if (s.executionTarget !== 'physical') return [];
  const issues: ProgramIssue[] = [];
  const err = (message: string) => issues.push({ message: `Physical hardware: ${message}`, severity: 'error' });
  if (s.phase !== 'open') err('no device is connected.');
  else if (s.deviceState !== 'armed') err('the robot is not armed. Arm it in Blueprint → Hardware first.');
  if (!s.deployed) err('no program is deployed.');
  else if (s.deployed.programId !== request.programId) err(`the deployed program is "${s.deployed.name}", not this one.`);
  else if (s.deployed.hash !== programHash(request.code)) err('this program changed since it was deployed. Prepare and deploy it again.');
  for (const issue of checkPhysicalProgram(request.code).filter((i) => i.severity === 'error')) issues.push({ message: issue.message, line: issue.line, severity: 'error' });
  if (!currentValidation().canArm) err('hardware validation no longer passes.');
  return issues;
}

const physicalOverride = {
  list: () => [{ id: physicalSensorId(), type: 'distance', name: 'Distance (physical VL53L0X)', enabled: true, rateHz: 10, source: 'physical' }],
  read: (sensorId: string, type: string | undefined) => {
    if (type && type !== 'distance') throw new Error(`The physical robot has no ${type} sensor.`);
    if (sensorId !== physicalSensorId()) throw new Error(`Unknown physical sensor "${sensorId}". The physical distance sensor is "${physicalSensorId()}".`);
    const r = physicalReadings.latest(sensorId);
    const stale = !r || performance.now() - r.timestamp > 500;
    return {
      sensorId,
      type: 'distance',
      source: 'physical',
      timestamp: r?.timestamp ?? 0,
      simTime: 0,
      valid: Boolean(r?.valid) && !stale,
      stale,
      sequence: r?.sequence ?? 0,
      distance: r?.valid ? r.value : null,
      detected: Boolean(r?.valid),
      status: r?.status === 'ok' ? 'hit' : 'no-hit',
      rays: [],
      ...(r && r.status !== 'ok' ? { error: `Physical sensor status: ${r.status}.` } : stale ? { error: 'No recent physical reading.' } : {}),
    };
  },
};

let runtimeConnected = false;

/** Register the gate and listeners once at startup. */
export function connectHardwareRuntime(): void {
  if (runtimeConnected) return;
  runtimeConnected = true;
  setRunGate(runGate);
  bus.subscribe('codeStudio.execution', (e) => {
    const s = store();
    if (e.state === 'running' && s.executionTarget === 'physical' && s.activity === 'idle' && s.deviceState === 'armed') {
      programStartedAt = performance.now();
      setPhysicalSensorOverride(physicalOverride);
      s.set({ activity: 'program' });
      record([hist('program.started', s.deployed?.name ?? 'Program', 'Physical robot', s.method === 'simulated' ? 'Simulated device (no hardware).' : '')]);
      return;
    }
    if ((e.state === 'completed' || e.state === 'error' || e.state === 'idle') && s.activity === 'program') {
      setPhysicalSensorOverride(null);
      jog = null;
      s.set({ activity: 'idle', executionTarget: 'simulation' });
      adapterStep();
      record([hist('program.stopped', s.deployed?.name ?? 'Program', e.state, e.detail ?? '')]);
    }
  });
  // Leaving the workspace mode or closing the project stops any physical motion (the device stays connected).
  onSessionEnd(() => {
    const s = store();
    if (s.activity !== 'idle' && s.activity !== 'program') endPhysicalActivity('The workspace session ended.');
  });
  bus.subscribe('project.opened', () => {
    if (transport) void disconnectHardware('Another project was opened.');
  });
  if (typeof window !== 'undefined') {
    // Best effort when the tab closes; the firmware's lease and heartbeat stop the motors anyway.
    window.addEventListener('pagehide', () => {
      if (transport && store().deviceState === 'armed') {
        void transport.write(encode.stop()).catch(() => undefined);
        void transport.write(encode.disarm()).catch(() => undefined);
      }
    });
  }
}

/** For the UI: the single displayed connection state. */
export function displayedState() {
  return connectionState(store());
}

/** Tests only. */
export function resetHardwareForTests(): void {
  generation += 1;
  stopTimers();
  rejectWaiters('reset');
  void transport?.close();
  transport = null;
  session = null;
  jog = null;
  lastSent = ZERO;
  invalidWindow = [];
  setPhysicalSensorOverride(null);
  useHardwareStore.setState({ phase: 'idle', method: null, device: null, deviceState: null, stopping: false, lastRxAt: null, latencyMs: null, heartbeat: 'off', lastFault: null, error: null, reconnectAvailable: false, telemetry: null, activity: 'idle', executionTarget: 'simulation', prepared: null, deployed: null, invalidLines: 0, log: [] });
}

