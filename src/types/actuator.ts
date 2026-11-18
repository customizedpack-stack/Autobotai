/**
 * Actuators and controllers (schema v3).
 *
 * An actuator drives one joint. A controller (for example a differential
 * drive) turns high-level commands into actuator targets. Configuration is
 * saved with the project; live values (current target, command state) are
 * runtime state kept by the movement engine and shown in the UI.
 */

export type ActuatorType = 'dcMotor' | 'servo' | 'jointActuator';

/** velocity: target is a speed (rad/s or m/s). position: target is a joint position. */
export type ActuatorControlMode = 'velocity' | 'position';

export type ActuatorCommandState = 'idle' | 'active' | 'holding' | 'limited' | 'disabled';

export interface RobotActuator {
  id: string;
  name: string;
  type: ActuatorType;
  /** Component that physically is the actuator (e.g. the "Left Motor" part), or null. */
  componentId: string | null;
  /** Joint this actuator drives. */
  jointId: string;
  controlMode: ActuatorControlMode;
  /** N·m for revolute joints, N for prismatic joints. Limits the motor force in the Physics engine. */
  maxTorque: number;
  /** rad/s for revolute joints, m/s for prismatic joints. Enforced by the kinematic engine. */
  maxVelocity: number;
  enabled: boolean;
  /** Saved default target (0). The live target is runtime state. */
  target: number;
  /** Saved default state ('idle'). The live state is runtime state. */
  commandState: ActuatorCommandState;
  metadata: { description: string; createdAt: string };
}

export interface ActuatorInput {
  name?: string;
  type: ActuatorType;
  componentId?: string | null;
  jointId: string;
  maxTorque?: number;
  maxVelocity?: number;
  enabled?: boolean;
  description?: string;
}

export type ActuatorPatch = Partial<Pick<RobotActuator, 'name' | 'type' | 'componentId' | 'maxTorque' | 'maxVelocity' | 'enabled'>>;

export type ControllerType = 'differentialDrive';

/** Two-wheel differential drive. Forward is the root component's local +X, up is +Y, left is −Z. */
export interface DifferentialDriveController {
  id: string;
  type: 'differentialDrive';
  name: string;
  /** Top-level component that moves when the robot drives. */
  rootComponentId: string;
  leftJointId: string;
  rightJointId: string;
  /** Meters. null = measured from the wheel geometry. */
  wheelRadius: number | null;
  /** Meters between the wheel contact centers. null = measured from the joint origins. */
  trackWidth: number | null;
  /** m/s at 100 % speed. */
  maxLinearSpeed: number;
  /** rad/s at 100 % speed. */
  maxAngularSpeed: number;
}

export type RobotController = DifferentialDriveController;

export type ControllerPatch = Partial<Pick<DifferentialDriveController, 'name' | 'wheelRadius' | 'trackWidth' | 'maxLinearSpeed' | 'maxAngularSpeed'>>;
