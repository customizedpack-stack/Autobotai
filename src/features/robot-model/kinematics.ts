import type { RobotJoint } from '../../types/joint';
import type { SceneObject, Transform, Vec3 } from '../../types/scene';
import { axisAngle, compose, invert, multiply, type Mat4 } from './mat4';
import { matrixToTransform, transformToMatrix } from './transforms';

/**
 * Joint kinematics (no physics). A joint position q moves the child component
 * around the joint frame: rotation by q radians about the axis (revolute) or a
 * shift of q meters along the axis (prismatic). Fixed joints never move.
 * The stored child transform is the pose at q = 0 and is never changed.
 */

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Motion of the joint in the PARENT frame for position q. */
export function jointMotionMatrix(joint: RobotJoint, q: number): Mat4 {
  const frame = compose(joint.origin.position, joint.origin.rotation, [1, 1, 1]);
  const axis = normalize(joint.axis);
  let motion: Mat4;
  if (joint.type === 'revolute') motion = axisAngle(axis, q);
  else if (joint.type === 'prismatic') motion = compose([axis[0] * q, axis[1] * q, axis[2] * q], [0, 0, 0], [1, 1, 1]);
  else return compose([0, 0, 0], [0, 0, 0], [1, 1, 1]);
  return multiply(frame, multiply(motion, invert(frame)));
}

/** The child's local transform after moving its joint to q. */
export function posedChildTransform(child: SceneObject, joint: RobotJoint, q: number): Transform {
  if (joint.type === 'fixed' || q === 0) return child.transform;
  return matrixToTransform(multiply(jointMotionMatrix(joint, q), transformToMatrix(child.transform)));
}

export type JointValueCheck = { ok: true; value: number } | { ok: false; error: string };

/** Check a joint position against the joint type and limits. */
export function checkJointValue(joint: RobotJoint, value: number): JointValueCheck {
  if (joint.type === 'fixed') return { ok: false, error: `Joint "${joint.name}" is fixed and cannot move.` };
  if (!Number.isFinite(value)) return { ok: false, error: 'Joint position must be a number.' };
  const { lower, upper } = joint.limits;
  const eps = 1e-9;
  if (value < lower - eps) return { ok: false, error: `Below the lower limit (${lower.toFixed(3)}).` };
  if (value > upper + eps) return { ok: false, error: `Above the upper limit (${upper.toFixed(3)}).` };
  return { ok: true, value: Math.min(upper, Math.max(lower, value)) };
}

/** Neutral position: 0 when it is inside the limits, otherwise the closest limit. */
export function neutralJointValue(joint: RobotJoint): number {
  if (joint.type === 'fixed') return 0;
  return Math.min(joint.limits.upper, Math.max(joint.limits.lower, 0));
}

/** Wrap an angle to (−π, π]. Used for continuously turning (velocity-controlled) wheels. */
export function wrapAngle(angle: number): number {
  const wrapped = ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
