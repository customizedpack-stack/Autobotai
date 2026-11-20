import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore, migratePersistedProjects } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { endControlSession, setWorkspaceMode } from '../../controls/controlSession';
import { connectCommandBus } from '../../controls/commandBus';
import { setScheduler } from '../../controls/movementEngine';
import { addExtra, addHardware, addStandardWiring, mapPart, modelView, setMotorDriver } from '../../blueprint/blueprintActions';
import { dataOf, useBlueprintStore } from '../../blueprint/blueprintStore';
import { PARTS } from '../../blueprint/catalog/parts';
import type { CatalogPart } from '../../blueprint/catalog/types';
import { configureExecution, pauseProgram, resumeProgram, runProgram, stopProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { saveCurrentProject } from '../../projects/workspaceActions';
import { sensorStream } from '../../sensors/stream/sensorStream';
import {
  armHardware,
  calibrationTest,
  clearHardwareFault,
  connectHardware,
  connectHardwareRuntime,
  currentValidation,
  deployPrepared,
  disconnectHardware,
  emergencyStop,
  jogStart,
  jogStop,
  reconnectHardware,
  resetEmergencyStop,
  resetHardwareForTests,
  setExecutionTarget,
  stopHardware,
} from '../connectionManager';
import { checkPhysicalProgram, prepareProgram } from '../deploy/programCheck';
import { jogCommand, mixDifferential, physicalDistanceMeters } from '../hal/differentialDrive';
import {
  acknowledgeWarning,
  addMotorPowerSwitchToBom,
  applyFirmwarePinMap,
  selectReferenceProfile,
  setCalibration,
  setLimits,
  setMotorPowerSwitchConfirmed,
  setPowerSupply,
} from '../hardwareActions';
import { connectionState, useHardwareStore } from '../hardwareStore';
import { physicalReadings } from '../physicalTelemetry';
import { LineSplitter, encode, parseDeviceLine, programHash } from '../protocol/protocol';
import { pinMapMismatches } from '../safety/validation';
import { simulatedDevice } from '../transport/simulatedDevice';
import { WebSerialTransport, webSerialSupport } from '../transport/webSerial';
import { defaultHardwareProfile } from '../../blueprint/model/types';

/**
 * Phase 10 hardware layer. Integration tests use the SIMULATED DEVICE (the firmware
 * logic running in this process). None of these results are physical hardware tests.
 */

connectCommandBus();
connectHardwareRuntime();

const part = (id: string): CatalogPart => structuredClone(PARTS.find((p) => p.id === id)!);
const objectId = (name: string) => useSceneStore.getState().objects.find((o) => o.name === name)!.id;
const hw = () => useHardwareStore.getState();
const dev = () => simulatedDevice();
const data = () => dataOf(useBlueprintStore.getState().blueprint);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function openExplorer() {
  localStorage.clear();
  endControlSession();
  useSceneStore.getState().closeProject();
  useBlueprintStore.getState().close();
  useProjectStore.setState({ projects: {} });
  const p = useProjectStore.getState().createProject({ name: 'Hardware Bot', category: 'mobile', templateId: 'explorer-bot' });
  useSceneStore.getState().loadProject(p);
  useBlueprintStore.getState().load(p.id, p.blueprint);
  return p;
}

/** The reference configuration, mapped and validated as a user would. */
function referenceSetup(): void {
  mapPart('component', objectId('Left Motor'), part('pololu-1101'));
  mapPart('component', objectId('Right Motor'), part('pololu-1101'));
  mapPart('component', objectId('Left Wheel'), part('pololu-1429'));
  mapPart('component', objectId('Right Wheel'), part('pololu-1429'));
  mapPart('component', objectId('Controller Board'), part('espressif-esp32-devkitc-v4'));
  mapPart('component', objectId('Distance Sensor'), part('pololu-2490'));
  const driver = addHardware('driver');
  mapPart('hardware', driver, part('pololu-713'));
  addExtra({ name: 'Bracket', quantity: 1, required: true, part: part('pololu-989') });
  addStandardWiring();
  selectReferenceProfile();
  applyFirmwarePinMap();
  addMotorPowerSwitchToBom();
  setMotorPowerSwitchConfirmed(true);
  setPowerSupply({ kind: 'battery', voltageV: 4.8, maxCurrentA: 4, source: 'Test value' });
  for (const item of currentValidation().items) if (item.level === 'warning' && item.ackId) acknowledgeWarning(item.ackId, true);
}

async function connectSimulated(): Promise<void> {
  expect(await connectHardware('simulated')).toBe(true);
}

beforeEach(() => {
  resetHardwareForTests();
  dev().boot('poweron');
  dev().setDistance(420, 'ok', false);
  dev().setSilent(false);
  dev().restoreLink();
  setWorkspaceMode('build');
});

afterEach(async () => {
  await disconnectHardware('test end');
  resetHardwareForTests();
});

describe('protocol', () => {
  it('parses valid device lines strictly and rejects anything else', () => {
    expect(parseDeviceLine('TEL t=10 st=armed en=1 l=100 r=-100 tl=200 tr=-200 d=412 ds=ok prog=-').ok).toBe(true);
    const tel = parseDeviceLine('TEL t=10 st=connected en=0 l=0 r=0 tl=0 tr=0 d=-1 ds=range prog=0a1b2c3d');
    expect(tel.ok && tel.message.kind === 'tel' && tel.message.distanceMm === null && tel.message.program === '0a1b2c3d').toBe(true);
    for (const bad of ['TEL t=1 st=armed', 'TEL t=1 st=flying en=1 l=0 r=0 tl=0 tr=0 d=1 ds=ok prog=-', 'TEL t=1 st=armed en=1 l=5000 r=0 tl=0 tr=0 d=1 ds=ok prog=-', 'GPIO 2 1', 'ACK x', 'FAULT code=Bad Code', 'ARMED now', 'HELLO_OK proto=1', 'TEL t=1 st=armed en=1 l=0 r=0 tl=0 tr=0 d=1 ds=ok prog=- extra=1', 'PONG 1\u0001', 'x'.repeat(241)]) {
      expect(parseDeviceLine(bad).ok, bad).toBe(false);
    }
  });

  it('only encodes allowlisted commands within range', () => {
    expect(encode.drive(1, 300, -300, 300)).toBe('DRIVE 1 300 -300 300');
    expect(() => encode.drive(1, 1001, 0, 300)).toThrow();
    expect(() => encode.drive(1, 0, 0, 501)).toThrow();
    expect(() => encode.drive(1, 0.5, 0, 100)).toThrow();
    expect(() => encode.arm('nothex!!')).toThrow();
    expect(() => encode.config({ max: 2000, accel: 1500, invl: false, invr: false, hz: 10 })).toThrow();
    expect(encode.program(null)).toBe('PROGRAM clear');
    expect(Object.keys(encode).sort()).toEqual(['arm', 'clearFault', 'config', 'disarm', 'drive', 'estop', 'hello', 'ping', 'program', 'resetEstop', 'status', 'stop']);
  });

  it('splits lines and drops overlong ones', () => {
    const lines: string[] = [];
    let overflow = 0;
    const s = new LineSplitter((l) => lines.push(l), () => overflow++, 10);
    s.push('PONG 1\r\nPO');
    s.push('NG 2\n' + 'x'.repeat(20) + '\nACK 3\n');
    expect(lines).toEqual(['PONG 1', 'PONG 2', 'ACK 3']);
    expect(overflow).toBe(1);
    expect(programHash('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('HAL: differential drive limits', () => {
  const profile = defaultHardwareProfile('now');
  it('mixes forward, reverse and turns within the speed limit', () => {
    expect(mixDifferential(1, 0, 100, profile)).toEqual({ left: 300, right: 300 });
    expect(mixDifferential(-1, 0, 50, profile)).toEqual({ left: -150, right: -150 });
    expect(mixDifferential(0, 1, 100, profile)).toEqual({ left: -300, right: 300 }); // positive angular = left turn
    expect(mixDifferential(0, -1, 100, profile)).toEqual({ left: 300, right: -300 });
    expect(mixDifferential(1, 1, 100, profile)).toEqual({ left: 0, right: 300 });
    expect(mixDifferential(5, 0, 500, profile)).toEqual({ left: 300, right: 300 }); // never above the limit
    expect(mixDifferential(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, profile)).toEqual({ left: 0, right: 0 });
    expect(mixDifferential(0, 0, 100, profile)).toEqual({ left: 0, right: 0 });
  });

  it('lifts small commands to the calibrated start-up duty but never above the limit', () => {
    const p = { ...profile, calibration: { ...profile.calibration, pwmMinPermille: 120 } };
    expect(mixDifferential(0.1, 0, 100, p)).toEqual({ left: 120, right: 120 });
    expect(mixDifferential(1, 0, 100, p)).toEqual({ left: 300, right: 300 });
    expect(jogCommand('left-wheel', 0.25, profile)).toEqual({ left: 75, right: 0 });
    expect(jogCommand('forward', 5, profile)).toEqual({ left: 150, right: 150 }); // jog fraction capped at 50 %
    expect(physicalDistanceMeters(412, { distanceOffsetMm: -12 })).toBe(0.4);
    expect(physicalDistanceMeters(null, { distanceOffsetMm: 0 })).toBeNull();
  });
});

describe('Program preparation', () => {
  it('accepts driving and distance reads, refuses what the physical robot cannot do', () => {
    expect(checkPhysicalProgram('await robotControl.drive.forward({ speed: 0.5, durationMs: 500 });\nconst d = robotSensors.distance("front-distance").meters();').filter((i) => i.severity === 'error')).toEqual([]);
    const bad = checkPhysicalProgram('robotCamera.capture("c");\nrobotSensors.encoder("l").read();\nrobotControl.joint("j").setTarget(1);\nrobotSensors.distance("d").subscribe(() => {});\n// robotCamera in a comment is fine\nrobotControl.reset();');
    expect(bad.filter((i) => i.severity === 'error').map((i) => i.line)).toEqual([1, 2, 3, 4, 6]);
    const p = prepareProgram({ programId: 'p', name: 'P', language: 'javascript', code: 'robotControl.stop();' });
    expect(p.ok).toBe(true);
    expect(p.hash).toBe(programHash('robotControl.stop();'));
  });
});

describe('Validation and interlocks', () => {
  it('blocks until the reference parts, power supply, motor-power switch and firmware pin map are in place', () => {
    openExplorer();
    let v = currentValidation();
    expect(v.items.find((i) => i.id === 'profile')!.level).toBe('blocker');
    selectReferenceProfile();
    v = currentValidation();
    expect(v.profileReady).toBe(false);
    for (const id of ['part:controller', 'part:driver', 'part:motor:Left', 'part:distance', 'power:supply', 'safety:switch']) expect(v.items.find((i) => i.id === id)?.level, id).toBe('blocker');
    referenceSetup();
    v = currentValidation();
    expect(v.items.filter((i) => i.level === 'blocker' && i.id !== 'device')).toEqual([]);
    expect(v.profileReady).toBe(true);
    expect(v.canArm).toBe(false); // no device yet
    // Known warnings of the reference configuration are listed and had to be accepted.
    const warnings = v.items.filter((i) => i.level === 'warning').map((i) => i.id);
    expect(warnings).toEqual(expect.arrayContaining(['compat:mc:' + data().mappings.find((m) => m.targetId === objectId('Left Motor'))!.id]));
  });

  it('unknown critical data and other parts block arming (no interchangeable parts assumed)', () => {
    openExplorer();
    referenceSetup();
    setPowerSupply({ kind: 'battery', voltageV: 4.8, maxCurrentA: null, source: '' });
    expect(currentValidation().items.find((i) => i.id === 'power:supply')!.level).toBe('blocker');
    setPowerSupply({ kind: 'battery', voltageV: 20, maxCurrentA: 4, source: '' });
    expect(currentValidation().items.find((i) => i.id === 'power:supply:vm')!.level).toBe('blocker');
    setPowerSupply({ kind: 'battery', voltageV: 4.8, maxCurrentA: 4, source: '' });
    mapPart('component', objectId('Left Motor'), part('pololu-1581'));
    const v = currentValidation();
    expect(v.items.find((i) => i.id === 'part:motor:Left')!.level).toBe('blocker');
    expect(v.items.some((i) => i.level === 'blocker' && i.id.startsWith('compat:shaft:'))).toBe(true);
    expect(v.profileReady).toBe(false);
  });

  it('wiring that differs from the firmware pin map blocks until the pin map is applied', () => {
    openExplorer();
    referenceSetup();
    const d = data();
    const pwma = d.wiring.find((w) => w.componentPin === 'PWMA')!;
    useBlueprintStore.getState().apply('test', { ...d, wiring: d.wiring.map((w) => (w.id === pwma.id ? { ...w, controllerPin: 'GPIO2' } : w)) });
    expect(pinMapMismatches(data())).toEqual([expect.objectContaining({ pin: 'PWMA', expected: 'GPIO26', actual: 'GPIO2' })]);
    expect(currentValidation().items.find((i) => i.id === 'wiring:pins')!.level).toBe('blocker');
    applyFirmwarePinMap();
    expect(pinMapMismatches(data())).toEqual([]);
  });
});

describe('Simulated device integration (not physical hardware)', () => {
  it('handshake identifies the firmware; motors stay disabled after connecting', async () => {
    openExplorer();
    await connectSimulated();
    expect(connectionState(hw())).toBe('connected');
    expect(hw().device).toMatchObject({ device: 'explorer-bot-esp32', board: 'esp32-devkitc-v4', firmware: '0.1.0', protocol: 1, encoders: false });
    await sleep(250);
    expect(dev().outputs.enabled).toBe(false);
    expect(dev().state).toBe('connected');
    expect(hw().telemetry?.enabled).toBe(false);
    const types = useBlueprintStore.getState().blueprint.history.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['hardware.connected', 'hardware.firmware']));
    expect(useBlueprintStore.getState().blueprint.history.find((e) => e.type === 'hardware.connected')!.note).toContain('Simulated device');
  });

  it('a device that never answers fails the handshake and is never shown as connected', async () => {
    openExplorer();
    dev().setSilent(true);
    const states: string[] = [];
    const unsub = useHardwareStore.subscribe((s) => states.push(connectionState(s)));
    expect(await connectHardware('simulated')).toBe(false);
    unsub();
    expect(states).not.toContain('connected');
    expect(hw().error).toMatch(/Handshake failed/);
    dev().setSilent(false);
  }, 10000);

  it('a pending connection attempt can be cancelled and is never shown as connected', async () => {
    openExplorer();
    dev().setSilent(true);
    const attempt = connectHardware('simulated');
    await sleep(50);
    expect(connectionState(hw())).toBe('connecting');
    await disconnectHardware('Connection attempt cancelled by the user.');
    expect(await attempt).toBe(false);
    expect(connectionState(hw())).toBe('not-connected');
    dev().setSilent(false);
    expect(await connectHardware('simulated')).toBe(true);
  }, 10000);

  it('arming needs validation and an explicit safety confirmation', async () => {
    openExplorer();
    selectReferenceProfile();
    await connectSimulated();
    let r = await armHardware(true);
    expect(r.ok).toBe(false);
    referenceSetup();
    r = await armHardware(false);
    expect(r.ok).toBe(false);
    expect(dev().state).toBe('connected');
    r = await armHardware(true);
    expect(r).toEqual({ ok: true });
    await until(() => dev().state === 'armed');
    expect(dev().config.maxPermille).toBe(300);
  });

  it('low-speed jog moves the motors; stop zeroes them at once', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    expect(jogStart('forward')).toBe(true);
    await until(() => dev().outputs.left > 0 && dev().outputs.right > 0);
    expect(dev().outputs.left).toBeLessThanOrEqual(75);
    expect(connectionState(hw())).toBe('running');
    await until(() => (hw().telemetry?.left ?? 0) > 0);
    jogStop();
    await until(() => dev().outputs.left === 0);
    expect(jogStart('left')).toBe(true);
    await until(() => dev().outputs.left < 0 && dev().outputs.right > 0);
    await stopHardware();
    await until(() => dev().outputs.left === 0 && dev().outputs.right === 0);
    expect(dev().state).toBe('armed');
  });

  it('emergency stop is immediate and latched; reset needs a new ARM; nothing resumes by itself', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    jogStart('forward');
    await until(() => dev().outputs.left > 0);
    await emergencyStop();
    await until(() => dev().state === 'estop');
    expect(dev().outputs).toEqual({ enabled: false, left: 0, right: 0 });
    await until(() => connectionState(hw()) === 'emergency-stopped');
    expect((await armHardware(true)).ok).toBe(false);
    expect(jogStart('forward')).toBe(false);
    expect(await resetEmergencyStop()).toBe(true);
    await sleep(300);
    expect(dev().state).toBe('connected');
    expect(dev().outputs.enabled).toBe(false);
    expect(useBlueprintStore.getState().blueprint.history.some((e) => e.type === 'hardware.estop')).toBe(true);
  });

  it('the robot stop button (local e-stop) disables the motors and is reported', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    jogStart('forward');
    await until(() => dev().outputs.left > 0);
    dev().pressStopButton();
    await until(() => hw().deviceState === 'estop');
    expect(hw().activity).toBe('idle');
    expect(dev().outputs.enabled).toBe(false);
  });

  it('communication loss while moving: the firmware stops and latches a fault; reconnect does not resume motion', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    jogStart('forward');
    await until(() => dev().outputs.left > 0);
    dev().cutLink(); // the cable "breaks": nothing passes in either direction
    // The lease (300 ms) stops the motors first; the heartbeat timeout (1 s) then latches a fault.
    await until(() => dev().outputs.left === 0, 1000);
    await until(() => dev().state === 'fault', 2500);
    expect(dev().outputs.enabled).toBe(false);
    await until(() => connectionState(hw()) === 'disconnected', 3000);
    expect(hw().activity).toBe('idle');
    // Explicit reconnect: the device is still in fault, disarmed, and nothing moves.
    expect(await reconnectHardware()).toBe(true);
    await sleep(300);
    expect(connectionState(hw())).toBe('fault');
    expect(hw().lastFault?.code).toBe('heartbeat_timeout');
    // The fault latched while the link was down; the handshake reports it, so Build History records it.
    expect(useBlueprintStore.getState().blueprint.history.some((e) => e.type === 'hardware.fault' && e.next === 'heartbeat_timeout')).toBe(true);
    expect(dev().outputs).toEqual({ enabled: false, left: 0, right: 0 });
    expect(jogStart('forward')).toBe(false);
    expect((await armHardware(true)).ok).toBe(false);
    expect(await clearHardwareFault()).toBe(true);
    await sleep(200);
    expect(dev().state).toBe('connected');
    expect(dev().outputs.enabled).toBe(false);
    expect((await armHardware(true)).ok).toBe(true);
  }, 15000);

  it('a device reset during a session drops the session safely (motors disabled after boot)', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    dev().boot('watchdog');
    await until(() => connectionState(hw()) === 'disconnected');
    expect(hw().error).toMatch(/restarted/);
    expect(dev().state).toBe('fault');
    expect(dev().outputs.enabled).toBe(false);
  });

  it('a flood of invalid device lines closes the link', async () => {
    openExplorer();
    await connectSimulated();
    for (let i = 0; i < 25; i++) dev().injectGarbage(`NONSENSE ${i}`);
    await until(() => connectionState(hw()) === 'disconnected');
    expect(hw().error).toMatch(/invalid messages/);
  });

  it('physical telemetry goes to its own stream with source "physical" and never into the simulated stream', async () => {
    openExplorer();
    referenceSetup();
    setCalibration({ distanceOffsetMm: -20 }, 'distance offset');
    await connectSimulated();
    await until(() => physicalReadings.latest('front-distance') !== undefined);
    const r = physicalReadings.latest('front-distance')!;
    expect(r).toMatchObject({ source: 'physical', unit: 'm', valid: true, status: 'ok', rawMm: 420, value: 0.4 });
    expect(sensorStream.latest('front-distance')?.source).not.toBe('physical');
    dev().setDistance(null, 'err');
    await until(() => physicalReadings.latest('front-distance')!.status === 'error');
    expect(physicalReadings.latest('front-distance')!.valid).toBe(false);
  });

  it('deploy, start and stop a program on the physical target; it cannot start without deployment or arming', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    const code = 'await robotControl.drive.forward({ speed: 1, durationMs: 600 });\nconst d = await robotSensors.distance("front-distance").read();\nprint(d.source, d.valid);';
    configureExecution({ sandbox: inProcessSandbox() });
    setScheduler({ request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number, cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) });
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    expect(setExecutionTarget('physical', false)).toBe(false);
    expect(setExecutionTarget('physical', true)).toBe(true);
    // Not deployed, not armed: refused.
    let run = runProgram({ programId: 'prg1', programName: 'Drive', language: 'javascript', code });
    expect(run.ok).toBe(false);
    useHardwareStore.getState().set({ prepared: prepareProgram({ programId: 'prg1', name: 'Drive', language: 'javascript', code }) });
    expect((await deployPrepared()).ok).toBe(true);
    await until(() => hw().telemetry?.program === hw().deployed?.hash);
    run = runProgram({ programId: 'prg1', programName: 'Drive', language: 'javascript', code });
    expect(run.ok).toBe(false); // still not armed
    expect((await armHardware(true)).ok).toBe(true);
    // A changed program is refused.
    expect(runProgram({ programId: 'prg1', programName: 'Drive', language: 'javascript', code: code + '\n// changed' }).ok).toBe(false);
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    run = runProgram({ programId: 'prg1', programName: 'Drive', language: 'javascript', code });
    expect(run.ok).toBe(true);
    await until(() => dev().outputs.left > 0, 2000);
    expect(dev().outputs.left).toBeLessThanOrEqual(300);
    await until(() => useExecutionStore.getState().state === 'completed', 5000);
    await until(() => dev().outputs.left === 0, 2000);
    expect(hw().executionTarget).toBe('simulation'); // back to simulation after the physical run
    expect(hw().activity).toBe('idle');
    const types = useBlueprintStore.getState().blueprint.history.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['program.deployed', 'program.started', 'program.stopped']));
    stopProgram();
    setScheduler(null);
  }, 15000);

  it('pausing a program on the physical target stops the motors; resume continues', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    const code = 'await robotControl.drive.forward({ speed: 1, durationMs: 1500 });';
    configureExecution({ sandbox: inProcessSandbox() });
    setScheduler({ request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number, cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) });
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    expect(setExecutionTarget('physical', true)).toBe(true);
    useHardwareStore.getState().set({ prepared: prepareProgram({ programId: 'prg2', name: 'Pause', language: 'javascript', code }) });
    expect((await deployPrepared()).ok).toBe(true);
    await until(() => hw().telemetry?.program === hw().deployed?.hash);
    expect((await armHardware(true)).ok).toBe(true);
    expect(runProgram({ programId: 'prg2', programName: 'Pause', language: 'javascript', code }).ok).toBe(true);
    await until(() => dev().outputs.left > 0, 2000);
    expect(pauseProgram()).toBe(true);
    await until(() => dev().outputs.left === 0, 1000);
    await sleep(400);
    expect(dev().outputs.left).toBe(0); // stays stopped while paused
    expect(resumeProgram()).toBe(true);
    await until(() => dev().outputs.left > 0, 2000);
    stopProgram();
    await until(() => dev().outputs.left === 0, 1000);
    setScheduler(null);
  }, 15000);

  it('disconnect stops and disarms; the simulated device ends disarmed with motors off', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    jogStart('forward');
    await until(() => dev().outputs.left > 0);
    await disconnectHardware();
    await sleep(100);
    expect(dev().state).toBe('connected');
    expect(dev().outputs).toEqual({ enabled: false, left: 0, right: 0 });
    expect(connectionState(hw())).toBe('not-connected');
  });

  it('calibration test runs one wheel at low speed for a short, fixed time', async () => {
    openExplorer();
    referenceSetup();
    await connectSimulated();
    expect((await armHardware(true)).ok).toBe(true);
    const done = calibrationTest('left-wheel', 400);
    await until(() => dev().outputs.left > 0);
    expect(dev().outputs.right).toBe(0);
    expect(await done).toBe(true);
    await until(() => dev().outputs.left === 0);
  });
});

describe('Profile, calibration and persistence', () => {
  it('calibration is stored in the profile, never in the 3D model, and survives save and reload', () => {
    const p = openExplorer();
    referenceSetup();
    const objects = structuredClone(useSceneStore.getState().objects);
    const controllers = structuredClone(useSceneStore.getState().controllers);
    setCalibration({ invertLeft: true, wheelDiameterMm: 69.5, trackWidthMm: 148, pwmMinPermille: 90, distanceOffsetMm: -15, sensorPositionMm: [110, 40, 0] }, 'measured');
    setLimits({ maxSpeedPermille: 250, maxRunSeconds: 30 });
    expect(useSceneStore.getState().objects).toEqual(objects);
    expect(useSceneStore.getState().controllers).toEqual(controllers);
    expect(useBlueprintStore.getState().blueprint.history.some((e) => e.type === 'hardware.calibration')).toBe(true);
    saveCurrentProject();
    const raw = JSON.parse(localStorage.getItem('arai.projects.v1')!) as { state: unknown; version: number };
    const reloaded = migratePersistedProjects(raw.state, raw.version).projects[p.id]!;
    expect(reloaded.blueprint!.hardwareProfile).toMatchObject({ limits: { maxSpeedPermille: 250, maxRunSeconds: 30 }, calibration: { invertLeft: true, wheelDiameterMm: 69.5, trackWidthMm: 148, pwmMinPermille: 90, distanceOffsetMm: -15, sensorPositionMm: [110, 40, 0], encoderTicksPerRev: null } });
    expect(JSON.stringify(reloaded)).not.toMatch(/session|password|token/i);
    expect(reloaded.objects).toEqual(objects);
  });

  it('invalid calibration and power values are rejected (stay unknown), and undo restores the profile', () => {
    openExplorer();
    referenceSetup();
    setCalibration({ wheelDiameterMm: -5, trackWidthMm: Number.NaN }, 'bad');
    expect(data().hardwareProfile!.calibration.wheelDiameterMm).toBeNull();
    expect(data().hardwareProfile!.calibration.trackWidthMm).toBeNull();
    setPowerSupply({ kind: 'battery', voltageV: -1, maxCurrentA: 1e9, source: 'x' });
    expect(data().hardwareProfile!.powerSupply).toMatchObject({ voltageV: null, maxCurrentA: null });
    setWorkspaceMode('blueprint');
    useBlueprintStore.getState().undo();
    expect(data().hardwareProfile!.powerSupply.voltageV).toBe(4.8);
  });

  it('Web Serial support is detected honestly and a missing port is reported, not faked', async () => {
    expect(webSerialSupport()).toMatchObject({ ok: false });
    const fakeSerial = { requestPort: () => Promise.reject(Object.assign(new Error('none'), { name: 'NotFoundError' })), getPorts: () => Promise.resolve([]), addEventListener: () => undefined, removeEventListener: () => undefined };
    const t = new WebSerialTransport(fakeSerial as never);
    await expect(t.open({ onLine: () => undefined, onClose: () => undefined, onGarbage: () => undefined })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(t.open({ onLine: () => undefined, onClose: () => undefined, onGarbage: () => undefined }, { reuseGrantedPort: true })).rejects.toMatchObject({ code: 'no-port' });
  });

  it('assigning motors to a driver keeps working with the reference profile (Phase 9 compatibility)', () => {
    openExplorer();
    referenceSetup();
    const driver = data().mappings.find((m) => m.partId === 'pololu-713')!;
    setMotorDriver(data().mappings.find((m) => m.targetId === objectId('Left Motor'))!.id, driver.id);
    expect(currentValidation().items.find((i) => i.id === 'part:motor:Left')!.level).toBe('ok');
    expect(modelView().actuators.length).toBe(2);
  });
});
