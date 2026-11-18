import type { JointInput, JointLimits, JointType, RobotJoint } from '../../types/joint';
import type { SceneObject, Vec3 } from '../../types/scene';
import { createId } from '../../utils/id';

export const JOINT_TYPES: readonly { id: JointType; label: string; description: string }[] = [
  { id: 'fixed', label: 'Fixed', description: 'Rigid connection, no relative movement.' },
  { id: 'revolute', label: 'Revolute', description: 'Rotates around one axis between limits.' },
  { id: 'prismatic', label: 'Prismatic', description: 'Slides along one axis between limits.' },
];

export const DEFAULT_AXIS: Record<JointType, Vec3> = {
  fixed: [0, 0, 1],
  revolute: [0, 0, 1],
  prismatic: [1, 0, 0],
};

export const DEFAULT_LIMITS: Record<JointType, JointLimits> = {
  fixed: { lower: 0, upper: 0 },
  revolute: { lower: -Math.PI, upper: Math.PI },
  prismatic: { lower: 0, upper: 0.1 },
};

export function jointTypeLabel(type: JointType): string {
  return JOINT_TYPES.find((t) => t.id === type)?.label ?? type;
}

/** Normalize an axis; returns null for a zero or non-finite vector. */
export function normalizeAxis(axis: Vec3): Vec3 | null {
  if (!axis.every(Number.isFinite)) return null;
  const length = Math.hypot(...axis);
  if (length < 1e-9) return null;
  return [axis[0] / length, axis[1] / length, axis[2] / length];
}

/**
 * Validate a joint against the model. `existing` excludes the joint itself
 * when an existing joint is being edited.
 */
export function validateJoint(
  joint: Pick<RobotJoint, 'type' | 'parentId' | 'childId' | 'axis' | 'limits' | 'origin'> & { id?: string },
  objects: readonly SceneObject[],
  existing: readonly RobotJoint[],
): string[] {
  const errors: string[] = [];
  const parent = objects.find((o) => o.id === joint.parentId);
  const child = objects.find((o) => o.id === joint.childId);
  if (!JOINT_TYPES.some((t) => t.id === joint.type)) errors.push(`Unknown joint type "${joint.type}".`);
  if (!parent) errors.push('Parent component not found.');
  if (!child) errors.push('Child component not found.');
  if (joint.parentId === joint.childId) errors.push('A joint must connect two different components.');
  const others = existing.filter((j) => j.id !== joint.id);
  if (child && others.some((j) => j.childId === joint.childId)) {
    errors.push(`"${child.name}" already has a joint. A component can have only one joint to its parent.`);
  }
  if (others.some((j) => j.parentId === joint.childId && j.childId === joint.parentId)) {
    errors.push('These components are already joined in the opposite direction.');
  }
  if (!normalizeAxis(joint.axis)) errors.push('Joint axis must be a non-zero vector.');
  if (![...joint.origin.position, ...joint.origin.rotation].every(Number.isFinite)) errors.push('Joint origin must be finite numbers.');
  if (joint.type !== 'fixed') {
    const { lower, upper } = joint.limits;
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) errors.push('Joint limits must be numbers.');
    else if (lower > upper) errors.push('Lower limit must not be greater than the upper limit.');
  }
  return errors;
}

/** Build a complete joint from user input, filling defaults. Origin defaults to the child's local position. */
export function buildJoint(input: JointInput, child: SceneObject | undefined, parentName: string, now = new Date().toISOString()): RobotJoint {
  return {
    id: createId('jnt'),
    name: input.name?.trim() || `${parentName} → ${child?.name ?? 'child'}`,
    type: input.type,
    parentId: input.parentId,
    childId: input.childId,
    axis: normalizeAxis(input.axis ?? DEFAULT_AXIS[input.type]) ?? DEFAULT_AXIS[input.type],
    origin: input.origin ?? { position: child ? [...child.transform.position] : [0, 0, 0], rotation: [0, 0, 0] },
    limits: input.limits ?? { ...DEFAULT_LIMITS[input.type] },
    metadata: { description: input.description ?? '', createdAt: now },
  };
}
