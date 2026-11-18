import type { Transform, Vec3 } from '../../types/scene';

/**
 * Minimal 4×4 matrix math (column-major, same conventions as Three.js) for
 * the robot model. Kept free of the Three.js import on purpose: the model is
 * used on the dashboard (project creation, migration) and must not pull the
 * 3D engine into the start page bundle.
 */
export type Mat4 = number[];

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Translation × rotation (XYZ Euler, radians) × scale. */
export function compose(position: Vec3, rotation: Vec3, scale: Vec3): Mat4 {
  const [x, y, z] = rotation;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  const [sx, sy, sz] = scale;
  return [
    c * e * sx, (af + be * d) * sx, (bf - ae * d) * sx, 0,
    -c * f * sy, (ae - bf * d) * sy, (be + af * d) * sy, 0,
    d * sz, -b * c * sz, a * c * sz, 0,
    position[0], position[1], position[2], 1,
  ];
}

/** a × b */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** General 4×4 inverse (identity for a singular matrix). */
export function invert(m: Mat4): Mat4 {
  const [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44] = m as [
    number, number, number, number, number, number, number, number,
    number, number, number, number, number, number, number, number,
  ];
  const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
  const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
  const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
  const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det === 0) return identity();
  const i = 1 / det;
  return [
    t11 * i,
    (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * i,
    (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * i,
    (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * i,
    t12 * i,
    (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * i,
    (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * i,
    (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * i,
    t13 * i,
    (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * i,
    (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * i,
    (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * i,
    t14 * i,
    (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * i,
    (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * i,
    (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * i,
  ];
}

/** Transform a point by the matrix (w = 1). */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

/**
 * Decompose into position, XYZ Euler rotation and scale (Three.js algorithm).
 * A matrix with shear cannot be represented exactly; the closest TRS is returned.
 */
export function decompose(m: Mat4): Transform {
  let sx = Math.hypot(m[0]!, m[1]!, m[2]!);
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!);
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!);
  const det =
    m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
  if (det < 0) sx = -sx;
  const r11 = m[0]! / sx;
  const r21 = m[1]! / sx;
  const r31 = m[2]! / sx;
  const r12 = m[4]! / sy;
  const r22 = m[5]! / sy;
  const r32 = m[6]! / sy;
  const r13 = m[8]! / sz;
  const r23 = m[9]! / sz;
  const r33 = m[10]! / sz;
  const y = Math.asin(clamp1(r13));
  let x: number;
  let z: number;
  if (Math.abs(r13) < 0.9999999) {
    x = Math.atan2(-r23, r33);
    z = Math.atan2(-r12, r11);
  } else {
    x = Math.atan2(r32, r22);
    z = 0;
  }
  void r21;
  void r31;
  return { position: [m[12]!, m[13]!, m[14]!], rotation: [x, y, z], scale: [sx, sy, sz] };
}

/** Rotation of `angle` radians about a unit `axis` (Rodrigues). */
export function axisAngle(axis: Vec3, angle: number): Mat4 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

/** Rotate (and scale) a direction by the matrix, ignoring translation. */
export function transformDirection(m: Mat4, d: Vec3): Vec3 {
  return [
    m[0]! * d[0] + m[4]! * d[1] + m[8]! * d[2],
    m[1]! * d[0] + m[5]! * d[1] + m[9]! * d[2],
    m[2]! * d[0] + m[6]! * d[1] + m[10]! * d[2],
  ];
}
