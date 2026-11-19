import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jointByName, openExplorer } from '../../controls/testUtils';
import { robotModel } from '../../robot-model/robotModelConnector';
import { checkSyntax } from '../utils/programValidation';
import { starterBlocklyWorkspace } from '../storage/starterPrograms';
import { Blockly, setupBlockly } from './blocklySetup';
import { generateFromSource, generateFromWorkspace, loadWorkspace, saveWorkspace } from './generator';
import { TOOLBOX, SUPPORTED_BLOCK_TYPES } from './toolbox';
import '../testUtils';

const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
/** A program: start block followed by `blocks` (each { type, inputs?, fields? }). */
function program(...blocks: Record<string, unknown>[]): string {
  let next: Record<string, unknown> | undefined;
  for (const b of [...blocks].reverse()) next = { block: { ...b, ...(next ? { next } : {}) } };
  return JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 0, y: 0, ...(next ? { next } : {}) }] } });
}

let workspace: Blockly.Workspace;
beforeEach(() => {
  openExplorer(false);
  setupBlockly();
  workspace = new Blockly.Workspace();
});
afterEach(() => workspace.dispose());

describe('Blockly robot blocks', () => {
  it('initializes a workspace and loads every custom block in the toolbox', () => {
    const types = TOOLBOX.contents.flatMap((c) => ('contents' in c && c.contents ? c.contents.map((b) => b.type) : []));
    for (const type of types) {
      expect(Blockly.Blocks[type], type).toBeDefined();
      expect(SUPPORTED_BLOCK_TYPES.has(type), type).toBe(true);
      const block = workspace.newBlock(type);
      expect(block.type).toBe(type);
    }
    expect(TOOLBOX.contents.map((c) => c.name)).toEqual(['Program', 'Movement', 'Robot Joints', 'Sensors', 'Camera', 'Timing', 'Logic', 'Math', 'Variables', 'Output']);
  });

  it('fills joint dropdowns from the open robot (movable joints only)', () => {
    openExplorer(false, 'robotic-arm');
    const block = workspace.newBlock('robot_set_joint_target');
    const options = (block.getField('JOINT') as Blockly.FieldDropdown).getOptions(false).map((o) => o[0]);
    expect(options).toEqual(expect.arrayContaining(['Elbow (revolute)']));
    expect(options.some((o) => String(o).includes('fixed'))).toBe(false);
  });

  it('generates valid JavaScript that uses the Robot Control API (starter program)', () => {
    const result = generateFromSource(starterBlocklyWorkspace());
    expect(result.ok).toBe(true);
    expect(result.code).toContain('await robotControl.drive.forward({ speed: 0.5, durationMs: 2000 });');
    expect(result.code).toContain('await robotControl.turn.left({ rate: 0.5, durationMs: 1000 });');
    expect(result.code).toContain('await robotControl.stop();');
    expect(result.requirements.usesDrive).toBe(true);
    expect(checkSyntax(result.code)).toEqual([]);
    // No direct store, engine or browser access is ever generated.
    expect(result.code).not.toMatch(/Store|movementEngine|getState\(\)\.patch|window|document|localStorage|fetch|eval/);
  });

  it('generates every movement, timing and output block as valid code', () => {
    const src = program(
      { type: 'robot_move_backward', inputs: { SPEED: num(0.3), DURATION: num(500) } },
      { type: 'robot_drive_at_speed', inputs: { SPEED: num(0.6) } },
      { type: 'robot_set_turn_rate', inputs: { RATE: num(-0.2) } },
      { type: 'robot_turn_right', inputs: { RATE: num(0.4), DURATION: num(300) } },
      { type: 'robot_set_speed', inputs: { PERCENT: num(75) } },
      { type: 'robot_wait_seconds', inputs: { SECONDS: num(1.5) } },
      { type: 'robot_print', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'hi "there"' } } } } },
      { type: 'robot_log_value', fields: { LABEL: 'x' }, inputs: { VALUE: { block: { type: 'robot_min_max', fields: { OP: 'MAX' }, inputs: { A: num(2), B: num(3) } } } } },
      { type: 'robot_report' },
      { type: 'robot_reset' },
    );
    const result = generateFromSource(src);
    expect(result.issues).toEqual([]);
    expect(checkSyntax(result.code)).toEqual([]);
    for (const expected of [
      'await robotControl.drive.backward({ speed: 0.3, durationMs: 500 });',
      'await robotControl.drive.set(0.6);',
      'await robotControl.turn.set(-0.2);',
      'await robotControl.turn.right({ rate: 0.4, durationMs: 300 });',
      'await robotControl.setSpeedPercent(75);',
      'await wait((1.5) * 1000);',
      "console.log('hi \"there\"');",
      'console.log("x =", Math.max(2, 3));',
      'await robotControl.getState()',
      'await robotControl.reset();',
    ]) {
      expect(result.code, expected).toContain(expected);
    }
  });

  it('puts a pause point in every loop (repeat, while/until, forever, every)', () => {
    const src = program(
      { type: 'controls_repeat_ext', inputs: { TIMES: num(3), DO: { block: { type: 'robot_wait', inputs: { MS: num(10) } } } } },
      { type: 'controls_whileUntil', fields: { MODE: 'UNTIL' }, inputs: { BOOL: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } } },
      { type: 'robot_every', inputs: { MS: num(500), DO: { block: { type: 'robot_stop' } } } },
    );
    const result = generateFromSource(src);
    expect(result.ok).toBe(true);
    expect(result.code.match(/await __checkpoint\(\);/g)!.length).toBe(3);
    expect(checkSyntax(result.code)).toEqual([]);
    const forever = generateFromSource(program({ type: 'robot_forever', inputs: { DO: { block: { type: 'robot_stop' } } } }));
    expect(forever.code).toMatch(/while \(true\) \{\n\s+await __checkpoint\(\);/);
  });

  it('converts joint targets to radians and records literal targets for limit checks', () => {
    openExplorer(false, 'robotic-arm');
    const elbow = jointByName('Elbow');
    robotModel.createActuator({ type: 'jointActuator', jointId: elbow.id });
    const src = program(
      { type: 'robot_set_joint_target', fields: { JOINT: elbow.id, WAIT: 'TRUE' }, inputs: { TARGET: num(90) } },
      { type: 'robot_set_joint_target', fields: { JOINT: elbow.id, WAIT: 'FALSE' }, inputs: { TARGET: num(45) } },
      { type: 'robot_preview_joint', fields: { JOINT: elbow.id }, inputs: { TARGET: num(10) } },
      { type: 'robot_wait_joint', fields: { JOINT: elbow.id } },
      { type: 'robot_print', inputs: { TEXT: { block: { type: 'robot_joint_info', fields: { PROP: 'position', JOINT: elbow.id } } } } },
    );
    const result = generateFromSource(src);
    expect(result.issues).toEqual([]);
    const id = JSON.stringify(elbow.id);
    expect(result.code).toContain(`await robotControl.joint(${id}).setTarget((90) * Math.PI / 180);`);
    expect(result.code).toMatch(new RegExp(`\\n\\s*robotControl\\.joint\\(${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\.setTarget\\(\\(45\\)`));
    expect(result.code).toContain(`await robot.waitForJoint(${id});`);
    expect(result.code).toContain(`((await robot.jointInfo(${id})).position * 180 / Math.PI)`);
    expect(result.requirements.jointIds).toEqual([elbow.id]);
    expect(result.requirements.jointTargets[0]!.target).toBeCloseTo(Math.PI / 2, 6);
    expect(checkSyntax(result.code)).toEqual([]);
  });

  it('rejects programs without a start block, with empty inputs, or with unsupported blocks', () => {
    expect(generateFromSource(JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ type: 'robot_stop' }] } })).issues[0]!.message).toMatch(/when program starts/);
    const empty = generateFromSource(program({ type: 'robot_move_forward', inputs: { SPEED: num(0.5) } }));
    expect(empty.ok).toBe(false);
    expect(empty.issues[0]!.message).toMatch(/missing a value/);
    const noCondition = generateFromSource(program({ type: 'controls_if' }));
    expect(noCondition.issues[0]!.message).toBe('The block "If" is missing a value.');
    // A library block that is not offered (it would generate window.alert) cannot slip through.
    const unsupported = generateFromSource(program({ type: 'text_print', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'x' } } } } }));
    expect(unsupported.ok).toBe(false);
    expect(unsupported.issues[0]!.message).toMatch(/not supported/);
    expect(unsupported.code).toBe('');
  });

  it('flags references to joints that no longer exist instead of retargeting them', () => {
    openExplorer(false, 'robotic-arm');
    const elbow = jointByName('Elbow');
    const src = program({ type: 'robot_preview_joint', fields: { JOINT: 'jnt_deleted' }, inputs: { TARGET: num(10) } });
    const loaded = loadWorkspace(workspace, src);
    expect(loaded.missingJoints).toEqual(['jnt_deleted']);
    const block = workspace.getAllBlocks(false).find((b) => b.type === 'robot_preview_joint')!;
    expect(block.getFieldValue('JOINT')).toBe('jnt_deleted');
    const result = generateFromWorkspace(workspace);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ blockId: block.id, message: expect.stringMatching(/no longer exists/) });
    expect(elbow).toBeDefined();
  });

  it('warns about blocks that are not attached to the start block', () => {
    const src = JSON.parse(program({ type: 'robot_stop' }));
    src.blocks.blocks.push({ type: 'robot_reset', x: 300, y: 0 });
    const result = generateFromSource(JSON.stringify(src));
    expect(result.ok).toBe(true);
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
    expect(result.code).not.toContain('reset');
  });

  it('round-trips the workspace (save → load → save is stable)', () => {
    loadWorkspace(workspace, starterBlocklyWorkspace());
    const once = saveWorkspace(workspace);
    const again = new Blockly.Workspace();
    loadWorkspace(again, once);
    expect(saveWorkspace(again)).toBe(once);
    again.dispose();
  });

  it('supports variables and math', () => {
    const src = JSON.stringify({
      variables: [{ name: 'count', id: 'v1' }],
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'robot_start',
            next: {
              block: {
                type: 'variables_set',
                fields: { VAR: { id: 'v1' } },
                inputs: { VALUE: { block: { type: 'math_arithmetic', fields: { OP: 'ADD' }, inputs: { A: num(1), B: num(2) } } } },
                next: { block: { type: 'robot_print', inputs: { TEXT: { block: { type: 'variables_get', fields: { VAR: { id: 'v1' } } } } } } },
              },
            },
          },
        ],
      },
    });
    const result = generateFromSource(src);
    expect(result.ok).toBe(true);
    expect(result.code).toMatch(/var count;/);
    expect(result.code).toContain('count = 1 + 2;');
    expect(checkSyntax(result.code)).toEqual([]);
  });
});
