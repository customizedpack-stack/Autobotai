/**
 * Reverse Engineering analysis. Reads the EXISTING robot model (objects, joints,
 * actuators, controllers, sensors), the Phase 9 Blueprint and saved programs.
 * Nothing here creates or changes a model.
 */
import { findComponent } from '../../component-library/catalog';
import type { Model } from '../../robot-model/operations';
import type { Blueprint } from '../../blueprint/model/types';
import type { RobotJoint } from '../../../types/joint';
import type { RobotSensor } from '../../../types/sensor';
import type { SceneObject } from '../../../types/scene';
import type { RobotActuator, RobotController } from '../../../types/actuator';

/** Why each kind of part is on a robot (by catalog component, then by category). */
const WHY_BY_COMPONENT: Record<string, string> = {
  'chassis-rect': 'Everything else is attached to it; it carries the load and keeps the wheels at a fixed distance.',
  'chassis-round': 'Everything else is attached to it; a round frame turns in place without catching corners.',
  'wheel-standard': 'A drive wheel turns motor rotation into motion along the floor.',
  'wheel-large': 'A large drive wheel rolls over rough ground more easily.',
  'wheel-caster': 'A passive caster is the third contact point, so the robot stays level without steering.',
  'motor-dc': 'A DC motor spins a wheel continuously; its speed sets how fast that side of the robot moves.',
  'motor-servo': 'A servo turns to an exact angle and holds it.',
  'motor-stepper': 'A stepper moves in precise steps without a sensor.',
  'sensor-distance': 'A distance sensor tells the program how far the nearest object in front is.',
  'sensor-camera': 'A camera gives the program an image to measure (brightness, color).',
  'sensor-imu': 'An IMU measures rotation and acceleration, so the program knows how the robot is tilted or turning.',
  'other-controller': 'The controller board runs the program and sends commands to the motors.',
  'other-gripper': 'The gripper is the tool at the end of the arm that would hold objects (grasping is not simulated).',
  'joint-revolute': 'This marker shows where a revolute joint rotates.',
  'body-plate': 'A mounting plate gives electronics a flat place to sit.',
};
const WHY_BY_CATEGORY: Record<string, string> = {
  body: 'A rigid body gives the robot its shape and holds other parts.',
  chassis: 'The chassis is the main frame.',
  wheel: 'Wheels let the robot roll.',
  motor: 'Motors create movement.',
  sensor: 'Sensors let the program measure the world.',
  joint: 'A joint lets two parts move relative to each other.',
  other: 'A supporting part of the robot.',
};

export interface ComponentInsight {
  object: SceneObject;
  catalogName: string | null;
  category: string;
  purpose: string;
  function: string | null;
  whyNeeded: string;
  parent: SceneObject | null;
  children: SceneObject[];
  /** Parts linked to this one by a joint (either side). */
  connected: { object: SceneObject; joint: RobotJoint }[];
  joints: RobotJoint[];
  sensors: RobotSensor[];
  actuators: RobotActuator[];
  controllers: RobotController[];
  /** Phase 9 real part mapped to this component, if any. */
  realPart: { name: string; partId: string; verification: string } | null;
}

export function inspectComponent(model: Model, id: string, blueprint?: Pick<Blueprint, 'mappings'> | null): ComponentInsight | null {
  const byId = new Map(model.objects.map((o) => [o.id, o]));
  const object = byId.get(id);
  if (!object) return null;
  const catalog = object.metadata.componentId ? findComponent(object.metadata.componentId) : undefined;
  const joints = model.joints.filter((j) => j.parentId === id || j.childId === id);
  const jointIds = new Set(joints.map((j) => j.id));
  const connected = joints
    .map((j) => ({ joint: j, object: byId.get(j.parentId === id ? j.childId : j.parentId) }))
    .filter((c): c is { joint: RobotJoint; object: SceneObject } => Boolean(c.object));
  const sensors = (model.sensors ?? []).filter((s) => (s.type === 'encoder' ? jointIds.has(s.jointId) : s.partId === id));
  const actuators = model.actuators.filter((a) => a.componentId === id || jointIds.has(a.jointId));
  const controllers = model.controllers.filter((c) => c.rootComponentId === id || jointIds.has(c.leftJointId) || jointIds.has(c.rightJointId) || actuators.some((a) => a.jointId === c.leftJointId || a.jointId === c.rightJointId));
  const mapping = blueprint?.mappings.find((m) => m.targetKind === 'component' && m.targetId === id);
  return {
    object,
    catalogName: catalog?.name ?? null,
    category: object.category,
    purpose: object.metadata.description || catalog?.description || 'No description stored for this part.',
    function: catalog ? catalog.description : null,
    whyNeeded: (object.metadata.componentId && WHY_BY_COMPONENT[object.metadata.componentId]) || WHY_BY_CATEGORY[object.category] || WHY_BY_CATEGORY.other!,
    parent: object.parentId ? (byId.get(object.parentId) ?? null) : null,
    children: model.objects.filter((o) => o.parentId === id),
    connected,
    joints,
    sensors,
    actuators,
    controllers,
    realPart: mapping ? { name: `${mapping.snapshot.manufacturer} ${mapping.snapshot.mpn} — ${mapping.snapshot.name}`, partId: mapping.partId, verification: mapping.snapshot.verification } : null,
  };
}

export interface TreeNode {
  object: SceneObject;
  depth: number;
}

/** Depth-first component hierarchy (roots first, children in stored order). */
export function hierarchy(objects: readonly SceneObject[]): TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const o of objects.filter((x) => x.parentId === parentId)) {
      out.push({ object: o, depth });
      visit(o.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

export interface BuildStep {
  order: number;
  text: string;
}

/**
 * The assembly order implied by the model: frame first, then each part onto the part it is
 * attached to (parents before children), then joints and drives. Derived from the stored
 * hierarchy; it is not a verified physical procedure.
 */
export function buildSequence(model: Model): BuildStep[] {
  const steps: string[] = [];
  const byId = new Map(model.objects.map((o) => [o.id, o]));
  for (const node of hierarchy(model.objects)) {
    const parent = node.object.parentId ? byId.get(node.object.parentId) : undefined;
    steps.push(parent ? `Attach ${node.object.name} to ${parent.name}.` : `Start with ${node.object.name} (top-level part).`);
  }
  for (const j of model.joints) {
    steps.push(`Set up the ${j.type} joint "${j.name}" between ${byId.get(j.parentId)?.name ?? '?'} and ${byId.get(j.childId)?.name ?? '?'}.`);
  }
  for (const a of model.actuators) steps.push(`Connect actuator "${a.name}" to its joint.`);
  for (const c of model.controllers) steps.push(`Configure "${c.name}" to drive the two wheel joints together.`);
  for (const s of model.sensors ?? []) steps.push(`Configure sensor "${s.name}" (${s.type}).`);
  return steps.map((text, i) => ({ order: i + 1, text }));
}

/** Program lines that mention this component's sensors, joints or drive. Used to link parts to code. */
export function relatedProgramLines(code: string, insight: ComponentInsight): number[] {
  const terms = [
    ...insight.sensors.map((s) => `"${s.id}"`),
    ...insight.joints.map((j) => `"${j.name}"`),
    ...(insight.controllers.length > 0 ? ['robotControl.drive', 'robotControl.turn', 'robotControl.stop'] : []),
    ...(insight.sensors.some((s) => s.type === 'camera') ? ['robotCamera.'] : []),
  ];
  if (terms.length === 0) return [];
  return code
    .split('\n')
    .map((line, i) => (terms.some((t) => line.includes(t)) ? i + 1 : 0))
    .filter((n) => n > 0);
}
