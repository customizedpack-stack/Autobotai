import type { JointInput, JointPatch, RobotJoint } from '../../types/joint';
import type { SceneObject } from '../../types/scene';
import { reparentError } from './hierarchy';
import { buildJoint, normalizeAxis, validateJoint } from './joints';
import { indexObjects, localFromWorld, worldMatrix } from './transforms';

/**
 * Pure robot-model operations. Each returns the next model or a list of
 * errors and never mutates its input. The C1 connector applies results to the
 * editor store (with undo history) and announces them on the Connector Bus.
 */

export interface Model {
  objects: SceneObject[];
  joints: RobotJoint[];
}

export type OpResult<T = object> = ({ ok: true; model: Model } & T) | { ok: false; errors: string[] };

export function reparentComponent(
  model: Model,
  id: string,
  parentId: string | null,
  preserveWorld = true,
): OpResult<{ from: string | null }> {
  const error = reparentError(model.objects, id, parentId);
  if (error) return { ok: false, errors: [error] };
  const object = model.objects.find((o) => o.id === id)!;
  if (object.parentId === parentId) return { ok: false, errors: ['Already attached to that parent.'] };
  const joint = model.joints.find((j) => j.childId === id);
  if (joint) {
    return { ok: false, errors: [`"${object.name}" is connected by joint "${joint.name}". Delete the joint before moving it to another parent.`] };
  }
  const index = indexObjects(model.objects);
  const transform = preserveWorld ? localFromWorld(worldMatrix(id, index), parentId, index) : object.transform;
  return {
    ok: true,
    from: object.parentId,
    model: {
      objects: model.objects.map((o) => (o.id === id ? { ...o, parentId, transform } : o)),
      joints: model.joints,
    },
  };
}

/**
 * Remove a component. Its children move up to its parent and keep their world
 * position; joints that involve the removed component are removed too.
 */
export function removeComponent(model: Model, id: string): OpResult<{ reparented: string[]; removedJoints: string[] }> {
  const target = model.objects.find((o) => o.id === id);
  if (!target) return { ok: false, errors: ['Component not found.'] };
  const index = indexObjects(model.objects);
  const children = model.objects.filter((o) => o.parentId === id);
  const removedJoints = model.joints.filter((j) => j.parentId === id || j.childId === id).map((j) => j.id);
  const objects = model.objects
    .filter((o) => o.id !== id)
    .map((o) =>
      o.parentId === id
        ? { ...o, parentId: target.parentId, transform: localFromWorld(worldMatrix(o.id, index), target.parentId, index) }
        : o,
    );
  return {
    ok: true,
    reparented: children.map((c) => c.id),
    removedJoints,
    model: { objects, joints: model.joints.filter((j) => !removedJoints.includes(j.id)) },
  };
}

/**
 * Create a joint. If the child is not yet attached to the joint's parent it is
 * attached in the same step, keeping its world position.
 */
export function createJoint(model: Model, input: JointInput): OpResult<{ joint: RobotJoint; reparented: boolean }> {
  const child = model.objects.find((o) => o.id === input.childId);
  const parent = model.objects.find((o) => o.id === input.parentId);
  let working = model;
  let reparented = false;
  if (child && parent && child.parentId !== parent.id) {
    const hierarchyError = reparentError(model.objects, child.id, parent.id);
    if (hierarchyError) return { ok: false, errors: [hierarchyError] };
    if (model.joints.some((j) => j.childId === child.id)) {
      return { ok: false, errors: [`"${child.name}" already has a joint. A component can have only one joint to its parent.`] };
    }
    const moved = reparentComponent(model, child.id, parent.id);
    if (!moved.ok) return moved;
    working = moved.model;
    reparented = true;
  }
  const attachedChild = working.objects.find((o) => o.id === input.childId);
  const joint = buildJoint(input, attachedChild, parent?.name ?? 'parent');
  const errors = validateJoint(joint, working.objects, working.joints);
  if (errors.length) return { ok: false, errors };
  return { ok: true, joint, reparented, model: { objects: working.objects, joints: [...working.joints, joint] } };
}

export function updateJoint(model: Model, id: string, patch: JointPatch): OpResult<{ joint: RobotJoint; changed: string[] }> {
  const current = model.joints.find((j) => j.id === id);
  if (!current) return { ok: false, errors: ['Joint not found.'] };
  const next: RobotJoint = { ...current, ...patch, origin: patch.origin ?? current.origin, limits: patch.limits ?? current.limits };
  if (patch.axis) {
    const axis = normalizeAxis(patch.axis);
    if (!axis) return { ok: false, errors: ['Joint axis must be a non-zero vector.'] };
    next.axis = axis;
  }
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, errors: ['Joint name is empty.'] };
  const errors = validateJoint(next, model.objects, model.joints);
  if (errors.length) return { ok: false, errors };
  const changed = (Object.keys(patch) as (keyof JointPatch)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(current[k]));
  if (changed.length === 0) return { ok: false, errors: [] };
  return { ok: true, joint: next, changed, model: { objects: model.objects, joints: model.joints.map((j) => (j.id === id ? next : j)) } };
}

export function deleteJoint(model: Model, id: string): OpResult<{ joint: RobotJoint }> {
  const joint = model.joints.find((j) => j.id === id);
  if (!joint) return { ok: false, errors: ['Joint not found.'] };
  return { ok: true, joint, model: { objects: model.objects, joints: model.joints.filter((j) => j.id !== id) } };
}
