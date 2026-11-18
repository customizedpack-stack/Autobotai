import { parse } from 'acorn';
import { checkDriveReady, type CommandContext } from '../../controls/commands';
import { checkJointValue } from '../../robot-model/kinematics';

/**
 * Checks before a program runs. Parsing only reads the code; nothing is executed.
 * Runtime values are validated again by the host bridge and C2 for every command.
 */

export interface ProgramIssue {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
}

/** The program body is wrapped in an async function, so top-level `await` and `return` are allowed. */
export function checkSyntax(code: string): ProgramIssue[] {
  try {
    parse(`(async function () {\n${code}\n})`, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
    return [];
  } catch (error) {
    const err = error as { message?: string; loc?: { line: number; column: number } };
    const message = (err.message ?? 'Syntax error').replace(/\s*\(\d+:\d+\)\s*$/, '');
    const line = err.loc ? Math.max(1, err.loc.line - 1) : undefined;
    return [{ message: `Syntax error: ${message}`, line, column: err.loc?.column, severity: 'error' }];
  }
}

/** Does the program use driving commands (so a drive must be ready)? */
export function usesDrive(code: string): boolean {
  return /robotControl\s*\.\s*(drive|turn)\b/.test(code);
}

export interface ProgramRequirements {
  usesDrive: boolean;
  /** Joint ids referenced literally (Blockly fields). */
  jointIds: string[];
  /** Literal joint targets, checked against limits before the run. */
  jointTargets: { jointId: string; target: number; label: string; mode: 'actuator' | 'preview' }[];
}

/** Robot-level checks: an open project, a ready drive when driving is used, existing joints, targets within limits. */
export function checkRequirements(requirements: ProgramRequirements, ctx: CommandContext): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  if (!ctx.projectId) return [{ message: 'Open a robot project first.', severity: 'error' }];
  if (requirements.usesDrive) {
    for (const problem of checkDriveReady(ctx)) issues.push({ message: problem, severity: 'error' });
  }
  for (const jointId of requirements.jointIds) {
    if (!ctx.joints.some((j) => j.id === jointId)) issues.push({ message: 'A block refers to a joint that no longer exists in this robot. Choose a joint again.', severity: 'error' });
  }
  for (const { jointId, target, label, mode } of requirements.jointTargets) {
    const joint = ctx.joints.find((j) => j.id === jointId);
    if (!joint) continue;
    const check = checkJointValue(joint, target);
    if (!check.ok) issues.push({ message: `${label} on "${joint.name}": ${check.error}`, severity: 'error' });
    if (mode === 'actuator' && !ctx.actuators.some((a) => a.jointId === jointId && a.enabled && a.controlMode === 'position')) {
      issues.push({ message: `${label}: joint "${joint.name}" has no enabled position actuator (servo or joint actuator).`, severity: 'error' });
    }
  }
  return issues;
}
