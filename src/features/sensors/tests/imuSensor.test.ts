import { afterEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { step } from '../../controls/movementEngine';
import { robotControl } from '../../controls/robotControlApi';
import { openExplorer } from '../../controls/testUtils';
import { selectEngine, setGravityEnabled } from '../../physics/simulation/simulationManager';
import { robotModel } from '../../robot-model/robotModelConnector';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { readSensor } from '../core/sensorManager';
import type { ImuReading } from '../core/sensorTypes';
import { eulerFromQuat } from '../imu/imuMath';
import { imu, physicsBot, stepSimulation } from './helpers';

afterEach(async () => {
  await selectEngine('kinematic');
});

describe('IMU math', () => {
  it('roll, pitch and yaw from a quaternion', () => {
    const yaw = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
    expect(eulerFromQuat(yaw(0.5)).yaw).toBeCloseTo(0.5, 9);
    const pitch = { x: 0, y: 0, z: Math.sin(0.2), w: Math.cos(0.2) };
    expect(eulerFromQuat(pitch).pitch).toBeCloseTo(0.4, 9);
    const roll = { x: Math.sin(0.15), y: 0, z: 0, w: Math.cos(0.15) };
    expect(eulerFromQuat(roll).roll).toBeCloseTo(0.3, 9);
  });
});

describe('IMU on the physics engine', () => {
  it('at rest: level orientation, no rotation, gravity-free acceleration ≈ 0, specific force ≈ +9.81 up', async () => {
    await physicsBot();
    const r = imu();
    expect(r.valid).toBe(true);
    expect(Math.abs(r.euler.roll) + Math.abs(r.euler.pitch)).toBeLessThan(0.02);
    expect(Math.hypot(r.angularVelocity.x, r.angularVelocity.y, r.angularVelocity.z)).toBeLessThan(0.02);
    expect(Math.hypot(r.linearAcceleration.x, r.linearAcceleration.y, r.linearAcceleration.z)).toBeLessThan(0.1);
    expect(r.specificForce.y).toBeCloseTo(9.81, 1);
    expect(r.frame).toBe('sensor');
  });

  it('turning left gives positive yaw rate; the yaw angle follows the real heading', async () => {
    await physicsBot();
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.turn.set(1, 'panel');
    stepSimulation(1);
    const r = imu();
    expect(r.angularVelocity.y).toBeGreaterThan(0.5);
    expect(r.euler.yaw).toBeGreaterThan(0.4);
    robotControl.turn.set(0, 'panel');
  });

  it('starting to drive forward shows forward acceleration; braking shows negative', async () => {
    await physicsBot();
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    stepSimulation(1 / 30);
    expect(imu().linearAcceleration.x).toBeGreaterThan(0.3);
    stepSimulation(1.5);
    robotControl.drive.set(0, 'panel');
    stepSimulation(1 / 30);
    expect(imu().linearAcceleration.x).toBeLessThan(-0.3);
  });

  it('gravity off: specific force ≈ 0 (a floating robot is weightless)', async () => {
    await physicsBot();
    setGravityEnabled(false);
    stepSimulation(0.5);
    const r = imu();
    expect(Math.hypot(r.specificForce.x, r.specificForce.y, r.specificForce.z)).toBeLessThan(0.2);
    setGravityEnabled(true);
  });

  it('world frame option reports vectors in world axes', async () => {
    await physicsBot('floor', () => {
      robotModel.updateSensor('main-imu', { frame: 'world', rotation: [Math.PI / 2, 0, 0] });
    });
    const r = imu();
    expect(r.frame).toBe('world');
    // Rolled 90° on its mount, yet in world axes gravity's reaction still points up (+Y).
    expect(r.specificForce.y).toBeCloseTo(9.81, 1);
    expect(r.euler.roll).toBeCloseTo(Math.PI / 2, 1);
  });

  it('no spike after a reset: the first sample after it is "warming up", then valid', async () => {
    await physicsBot();
    robotControl.drive.set(1, 'panel');
    stepSimulation(1);
    robotControl.reset('panel');
    stepSimulation(1 / 60);
    const first = imu();
    expect(first.valid).toBe(false);
    expect(first.error).toMatch(/Warming up/);
    stepSimulation(0.5);
    const r = imu();
    expect(r.valid).toBe(true);
    expect(Math.abs(r.linearAcceleration.x)).toBeLessThan(1);
  });
});

describe('IMU on the kinematic engine', () => {
  it('turning in place gives the commanded yaw rate; at rest everything is zero', () => {
    openExplorer(false);
    setWorkspaceMode('control');
    const rest = readSensor('main-imu') as ImuReading;
    expect(rest.valid).toBe(true);
    expect(rest.specificForce.y).toBeCloseTo(9.81, 2);
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.turn.set(1, 'panel');
    for (let i = 0; i < 60; i++) step(1 / 60);
    const r = readSensor('main-imu') as ImuReading;
    expect(r.source).toBe('kinematic');
    expect(r.angularVelocity.y).toBeGreaterThan(0.5);
    robotControl.turn.set(0, 'panel');
    step(1 / 60);
    const after = readSensor('main-imu') as ImuReading;
    expect(after.angularVelocity.y).toBe(0);
    expect(after.linearAcceleration.x).toBe(0);
  });
});
