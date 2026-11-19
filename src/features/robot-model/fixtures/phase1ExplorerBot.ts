/**
 * Test fixtures: an Explorer Bot exactly as Phase 1 saved it (commit f163ce8,
 * src/features/robot-library/templates.ts and materialize.ts). Schema v1: every part is a
 * root (parentId null) with a WORLD transform, and there are no joints. Note that Phase 1
 * put "Left Wheel" at +Z, the robot's right side (left is −Z when facing +X).
 */
import type { RobotProject } from '../../../types/project';
import type { SceneObject } from '../../../types/scene';

const HALF_PI = Math.PI / 2;
const CREATED = '2026-08-20T09:00:00.000Z';

/** The Phase 1 template parts, copied verbatim. */
const PHASE1_PARTS = [
    { name: 'Chassis', category: 'chassis', componentId: 'chassis-rect', description: 'Main frame of Explorer Bot.', geometry: { shape: 'box', size: [0.4, 0.1, 0.26] }, color: '#3B82F6', transform: { position: [0, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Top Plate', category: 'body', componentId: 'body-plate', description: 'Mounting deck.', geometry: { shape: 'box', size: [0.34, 0.015, 0.22] }, color: '#334155', transform: { position: [-0.02, 0.17, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Wheel', category: 'wheel', componentId: 'wheel-standard', description: 'Left drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, 0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Wheel', category: 'wheel', componentId: 'wheel-standard', description: 'Right drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, -0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Motor', category: 'motor', componentId: 'motor-dc', description: 'Drives the left wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, 0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Motor', category: 'motor', componentId: 'motor-dc', description: 'Drives the right wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, -0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Caster Ball', category: 'wheel', componentId: 'wheel-caster', description: 'Rear support.', geometry: { shape: 'sphere', radius: 0.03 }, color: '#94A3B8', transform: { position: [-0.15, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Distance Sensor', category: 'sensor', componentId: 'sensor-distance', description: 'Front range finder for obstacle detection.', geometry: { shape: 'box', size: [0.03, 0.03, 0.06] }, color: '#22C55E', transform: { position: [0.215, 0.13, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Controller Board', category: 'other', componentId: 'other-controller', description: 'Runs the robot program.', geometry: { shape: 'box', size: [0.07, 0.01, 0.05] }, color: '#0EA5E9', transform: { position: [-0.06, 0.183, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
];

/** Phase 1 objects with stable ids (obj_p1_chassis, obj_p1_left-wheel, …). */
export function phase1Objects(): SceneObject[] {
  return PHASE1_PARTS.map((d) => ({
    id: `obj_p1_${d.name.toLowerCase().replace(/ /g, '-')}`,
    name: d.name,
    category: d.category,
    geometry: structuredClone(d.geometry),
    color: d.color,
    transform: structuredClone(d.transform),
    visible: true,
    parentId: null,
    metadata: { componentId: d.componentId ?? null, description: d.description ?? '', createdAt: CREATED },
  })) as SceneObject[];
}

/** A raw Phase 1 (schema v1) project, as stored in localStorage by Phase 1. */
export function phase1Project(): Record<string, unknown> {
  return { id: 'prj_phase1', name: 'My Explorer Bot', category: 'mobile', templateId: 'explorer-bot', schemaVersion: 1, objects: phase1Objects(), createdAt: CREATED, updatedAt: CREATED, savedAt: CREATED };
}

/**
 * The same project after the OLD migration (before this fix) ran and the app saved it again:
 * schema v3, still flat, no joints, no motors, no drive. This is what the user's browser holds.
 */
export function legacyStoredProject(extra: Partial<RobotProject> = {}): RobotProject {
  return { ...(phase1Project() as unknown as RobotProject), schemaVersion: 3, joints: [], actuators: [], controllers: [], ...extra };
}
