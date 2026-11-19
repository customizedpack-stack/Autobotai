import type { Mat4 } from '../../robot-model/mat4';
import type { Vec3 } from '../../../types/scene';

/** Unit quaternion { x, y, z, w } (the shape Rapier uses). */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Rotation part of a column-major matrix (scale removed) as a quaternion. */
export function quatFromMatrix(m: Mat4): Quat {
  const sx = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!) || 1;
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!) || 1;
  const m00 = m[0]! / sx, m10 = m[1]! / sx, m20 = m[2]! / sx;
  const m01 = m[4]! / sy, m11 = m[5]! / sy, m21 = m[6]! / sy;
  const m02 = m[8]! / sz, m12 = m[9]! / sz, m22 = m[10]! / sz;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return normalizeQuat(q);
}

export function normalizeQuat(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

export function multiplyQuat(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function conjugateQuat(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const p = multiplyQuat(multiplyQuat(q, { x: v[0], y: v[1], z: v[2], w: 0 }), conjugateQuat(q));
  return [p.x, p.y, p.z];
}

/** Signed rotation angle of `q` about the unit `axis` (twist decomposition), in −π … π. */
export function twistAngle(q: Quat, axis: Vec3): number {
  const projection = q.x * axis[0] + q.y * axis[1] + q.z * axis[2];
  let angle = 2 * Math.atan2(projection, q.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/** Column-major matrix from position + quaternion (+ optional scale). */
export function matrixFromPose(position: Vec3, q: Quat, scale: Vec3 = [1, 1, 1]): Mat4 {
  const { x, y, z, w } = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * scale[0], 2 * (xy + wz) * scale[0], 2 * (xz - wy) * scale[0], 0,
    2 * (xy - wz) * scale[1], (1 - 2 * (xx + zz)) * scale[1], 2 * (yz + wx) * scale[1], 0,
    2 * (xz + wy) * scale[2], 2 * (yz - wx) * scale[2], (1 - 2 * (xx + yy)) * scale[2], 0,
    position[0], position[1], position[2], 1,
  ];
}
