import type { RobotJoint } from '../../types/joint';
import type { ComponentCategory, SceneObject, SceneObjectDraft } from '../../types/scene';
import { descendantIds } from './hierarchy';
import { validateJoint } from './joints';

const CATEGORIES: readonly ComponentCategory[] = ['body', 'chassis', 'wheel', 'motor', 'sensor', 'joint', 'other'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const finite3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Validate a component draft (catalog or template) before it enters the scene. */
export function validateComponentDraft(draft: SceneObjectDraft): string[] {
  const errors: string[] = [];
  if (!draft.name?.trim()) errors.push('Component name is empty.');
  if (!CATEGORIES.includes(draft.category)) errors.push(`Unknown component category "${String(draft.category)}".`);
  if (!HEX.test(draft.color)) errors.push(`Invalid color "${draft.color}".`);
  const g = draft.geometry;
  const positive = (n: number) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  switch (g?.shape) {
    case 'box':
      if (!finite3(g.size) || !g.size.every(positive)) errors.push('Box size must be three positive numbers.');
      break;
    case 'cylinder':
    case 'cone':
      if (!positive(g.radius) || !positive(g.height)) errors.push(`${g.shape} radius and height must be positive.`);
      break;
    case 'sphere':
      if (!positive(g.radius)) errors.push('Sphere radius must be positive.');
      break;
    case 'capsule':
      if (!positive(g.radius) || !positive(g.length)) errors.push('Capsule radius and length must be positive.');
      break;
    default:
      errors.push('Unknown geometry.');
  }
  const t = draft.transform;
  if (!t || !finite3(t.position) || !finite3(t.rotation) || !finite3(t.scale)) errors.push('Transform must be finite numbers.');
  else if (t.scale.some((s) => s === 0)) errors.push('Scale must not be zero.');
  return errors;
}

export interface ModelIssue {
  severity: 'error' | 'warning';
  message: string;
  componentId?: string;
  jointId?: string;
}

/** Whole-model check: hierarchy integrity and joint consistency. */
export function validateRobotModel(objects: readonly SceneObject[], joints: readonly RobotJoint[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const ids = new Set<string>();
  for (const o of objects) {
    if (ids.has(o.id)) issues.push({ severity: 'error', message: `Duplicate component id ${o.id}.`, componentId: o.id });
    ids.add(o.id);
  }
  for (const o of objects) {
    if (o.parentId === o.id) issues.push({ severity: 'error', message: `"${o.name}" is its own parent.`, componentId: o.id });
    else if (o.parentId && !ids.has(o.parentId)) {
      issues.push({ severity: 'warning', message: `"${o.name}" refers to a missing parent; it is shown as a root.`, componentId: o.id });
    } else if (o.parentId && descendantIds(objects, o.id).has(o.parentId)) {
      issues.push({ severity: 'error', message: `"${o.name}" is part of a parent loop.`, componentId: o.id });
    }
  }
  for (const joint of joints) {
    for (const message of validateJoint(joint, objects, joints)) {
      issues.push({ severity: 'error', message: `Joint "${joint.name}": ${message}`, jointId: joint.id });
    }
    const child = objects.find((o) => o.id === joint.childId);
    if (child && child.parentId !== joint.parentId) {
      issues.push({ severity: 'error', message: `Joint "${joint.name}": child is not attached to the joint's parent.`, jointId: joint.id });
    }
  }
  return issues;
}
