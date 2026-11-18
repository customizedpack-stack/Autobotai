import type { ActuatorInput, ActuatorPatch, ControllerPatch, RobotActuator, RobotController } from '../../types/actuator';
import type { JointInput, JointPatch, RobotJoint } from '../../types/joint';
import type { SceneObject } from '../../types/scene';
import { actuatorTypeInfo, buildActuator, validateActuator, validateController } from './actuators';
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
  actuators: RobotActuator[];
  controllers: RobotController[];
}

/** Remove actuators and controllers that refer to components or joints that no longer exist. */
function pruneDrives(model: Model): { model: Model; removedActuators: string[]; removedControllers: string[] } {
  const objectIds = new Set(model.objects.map((o) => o.id));
  const jointIds = new Set(model.joints.map((j) => j.id));
  const actuators = model.actuators.filter((a) => jointIds.has(a.jointId) && (a.componentId === null || objectIds.has(a.componentId)));
  const controllers = model.controllers.filter(
    (c) => objectIds.has(c.rootComponentId) && jointIds.has(c.leftJointId) && jointIds.has(c.rightJointId),
  );
  return {
    model: { ...model, actuators, controllers },
    removedActuators: model.actuators.filter((a) => !actuators.includes(a)).map((a) => a.id),
    removedControllers: model.controllers.filter((c) => !controllers.includes(c)).map((c) => c.id),
  };
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
    model: { ...model, objects: model.objects.map((o) => (o.id === id ? { ...o, parentId, transform } : o)) },
  };
}

/**
 * Remove a component. Its children move up to its parent and keep their world
 * position; joints that involve the removed component are removed too.
 */
export function removeComponent(
  model: Model,
  id: string,
): OpResult<{ reparented: string[]; removedJoints: string[]; removedActuators: string[]; removedControllers: string[] }> {
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
  const pruned = pruneDrives({ ...model, objects, joints: model.joints.filter((j) => !removedJoints.includes(j.id)) });
  return {
    ok: true,
    reparented: children.map((c) => c.id),
    removedJoints,
    removedActuators: pruned.removedActuators,
    removedControllers: pruned.removedControllers,
    model: pruned.model,
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
  return { ok: true, joint, reparented, model: { ...working, joints: [...working.joints, joint] } };
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
  const bound = model.actuators.find((a) => a.jointId === id);
  if (bound && !actuatorTypeInfo(bound.type).joints.includes(next.type)) {
    errors.push(`Actuator "${bound.name}" cannot drive a ${next.type} joint. Remove the actuator first.`);
  }
  if (next.type !== 'revolute' && model.controllers.some((c) => c.leftJointId === id || c.rightJointId === id)) {
    errors.push('This joint is a drive wheel and must stay revolute. Remove the drive controller first.');
  }
  if (errors.length) return { ok: false, errors };
  const changed = (Object.keys(patch) as (keyof JointPatch)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(current[k]));
  if (changed.length === 0) return { ok: false, errors: [] };
  return { ok: true, joint: next, changed, model: { ...model, joints: model.joints.map((j) => (j.id === id ? next : j)) } };
}

export function deleteJoint(model: Model, id: string): OpResult<{ joint: RobotJoint; removedActuators: string[]; removedControllers: string[] }> {
  const joint = model.joints.find((j) => j.id === id);
  if (!joint) return { ok: false, errors: ['Joint not found.'] };
  const pruned = pruneDrives({ ...model, joints: model.joints.filter((j) => j.id !== id) });
  return { ok: true, joint, ...pruned };
}

// ── Actuators ────────────────────────────────────────────────────────────────

export function createActuator(model: Model, input: ActuatorInput): OpResult<{ actuator: RobotActuator }> {
  const joint = model.joints.find((j) => j.id === input.jointId);
  const actuator = buildActuator(input, joint);
  const errors = validateActuator(actuator, model);
  if (errors.length) return { ok: false, errors };
  return { ok: true, actuator, model: { ...model, actuators: [...model.actuators, actuator] } };
}

export function updateActuator(model: Model, id: string, patch: ActuatorPatch): OpResult<{ actuator: RobotActuator; changed: string[] }> {
  const current = model.actuators.find((a) => a.id === id);
  if (!current) return { ok: false, errors: ['Actuator not found.'] };
  const next: RobotActuator = { ...current, ...patch };
  if (patch.type && patch.type !== current.type) next.controlMode = actuatorTypeInfo(patch.type).controlMode;
  const errors = validateActuator(next, model);
  if (errors.length) return { ok: false, errors };
  const changed = (Object.keys(patch) as (keyof ActuatorPatch)[]).filter((k) => patch[k] !== current[k]);
  if (changed.length === 0) return { ok: false, errors: [] };
  return { ok: true, actuator: next, changed, model: { ...model, actuators: model.actuators.map((a) => (a.id === id ? next : a)) } };
}

export function deleteActuator(model: Model, id: string): OpResult<{ actuator: RobotActuator }> {
  const actuator = model.actuators.find((a) => a.id === id);
  if (!actuator) return { ok: false, errors: ['Actuator not found.'] };
  return { ok: true, actuator, model: { ...model, actuators: model.actuators.filter((a) => a.id !== id) } };
}

// ── Controllers ──────────────────────────────────────────────────────────────

/** Add a controller, plus any actuators it brings (e.g. auto-configured drive motors). */
export function addController(model: Model, controller: RobotController, actuators: RobotActuator[] = []): OpResult<{ controller: RobotController }> {
  const withActuators = { ...model, actuators: [...model.actuators, ...actuators] };
  const errors = validateController(controller, withActuators, model.controllers);
  for (const a of actuators) errors.push(...validateActuator(a, withActuators).map((e) => `${a.name}: ${e}`));
  if (errors.length) return { ok: false, errors };
  return { ok: true, controller, model: { ...withActuators, controllers: [...model.controllers, controller] } };
}

export function updateController(model: Model, id: string, patch: ControllerPatch): OpResult<{ controller: RobotController; changed: string[] }> {
  const current = model.controllers.find((c) => c.id === id);
  if (!current) return { ok: false, errors: ['Controller not found.'] };
  const next: RobotController = { ...current, ...patch };
  const errors = validateController(next, model, model.controllers);
  if (errors.length) return { ok: false, errors };
  const changed = (Object.keys(patch) as (keyof ControllerPatch)[]).filter((k) => patch[k] !== current[k]);
  if (changed.length === 0) return { ok: false, errors: [] };
  return { ok: true, controller: next, changed, model: { ...model, controllers: model.controllers.map((c) => (c.id === id ? next : c)) } };
}

export function removeController(model: Model, id: string): OpResult<{ controller: RobotController }> {
  const controller = model.controllers.find((c) => c.id === id);
  if (!controller) return { ok: false, errors: ['Controller not found.'] };
  return { ok: true, controller, model: { ...model, controllers: model.controllers.filter((c) => c.id !== id) } };
}
