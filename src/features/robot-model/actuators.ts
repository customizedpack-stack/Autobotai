import type { ActuatorInput, ActuatorType, RobotActuator, RobotController } from '../../types/actuator';
import type { JointType, RobotJoint } from '../../types/joint';
import type { SceneObject } from '../../types/scene';
import { createId } from '../../utils/id';

export interface ActuatorTypeInfo {
  id: ActuatorType;
  label: string;
  description: string;
  /** Joint types this actuator can drive. */
  joints: readonly JointType[];
  controlMode: RobotActuator['controlMode'];
  /** Whether the actuator must be linked to a motor component. */
  needsMotorComponent: boolean;
  defaults: { maxTorque: number; maxVelocity: number };
}

export const ACTUATOR_TYPES: readonly ActuatorTypeInfo[] = [
  {
    id: 'dcMotor',
    label: 'DC Motor',
    description: 'Speed-controlled motor for wheels. Turns continuously.',
    joints: ['revolute'],
    controlMode: 'velocity',
    needsMotorComponent: true,
    defaults: { maxTorque: 0.5, maxVelocity: 20 },
  },
  {
    id: 'servo',
    label: 'Servo Motor',
    description: 'Position-controlled motor. Moves to an angle within the joint limits.',
    joints: ['revolute'],
    controlMode: 'position',
    needsMotorComponent: true,
    defaults: { maxTorque: 1.5, maxVelocity: 5 },
  },
  {
    id: 'jointActuator',
    label: 'Generic Joint Actuator',
    description: 'Position-controlled actuator for revolute or prismatic joints.',
    joints: ['revolute', 'prismatic'],
    controlMode: 'position',
    needsMotorComponent: false,
    defaults: { maxTorque: 10, maxVelocity: 2 },
  },
];

export function actuatorTypeInfo(type: ActuatorType): ActuatorTypeInfo {
  return ACTUATOR_TYPES.find((t) => t.id === type) ?? ACTUATOR_TYPES[2]!;
}

/** Actuator types that can drive the given joint. */
export function compatibleActuatorTypes(joint: RobotJoint | undefined): ActuatorTypeInfo[] {
  if (!joint) return [];
  return ACTUATOR_TYPES.filter((t) => t.joints.includes(joint.type));
}

export interface ActuatorContext {
  objects: readonly SceneObject[];
  joints: readonly RobotJoint[];
  actuators: readonly RobotActuator[];
}

/** Validate an actuator against the model. `existing` excludes the actuator itself when editing. */
export function validateActuator(actuator: Omit<RobotActuator, 'metadata' | 'id'> & { id?: string }, ctx: ActuatorContext): string[] {
  const errors: string[] = [];
  const info = ACTUATOR_TYPES.find((t) => t.id === actuator.type);
  if (!info) return [`Unknown actuator type "${String(actuator.type)}".`];
  if (!actuator.name.trim()) errors.push('Actuator name is empty.');
  const joint = ctx.joints.find((j) => j.id === actuator.jointId);
  if (!joint) errors.push('Bound joint not found.');
  else if (!info.joints.includes(joint.type)) {
    errors.push(
      joint.type === 'fixed'
        ? `Joint "${joint.name}" is fixed and cannot be driven.`
        : `A ${info.label} cannot drive a ${joint.type} joint.`,
    );
  }
  if (joint && ctx.actuators.some((a) => a.jointId === joint.id && a.id !== actuator.id)) {
    errors.push(`Joint "${joint.name}" already has an actuator.`);
  }
  if (actuator.componentId) {
    const component = ctx.objects.find((o) => o.id === actuator.componentId);
    if (!component) errors.push('Actuator component not found.');
    else if (info.needsMotorComponent && component.category !== 'motor') errors.push(`"${component.name}" is not a motor component.`);
  } else if (info.needsMotorComponent) {
    errors.push(`A ${info.label} must be linked to a motor component.`);
  }
  if (!(Number.isFinite(actuator.maxTorque) && actuator.maxTorque > 0)) errors.push('Maximum torque must be a positive number.');
  if (!(Number.isFinite(actuator.maxVelocity) && actuator.maxVelocity > 0)) errors.push('Maximum velocity must be a positive number.');
  if (actuator.controlMode !== info.controlMode) errors.push(`A ${info.label} uses ${info.controlMode} control.`);
  return errors;
}

export function buildActuator(input: ActuatorInput, joint: RobotJoint | undefined, now = new Date().toISOString()): RobotActuator {
  const info = actuatorTypeInfo(input.type);
  return {
    id: createId('act'),
    name: input.name?.trim() || `${joint?.name ?? 'Joint'} ${info.label}`,
    type: input.type,
    componentId: input.componentId ?? null,
    jointId: input.jointId,
    controlMode: info.controlMode,
    maxTorque: input.maxTorque ?? info.defaults.maxTorque,
    maxVelocity: input.maxVelocity ?? info.defaults.maxVelocity,
    enabled: input.enabled ?? true,
    target: 0,
    commandState: 'idle',
    metadata: { description: input.description ?? '', createdAt: now },
  };
}

/** Validate a controller configuration against the model. */
export function validateController(controller: RobotController, ctx: ActuatorContext, others: readonly RobotController[] = []): string[] {
  const errors: string[] = [];
  if (controller.type !== 'differentialDrive') return [`Unknown controller type "${String(controller.type)}".`];
  const root = ctx.objects.find((o) => o.id === controller.rootComponentId);
  if (!root) errors.push('Drive root component not found.');
  else if (root.parentId) errors.push(`Drive root "${root.name}" must be a top-level component.`);
  for (const [side, id] of [
    ['Left', controller.leftJointId],
    ['Right', controller.rightJointId],
  ] as const) {
    const joint = ctx.joints.find((j) => j.id === id);
    if (!joint) errors.push(`${side} wheel joint not found.`);
    else if (joint.type !== 'revolute') errors.push(`${side} wheel joint "${joint.name}" must be revolute.`);
  }
  if (controller.leftJointId === controller.rightJointId) errors.push('Left and right wheel joints must be different.');
  if (controller.wheelRadius !== null && !(Number.isFinite(controller.wheelRadius) && controller.wheelRadius > 0)) {
    errors.push('Wheel radius must be a positive number.');
  }
  if (controller.trackWidth !== null && !(Number.isFinite(controller.trackWidth) && controller.trackWidth > 0)) {
    errors.push('Track width must be a positive number.');
  }
  if (!(Number.isFinite(controller.maxLinearSpeed) && controller.maxLinearSpeed > 0)) errors.push('Maximum linear speed must be positive.');
  if (!(Number.isFinite(controller.maxAngularSpeed) && controller.maxAngularSpeed > 0)) errors.push('Maximum turn rate must be positive.');
  if (others.some((c) => c.id !== controller.id && c.type === controller.type && c.rootComponentId === controller.rootComponentId)) {
    errors.push('This robot already has a differential-drive controller.');
  }
  return errors;
}
