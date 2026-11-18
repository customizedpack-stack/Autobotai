import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { openExplorer } from '../../controls/testUtils';
import { configureExecution, pauseProgram, resumeProgram, runProgram, stopProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { selectEngine, setEnvironment, setSimulationScheduler } from '../../physics/simulation/simulationManager';
import { useConsoleStore } from '../../../stores/consoleStore';
import { sensorStream } from '../stream/sensorStream';
import { SandboxSensorBridge } from '../api/sandboxSensorBridge';

/** Code Studio programs reading sensors: sandbox → bridge → sensor API (C3). Real-time loop. */

const state = () => useExecutionStore.getState().state;
const messages = () => useConsoleStore.getState().entries.map((e) => e.message);
const run = (code: string) => runProgram({ programId: 'p_sensors', programName: 'Sensors', language: 'javascript', code });

beforeEach(async () => {
  openExplorer(false);
  setWorkspaceMode('code');
  useExecutionStore.getState().set({ ...IDLE_STATUS });
  useConsoleStore.setState({ entries: [], events: [] });
  configureExecution({ sandbox: inProcessSandbox() });
  setSimulationScheduler({
    request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  });
});
afterEach(async () => {
  stopProgram();
  await selectEngine('kinematic');
  setSimulationScheduler(null);
  configureExecution();
});

describe('robotSensors in JavaScript programs', () => {
  it('reads the distance sensor, the IMU and an encoder (physics) and lists the sensors', async () => {
    await selectEngine('physics');
    setEnvironment('obstacles');
    expect(
      run(`const list = await robotSensors.list();
console.log("sensors", list.map((s) => s.id).join(","));
await wait(200);
const d = await robotSensors.distance("front-distance").read();
console.log("distance", d.valid, d.status, d.distance.toFixed(2));
console.log("meters", (await robotSensors.distance("front-distance").meters()).toFixed(2));
console.log("obstacle", await robotSensors.distance("front-distance").isObstacleDetected(2));
const imu = await robotSensors.imu("main-imu").read();
console.log("imu", imu.valid, imu.specificForce.y.toFixed(1));
const e = await robotSensors.encoder("left-encoder").read();
console.log("encoder", e.valid, e.ticksPerRevolution);`).ok,
    ).toBe(true);
    await until(() => state() === 'completed', 8000);
    const log = messages().join('\n');
    expect(log).toContain('Program: sensors front-distance,left-encoder,right-encoder,main-imu');
    expect(log).toMatch(/Program: distance true hit 1\.1\d/);
    expect(log).toMatch(/Program: meters 1\.1\d/);
    expect(log).toContain('Program: obstacle true');
    expect(log).toContain('Program: imu true 9.8');
    expect(log).toContain('Program: encoder true 360');
  });

  it('subscribe delivers readings (at most 20 per second); unsubscribe ends them and lets the program finish', async () => {
    await selectEngine('physics');
    expect(
      run(`let n = 0;
const sub = await robotSensors.imu("main-imu").subscribe(() => { n += 1; });
await wait(1000);
await sub.unsubscribe();
console.log("count", n);`).ok,
    ).toBe(true);
    await until(() => state() === 'completed', 8000);
    const count = Number(messages().find((m) => m.startsWith('Program: count '))!.split(' ').pop());
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThanOrEqual(22);
    expect(sensorStream.listenerCount).toBe(0);
  });

  it('Stop ends every subscription of the run (no listener is left behind)', async () => {
    await selectEngine('physics');
    const before = sensorStream.listenerCount;
    run(`await robotSensors.distance("front-distance").subscribe(() => {});
await robotSensors.imu("main-imu").subscribe(() => {});
await wait(10000);`);
    await until(() => sensorStream.listenerCount === before + 2, 5000);
    stopProgram();
    expect(sensorStream.listenerCount).toBe(before);
  });

  it('unknown sensor ids and wrong types give clear errors', async () => {
    run(`await robotSensors.distance("no-such").read();`);
    await until(() => state() === 'error', 5000);
    expect(useExecutionStore.getState().error!.message).toMatch(/no sensor "no-such". Sensors: front-distance/);
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    run(`await robotSensors.distance("main-imu").read();`);
    await until(() => state() === 'error', 5000);
    expect(useExecutionStore.getState().error!.message).toBe('"main-imu" is an IMU, not a distance sensor.');
  });

  it('Kinematic mode: distance meters() stops with the clear reason; IMU and encoders work', async () => {
    run(`const imu = await robotSensors.imu("main-imu").read();
console.log("imu", imu.source, imu.valid);
console.log("ticks", await robotSensors.encoder("left-encoder").value("ticks"));
await robotSensors.distance("front-distance").meters();`);
    await until(() => state() === 'error', 5000);
    expect(messages()).toContain('Program: imu kinematic true');
    expect(messages()).toContain('Program: ticks 0');
    expect(useExecutionStore.getState().error!.message).toMatch(/needs the Physics engine/);
  });

  it('a paused program receives no sensor readings; after resume they continue', async () => {
    await selectEngine('physics');
    run(`let n = 0;
await robotSensors.imu("main-imu").subscribe(() => { n += 1; });
for (let i = 0; i < 40; i++) { await wait(50); console.log("n", n); }`);
    await until(() => messages().some((m) => m === 'Program: n 3' || m === 'Program: n 4'), 5000);
    pauseProgram();
    const atPause = useConsoleStore.getState().entries.length;
    await new Promise((r) => setTimeout(r, 400));
    expect(useConsoleStore.getState().entries.length - atPause).toBeLessThanOrEqual(2);
    resumeProgram();
    await until(() => messages().filter((m) => m.startsWith('Program: n ')).length > 10, 5000);
    stopProgram();
  });
});

describe('sandbox sensor bridge limits and ownership', () => {
  it('limits subscriptions per run and reads per second; old runs cannot use sensors', async () => {
    const pushed: unknown[] = [];
    let t = 0;
    const bridge = new SandboxSensorBridge({ sessionId: 'run_a', limits: { maxSensorReadsPerSecond: 3, maxSensorSubscriptions: 2, maxSensorHz: 20 }, push: (m) => pushed.push(m), now: () => t });
    await bridge.handle('sensor.subscribe', { sensorId: 'main-imu', type: 'imu' });
    await bridge.handle('sensor.subscribe', { sensorId: 'left-encoder', type: 'encoder' });
    await expect(bridge.handle('sensor.subscribe', { sensorId: 'right-encoder', type: 'encoder' })).rejects.toThrow(/limit is 2/);
    await bridge.handle('sensor.read', { sensorId: 'main-imu', type: 'imu' });
    await bridge.handle('sensor.read', { sensorId: 'main-imu', type: 'imu' });
    await bridge.handle('sensor.list', {});
    await expect(bridge.handle('sensor.read', { sensorId: 'main-imu', type: 'imu' })).rejects.toThrow(/limit is 3 per second/);
    t = 1500;
    await bridge.handle('sensor.read', { sensorId: 'main-imu', type: 'imu' });
    await expect(bridge.handle('sensor.read', { sensorId: 'Bad Id', type: 'imu' })).rejects.toThrow(/not a valid sensor id/);
    bridge.dispose();
    expect(bridge.activeSubscriptions).toBe(0);
    await expect(bridge.handle('sensor.read', { sensorId: 'main-imu', type: 'imu' })).rejects.toThrow(/no longer running/);
  });

  it('a run is tied to its project: after opening another project its sensor calls are refused', async () => {
    const bridge = new SandboxSensorBridge({ sessionId: 'run_b', limits: { maxSensorReadsPerSecond: 100, maxSensorSubscriptions: 8, maxSensorHz: 20 }, push: () => undefined });
    openExplorer(false);
    await expect(bridge.handle('sensor.list', {})).rejects.toThrow(/project changed/);
    bridge.dispose();
  });
});
