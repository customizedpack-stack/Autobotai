import { bus } from '../../core/bus/connectorBus';
import { useSceneStore } from '../../stores/sceneStore';
import type { ActuatorInput, ActuatorPatch, ControllerPatch, RobotActuator, RobotController } from '../../types/actuator';
import type { JointInput, JointPatch, RobotJoint } from '../../types/joint';
import type { SceneObject, SceneObjectDraft, Transform } from '../../types/scene';
import { log } from '../../utils/logger';
import { materializeObject } from '../projects/materialize';
import { actuatorTypeInfo } from './actuators';
import { suggestDifferentialDrive } from './drive';
import { jointTypeLabel } from './joints';
import * as ops from './operations';
import { indexObjects, localFromWorld, transformToMatrix } from './transforms';
import { validateComponentDraft, validateRobotModel, type ModelIssue } from './validation';

/**
 * C1 — Robot Model Connector.
 *
 * The single gateway for STRUCTURAL changes to the robot model: adding and
 * removing components, changing the hierarchy, and creating, editing or
 * deleting joints. Every command:
 *   1. validates the change with the pure functions in this module,
 *   2. applies it to the editor store as ONE undo step (sceneStore.applyModel),
 *   3. announces it on the Connector Bus (`robotModel.*` events).
 * Rejected commands change nothing and publish `robotModel.rejected`.
 *
 * Other modules (Code Studio, AI) can request the same changes over the bus
 * with `robotModel.request.*` messages; see connectRobotModelConnector().
 * Plain transform edits (move/rotate/scale) stay on sceneStore.updateTransform.
 */

export type CommandResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function model(): ops.Model {
  const { objects, joints, actuators, controllers } = useSceneStore.getState();
  return { objects, joints, actuators, controllers };
}

function reject<T>(command: string, errors: string[]): CommandResult<T> {
  if (errors.length) {
    bus.publish('robotModel.rejected', { command, errors });
    log.error('scene', `${command} rejected: ${errors.join(' ')}`);
  }
  return { ok: false, errors };
}

function apply(label: string, next: ops.Model): void {
  useSceneStore.getState().applyModel(label, next);
  bus.publish('robotModel.changed', {
    reason: label,
    componentCount: next.objects.length,
    jointCount: next.joints.length,
    actuatorCount: next.actuators.length,
  });
}

const nameOf = (id: string | null) => (id ? (useSceneStore.getState().objects.find((o) => o.id === id)?.name ?? id) : 'root');

export interface AddComponentOptions {
  /** Attach under this parent. */
  parentId?: string | null;
  /** Interpret the draft transform as a WORLD transform (e.g. a drop point) and convert it. */
  worldTransform?: boolean;
}

export const robotModel = {
  /** Current model snapshot (read-only). */
  getModel(): Readonly<ops.Model> {
    return model();
  },

  validate(): ModelIssue[] {
    const { objects, joints, actuators, controllers } = model();
    return validateRobotModel(objects, joints, actuators, controllers);
  },

  addComponent(draft: SceneObjectDraft, options: AddComponentOptions = {}): CommandResult<SceneObject> {
    const errors = validateComponentDraft(draft);
    const current = model();
    const parentId = options.parentId ?? null;
    if (parentId && !current.objects.some((o) => o.id === parentId)) errors.push('Parent component not found.');
    if (errors.length) return reject('Add component', errors);

    let transform: Transform = draft.transform;
    if (options.worldTransform && parentId) {
      transform = localFromWorld(transformToMatrix(draft.transform), parentId, indexObjects(current.objects));
    }
    const object: SceneObject = { ...materializeObject({ ...draft, transform }), parentId };
    apply(`Add ${object.name}`, { ...current, objects: [...current.objects, object] });
    bus.publish('robotModel.componentAdded', { componentId: object.id, name: object.name, parentId });
    return { ok: true, value: object };
  },

  /** Insert a ready-made assembly (e.g. a starter robot) as one undo step. */
  insertAssembly(objects: SceneObject[], joints: RobotJoint[], label: string): CommandResult<{ count: number }> {
    const current = model();
    const next = { ...current, objects: [...current.objects, ...objects], joints: [...current.joints, ...joints] };
    const errors = validateRobotModel(next.objects, next.joints, next.actuators, next.controllers)
      .filter((i) => i.severity === 'error')
      .map((i) => i.message);
    if (errors.length) return reject(label, errors);
    apply(label, next);
    for (const o of objects) bus.publish('robotModel.componentAdded', { componentId: o.id, name: o.name, parentId: o.parentId });
    for (const j of joints) bus.publish('robotModel.jointCreated', { jointId: j.id, type: j.type, parentId: j.parentId, childId: j.childId });
    return { ok: true, value: { count: objects.length } };
  },

  removeComponent(id: string): CommandResult<{ reparented: string[]; removedJoints: string[]; removedActuators: string[] }> {
    const name = nameOf(id);
    const result = ops.removeComponent(model(), id);
    if (!result.ok) return reject('Delete component', result.errors);
    apply(`Delete ${name}`, result.model);
    bus.publish('robotModel.componentRemoved', {
      componentId: id,
      name,
      reparentedChildren: result.reparented,
      removedJoints: result.removedJoints,
    });
    announceRemovedDrives(result.removedActuators, result.removedControllers);
    return { ok: true, value: { reparented: result.reparented, removedJoints: result.removedJoints, removedActuators: result.removedActuators } };
  },

  reparent(id: string, parentId: string | null): CommandResult<{ from: string | null }> {
    const result = ops.reparentComponent(model(), id, parentId);
    if (!result.ok) return reject('Reparent', result.errors);
    apply(`Attach ${nameOf(id)} to ${nameOf(parentId)}`, result.model);
    bus.publish('robotModel.componentReparented', { componentId: id, from: result.from, to: parentId });
    log.info('scene', parentId ? `Attached "${nameOf(id)}" to "${nameOf(parentId)}".` : `Detached "${nameOf(id)}" to the root.`);
    return { ok: true, value: { from: result.from } };
  },

  createJoint(input: JointInput): CommandResult<RobotJoint> {
    const childName = nameOf(input.childId);
    const result = ops.createJoint(model(), input);
    if (!result.ok) return reject('Create joint', result.errors);
    apply(`Create ${jointTypeLabel(result.joint.type)} joint`, result.model);
    if (result.reparented) {
      bus.publish('robotModel.componentReparented', { componentId: input.childId, from: null, to: input.parentId });
    }
    bus.publish('robotModel.jointCreated', {
      jointId: result.joint.id,
      type: result.joint.type,
      parentId: result.joint.parentId,
      childId: result.joint.childId,
    });
    log.success('scene', `Created ${jointTypeLabel(result.joint.type).toLowerCase()} joint "${result.joint.name}"${result.reparented ? ` and attached "${childName}"` : ''}.`);
    return { ok: true, value: result.joint };
  },

  updateJoint(id: string, patch: JointPatch): CommandResult<RobotJoint> {
    const result = ops.updateJoint(model(), id, patch);
    if (!result.ok) return reject('Edit joint', result.errors);
    apply(`Edit joint ${result.joint.name}`, result.model);
    bus.publish('robotModel.jointUpdated', { jointId: id, changed: result.changed });
    return { ok: true, value: result.joint };
  },

  deleteJoint(id: string): CommandResult<RobotJoint> {
    const result = ops.deleteJoint(model(), id);
    if (!result.ok) return reject('Delete joint', result.errors);
    apply(`Delete joint ${result.joint.name}`, result.model);
    bus.publish('robotModel.jointDeleted', { jointId: id, parentId: result.joint.parentId, childId: result.joint.childId });
    announceRemovedDrives(result.removedActuators, result.removedControllers);
    log.warning('scene', `Deleted joint "${result.joint.name}".`);
    return { ok: true, value: result.joint };
  },

  // ── Actuators (schema v3) ──────────────────────────────────────────────────

  createActuator(input: ActuatorInput): CommandResult<RobotActuator> {
    const result = ops.createActuator(model(), input);
    if (!result.ok) return reject('Add actuator', result.errors);
    apply(`Add ${actuatorTypeInfo(result.actuator.type).label}`, result.model);
    bus.publish('robotModel.actuatorCreated', { actuatorId: result.actuator.id, type: result.actuator.type, jointId: result.actuator.jointId });
    log.success('scene', `Added ${actuatorTypeInfo(result.actuator.type).label} "${result.actuator.name}".`);
    return { ok: true, value: result.actuator };
  },

  updateActuator(id: string, patch: ActuatorPatch): CommandResult<RobotActuator> {
    const result = ops.updateActuator(model(), id, patch);
    if (!result.ok) return reject('Edit actuator', result.errors);
    apply(`Edit actuator ${result.actuator.name}`, result.model);
    bus.publish('robotModel.actuatorUpdated', { actuatorId: id, changed: result.changed });
    return { ok: true, value: result.actuator };
  },

  deleteActuator(id: string): CommandResult<RobotActuator> {
    const result = ops.deleteActuator(model(), id);
    if (!result.ok) return reject('Delete actuator', result.errors);
    apply(`Delete actuator ${result.actuator.name}`, result.model);
    bus.publish('robotModel.actuatorDeleted', { actuatorId: id });
    log.warning('scene', `Deleted actuator "${result.actuator.name}".`);
    return { ok: true, value: result.actuator };
  },

  // ── Controllers (schema v3) ────────────────────────────────────────────────

  /** Detect two wheel joints and add a differential-drive controller with DC motors. */
  setUpDifferentialDrive(): CommandResult<RobotController> {
    const current = model();
    if (current.controllers.some((c) => c.type === 'differentialDrive')) return reject('Set up drive', ['A differential-drive controller already exists.']);
    const suggestion = suggestDifferentialDrive(current.objects, current.joints, current.actuators);
    if (!suggestion.ok) return reject('Set up drive', suggestion.errors);
    const result = ops.addController(current, suggestion.controller, suggestion.actuators);
    if (!result.ok) return reject('Set up drive', result.errors);
    apply('Set up differential drive', result.model);
    for (const a of suggestion.actuators) bus.publish('robotModel.actuatorCreated', { actuatorId: a.id, type: a.type, jointId: a.jointId });
    bus.publish('robotModel.controllerChanged', { controllerId: result.controller.id, change: 'added' });
    log.success('scene', `Set up differential drive with ${suggestion.actuators.length} DC motor(s).`);
    return { ok: true, value: result.controller };
  },

  updateController(id: string, patch: ControllerPatch): CommandResult<RobotController> {
    const result = ops.updateController(model(), id, patch);
    if (!result.ok) return reject('Edit drive settings', result.errors);
    apply(`Edit ${result.controller.name}`, result.model);
    bus.publish('robotModel.controllerChanged', { controllerId: id, change: 'updated' });
    return { ok: true, value: result.controller };
  },

  removeController(id: string): CommandResult<RobotController> {
    const result = ops.removeController(model(), id);
    if (!result.ok) return reject('Remove drive', result.errors);
    apply(`Remove ${result.controller.name}`, result.model);
    bus.publish('robotModel.controllerChanged', { controllerId: id, change: 'removed' });
    return { ok: true, value: result.controller };
  },
};

function announceRemovedDrives(actuatorIds: string[], controllerIds: string[]): void {
  for (const id of actuatorIds) bus.publish('robotModel.actuatorDeleted', { actuatorId: id });
  for (const id of controllerIds) bus.publish('robotModel.controllerChanged', { controllerId: id, change: 'removed' });
  if (actuatorIds.length || controllerIds.length) {
    log.warning('scene', `Also removed ${actuatorIds.length} actuator(s) and ${controllerIds.length} drive controller(s) that depended on it.`);
  }
}

let connected = false;

/** Let other modules request model changes over the bus. Safe to call more than once. */
export function connectRobotModelConnector(): void {
  if (connected) return;
  connected = true;
  bus.subscribe('robotModel.request.reparent', ({ componentId, parentId }) => robotModel.reparent(componentId, parentId));
  bus.subscribe('robotModel.request.removeComponent', ({ componentId }) => robotModel.removeComponent(componentId));
  bus.subscribe('robotModel.request.createJoint', (input) => robotModel.createJoint(input));
  bus.subscribe('robotModel.request.updateJoint', ({ jointId, patch }) => robotModel.updateJoint(jointId, patch));
  bus.subscribe('robotModel.request.deleteJoint', ({ jointId }) => robotModel.deleteJoint(jointId));
  bus.subscribe('robotModel.request.createActuator', (input) => robotModel.createActuator(input));
  bus.subscribe('robotModel.request.updateActuator', ({ actuatorId, patch }) => robotModel.updateActuator(actuatorId, patch));
  bus.subscribe('robotModel.request.deleteActuator', ({ actuatorId }) => robotModel.deleteActuator(actuatorId));
}
