import { afterEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { events, openExplorer } from '../../controls/testUtils';
import { pauseSimulation, resumeSimulation, selectEngine, stopSimulation, isSimulationLoopRunning } from '../../physics/simulation/simulationManager';
import { robotModel } from '../../robot-model/robotModelConnector';
import { activeSource, readSensor, sensorConfigs } from '../core/sensorManager';
import { useSensorStore } from '../core/sensorStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { RingBuffer } from '../stream/ringBuffer';
import { HISTORY_SIZE, sensorStream } from '../stream/sensorStream';
import { physicsBot, stepSimulation } from './helpers';

afterEach(async () => {
  await selectEngine('kinematic');
});

describe('C3 sensor stream', () => {
  it('ring buffer never grows past its capacity', () => {
    const b = new RingBuffer<number>(3);
    for (let i = 0; i < 10; i++) b.push(i);
    expect(b.toArray()).toEqual([7, 8, 9]);
    expect(b.size).toBe(3);
  });

  it('subscribe, unsubscribe, latest and bounded history', async () => {
    await physicsBot();
    const seen: number[] = [];
    const off = sensorStream.subscribe('main-imu', (r) => seen.push(r.sequence));
    const before = sensorStream.listenerCount;
    stepSimulation(0.5);
    expect(seen.length).toBe(30); // 60 Hz IMU for 0.5 s
    off();
    off();
    expect(sensorStream.listenerCount).toBe(before - 1);
    stepSimulation(3);
    expect(seen.length).toBe(30);
    expect(sensorStream.history('main-imu').length).toBe(HISTORY_SIZE);
    expect(sensorStream.latest('main-imu')!.sequence).toBeGreaterThan(seen.at(-1)!);
  });

  it('update rates: 20 Hz distance, 60 Hz encoders and IMU, from the one simulation tick', async () => {
    await physicsBot('obstacles');
    const counts: Record<string, number> = {};
    const off = sensorStream.subscribe('*', (r) => (counts[r.sensorId] = (counts[r.sensorId] ?? 0) + 1));
    stepSimulation(1);
    off();
    expect(counts['front-distance']).toBe(20);
    expect(counts['left-encoder']).toBe(60);
    expect(counts['main-imu']).toBe(60);
    robotModel.updateSensor('front-distance', { rateHz: 10 });
    const off2 = sensorStream.subscribe('front-distance', () => (counts.after = (counts.after ?? 0) + 1));
    stepSimulation(1);
    off2();
    expect(counts.after).toBe(10);
  });
});

describe('sensor lifecycle', () => {
  it('Explorer Bot gets four default sensors with unique ids; no duplicates are allowed', () => {
    openExplorer(false);
    expect(sensorConfigs().map((s) => s.id)).toEqual(['front-distance', 'left-encoder', 'right-encoder', 'main-imu']);
    const result = robotModel.addSensor({ ...sensorConfigs()[0]! });
    expect(result.ok).toBe(false);
    expect(sensorConfigs()).toHaveLength(4);
  });

  it('pause stops new readings (marked stale); resume continues with one loop', async () => {
    await physicsBot();
    stepSimulation(0.2);
    pauseSimulation();
    const seq = readSensor('main-imu')!.sequence;
    stepSimulation(1); // ignored while paused
    const paused = readSensor('main-imu')!;
    expect(paused.sequence).toBe(seq);
    expect(paused.stale).toBe(true);
    expect(useSensorStore.getState().stream).toBe('paused');
    resumeSimulation();
    expect(isSimulationLoopRunning()).toBe(false); // manual clock in tests: still no second loop
    stepSimulation(0.1);
    expect(readSensor('main-imu')!.sequence).toBe(seq + 6);
    expect(useSensorStore.getState().stream).toBe('running');
  });

  it('disabled sensors produce no readings and say so; enabling resumes them', async () => {
    await physicsBot();
    robotModel.updateSensor('main-imu', { enabled: false });
    const seq = readSensor('main-imu')!.sequence;
    stepSimulation(0.5);
    const r = readSensor('main-imu')!;
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Sensor is disabled.');
    expect(r.sequence).toBe(seq);
    expect(events('sensor.event').some((e) => e.sensorId === 'main-imu' && e.event === 'disabled')).toBe(true);
    robotModel.updateSensor('main-imu', { enabled: true });
    stepSimulation(0.5);
    expect(readSensor('main-imu')!.sequence).toBeGreaterThan(seq);
  });

  it('stopping the simulation stops every sensor and clears readings; nothing keeps sampling', async () => {
    await physicsBot();
    stopSimulation();
    // Physics is still the chosen engine but stopped: no sensor source at all.
    expect(activeSource()).toBeNull();
    expect(events('sensor.stream').at(-1)).toMatchObject({ state: 'off', source: 'physics' });
    expect(readSensor('main-imu')!.error).toMatch(/Start the physics simulation/);
    expect(events('sensor.event').filter((e) => e.event === 'stopped' && e.source === 'physics')).toHaveLength(4);
    setWorkspaceMode('build');
    expect(activeSource()).toBeNull();
    expect(readSensor('main-imu')!.valid).toBe(false);
    expect(useSensorStore.getState().stream).toBe('off');
    expect(Object.keys(useSensorStore.getState().readings)).toHaveLength(0);
  });

  it('switching engines never leaves two sources: kinematic ↔ physics', async () => {
    openExplorer(false);
    setWorkspaceMode('control');
    expect(activeSource()).toBe('kinematic');
    await selectEngine('physics');
    expect(activeSource()).toBe('physics');
    expect(readSensor('main-imu')!.source).toBe('physics');
    await selectEngine('kinematic');
    expect(activeSource()).toBe('kinematic');
    expect(readSensor('main-imu')!.source).toBe('kinematic');
    const started = events('sensor.stream').map((e) => `${e.state}:${e.source}`);
    expect(started).toEqual(['running:kinematic', 'off:kinematic', 'running:physics', 'off:physics', 'running:kinematic']);
  });

  it('removing a part removes its sensor in the same undo step; undo brings both back', () => {
    openExplorer(false);
    const part = robotModel.getModel().objects.find((o) => o.name === 'Distance Sensor')!;
    robotModel.removeComponent(part.id);
    expect(sensorConfigs().some((s) => s.id === 'front-distance')).toBe(false);
    expect(events('robotModel.sensorChanged')).toContainEqual({ sensorId: 'front-distance', change: 'removed' });
    useSceneStore.getState().undo();
    expect(sensorConfigs().some((s) => s.id === 'front-distance')).toBe(true);
    expect(useSceneStore.getState().objects.some((o) => o.id === part.id)).toBe(true);
  });
});
