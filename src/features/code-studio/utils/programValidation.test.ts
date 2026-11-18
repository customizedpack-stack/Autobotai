import { beforeEach, describe, expect, it } from 'vitest';
import { commandContext } from '../../controls/commandBus';
import { jointByName, openExplorer } from '../../controls/testUtils';
import { robotModel } from '../../robot-model/robotModelConnector';
import { checkRequirements, checkSyntax, usesDrive } from './programValidation';

beforeEach(() => {
  openExplorer(false);
});

describe('program validation (before running)', () => {
  it('accepts valid code including top-level await and return', () => {
    expect(checkSyntax('await robotControl.stop();\nif (true) return;')).toEqual([]);
  });

  it('reports syntax errors with the line in the user program', () => {
    const issues = checkSyntax('const a = 1;\nconst b = ;\n');
    expect(issues[0]).toMatchObject({ severity: 'error', line: 2 });
    expect(issues[0]!.message).toMatch(/^Syntax error: Unexpected token/);
    expect(checkSyntax('import x from "y";')[0]!.message).toMatch(/Syntax error/);
  });

  it('detects driving commands', () => {
    expect(usesDrive('await robotControl.drive.forward()')).toBe(true);
    expect(usesDrive('robotControl . turn.left()')).toBe(true);
    expect(usesDrive('await robotControl.stop()')).toBe(false);
  });

  it('checks drive readiness, joint existence, limits and position actuators', () => {
    expect(checkRequirements({ usesDrive: true, jointIds: [], jointTargets: [] }, commandContext())).toEqual([]);
    openExplorer(false, 'robotic-arm');
    const elbow = jointByName('Elbow');
    const ctx = () => commandContext();
    expect(checkRequirements({ usesDrive: true, jointIds: [], jointTargets: [] }, ctx())[0]!.message).toMatch(/no drive controller/);
    expect(checkRequirements({ usesDrive: false, jointIds: ['gone'], jointTargets: [] }, ctx())[0]!.message).toMatch(/no longer exists/);
    const target = { jointId: elbow.id, target: 99, label: 'Set joint target', mode: 'actuator' as const };
    const issues = checkRequirements({ usesDrive: false, jointIds: [elbow.id], jointTargets: [target] }, ctx()).map((i) => i.message);
    expect(issues).toEqual([expect.stringMatching(/upper limit/), expect.stringMatching(/no enabled position actuator/)]);
    robotModel.createActuator({ type: 'jointActuator', jointId: elbow.id });
    expect(checkRequirements({ usesDrive: false, jointIds: [elbow.id], jointTargets: [{ ...target, target: 0.5 }] }, ctx())).toEqual([]);
    expect(checkRequirements({ usesDrive: false, jointIds: [], jointTargets: [] }, { ...ctx(), projectId: null })[0]!.message).toBe('Open a robot project first.');
  });
});
