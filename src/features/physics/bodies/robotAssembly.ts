import type { RobotActuator } from '../../../types/actuator';
import type { RobotJoint } from '../../../types/joint';
import type { SceneObject, Transform, Vec3 } from '../../../types/scene';
import { compose, decompose, invert, multiply, transformDirection, transformPoint, type Mat4 } from '../../robot-model/mat4';
import { indexObjects, worldMatrix } from '../../robot-model/transforms';
import { quatFromMatrix, type Quat } from '../engine/quat';
import { resolvePartPhysics, type ResolvedPartPhysics } from './materials';
import { isValidShape, shapeFor, shapeVolume, type ShapeSpec } from './shapes';

/**
 * Robot model → physics description (pure, engine-independent).
 *
 * LINKS (rigid bodies): every root component, and every child attached by a
 * revolute or prismatic joint, starts a link. Children attached without a
 * joint or with a FIXED joint are merged into their parent's link as extra
 * colliders (a compound body). That is the exact rigid connection a fixed joint
 * means, and it is more stable than a solver constraint.
 *
 * JOINTS: revolute and prismatic joints become constraints between two links,
 * with anchors and axes expressed in each link's own frame.
 *
 * The saved design is only read: nothing in the project is changed.
 */

export interface AssemblyCollider {
  componentId: string;
  name: string;
  shape: ShapeSpec;
  /** Pose in the link frame. */
  position: Vec3;
  rotation: Quat;
  physics: ResolvedPartPhysics;
  /** Mass used (kg): the explicit value or density × volume. */
  mass: number;
}

export interface AssemblyLink {
  /** Id of the link's root component. */
  id: string;
  name: string;
  componentIds: string[];
  /** World pose of the link frame (the root component's position and rotation, no scale). */
  position: Vec3;
  rotation: Quat;
  /** The design (saved) transform of the root component, used to render the link. */
  designTransform: Transform;
  /** True when the root component is a top-level component (no parent). */
  isRoot: boolean;
  colliders: AssemblyCollider[];
  mass: number;
}

export interface AssemblyJoint {
  jointId: string;
  name: string;
  type: 'revolute' | 'prismatic';
  parentLink: number;
  childLink: number;
  anchor1: Vec3;
  anchor2: Vec3;
  axis1: Vec3;
  axis2: Vec3;
  /** Joint limits, or null for continuous rotation (revolute joints driven by a DC motor, as in Phase 3). */
  limits: [number, number] | null;
  actuator: RobotActuator | null;
}

export interface RobotAssembly {
  links: AssemblyLink[];
  joints: AssemblyJoint[];
  /** Component id → index of its link. */
  linkOf: Map<string, number>;
  /** Fixed joints that were merged into their parent's body. */
  mergedFixedJoints: string[];
  issues: string[];
  totalMass: number;
}

const normalize = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > 1e-12 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};

function unscaledFrame(world: Mat4): { matrix: Mat4; position: Vec3; rotation: Quat } {
  const t = decompose(world);
  return { matrix: compose(t.position, t.rotation, [1, 1, 1]), position: t.position, rotation: quatFromMatrix(world) };
}

export function buildRobotAssembly(objects: readonly SceneObject[], joints: readonly RobotJoint[], actuators: readonly RobotActuator[]): RobotAssembly {
  const index = indexObjects(objects);
  const issues: string[] = [];
  const movingJointByChild = new Map(joints.filter((j) => j.type !== 'fixed' && index.has(j.parentId) && index.has(j.childId)).map((j) => [j.childId, j]));
  const isLinkRoot = (o: SceneObject) => o.parentId === null || !index.has(o.parentId) || movingJointByChild.has(o.id);
  const linkRootOf = (id: string): string => {
    let current = index.get(id);
    for (let guard = 0; current && guard < 1000; guard++) {
      if (isLinkRoot(current)) return current.id;
      current = index.get(current.parentId!);
    }
    return id;
  };

  const links: AssemblyLink[] = [];
  const linkOf = new Map<string, number>();
  const frames: Mat4[] = [];
  for (const o of objects) {
    if (!isLinkRoot(o)) continue;
    const world = worldMatrix(o.id, index);
    const frame = unscaledFrame(world);
    linkOf.set(o.id, links.length);
    frames.push(frame.matrix);
    links.push({ id: o.id, name: o.name, componentIds: [], position: frame.position, rotation: frame.rotation, designTransform: o.transform, isRoot: o.parentId === null, colliders: [], mass: 0 });
  }

  for (const o of objects) {
    const linkIndex = linkOf.get(linkRootOf(o.id))!;
    linkOf.set(o.id, linkIndex);
    const link = links[linkIndex]!;
    link.componentIds.push(o.id);
    // Joint-marker shapes from the library are visual placeholders, not physical parts.
    if (o.category === 'joint') continue;
    const world = worldMatrix(o.id, index);
    const local = multiply(invert(frames[linkIndex]!), world);
    const t = decompose(local);
    const shape = shapeFor(o.geometry, t.scale);
    if (!isValidShape(shape)) {
      issues.push(`"${o.name}" has a zero or invalid size and has no collision shape.`);
      continue;
    }
    // A wheel-category part fixed to its parent (no moving joint), such as a caster ball, slides with low friction.
    const passiveCaster = o.category === 'wheel' && !movingJointByChild.has(o.id);
    const physics = resolvePartPhysics(o, { passiveCaster });
    const mass = physics.mass ?? physics.density * shapeVolume(shape);
    link.colliders.push({ componentId: o.id, name: o.name, shape, position: t.position, rotation: quatFromMatrix(local), physics, mass });
    link.mass += mass;
  }

  const assemblyJoints: AssemblyJoint[] = [];
  const mergedFixedJoints: string[] = [];
  for (const joint of joints) {
    if (!index.has(joint.parentId) || !index.has(joint.childId)) {
      issues.push(`Joint "${joint.name}" refers to a missing component and was skipped.`);
      continue;
    }
    if (joint.type === 'fixed') {
      mergedFixedJoints.push(joint.id);
      continue;
    }
    const parentLink = linkOf.get(joint.parentId)!;
    const childLink = linkOf.get(joint.childId)!;
    if (parentLink === childLink) {
      issues.push(`Joint "${joint.name}" connects a part to itself and was skipped.`);
      continue;
    }
    const parentWorld = worldMatrix(joint.parentId, index);
    const anchorWorld = transformPoint(parentWorld, joint.origin.position);
    const axisWorld = normalize(transformDirection(multiply(parentWorld, compose([0, 0, 0], joint.origin.rotation, [1, 1, 1])), joint.axis));
    if (axisWorld.every((c) => c === 0)) {
      issues.push(`Joint "${joint.name}" has no valid axis and was skipped.`);
      continue;
    }
    const inv1 = invert(frames[parentLink]!);
    const inv2 = invert(frames[childLink]!);
    const actuator = actuators.find((a) => a.jointId === joint.id) ?? null;
    const continuous = joint.type === 'revolute' && actuator?.type === 'dcMotor';
    assemblyJoints.push({
      jointId: joint.id,
      name: joint.name,
      type: joint.type,
      parentLink,
      childLink,
      anchor1: transformPoint(inv1, anchorWorld),
      anchor2: transformPoint(inv2, anchorWorld),
      axis1: normalize(transformDirection(inv1, axisWorld)),
      axis2: normalize(transformDirection(inv2, axisWorld)),
      limits: continuous ? null : [joint.limits.lower, joint.limits.upper],
      actuator,
    });
  }

  for (const link of links) {
    if (link.colliders.length === 0) issues.push(`"${link.name}" has no physical shape; it gets a small default mass.`);
  }
  return { links, joints: assemblyJoints, linkOf, mergedFixedJoints, issues, totalMass: links.reduce((s, l) => s + l.mass, 0) };
}
