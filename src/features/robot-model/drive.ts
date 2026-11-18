import type { DifferentialDriveController, RobotActuator } from '../../types/actuator';
import type { RobotJoint } from '../../types/joint';
import type { SceneObject, Vec3 } from '../../types/scene';
import { createId } from '../../utils/id';
import { ancestorIds } from './hierarchy';
import { buildActuator } from './actuators';
import { compose, decompose, invert, multiply, transformDirection, type Mat4 } from './mat4';
import { indexObjects, worldMatrix, worldPosition } from './transforms';

/**
 * Differential-drive geometry measured from the robot model.
 * Convention: in the drive root's frame, forward is +X, up is +Y, left is −Z.
 */

export const FORWARD: Vec3 = [1, 0, 0];
export const UP: Vec3 = [0, 1, 0];

export interface WheelGeometry {
  jointId: string;
  /** Joint origin in the root frame. */
  origin: Vec3;
  /** Joint axis in the root frame. */
  axis: Vec3;
  /** +1 or −1: joint-position direction that rolls this wheel forward. */
  spinSign: 1 | -1;
}

export interface DriveGeometry {
  wheelRadius: number;
  trackWidth: number;
  left: WheelGeometry;
  right: WheelGeometry;
  warnings: string[];
}

export type DriveGeometryResult = { ok: true; geometry: DriveGeometry } | { ok: false; errors: string[] };

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function jointFrameInRoot(joint: RobotJoint, rootInverse: Mat4, index: ReturnType<typeof indexObjects>): Mat4 {
  const parentWorld = worldMatrix(joint.parentId, index);
  return multiply(rootInverse, multiply(parentWorld, compose(joint.origin.position, joint.origin.rotation, [1, 1, 1])));
}

/** Wheel radius from the wheel component's geometry and scale (in the root frame). */
export function measureWheelRadius(wheel: SceneObject | undefined, rootInverse: Mat4, index: ReturnType<typeof indexObjects>): number | null {
  if (!wheel) return null;
  const { scale } = decompose(multiply(rootInverse, worldMatrix(wheel.id, index)));
  const g = wheel.geometry;
  if (g.shape === 'cylinder') return g.radius * Math.max(Math.abs(scale[0]), Math.abs(scale[2]));
  if (g.shape === 'sphere') return g.radius * Math.max(...scale.map(Math.abs));
  return null;
}

export function measureDriveGeometry(
  controller: Pick<DifferentialDriveController, 'rootComponentId' | 'leftJointId' | 'rightJointId' | 'wheelRadius' | 'trackWidth'>,
  objects: readonly SceneObject[],
  joints: readonly RobotJoint[],
): DriveGeometryResult {
  const errors: string[] = [];
  const index = indexObjects(objects);
  if (!index.has(controller.rootComponentId)) return { ok: false, errors: ['Drive root component not found.'] };
  const rootInverse = invert(worldMatrix(controller.rootComponentId, index));
  const wheels: WheelGeometry[] = [];
  const radii: (number | null)[] = [];
  for (const [side, id] of [
    ['Left', controller.leftJointId],
    ['Right', controller.rightJointId],
  ] as const) {
    const joint = joints.find((j) => j.id === id);
    if (!joint) {
      errors.push(`${side} wheel joint not found.`);
      continue;
    }
    if (joint.type !== 'revolute') errors.push(`${side} wheel joint "${joint.name}" must be revolute.`);
    const frame = jointFrameInRoot(joint, rootInverse, index);
    const axis = normalize(transformDirection(frame, joint.axis));
    const rolling = dot(cross(axis, UP), FORWARD);
    if (Math.abs(rolling) < 0.5) errors.push(`${side} wheel joint "${joint.name}" does not spin sideways (its axis must point left/right).`);
    wheels.push({ jointId: id, origin: [frame[12]!, frame[13]!, frame[14]!], axis, spinSign: rolling >= 0 ? 1 : -1 });
    radii.push(measureWheelRadius(objects.find((o) => o.id === joint.childId), rootInverse, index));
  }
  if (errors.length || wheels.length !== 2) return { ok: false, errors };
  const [left, right] = wheels as [WheelGeometry, WheelGeometry];

  const wheelRadius = controller.wheelRadius ?? (radii[0] && radii[1] ? (radii[0] + radii[1]) / 2 : null);
  if (wheelRadius === null) return { ok: false, errors: ['Wheel radius could not be measured from the wheel shape. Enter it in the drive settings.'] };
  const trackWidth = controller.trackWidth ?? Math.abs(left.origin[2] - right.origin[2]);
  const validation = validateDriveDimensions(wheelRadius, trackWidth);
  if (validation.length) return { ok: false, errors: validation };

  const warnings: string[] = [];
  if (left.origin[2] > right.origin[2]) warnings.push('The left wheel is on the right side of the robot (left is −Z when facing +X). Turning will feel reversed.');
  return { ok: true, geometry: { wheelRadius, trackWidth, left, right, warnings } };
}

export function validateDriveDimensions(wheelRadius: number, trackWidth: number): string[] {
  const errors: string[] = [];
  if (!(Number.isFinite(wheelRadius) && wheelRadius > 0)) errors.push('Wheel radius must be a positive number.');
  if (!(Number.isFinite(trackWidth) && trackWidth > 0)) errors.push('Track width must be a positive number (the wheels must not share a position).');
  return errors;
}

/**
 * Find two wheel joints that can form a differential drive, and the motor
 * components next to them. Returns a ready controller plus DC motor actuators.
 */
export function suggestDifferentialDrive(
  objects: readonly SceneObject[],
  joints: readonly RobotJoint[],
  actuators: readonly RobotActuator[] = [],
): { ok: true; controller: DifferentialDriveController; actuators: RobotActuator[] } | { ok: false; errors: string[] } {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const wheelJoints = joints.filter((j) => j.type === 'revolute' && byId.get(j.childId)?.category === 'wheel');
  const groups = new Map<string, RobotJoint[]>();
  for (const j of wheelJoints) groups.set(j.parentId, [...(groups.get(j.parentId) ?? []), j]);
  const pair = [...groups.values()].find((g) => g.length >= 2);
  if (!pair) return { ok: false, errors: ['No pair of revolute wheel joints on the same part was found. Add two wheels with revolute joints first.'] };

  const parentId = pair[0]!.parentId;
  const rootId = ancestorIds(objects, parentId).at(-1) ?? parentId;
  const index = indexObjects(objects);
  const rootInverse = invert(worldMatrix(rootId, index));
  const lateral = (j: RobotJoint) => jointFrameInRoot(j, rootInverse, index)[14]!;
  const sorted = [...pair].sort((a, b) => lateral(a) - lateral(b));
  const left = sorted[0]!;
  const right = sorted.at(-1)!;

  const controller: DifferentialDriveController = {
    id: createId('ctl'),
    type: 'differentialDrive',
    name: 'Differential Drive',
    rootComponentId: rootId,
    leftJointId: left.id,
    rightJointId: right.id,
    wheelRadius: null,
    trackWidth: null,
    maxLinearSpeed: 0.5,
    maxAngularSpeed: 2,
  };
  const measured = measureDriveGeometry(controller, objects, joints);
  if (!measured.ok) return measured;

  // Pair each wheel with the nearest unused motor component in the same robot.
  const used = new Set(actuators.map((a) => a.componentId));
  const inRobot = (id: string) => id === rootId || ancestorIds(objects, id).includes(rootId);
  const motors = objects.filter((o) => o.category === 'motor' && inRobot(o.id) && !used.has(o.id));
  const created: RobotActuator[] = [];
  for (const [side, joint] of [
    ['Left', left],
    ['Right', right],
  ] as const) {
    if (actuators.some((a) => a.jointId === joint.id)) continue;
    const wheelPos = worldPosition(joint.childId, index);
    const motor = motors
      .filter((m) => !created.some((a) => a.componentId === m.id))
      .map((m) => ({ m, d: Math.hypot(...worldPosition(m.id, index).map((v, i) => v - wheelPos[i]!)) }))
      .sort((a, b) => a.d - b.d)[0]?.m;
    if (!motor) return { ok: false, errors: [`No free motor component found for the ${side.toLowerCase()} wheel. Add a DC Motor part to the robot.`] };
    created.push(buildActuator({ type: 'dcMotor', jointId: joint.id, componentId: motor.id, name: `${side} Drive Motor` }, joint));
  }
  return { ok: true, controller, actuators: created };
}
