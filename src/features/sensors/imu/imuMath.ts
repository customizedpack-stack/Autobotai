import type { Vec3 } from '../../../types/scene';
import { conjugateQuat, multiplyQuat, rotateVec, type Quat } from '../../physics/engine/quat';

/** Express a world vector in the sensor frame. */
export function toSensorFrame(rotation: Quat, v: Vec3): Vec3 {
  return rotateVec(conjugateQuat(rotation), v);
}

/** Angular velocity (world, rad/s) that turns q0 into q1 in dt seconds. */
export function angularVelocityFromQuats(q0: Quat, q1: Quat, dt: number): Vec3 {
  if (dt <= 0) return [0, 0, 0];
  let d = multiplyQuat(q1, conjugateQuat(q0));
  if (d.w < 0) d = { x: -d.x, y: -d.y, z: -d.z, w: -d.w };
  const s = Math.hypot(d.x, d.y, d.z);
  if (s < 1e-12) return [0, 0, 0];
  const angle = 2 * Math.atan2(s, d.w);
  return [(d.x / s) * (angle / dt), (d.y / s) * (angle / dt), (d.z / s) * (angle / dt)];
}

/**
 * Roll, pitch, yaw for the Y-up, forward = +X convention:
 * yaw about +Y (positive = turning left), pitch about +Z (nose up positive), roll about +X.
 */
export function eulerFromQuat(q: Quat): { roll: number; pitch: number; yaw: number } {
  const f = rotateVec(q, [1, 0, 0]);
  const up = rotateVec(q, [0, 1, 0]);
  const yaw = Math.atan2(-f[2], f[0]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
  // Roll about the forward axis, measured from the "level" up direction (world up made perpendicular to forward).
  const u0: Vec3 = [-f[1] * f[0], 1 - f[1] * f[1], -f[1] * f[2]];
  const l = Math.hypot(u0[0], u0[1], u0[2]);
  if (l < 1e-6) return { roll: 0, pitch, yaw };
  const u: Vec3 = [u0[0] / l, u0[1] / l, u0[2] / l];
  const s: Vec3 = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  const roll = Math.atan2(up[0] * s[0] + up[1] * s[1] + up[2] * s[2], up[0] * u[0] + up[1] * u[1] + up[2] * u[2]);
  return { roll, pitch, yaw };
}
