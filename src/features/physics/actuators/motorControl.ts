import type { RobotActuator } from '../../../types/actuator';
import { MOTOR_SATURATION_SPEED, SERVO_POSITION_GAIN, SERVO_TIMEOUT_EXTRA_S, SERVO_TOLERANCE } from '../physicsConfig';

/**
 * Actuator control laws (pure). The physics engine applies the result through
 * the joint's motor, which produces torque (revolute) or force (prismatic) between
 * the two bodies, never limited above the actuator's `maxTorque`. Positions are
 * never set directly.
 *
 * DC motor  (velocity): target joint velocity; torque limited by maxTorque.
 *                       No command = target 0 with the same torque (braking).
 * Servo     (position): outer loop target velocity = gain × error, limited by
 *                       maxVelocity; inner loop as above (torque-limited).
 * Generic   (position): same as servo, on revolute or prismatic joints.
 * Disabled / no actuator: motor force 0, so the joint moves freely.
 */

export interface MotorCommand {
  /** Target joint velocity (rad/s or m/s). */
  velocity: number;
  /** Maximum torque (N·m) or force (N); 0 = motor off (free joint). */
  maxForce: number;
  /** Velocity tracking factor passed to the engine. */
  factor: number;
}

export const MOTOR_OFF: MotorCommand = { velocity: 0, maxForce: 0, factor: 0 };

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/** Tracking factor that reaches full torque at MOTOR_SATURATION_SPEED of speed error. */
const factorFor = (maxTorque: number) => maxTorque / MOTOR_SATURATION_SPEED;

/** DC motor or a drive wheel: track a velocity, limited by the actuator's speed and torque. */
export function velocityMotor(actuator: RobotActuator | null, targetVelocity: number): MotorCommand {
  if (!actuator || !actuator.enabled) return MOTOR_OFF;
  return { velocity: clamp(targetVelocity, actuator.maxVelocity), maxForce: actuator.maxTorque, factor: factorFor(actuator.maxTorque) };
}

/** Servo or generic actuator: move toward a position at no more than maxVelocity. */
export function positionMotor(actuator: RobotActuator | null, target: number, position: number): MotorCommand {
  if (!actuator || !actuator.enabled) return MOTOR_OFF;
  const velocity = clamp(SERVO_POSITION_GAIN * (target - position), actuator.maxVelocity);
  return { velocity, maxForce: actuator.maxTorque, factor: factorFor(actuator.maxTorque) };
}

/** True when a position target has been reached and the joint has settled. */
export function targetReached(type: 'revolute' | 'prismatic', target: number, position: number, rate: number): boolean {
  return Math.abs(target - position) <= SERVO_TOLERANCE[type] && Math.abs(rate) < 0.05;
}

/** Simulated time allowed to reach a target before the move ends as "stopped" (blocked or too weak). */
export function targetDeadline(distance: number, maxVelocity: number): number {
  const travel = maxVelocity > 0 ? Math.abs(distance) / maxVelocity : 0;
  return travel * 3 + SERVO_TIMEOUT_EXTRA_S;
}
