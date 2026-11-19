import type { ColliderDesc } from '@dimforge/rapier3d-compat';
import type { EnvironmentObject } from '../../../types/environment';
import type { Rapier } from './rapierLoader';

/**
 * Collider shape for an environment object, sized exactly like the drawn object.
 * Boxes, walls, platforms, ground planes and block obstacles are cuboids; pillars are
 * cylinders; balls are spheres. Only ramps use a convex hull (a 6-point wedge).
 */

/** The ramp wedge in its own frame (centered on its bounding box): rises from −X (height 0) to +X (full height). */
export function rampPoints(size: [number, number, number]): Float32Array {
  const [w, h, d] = size.map((v) => v / 2) as [number, number, number];
  return new Float32Array([
    -w, -h, -d, -w, -h, d, // low edge on the ground
    w, -h, -d, w, -h, d, // high end, bottom
    w, h, -d, w, h, d, // high end, top
  ]);
}

export function environmentColliderDesc(R: Rapier, o: EnvironmentObject): ColliderDesc | null {
  const [x, y, z] = o.size;
  if (o.kind === 'ramp') return R.ColliderDesc.convexHull(rampPoints(o.size));
  if (o.kind === 'obstacle' && o.shape === 'cylinder') return R.ColliderDesc.cylinder(y / 2, x / 2);
  if (o.kind === 'obstacle' && o.shape === 'sphere') return R.ColliderDesc.ball(x / 2);
  return R.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
}
