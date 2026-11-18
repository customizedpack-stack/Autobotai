import type { SceneObject, Transform, Vec3 } from '../../types/scene';
import { geometryRadius } from '../../utils/math';
import { compose, decompose, invert, multiply, type Mat4 } from './mat4';

/**
 * Local <-> world transform math for the component hierarchy.
 * Pure functions on plain data (no Three.js import, see mat4.ts).
 */

export type ObjectIndex = ReadonlyMap<string, SceneObject>;
export type { Mat4 };

export function indexObjects(objects: readonly SceneObject[]): Map<string, SceneObject> {
  return new Map(objects.map((o) => [o.id, o]));
}

export function transformToMatrix(t: Transform): Mat4 {
  return compose(t.position, t.rotation, t.scale);
}

const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12)));
const clean3 = (v: Vec3): Vec3 => [clean(v[0]), clean(v[1]), clean(v[2])];

/**
 * Decompose a matrix into position / XYZ Euler rotation / scale.
 * Note: a matrix with shear (non-uniform parent scale combined with rotation)
 * cannot be represented exactly; the closest TRS is returned.
 */
export function matrixToTransform(m: Mat4): Transform {
  const t = decompose(m);
  return { position: clean3(t.position), rotation: clean3(t.rotation), scale: clean3(t.scale) };
}

/** World matrix of a component: parent world matrix × local matrix. */
export function worldMatrix(id: string, index: ObjectIndex, guard = 0): Mat4 {
  const object = index.get(id);
  if (!object) return compose([0, 0, 0], [0, 0, 0], [1, 1, 1]);
  const local = transformToMatrix(object.transform);
  if (!object.parentId || guard > 256) return local;
  return multiply(worldMatrix(object.parentId, index, guard + 1), local);
}

export function worldTransform(id: string, index: ObjectIndex): Transform {
  return matrixToTransform(worldMatrix(id, index));
}

export function worldPosition(id: string, index: ObjectIndex): Vec3 {
  const m = worldMatrix(id, index);
  return [m[12]!, m[13]!, m[14]!];
}

/** Local transform under `parentId` (or the world) that produces the given world matrix. */
export function localFromWorld(world: Mat4, parentId: string | null, index: ObjectIndex): Transform {
  if (!parentId) return matrixToTransform(world);
  return matrixToTransform(multiply(invert(worldMatrix(parentId, index)), world));
}

/** Approximate bounding sphere of all visible components, in world space. */
export function worldSceneBounds(objects: readonly SceneObject[]): { center: Vec3; radius: number } {
  const index = indexObjects(objects);
  const visible = objects.filter((o) => o.visible);
  if (visible.length === 0) return { center: [0, 0.25, 0], radius: 0.6 };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const object of visible) {
    const { position, scale } = decompose(worldMatrix(object.id, index));
    const r = geometryRadius(object.geometry) * Math.max(...scale.map(Math.abs));
    position.forEach((p, axis) => {
      min[axis] = Math.min(min[axis]!, p - r);
      max[axis] = Math.max(max[axis]!, p + r);
    });
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(0.3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return { center, radius };
}
