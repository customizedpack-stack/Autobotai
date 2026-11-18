import type { RobotActuator, RobotController } from '../../types/actuator';
import type { RobotJoint } from '../../types/joint';
import type { SceneObject } from '../../types/scene';
import { measureDriveGeometry } from '../robot-model/drive';
import { checkJointValue } from '../robot-model/kinematics';

/**
 * C2 Command Bus — command types and validation (pure).
 */

export type CommandType = 'drive' | 'turn' | 'setJointTarget' | 'stop' | 'reset';

export interface CommandPayloads {
  /** speed: −1 (full reverse) … 1 (full forward), scaled by the speed setting. durationMs: stop after this time. */
  drive: { speed: number; durationMs?: number };
  /** rate: −1 (full right) … 1 (full left), scaled by the speed setting. */
  turn: { rate: number; durationMs?: number };
  /**
   * mode 'actuator': the joint's position actuator moves it at its maximum speed.
   * mode 'preview':  kinematic joint preview, jumps to the value (no actuator needed).
   */
  setJointTarget: { jointId: string; target: number; mode: 'actuator' | 'preview' };
  stop: Record<string, never>;
  reset: Record<string, never>;
}

export type CommandSource = 'keyboard' | 'panel' | 'api' | 'bus';

export interface RobotCommand<T extends CommandType = CommandType> {
  id: string;
  /** The open project's id. */
  robotId: string;
  type: T;
  payload: CommandPayloads[T];
  timestamp: number;
  source: CommandSource;
}

export interface CommandValidation {
  valid: boolean;
  errors: string[];
}

export interface CommandContext {
  projectId: string | null;
  mode: 'build' | 'control';
  objects: readonly SceneObject[];
  joints: readonly RobotJoint[];
  actuators: readonly RobotActuator[];
  controllers: readonly RobotController[];
}

const MAX_DURATION_MS = 60_000;
const TYPES: readonly CommandType[] = ['drive', 'turn', 'setJointTarget', 'stop', 'reset'];

function checkUnit(name: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${name} must be a number.`);
  else if (value < -1 || value > 1) errors.push(`${name} must be between −1 and 1.`);
}

function checkDuration(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_DURATION_MS) {
    errors.push(`durationMs must be between 1 and ${MAX_DURATION_MS}.`);
  }
}

/** Everything a drive or turn needs: a controller, both wheel joints, and an enabled motor on each. */
export function checkDriveReady(ctx: CommandContext): string[] {
  const controller = ctx.controllers.find((c) => c.type === 'differentialDrive');
  if (!controller) return ['This robot has no drive controller. Use "Set up differential drive" first.'];
  const geometry = measureDriveGeometry(controller, ctx.objects, ctx.joints);
  if (!geometry.ok) return geometry.errors;
  const errors: string[] = [];
  for (const [side, jointId] of [
    ['left', controller.leftJointId],
    ['right', controller.rightJointId],
  ] as const) {
    const joint = ctx.joints.find((j) => j.id === jointId);
    const actuator = ctx.actuators.find((a) => a.jointId === jointId);
    if (!actuator) errors.push(`The ${side} wheel joint "${joint?.name ?? jointId}" has no motor (missing actuator).`);
    else if (!actuator.enabled) errors.push(`Motor "${actuator.name}" is disabled.`);
    else if (actuator.controlMode !== 'velocity') errors.push(`Motor "${actuator.name}" must be speed-controlled (DC motor) to drive a wheel.`);
  }
  return errors;
}

export function validateCommand(command: RobotCommand, ctx: CommandContext): CommandValidation {
  const errors: string[] = [];
  if (!TYPES.includes(command.type)) return { valid: false, errors: [`Unknown command type "${String(command.type)}".`] };
  if (!ctx.projectId || command.robotId !== ctx.projectId) errors.push('Target robot is not open in the workspace.');
  if (command.type !== 'stop' && ctx.mode !== 'control') errors.push('Switch to Control Mode to move the robot.');
  const payload = (command.payload ?? {}) as Record<string, unknown>;

  switch (command.type) {
    case 'drive':
      checkUnit('speed', payload.speed, errors);
      checkDuration(payload.durationMs, errors);
      if (errors.length === 0) errors.push(...checkDriveReady(ctx));
      break;
    case 'turn':
      checkUnit('rate', payload.rate, errors);
      checkDuration(payload.durationMs, errors);
      if (errors.length === 0) errors.push(...checkDriveReady(ctx));
      break;
    case 'setJointTarget': {
      const joint = ctx.joints.find((j) => j.id === payload.jointId);
      if (!joint) {
        errors.push(`Joint "${String(payload.jointId)}" not found.`);
        break;
      }
      if (payload.mode !== 'actuator' && payload.mode !== 'preview') errors.push('mode must be "actuator" or "preview".');
      const check = checkJointValue(joint, Number(payload.target));
      if (!check.ok) errors.push(check.error);
      if (payload.mode === 'actuator') {
        const actuator = ctx.actuators.find((a) => a.jointId === joint.id);
        if (!actuator) errors.push(`Joint "${joint.name}" has no actuator.`);
        else if (!actuator.enabled) errors.push(`Actuator "${actuator.name}" is disabled.`);
        else if (actuator.controlMode !== 'position') errors.push(`"${actuator.name}" is speed-controlled; use drive commands for it.`);
      }
      break;
    }
    case 'stop':
    case 'reset':
      break;
  }
  return { valid: errors.length === 0, errors };
}
