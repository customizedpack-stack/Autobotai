import type { Vec3 } from '../../../types/scene';
import type { ImuSensorConfig } from '../../../types/sensor';
import type { Quat } from '../../physics/engine/quat';
import { sensorWorldPose } from '../core/mount';
import { xyz, type ImuReading, type ReadingBase, type SensorSource } from '../core/sensorTypes';
import { angularVelocityFromQuats, eulerFromQuat, toSensorFrame } from './imuMath';

/**
 * Simulated IMU, from the actual motion of the part it is fixed to.
 *
 * - Orientation: the sensor's world rotation (part rotation × mount rotation).
 * - Angular velocity: the body's angular velocity (physics), or the rotation between
 *   two samples divided by the time between them (kinematic).
 * - Linear acceleration: the change of the sensor point's velocity between two samples
 *   divided by the simulated time between them (a whole number of 1/60 s ticks).
 *   It does NOT include gravity; `specificForce` = acceleration − gravity is what a real
 *   accelerometer reads (+9.81 m/s² up when resting).
 * - The first sample after a start or reset has no previous velocity: it is marked
 *   invalid ("warming up") instead of reporting a spike.
 */

export class ImuState {
  prevVelocity: Vec3 | null = null;
  prevPose: { position: Vec3; rotation: Quat } | null = null;
  prevTime = 0;

  reset(): void {
    this.prevVelocity = null;
    this.prevPose = null;
    this.prevTime = 0;
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

export function sampleImu(
  config: ImuSensorConfig,
  source: SensorSource,
  state: ImuState,
  base: Omit<ReadingBase, 'type' | 'valid'>,
  options: { atRest?: boolean } = {},
): ImuReading {
  const zero = { x: 0, y: 0, z: 0 };
  const pose = sensorWorldPose(source, config.partId, config.position, config.rotation);
  if ('error' in pose) {
    state.reset();
    return { ...base, type: 'imu', valid: false, error: pose.error, orientation: { x: 0, y: 0, z: 0, w: 1 }, euler: { roll: 0, pitch: 0, yaw: 0 }, angularVelocity: zero, linearAcceleration: zero, specificForce: zero, frame: config.frame };
  }
  const t = base.simTime;
  const dt = state.prevPose ? t - state.prevTime : 0;
  let velocity: Vec3 | null = null;
  let angular: Vec3 = [0, 0, 0];
  if (options.atRest) {
    velocity = [0, 0, 0];
  } else {
    const measured = source.pointVelocity(config.partId, pose.position);
    if (measured) {
      velocity = measured.linear;
      angular = measured.angular;
    } else if (state.prevPose && dt > 1e-9) {
      velocity = scale(sub(pose.position, state.prevPose.position), 1 / dt);
      angular = angularVelocityFromQuats(state.prevPose.rotation, pose.rotation, dt);
    }
  }
  let acceleration: Vec3 | null = null;
  if (options.atRest) acceleration = [0, 0, 0];
  else if (velocity && state.prevVelocity && dt > 1e-9) acceleration = scale(sub(velocity, state.prevVelocity), 1 / dt);
  state.prevPose = pose;
  state.prevTime = t;
  if (velocity) state.prevVelocity = velocity;

  const toFrame = (v: Vec3) => (config.frame === 'sensor' ? toSensorFrame(pose.rotation, v) : v);
  const a = acceleration ?? [0, 0, 0];
  return {
    ...base,
    type: 'imu',
    valid: acceleration !== null,
    ...(acceleration === null ? { error: 'Warming up: acceleration needs two samples (available from the next reading).' } : {}),
    orientation: pose.rotation,
    euler: eulerFromQuat(pose.rotation),
    angularVelocity: xyz(toFrame(angular)),
    linearAcceleration: xyz(toFrame(a)),
    specificForce: xyz(toFrame(sub(a, source.gravity()))),
    frame: config.frame,
  };
}
