import { afterEach, describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../types/scene';
import type { ImuSensorConfig } from '../../../types/sensor';
import { setWorkspaceMode } from '../../controls/controlSession';
import { setScheduler, step } from '../../controls/movementEngine';
import { robotControl } from '../../controls/robotControlApi';
import { openExplorer } from '../../controls/testUtils';
import { selectEngine } from '../../physics/simulation/simulationManager';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { readSensor } from '../core/sensorManager';
import type { ImuReading, SensorSource } from '../core/sensorTypes';
import { defaultImu } from '../config/sensorConfig';
import { ImuState, sampleImu, samplesForAcceleration } from '../imu/imuSensor';
import { physicsBot, stepSimulation } from './helpers';

/**
 * Phase 6 correction A: the IMU never invents an acceleration while warming up.
 * Physics (velocity measured): 2 samples. Kinematic (velocity from poses): 3 samples.
 */

const config: ImuSensorConfig = defaultImu('part');
const DT = 1 / 60;

/** A source whose part moves along +X with x(t) = x0 + v0 t + a t² / 2. */
function movingSource(options: { measured: boolean; v0: number; a: number }): SensorSource & { t: number } {
  const src = {
    t: 0,
    kind: options.measured ? ('physics' as const) : ('kinematic' as const),
    generation: () => 0,
    partPose: () => ({ position: [options.v0 * src.t + 0.5 * options.a * src.t * src.t, 0.1, 0] as Vec3, rotation: { x: 0, y: 0, z: 0, w: 1 } }),
    pointVelocity: () => (options.measured ? { linear: [options.v0 + options.a * src.t, 0, 0] as Vec3, angular: [0, 0, 0] as Vec3 } : null),
    jointAngle: () => null,
    jointRate: () => null,
    castRay: () => undefined,
    gravity: () => [0, -9.81, 0] as Vec3,
  };
  return src;
}

function sample(src: SensorSource & { t: number }, state: ImuState, atRest = false): ImuReading {
  return sampleImu(config, src, state, { sensorId: 'imu', timestamp: 0, simTime: src.t, source: src.kind, stale: false, sequence: state.samples + 1 }, { atRest });
}

afterEach(async () => {
  await selectEngine('kinematic');
});

describe('IMU warm-up (correction A)', () => {
  it('needs 2 samples with measured velocity (physics) and 3 with pose-derived velocity (kinematic)', () => {
    expect(samplesForAcceleration(true)).toBe(2);
    expect(samplesForAcceleration(false)).toBe(3);
  });

  it('kinematic: sample 1 and 2 are warming up with zero placeholders; sample 3 is the first valid acceleration', () => {
    const src = movingSource({ measured: false, v0: 0.5, a: 2 });
    const state = new ImuState();
    const first = sample(src, state);
    expect(first.valid).toBe(false);
    expect(first.error).toBe('Warming up: acceleration needs 3 samples (1 so far).');
    expect(first.linearAcceleration).toEqual({ x: 0, y: 0, z: 0 });
    src.t += DT;
    const second = sample(src, state);
    expect(second.valid).toBe(false);
    expect(second.error).toBe('Warming up: acceleration needs 3 samples (2 so far).');
    expect(second.linearAcceleration).toEqual({ x: 0, y: 0, z: 0 });
    src.t += DT;
    const third = sample(src, state);
    expect(third.valid).toBe(true);
    // Finite differences of x = v0 t + a t²/2 give exactly a.
    expect(third.linearAcceleration.x).toBeCloseTo(2, 6);
  });

  it('kinematic constant speed: no artificial spike when the history starts mid-motion', () => {
    const src = movingSource({ measured: false, v0: 0.5, a: 0 });
    src.t = 3; // the robot is already moving when sampling starts
    const state = new ImuState();
    const readings: ImuReading[] = [];
    for (let i = 0; i < 6; i++) {
      readings.push(sample(src, state));
      src.t += DT;
    }
    expect(readings.slice(0, 2).every((r) => !r.valid)).toBe(true);
    for (const r of readings.slice(2)) {
      expect(r.valid).toBe(true);
      expect(Math.abs(r.linearAcceleration.x)).toBeLessThan(1e-6);
    }
  });

  it('physics: sample 1 warms up, sample 2 is the first valid acceleration', () => {
    const src = movingSource({ measured: true, v0: 0.5, a: 1.5 });
    const state = new ImuState();
    const first = sample(src, state);
    expect(first.valid).toBe(false);
    expect(first.error).toBe('Warming up: acceleration needs 2 samples (1 so far).');
    src.t += DT;
    const second = sample(src, state);
    expect(second.valid).toBe(true);
    expect(second.linearAcceleration.x).toBeCloseTo(1.5, 6);
  });

  it('reset clears pose, velocity and sample count, so warm-up starts again (no spike after a jump)', () => {
    const src = movingSource({ measured: false, v0: 0.5, a: 0 });
    const state = new ImuState();
    for (let i = 0; i < 4; i++) {
      sample(src, state);
      src.t += DT;
    }
    state.reset();
    expect(state.prevPose).toBeNull();
    expect(state.prevVelocity).toBeNull();
    expect(state.samples).toBe(0);
    src.t += 5; // the robot "jumped"
    expect(sample(src, state).valid).toBe(false);
    src.t += DT;
    expect(sample(src, state).valid).toBe(false);
    src.t += DT;
    const r = sample(src, state);
    expect(r.valid).toBe(true);
    expect(Math.abs(r.linearAcceleration.x)).toBeLessThan(1e-6);
  });

  it('an at-rest sample (kinematic engine not stepping) is a real zero measurement', () => {
    const src = movingSource({ measured: false, v0: 0, a: 0 });
    const r = sample(src, new ImuState(), true);
    expect(r.valid).toBe(true);
    expect(r.linearAcceleration).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.specificForce.y).toBeCloseTo(9.81, 6);
  });
});

describe('IMU warm-up in the running app', () => {
  it('kinematic movement: valid readings while driving; the start of motion is the real kinematic speed change', () => {
    openExplorer(false);
    setScheduler(null);
    setWorkspaceMode('control');
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    const accel: number[] = [];
    for (let i = 0; i < 30; i++) {
      step(1 / 60);
      const r = readSensor('main-imu') as ImuReading;
      expect(r.valid).toBe(true);
      accel.push(r.linearAcceleration.x);
    }
    // Constant kinematic speed after the first step: zero acceleration, no lingering spike.
    expect(Math.max(...accel.slice(2).map(Math.abs))).toBeLessThan(1e-6);
    robotControl.drive.set(0, 'panel');
  });

  it('physics: after a Reset the first IMU sample warms up and no spike follows', async () => {
    await physicsBot();
    robotControl.drive.set(1, 'panel');
    stepSimulation(1);
    robotControl.reset('panel');
    stepSimulation(1 / 60);
    const first = readSensor('main-imu') as ImuReading;
    expect(first.valid).toBe(false);
    expect(first.error).toBe('Warming up: acceleration needs 2 samples (1 so far).');
    const values: number[] = [];
    for (let i = 0; i < 30; i++) {
      stepSimulation(1 / 60);
      const r = readSensor('main-imu') as ImuReading;
      expect(r.valid).toBe(true);
      values.push(Math.hypot(r.linearAcceleration.x, r.linearAcceleration.y, r.linearAcceleration.z));
    }
    expect(Math.max(...values)).toBeLessThan(3);
  });
});
