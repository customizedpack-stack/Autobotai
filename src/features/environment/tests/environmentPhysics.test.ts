import { afterEach, describe, expect, it } from 'vitest';
import { robotControl } from '../../controls/robotControlApi';
import { byName } from '../../controls/testUtils';
import { PhysicsWorld } from '../../physics/engine/physicsWorld';
import { loadRapier } from '../../physics/engine/rapierLoader';
import { activePhysicsController, selectEngine, setEnvironment, stepSimulation } from '../../physics/simulation/simulationManager';
import { FIXED_STEP } from '../../physics/physicsConfig';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import type { EnvironmentDefinition } from '../../../types/environment';
import { readSensor } from '../../sensors/core/sensorManager';
import type { ImuReading } from '../../sensors/core/sensorTypes';
import { botIn, ground, object } from './helpers';

afterEach(async () => {
  await selectEngine('kinematic');
});

const chassis = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id]!;
const env = (objects: EnvironmentDefinition['objects']): EnvironmentDefinition => ({ id: 'w', name: 'w', version: 1, templateId: null, objects, createdAt: '', updatedAt: '' });
const run = (w: PhysicsWorld, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) w.step(FIXED_STEP);
};

describe('environment objects in the Rapier world', () => {
  it('a custom static ground supports the robot (no default floor is added)', async () => {
    await botIn([ground()]);
    const world = activePhysicsController()!.physicsWorld!;
    expect(world.ground).toBeNull();
    expect(world.environmentBodies[0]).toMatchObject({ status: 'active', dynamic: false });
    expect(chassis().position[1]).toBeGreaterThan(0.05);
    stepSimulation(1);
    expect(Math.abs(chassis().position[1] - 0.0)).toBeLessThan(0.3);
  });

  it('an empty environment gets the default floor', async () => {
    await botIn([]);
    expect(activePhysicsController()!.physicsWorld!.ground).not.toBeNull();
  });

  it('a custom wall stops the robot', async () => {
    await botIn([ground(), object('wall', { position: [1.0, 0.2, 0], size: [0.1, 0.4, 2] })]);
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    stepSimulation(5);
    robotControl.drive.set(0, 'panel');
    expect(chassis().position[0]).toBeGreaterThan(0.5);
    expect(chassis().position[0]).toBeLessThan(0.95);
  });

  it('a dynamic box settles on the ground and is pushed by the robot', async () => {
    await botIn([ground(), object('box', { position: [0.55, 0.3, 0], size: [0.2, 0.2, 0.2], body: 'dynamic', mass: 0.3 })]);
    const world = activePhysicsController()!.physicsWorld!;
    const box = world.environmentBodies[1]!;
    expect(box).toMatchObject({ status: 'active', dynamic: true });
    const rest = world.environmentPose(box.objectId)!;
    expect(rest.position[1]).toBeCloseTo(0.1, 1);
    robotControl.drive.set(1, 'panel');
    stepSimulation(3);
    robotControl.drive.set(0, 'panel');
    expect(world.environmentPose(box.objectId)!.position[0]).toBeGreaterThan(0.8);
  });

  it('a ramp lifts the robot and tilts it nose-up (IMU pitch), from real contact', async () => {
    await botIn([ground(), object('ramp', { position: [1.0, 0.06, 0], size: [0.8, 0.12, 0.8] }), object('platform', { position: [1.8, 0.06, 0], size: [0.8, 0.12, 0.8] })]);
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    let maxPitch = 0;
    for (let i = 0; i < 180; i++) {
      stepSimulation(1 / 60);
      const imu = readSensor('main-imu') as ImuReading;
      if (imu.valid) maxPitch = Math.max(maxPitch, imu.euler.pitch);
    }
    robotControl.drive.set(0, 'panel');
    expect(maxPitch).toBeGreaterThan(0.05);
    expect(chassis().position[1]).toBeGreaterThan(0.1);
  });
});

describe('environment physics properties (direct world)', () => {
  it('friction: a box on a steep ramp slides with friction 0 and holds with friction 2', async () => {
    const rapier = await loadRapier();
    const slide = (friction: number) => {
      const w = new PhysicsWorld(rapier, {
        gravityEnabled: true,
        environment: env([
          ground(),
          object('ramp', { position: [0, 0.2, 0], size: [1, 0.4, 1], friction }),
          object('box', { position: [0, 0.32, 0], rotation: [0, 0, Math.atan2(0.4, 1)], size: [0.1, 0.1, 0.1], body: 'dynamic', friction, mass: 0.2 }),
        ]),
      });
      const id = w.environmentBodies[2]!.objectId;
      const start = w.environmentPose(id)!.position[0];
      run(w, 1.5);
      const moved = Math.abs(w.environmentPose(id)!.position[0] - start);
      w.dispose();
      return moved;
    };
    expect(slide(0)).toBeGreaterThan(0.2);
    expect(slide(2)).toBeLessThan(0.02);
  });

  it('restitution: a ball bounces with 0.8 and does not with 0', async () => {
    const rapier = await loadRapier();
    const bounce = (restitution: number) => {
      const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: env([ground({ restitution }), object('obstacle', { position: [0, 1, 0], size: [0.2, 0.2, 0.2], body: 'dynamic', restitution, mass: 0.3 }, 'sphere')]) });
      const id = w.environmentBodies[1]!.objectId;
      let landed = false;
      let peak = 0;
      for (let i = 0; i < 180; i++) {
        w.step(FIXED_STEP);
        const y = w.environmentPose(id)!.position[1];
        if (y < 0.12) landed = true;
        if (landed) peak = Math.max(peak, y);
      }
      w.dispose();
      return peak;
    };
    expect(bounce(0.8)).toBeGreaterThan(0.4);
    expect(bounce(0)).toBeLessThan(0.15);
  });

  it('collider sizes match the objects; failures are reported per object; collision off adds no collider', async () => {
    const rapier = await loadRapier();
    const bad = { ...object('box', { position: [3, 0.1, 0] }), size: [0, 0.2, 0.2] as [number, number, number] };
    const w = new PhysicsWorld(rapier, {
      gravityEnabled: true,
      environment: env([object('wall', { position: [2, 0.2, 0], size: [0.1, 0.4, 2] }), bad, object('platform', { position: [-2, 0.05, 0], collision: false })]),
    });
    expect(w.environmentBodies.map((b) => b.status)).toEqual(['active', 'failed', 'no-collision']);
    expect(w.environmentBodies[1]!.error).toMatch(/size/);
    const he = w.environmentBodies[0]!.collider!.halfExtents()!;
    expect(he.x).toBeCloseTo(0.05, 6);
    expect(he.y).toBeCloseTo(0.2, 6);
    expect(he.z).toBeCloseTo(1, 6);
    // Default floor + the wall only.
    expect(w.world.colliders.len()).toBe(2);
    w.dispose();
    expect(w.isDisposed).toBe(true);
  });

  it('a rebuild (Reset, environment change) never leaves duplicate bodies; Stop frees the world', async () => {
    const objects = [ground(), object('box', { position: [1, 0.1, 0.8], body: 'dynamic' }), object('wall', { position: [2, 0.2, 0] })];
    await botIn(objects);
    const controller = activePhysicsController()!;
    const count = () => ({ bodies: controller.physicsWorld!.world.bodies.len(), colliders: controller.physicsWorld!.world.colliders.len() });
    const before = count();
    robotControl.reset('panel');
    stepSimulation(0.2);
    expect(count()).toEqual(before);
    setEnvironment('floor');
    stepSimulation(0.2);
    expect(controller.physicsWorld!.environmentBodies).toHaveLength(0);
    const old = controller.physicsWorld!;
    await selectEngine('kinematic');
    expect(old.isDisposed).toBe(true);
    expect(activePhysicsController()).toBeNull();
  });
});
