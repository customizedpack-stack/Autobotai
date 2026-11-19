import type { RobotController } from '../../types/actuator';
import type { SceneObject, Vec3 } from '../../types/scene';
import { descendantIds } from './hierarchy';
import { invert, multiply, transformPoint } from './mat4';
import { indexObjects, worldMatrix } from './transforms';

/**
 * Where a new camera part goes (Phase 8): on the robot's root part (the drive root, or the
 * first root part), at the front top, centered, looking forward (+X). Position is local to
 * that root part. Null when the scene has no robot part.
 */
export function cameraMountSpot(objects: readonly SceneObject[], controllers: readonly RobotController[] = []): { parentId: string; position: Vec3 } | null {
  const drive = controllers.find((c) => c.type === 'differentialDrive');
  const root = (drive && objects.find((o) => o.id === drive.rootComponentId)) ?? objects.find((o) => o.parentId === null && o.category !== 'joint');
  if (!root) return null;
  const index = indexObjects(objects);
  const toRoot = invert(worldMatrix(root.id, index));
  const ids = [root.id, ...descendantIds(objects, root.id)];
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const o = index.get(id);
    if (!o) continue;
    const m = multiply(toRoot, worldMatrix(id, index));
    const [x, y] = transformPoint(m, [0, 0, 0]);
    const g = o.geometry;
    const scale = Math.max(Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!));
    const half = (g.shape === 'box' ? Math.max(...g.size) / 2 : g.shape === 'capsule' ? g.radius + g.length / 2 : 'radius' in g ? g.radius : 0.05) * scale;
    maxX = Math.max(maxX, x! + (g.shape === 'box' ? (g.size[0] / 2) * scale : half));
    maxY = Math.max(maxY, y! + (g.shape === 'box' ? (g.size[1] / 2) * scale : half));
  }
  if (!Number.isFinite(maxX) || !Number.isFinite(maxY)) return { parentId: root.id, position: [0, 0.05, 0] };
  const r = (v: number) => Number(v.toFixed(4));
  return { parentId: root.id, position: [r(maxX - 0.03), r(maxY + 0.015), 0] };
}
