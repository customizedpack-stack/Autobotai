import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { step } from '../../controls/movementEngine';
import { robotControl } from '../../controls/robotControlApi';
import { openExplorer } from '../../controls/testUtils';
import { configureExecution, runProgram, stopProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { DEFAULT_LIMITS } from '../../code-studio/runtime/executionLimits';
import { useConsoleStore } from '../../../stores/consoleStore';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { SandboxSensorBridge, type SandboxSensorLimits } from '../api/sandboxSensorBridge';
import { readSensor } from '../core/sensorManager';
import type { EncoderReading } from '../core/sensorTypes';
import { sensorStream } from '../stream/sensorStream';

/** Phase 6 correction B: encoder resets have their own per-run rate limit. */

const LIMITS: SandboxSensorLimits = { maxSensorReadsPerSecond: 200, maxSensorSubscriptions: 8, maxSensorHz: 20, maxEncoderResetsPerSecond: 3 };
const angle = () => (readSensor('left-encoder') as EncoderReading).angle;

function drive() {
  useRobotStateStore.getState().setSpeedPercent(100);
  robotControl.drive.set(1, 'panel');
  for (let i = 0; i < 60; i++) step(1 / 60);
  robotControl.drive.set(0, 'panel');
  step(1 / 60);
}

beforeEach(() => {
  openExplorer(false);
  setWorkspaceMode('code');
});

describe('encoder reset rate protection (bridge)', () => {
  it('a normal reset sets the counter to 0; repeated resets within the limit work', async () => {
    let t = 0;
    const bridge = new SandboxSensorBridge({ sessionId: 'run_1', limits: LIMITS, push: () => undefined, now: () => t });
    drive();
    expect(angle()).toBeGreaterThan(1);
    await expect(bridge.handle('sensor.resetEncoder', { sensorId: 'left-encoder' })).resolves.toEqual({ ok: true });
    expect(angle()).toBe(0);
    t = 10;
    await bridge.handle('sensor.resetEncoder', { sensorId: 'left-encoder' });
    t = 20;
    await bridge.handle('sensor.resetEncoder', { sensorId: 'right-encoder' });
    bridge.dispose();
  });

  it('excessive resets are rejected with a clear SensorApiError; reads are not affected; the window recovers', async () => {
    let t = 0;
    const bridge = new SandboxSensorBridge({ sessionId: 'run_2', limits: LIMITS, push: () => undefined, now: () => t });
    for (let i = 0; i < 3; i++) await bridge.handle('sensor.resetEncoder', { sensorId: 'left-encoder' });
    drive();
    const before = angle();
    const rejected = bridge.handle('sensor.resetEncoder', { sensorId: 'left-encoder' });
    await expect(rejected).rejects.toThrow('Too many encoder resets: the limit is 3 per second. Reset once, then read the encoder.');
    await expect(rejected).rejects.toMatchObject({ name: 'SensorApiError' });
    // The rejected reset changed nothing, and reads still work.
    expect(angle()).toBe(before);
    for (let i = 0; i < 20; i++) await expect(bridge.handle('sensor.read', { sensorId: 'left-encoder', type: 'encoder' })).resolves.toMatchObject({ valid: true });
    t = 1001;
    await expect(bridge.handle('sensor.resetEncoder', { sensorId: 'left-encoder' })).resolves.toEqual({ ok: true });
    bridge.dispose();
  });

  it('a new run starts with fresh limits; an ended (stale) run cannot reset', async () => {
    const old = new SandboxSensorBridge({ sessionId: 'run_old', limits: LIMITS, push: () => undefined, now: () => 0 });
    for (let i = 0; i < 3; i++) await old.handle('sensor.resetEncoder', { sensorId: 'left-encoder' });
    await expect(old.handle('sensor.resetEncoder', { sensorId: 'left-encoder' })).rejects.toThrow(/Too many encoder resets/);
    old.dispose();
    await expect(old.handle('sensor.resetEncoder', { sensorId: 'left-encoder' })).rejects.toThrow('The program is no longer running.');
    const fresh = new SandboxSensorBridge({ sessionId: 'run_new', limits: LIMITS, push: () => undefined, now: () => 0 });
    await expect(fresh.handle('sensor.resetEncoder', { sensorId: 'left-encoder' })).resolves.toEqual({ ok: true });
    fresh.dispose();
  });

  it('an old run cannot reset encoders in a newly opened project', async () => {
    const bridge = new SandboxSensorBridge({ sessionId: 'run_p', limits: LIMITS, push: () => undefined });
    openExplorer(false);
    setWorkspaceMode('code');
    drive();
    const before = angle();
    await expect(bridge.handle('sensor.resetEncoder', { sensorId: 'left-encoder' })).rejects.toThrow('The robot project changed. Run the program again.');
    expect(angle()).toBe(before);
    bridge.dispose();
  });

  it('the default limit is 10 resets per second', () => {
    expect(DEFAULT_LIMITS.maxEncoderResetsPerSecond).toBe(10);
  });
});

describe('encoder reset limit in programs', () => {
  beforeEach(() => {
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    useConsoleStore.setState({ entries: [], events: [] });
    configureExecution({ sandbox: inProcessSandbox() });
  });
  afterEach(() => {
    stopProgram();
    configureExecution();
  });

  it('the 11th reset in a second fails in the program with the clear message', async () => {
    expect(
      runProgram({
        programId: 'p_r',
        programName: 'Resets',
        language: 'javascript',
        code: `for (let i = 0; i < 11; i++) { await robotSensors.encoder("left-encoder").reset(); }`,
      }).ok,
    ).toBe(true);
    await until(() => useExecutionStore.getState().state === 'error', 5000);
    expect(useExecutionStore.getState().error!.message).toBe('Too many encoder resets: the limit is 10 per second. Reset once, then read the encoder.');
  });

  it('Stop while reset requests are pending ends the run cleanly; the next run can reset again', async () => {
    const listeners = sensorStream.listenerCount;
    runProgram({
      programId: 'p_s',
      programName: 'Pending',
      language: 'javascript',
      code: `await robotSensors.imu("main-imu").subscribe(() => {});
const pending = [];
for (let i = 0; i < 30; i++) pending.push(robotSensors.encoder("left-encoder").reset().catch(() => "rejected"));
await wait(10000);`,
    });
    await until(() => useExecutionStore.getState().state === 'running', 5000);
    await new Promise((r) => setTimeout(r, 50));
    stopProgram();
    expect(useExecutionStore.getState().state).toBe('idle');
    expect(sensorStream.listenerCount).toBe(listeners);
    runProgram({ programId: 'p_n', programName: 'Next', language: 'javascript', code: `console.log(JSON.stringify(await robotSensors.encoder("left-encoder").reset()));` });
    await until(() => useExecutionStore.getState().state === 'completed', 5000);
    expect(useConsoleStore.getState().entries.map((e) => e.message)).toContain('Program: {"ok":true}');
  });
});
