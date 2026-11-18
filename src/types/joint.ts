import type { Vec3 } from './scene';

/** Joint types supported by the builder. Physics behavior arrives in Phase 5. */
export type JointType = 'fixed' | 'revolute' | 'prismatic';

export interface JointLimits {
  /** Radians for revolute joints, meters for prismatic joints. Ignored for fixed joints. */
  lower: number;
  upper: number;
}

/**
 * A joint connects a parent component to a child component (URDF-style).
 * `origin` is the joint frame expressed in the PARENT component's local frame;
 * `axis` is a unit vector expressed in the joint frame.
 * A child component has at most one joint, and the child is always a direct
 * child of the parent in the component hierarchy.
 */
export interface RobotJoint {
  id: string;
  name: string;
  type: JointType;
  parentId: string;
  childId: string;
  axis: Vec3;
  origin: { position: Vec3; rotation: Vec3 };
  limits: JointLimits;
  metadata: { description: string; createdAt: string };
}

export interface JointInput {
  name?: string;
  type: JointType;
  parentId: string;
  childId: string;
  axis?: Vec3;
  origin?: { position: Vec3; rotation: Vec3 };
  limits?: JointLimits;
  description?: string;
}

export type JointPatch = Partial<Pick<RobotJoint, 'name' | 'type' | 'axis' | 'origin' | 'limits'>>;

/** Template joint, referring to template draft keys. */
export interface JointDraft {
  name: string;
  type: JointType;
  parentKey: string;
  childKey: string;
  axis: Vec3;
  limits?: JointLimits;
  /** Joint origin in WORLD space; defaults to the child's position. */
  originWorld?: Vec3;
  description?: string;
}
