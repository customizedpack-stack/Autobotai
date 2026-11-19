import type { Vec3 } from '../../../types/scene';
import { ENVIRONMENT_FORMAT_VERSION, type EnvironmentDefinition, type EnvironmentObject } from '../../../types/environment';
import { defaultObject } from './environmentConfig';

/**
 * Built-in environment templates (read-only). Ids "floor" and "obstacles" are the
 * Phase 5 presets, kept with the same ids and the same obstacles so existing
 * selections, tests and programs behave exactly as before.
 * An environment without any ground object gets the default floor (a 40 × 40 m slab
 * whose top is y = 0), so a robot can never fall into the void.
 */

const T = '2026-11-19T00:00:00.000Z';
let n = 0;
const obj = (o: Partial<EnvironmentObject> & Pick<EnvironmentObject, 'kind' | 'name' | 'position' | 'size'>): EnvironmentObject => {
  n += 1;
  return { ...defaultObject(o.kind, o.shape), ...o, id: `tpl_${n}` } as EnvironmentObject;
};
const env = (id: string, name: string, objects: EnvironmentObject[]): EnvironmentDefinition => ({ id, name, version: ENVIRONMENT_FORMAT_VERSION, templateId: null, objects, createdAt: T, updatedAt: T });
const yaw = (a: number): Vec3 => [0, a, 0];

export const ENVIRONMENT_TEMPLATES: readonly EnvironmentDefinition[] = [
  env('floor', 'Empty Environment', []),
  env('arena', 'Basic Test Arena', [
    obj({ kind: 'ground', name: 'Arena Floor', position: [0, -0.05, 0], size: [6, 0.1, 6] }),
    obj({ kind: 'wall', name: 'North Wall', position: [2.95, 0.2, 0], size: [0.1, 0.4, 6] }),
    obj({ kind: 'wall', name: 'South Wall', position: [-2.95, 0.2, 0], size: [0.1, 0.4, 6] }),
    obj({ kind: 'wall', name: 'East Wall', position: [0, 0.2, 2.95], size: [5.8, 0.4, 0.1] }),
    obj({ kind: 'wall', name: 'West Wall', position: [0, 0.2, -2.95], size: [5.8, 0.4, 0.1] }),
    obj({ kind: 'box', name: 'Box A', position: [1.2, 0.1, 0.6], size: [0.2, 0.2, 0.2] }),
    obj({ kind: 'box', name: 'Box B', position: [1.2, 0.1, -0.6], size: [0.2, 0.2, 0.2] }),
  ]),
  // The Phase 5 obstacle course, unchanged (default floor).
  env('obstacles', 'Obstacle Course', [
    obj({ kind: 'wall', name: 'Wall', position: [1.4, 0.15, 0], rotation: yaw(0), size: [0.1, 0.3, 1.2], color: '#64748B', friction: 0.9, restitution: 0 }),
    obj({ kind: 'obstacle', shape: 'box', name: 'Block Left', position: [0.6, 0.1, -0.7], rotation: yaw(0.4), size: [0.25, 0.2, 0.25], color: '#475569', friction: 0.9, restitution: 0 }),
    obj({ kind: 'obstacle', shape: 'box', name: 'Block Right', position: [0.6, 0.1, 0.7], rotation: yaw(-0.4), size: [0.25, 0.2, 0.25], color: '#475569', friction: 0.9, restitution: 0 }),
    obj({ kind: 'platform', name: 'Step', position: [-0.9, 0.0125, 0], size: [0.4, 0.025, 0.8], color: '#334155', friction: 0.9, restitution: 0 }),
  ]),
  env('ramp-test', 'Ramp Test Environment', [
    obj({ kind: 'ground', name: 'Floor', position: [0, -0.05, 0], size: [8, 0.1, 4] }),
    obj({ kind: 'ramp', name: 'Ramp', position: [1.0, 0.06, 0], size: [0.8, 0.12, 0.8] }),
    obj({ kind: 'platform', name: 'Top Platform', position: [1.8, 0.06, 0], size: [0.8, 0.12, 0.8] }),
    obj({ kind: 'wall', name: 'End Wall', position: [2.8, 0.2, 0], size: [0.1, 0.4, 2] }),
  ]),
];

export function findTemplate(id: string): EnvironmentDefinition | undefined {
  return ENVIRONMENT_TEMPLATES.find((t) => t.id === id);
}

export const isTemplateId = (id: string) => ENVIRONMENT_TEMPLATES.some((t) => t.id === id);
