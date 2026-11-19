import type { PrimitiveGeometry, Vec3 } from '../../../types/scene';

/**
 * Collision shapes from component geometry. Simple primitives only (no meshes):
 * box → cuboid, sphere → ball, cylinder → cylinder, capsule → capsule, cone → cone.
 * Like the Three.js geometry used for rendering, cylinders, capsules and cones run
 * along the local Y axis and are centered. Scale is applied to the dimensions;
 * a non-uniform scale on round shapes uses the larger horizontal scale.
 */
export type ShapeSpec =
  | { kind: 'cuboid'; halfExtents: Vec3 }
  | { kind: 'ball'; radius: number }
  | { kind: 'cylinder'; halfHeight: number; radius: number }
  | { kind: 'capsule'; halfHeight: number; radius: number }
  | { kind: 'cone'; halfHeight: number; radius: number };

const abs = (v: Vec3): Vec3 => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];

export function shapeFor(geometry: PrimitiveGeometry, scale: Vec3): ShapeSpec {
  const [sx, sy, sz] = abs(scale);
  const sr = Math.max(sx, sz);
  switch (geometry.shape) {
    case 'box':
      return { kind: 'cuboid', halfExtents: [(geometry.size[0] * sx) / 2, (geometry.size[1] * sy) / 2, (geometry.size[2] * sz) / 2] };
    case 'sphere':
      return { kind: 'ball', radius: geometry.radius * Math.max(sx, sy, sz) };
    case 'cylinder':
      return { kind: 'cylinder', halfHeight: (geometry.height * sy) / 2, radius: geometry.radius * sr };
    case 'capsule':
      return { kind: 'capsule', halfHeight: (geometry.length * sy) / 2, radius: geometry.radius * sr };
    case 'cone':
      return { kind: 'cone', halfHeight: (geometry.height * sy) / 2, radius: geometry.radius * sr };
  }
}

/** Volume in m³ (used for mass = density × volume). */
export function shapeVolume(shape: ShapeSpec): number {
  switch (shape.kind) {
    case 'cuboid':
      return 8 * shape.halfExtents[0] * shape.halfExtents[1] * shape.halfExtents[2];
    case 'ball':
      return (4 / 3) * Math.PI * shape.radius ** 3;
    case 'cylinder':
      return Math.PI * shape.radius ** 2 * 2 * shape.halfHeight;
    case 'capsule':
      return Math.PI * shape.radius ** 2 * 2 * shape.halfHeight + (4 / 3) * Math.PI * shape.radius ** 3;
    case 'cone':
      return (Math.PI * shape.radius ** 2 * 2 * shape.halfHeight) / 3;
  }
}

/** True when every dimension is positive and finite (a usable collider). */
export function isValidShape(shape: ShapeSpec): boolean {
  const values =
    shape.kind === 'cuboid' ? shape.halfExtents : shape.kind === 'ball' ? [shape.radius] : [shape.halfHeight, shape.radius];
  return values.every((v) => Number.isFinite(v) && v > 1e-6);
}
