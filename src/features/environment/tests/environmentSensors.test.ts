import { afterEach, describe, expect, it } from 'vitest';
import { robotModel } from '../../robot-model/robotModelConnector';
import { selectEngine, setEnvironment, stepSimulation } from '../../physics/simulation/simulationManager';
import { readSensor } from '../../sensors/core/sensorManager';
import type { DistanceReading, EncoderReading } from '../../sensors/core/sensorTypes';
import { robotControl } from '../../controls/robotControlApi';
import { botIn, ground, object, saveEnv } from './helpers';
import { useRobotStateStore } from '../../../stores/robotStateStore';

/** Phase 6 sensors in Phase 7 custom environments: real Rapier ray casts and rigid-body state. */

afterEach(async () => {
  await selectEngine('kinematic');
});

const distance = () => readSensor('front-distance') as DistanceReading;

describe('distance sensor in custom environments', () => {
  it('detects a custom wall at the right distance', async () => {
    await botIn([ground(), object('wall', { position: [1.2, 0.2, 0], size: [0.1, 0.4, 2] })]);
    const r = distance();
    expect(r.status).toBe('hit');
    expect(r.hitPoint!.x).toBeCloseTo(1.15, 2);
    expect(r.distance!).toBeCloseTo(1.15 - r.origin.x, 3);
  });

  it('detects a custom box and an obstacle pillar', async () => {
    await botIn([ground(), object('box', { position: [0.9, 0.15, 0], size: [0.3, 0.3, 0.3], body: 'static' })]);
    expect(distance().hitPoint!.x).toBeCloseTo(0.75, 2);
    await botIn([ground(), object('obstacle', { position: [0.9, 0.3, 0], size: [0.2, 0.6, 0.2] }, 'cylinder')]);
    expect(distance().hitPoint!.x).toBeCloseTo(0.8, 2);
  });

  it('the reading updates after the obstacle is moved (edit, save, rebuild)', async () => {
    const env = await botIn([ground(), object('wall', { position: [1.2, 0.2, 0], size: [0.1, 0.4, 2] })]);
    const before = distance().distance!;
    saveEnv([env.objects[0]!, { ...env.objects[1]!, position: [0.8, 0.2, 0] }], env.id);
    setEnvironment(env.id); // the running simulation rebuilds from the saved definition
    stepSimulation(0.3);
    expect(distance().distance!).toBeCloseTo(before - 0.4, 2);
  });

  it('the reading updates after the obstacle is rotated', async () => {
    const env = await botIn([ground(), object('box', { position: [1.0, 0.2, 0], size: [0.4, 0.4, 0.4], body: 'static' })]);
    const face = distance().distance!;
    saveEnv([env.objects[0]!, { ...env.objects[1]!, rotation: [0, Math.PI / 4, 0] }], env.id);
    setEnvironment(env.id);
    stepSimulation(0.3);
    // The 45°-rotated box points a corner at the robot: 0.2·√2 − 0.2 ≈ 0.083 m closer.
    expect(face - distance().distance!).toBeCloseTo(0.2 * Math.SQRT2 - 0.2, 2);
  });

  it('a pushed dynamic box moves in the sensor reading too (live world)', async () => {
    await botIn([ground(), object('box', { position: [0.7, 0.15, 0], size: [0.3, 0.3, 0.6], body: 'dynamic', mass: 0.3 })]);
    const before = distance().hitPoint!.x;
    expect(before).toBeCloseTo(0.55, 1);
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    stepSimulation(2);
    robotControl.drive.set(0, 'panel');
    stepSimulation(0.3);
    const after = distance();
    expect(after.detected).toBe(true);
    expect(after.hitPoint!.x).toBeGreaterThan(before + 0.1);
  });

  it('self-collision stays filtered and no-hit stays null in a custom environment', async () => {
    await botIn([ground()], 1);
    expect(distance().status).toBe('no-hit');
    expect(distance().distance).toBeNull();
    robotModel.updateSensor('front-distance', { rotation: [0, Math.PI, 0] });
    stepSimulation(0.2);
    expect(distance().status).toBe('no-hit');
  });

  it('custom ground planes are ignored by default and seen when ground filtering is off', async () => {
    await botIn([ground()]);
    robotModel.updateSensor('front-distance', { rotation: [0, 0, -Math.PI / 6] });
    stepSimulation(0.2);
    expect(distance().status).toBe('no-hit');
    robotModel.updateSensor('front-distance', { ignoreGround: false });
    stepSimulation(0.2);
    expect(distance().status).toBe('hit');
    expect(distance().hitPoint!.y).toBeCloseTo(0, 2);
  });
});

describe('encoders and IMU in custom environments', () => {
  it('a wall that stops the robot also stops the wheels from turning (encoders read the real joints)', async () => {
    await botIn([ground(), object('wall', { position: [0.9, 0.2, 0], size: [0.1, 0.4, 2], friction: 0.9 })]);
    robotControl.drive.set(1, 'panel');
    stepSimulation(4);
    const pressed = (readSensor('left-encoder') as EncoderReading).distance!;
    robotControl.drive.set(0, 'panel');
    // Rolled distance ≈ how far the robot got (≈ 0.4 m to the wall), not the 2 m that 4 s of driving would give.
    expect(pressed).toBeLessThan(1.2);
  });
});
