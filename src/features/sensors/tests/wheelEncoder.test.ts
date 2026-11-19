import { afterEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { step } from '../../controls/movementEngine';
import { robotControl } from '../../controls/robotControlApi';
import { byName, openExplorer } from '../../controls/testUtils';
import { activePhysicsController, selectEngine } from '../../physics/simulation/simulationManager';
import { robotModel } from '../../robot-model/robotModelConnector';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { currentOdometry, readSensor, resetEncoder } from '../core/sensorManager';
import type { EncoderReading } from '../core/sensorTypes';
import { angleDelta, EncoderState } from '../encoders/wheelEncoder';
import { encoder, physicsBot, stepSimulation } from './helpers';

afterEach(async () => {
  await selectEngine('kinematic');
});

const chassisX = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id]!.position[0];

describe('wheel encoder math', () => {
  it('angle wrapping: the shortest signed difference', () => {
    expect(angleDelta(3.1, -3.1)).toBeCloseTo(2 * Math.PI - 6.2, 9);
    expect(angleDelta(-3.1, 3.1)).toBeCloseTo(-(2 * Math.PI - 6.2), 9);
    expect(angleDelta(0.2, 0.5)).toBeCloseTo(0.3, 9);
  });

  it('counts continuously across many revolutions in both directions', () => {
    const e = new EncoderState();
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    for (let a = 0; a <= 20; a += 0.3) e.update(wrap(a));
    expect(e.raw).toBeCloseTo(19.8, 6);
    let last = 0;
    for (let a = 19.8; a >= -5; a -= 0.3) {
      e.update(wrap(a));
      last = a;
    }
    expect(e.raw).toBeCloseTo(last, 6);
    e.reset();
    expect(e.raw).toBe(0);
  });
});

describe('wheel encoders on the physics engine', () => {
  it('Explorer Bot encoders count up when driving forward, continuously past one revolution', async () => {
    await physicsBot();
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    stepSimulation(3);
    const left = encoder('left-encoder');
    const right = encoder('right-encoder');
    expect(left.valid && right.valid).toBe(true);
    expect(left.angle).toBeGreaterThan(2 * Math.PI * 2);
    expect(right.angle).toBeGreaterThan(2 * Math.PI * 2);
    expect(left.revolutions).toBeCloseTo(left.angle / (2 * Math.PI), 9);
    expect(left.ticks).toBe(Math.trunc(left.revolutions * 360));
    expect(left.angularVelocity).toBeGreaterThan(5);
    // Rolled distance matches how far the robot really went (wheels grip, so within a few percent).
    expect(left.distance!).toBeCloseTo(chassisX(), 1);
    robotControl.drive.set(0, 'panel');
  });

  it('reverse rotation counts down; reset sets the counter to 0 at the current angle', async () => {
    await physicsBot();
    robotControl.drive.set(-1, 'panel');
    stepSimulation(1.5);
    expect(encoder('left-encoder').angle).toBeLessThan(-1);
    robotControl.drive.set(0, 'panel');
    stepSimulation(0.5);
    expect(resetEncoder('left-encoder')).toEqual({ ok: true });
    expect(encoder('left-encoder').angle).toBeCloseTo(0, 6);
    expect(encoder('right-encoder').angle).toBeLessThan(-1);
    expect(resetEncoder('main-imu')).toEqual({ ok: false, error: '"main-imu" is not a wheel encoder.' });
  });

  it('encoders read the actual wheel joint angle from the physics world (not the request)', async () => {
    await physicsBot();
    robotControl.drive.set(1, 'panel');
    stepSimulation(2.5);
    robotControl.drive.set(0, 'panel');
    stepSimulation(0.3);
    const world = activePhysicsController()!.physicsWorld!;
    const { useSceneStore } = await import('../../../stores/sceneStore');
    const sensor = useSceneStore.getState().sensors.find((s) => s.id === 'left-encoder')!;
    const joint = world.joints.find((j) => j.spec.jointId === (sensor as { jointId: string }).jointId)!;
    const actual = world.jointPosition(joint) * ((sensor as { invert: boolean }).invert ? -1 : 1);
    const counted = encoder('left-encoder').angle;
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    // Same physical angle (the encoder keeps counting past ±π, the joint read-out wraps).
    expect(wrap(counted - actual)).toBeCloseTo(0, 3);
    expect(counted).toBeGreaterThan(Math.PI);
  });

  it('odometry from both encoders follows the true pose but stays a separate estimate', async () => {
    await physicsBot();
    robotControl.drive.set(1, 'panel');
    stepSimulation(2);
    robotControl.drive.set(0, 'panel');
    stepSimulation(0.5);
    const odo = currentOdometry()!;
    expect(odo.available).toBe(true);
    const trueX = chassisX();
    expect(odo.x).toBeCloseTo(trueX, 1);
    expect(Math.abs(odo.heading)).toBeLessThan(0.05);
    // The physics pose is untouched by odometry.
    expect(activePhysicsController()!.physicsWorld!.links[0]!.body.translation().x).toBeCloseTo(trueX, 6);
  });

  it('a physics Reset restarts the encoders at zero', async () => {
    await physicsBot();
    robotControl.drive.set(1, 'panel');
    stepSimulation(1);
    expect(encoder('left-encoder').angle).toBeGreaterThan(1);
    robotControl.reset('panel');
    stepSimulation(0.2);
    expect(Math.abs(encoder('left-encoder').angle)).toBeLessThan(0.05);
  });

  it('an encoder on a missing joint is reported clearly', async () => {
    await physicsBot();
    const reading = readSensor('no-such-encoder');
    expect(reading).toBeUndefined();
    expect(robotModel.addSensor({ id: 'bad-encoder', type: 'encoder', name: 'Bad', enabled: true, rateHz: 60, jointId: 'missing', ticksPerRevolution: 360, invert: false })).toMatchObject({ ok: false });
  });
});

describe('wheel encoders on the kinematic engine', () => {
  it('follow the kinematic wheel angle continuously and stop when the robot stops', () => {
    openExplorer(false);
    setWorkspaceMode('control');
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    for (let i = 0; i < 180; i++) step(1 / 60);
    const l = readSensor('left-encoder') as EncoderReading;
    expect(l.source).toBe('kinematic');
    expect(l.valid).toBe(true);
    // 0.5 m/s for 3 s on 0.07 m wheels ≈ 21 rad.
    expect(l.angle).toBeGreaterThan(15);
    expect(l.distance!).toBeCloseTo(chassisX(), 2);
    robotControl.drive.set(0, 'panel');
    step(1 / 60);
    const rest = readSensor('left-encoder') as EncoderReading;
    expect(rest.angularVelocity).toBe(0);
    expect(rest.stale).toBe(false);
  });
});
