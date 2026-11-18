import { afterEach, describe, expect, it } from 'vitest';
import { robotControl } from '../../controls/robotControlApi';
import { byName } from '../../controls/testUtils';
import { setWorkspaceMode } from '../../controls/controlSession';
import { openExplorer } from '../../controls/testUtils';
import { robotModel } from '../../robot-model/robotModelConnector';
import { selectEngine } from '../../physics/simulation/simulationManager';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { rayAngles } from '../distance/distanceSensor';
import { readSensor } from '../core/sensorManager';
import type { DistanceReading } from '../core/sensorTypes';
import { distance, physicsBot, stepSimulation } from './helpers';

afterEach(async () => {
  await selectEngine('kinematic');
});

describe('distance sensor (Rapier ray casts)', () => {
  it('measures the wall of the obstacle course from the sensor pose', async () => {
    await physicsBot('obstacles');
    const r = distance();
    expect(r.valid).toBe(true);
    expect(r.source).toBe('physics');
    expect(r.status).toBe('hit');
    expect(r.detected).toBe(true);
    // Wall face at x = 1.35; sensor about 0.215 m ahead of the chassis center at x ≈ 0.
    expect(r.distance!).toBeGreaterThan(1.05);
    expect(r.distance!).toBeLessThan(1.2);
    expect(r.hitPoint!.x).toBeCloseTo(1.35, 2);
    expect(r.hitNormal!.x).toBeCloseTo(-1, 2);
  });

  it('reports no hit as distance null (never 0) on an empty floor, ignoring the ground', async () => {
    await physicsBot('floor');
    const r = distance();
    expect(r.valid).toBe(true);
    expect(r.distance).toBeNull();
    expect(r.detected).toBe(false);
    expect(r.status).toBe('no-hit');
    expect(r.maxRange).toBe(4);
  });

  it('distance shrinks as the robot drives toward the wall', async () => {
    await physicsBot('obstacles');
    const before = distance().distance!;
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    stepSimulation(1);
    robotControl.drive.set(0, 'panel');
    stepSimulation(0.5);
    const after = distance().distance!;
    expect(after).toBeLessThan(before - 0.2);
  });

  it('respects the maximum and minimum range', async () => {
    await physicsBot('obstacles', () => {
      robotModel.updateSensor('front-distance', { maxRange: 0.8 });
    });
    expect(distance().status).toBe('no-hit');
    expect(distance().distance).toBeNull();
    robotModel.updateSensor('front-distance', { maxRange: 4, minRange: 2 });
    stepSimulation(0.2);
    const r = distance();
    expect(r.status).toBe('too-close');
    expect(r.detected).toBe(true);
    expect(r.distance).toBeNull();
  });

  it('never detects its own robot: a ray pointing back through the chassis sees nothing', async () => {
    await physicsBot('floor', () => {
      robotModel.updateSensor('front-distance', { rotation: [0, Math.PI, 0] });
    });
    const r = distance();
    expect(r.valid).toBe(true);
    expect(r.direction.x).toBeLessThan(-0.99);
    expect(r.status).toBe('no-hit');
  });

  it('detects the ground only when ground filtering is off', async () => {
    await physicsBot('floor', () => {
      // Tilt the sensor 30° down (negative rotation about Z points +X downward).
      robotModel.updateSensor('front-distance', { rotation: [0, 0, -Math.PI / 6] });
    });
    expect(distance().status).toBe('no-hit');
    robotModel.updateSensor('front-distance', { ignoreGround: false });
    stepSimulation(0.2);
    const r = distance();
    expect(r.status).toBe('hit');
    expect(r.hitPoint!.y).toBeCloseTo(0, 3);
    expect(r.hitNormal!.y).toBeCloseTo(1, 3);
    // Sensor height h above the ground: distance ≈ h / sin(30°).
    expect(r.distance!).toBeCloseTo(r.origin.y / Math.sin(Math.PI / 6), 2);
  });

  it('multi-ray scan returns every ray and the nearest hit', async () => {
    await physicsBot('obstacles', () => {
      robotModel.updateSensor('front-distance', { rays: 5, fov: Math.PI / 2 });
    });
    const r = distance();
    expect(r.rays).toHaveLength(5);
    expect(r.rays.map((x) => x.angle)).toEqual(rayAngles(5, Math.PI / 2));
    const hits = r.rays.filter((x) => x.status === 'hit').map((x) => x.distance!);
    expect(r.distance).toBe(Math.min(...hits));
    // The center ray (0 rad) hits the wall straight ahead; side rays are longer or hit the blocks.
    expect(r.rays[2]!.angle).toBe(0);
  });

  it('Kinematic mode: the distance sensor reports clearly that it needs the Physics engine', () => {
    openExplorer(false);
    setWorkspaceMode('control');
    const r = readSensor('front-distance') as DistanceReading;
    expect(r.valid).toBe(false);
    expect(r.distance).toBeNull();
    expect(r.error).toMatch(/needs the Physics engine/);
    expect(r.source).toBe('kinematic');
  });

  it('Build Mode: no sensor runs; reads say where sensors work', () => {
    openExplorer(false);
    const r = readSensor('front-distance')!;
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Control Mode and Code Studio/);
    expect(byName('Distance Sensor')).toBeDefined();
  });
});
