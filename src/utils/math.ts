import type { PrimitiveGeometry, SceneObject, Vec3 } from '../types/scene';

export const RAD_TO_DEG = 180 / Math.PI;
export const DEG_TO_RAD = Math.PI / 180;

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Half-extent along the largest axis of an unscaled primitive. */
export function geometryRadius(geometry: PrimitiveGeometry): number {
  switch (geometry.shape) {
    case 'box':
      return Math.hypot(...geometry.size) / 2;
    case 'cylinder':
    case 'cone':
      return Math.hypot(geometry.radius, geometry.height / 2);
    case 'sphere':
      return geometry.radius;
    case 'capsule':
      return geometry.length / 2 + geometry.radius;
  }
}

export interface Bounds {
  center: Vec3;
  radius: number;
}

/** Approximate bounding sphere of all visible objects (used to frame the camera). */
export function sceneBounds(objects: SceneObject[]): Bounds {
  const visible = objects.filter((o) => o.visible);
  if (visible.length === 0) return { center: [0, 0.25, 0], radius: 0.6 };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const object of visible) {
    const r = geometryRadius(object.geometry) * Math.max(...object.transform.scale.map(Math.abs));
    object.transform.position.forEach((p, axis) => {
      min[axis] = Math.min(min[axis], p - r);
      max[axis] = Math.max(max[axis], p + r);
    });
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(0.3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return { center, radius };
}

/** Height of the object's lowest point when resting at y = 0 (unrotated, unscaled). */
export function restingHeight(geometry: PrimitiveGeometry): number {
  switch (geometry.shape) {
    case 'box':
      return geometry.size[1] / 2;
    case 'cylinder':
    case 'cone':
      return geometry.height / 2;
    case 'sphere':
      return geometry.radius;
    case 'capsule':
      return geometry.length / 2 + geometry.radius;
  }
}

export function describeGeometry(geometry: PrimitiveGeometry): string {
  const m = (v: number) => `${round(v, 3)} m`;
  switch (geometry.shape) {
    case 'box':
      return `Box ${geometry.size.map((v) => round(v, 3)).join(' × ')} m`;
    case 'cylinder':
      return `Cylinder r ${m(geometry.radius)}, h ${m(geometry.height)}`;
    case 'sphere':
      return `Sphere r ${m(geometry.radius)}`;
    case 'capsule':
      return `Capsule r ${m(geometry.radius)}, l ${m(geometry.length)}`;
    case 'cone':
      return `Cone r ${m(geometry.radius)}, h ${m(geometry.height)}`;
  }
}
