import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order, type JavascriptGenerator } from 'blockly/javascript';
import { useSceneStore } from '../../../stores/sceneStore';

/**
 * Custom AutoBotAI blocks and their JavaScript generators.
 *
 * Every robot block generates calls to the SAME sandbox API the JavaScript
 * editor uses (robotControl, robot, wait, console). Nothing here generates
 * store access or movement-engine calls; all values are checked again at run
 * time by the host bridge and C2.
 */

export const COLORS = {
  program: '#8B5CF6',
  movement: '#3B82F6',
  joints: '#A855F7',
  timing: '#F59E0B',
  output: '#10B981',
} as const;

export const NO_JOINT = '__none__';
const DEG = 180 / Math.PI;

// ── Joint dropdown ──────────────────────────────────────────────────────────

/** Joint ids that a loaded program refers to but the robot no longer has (shown as "missing"). */
const missingJointIds = new Set<string>();

/** Before loading a saved workspace, register joint ids that no longer exist so they stay visible as "missing". */
export function primeMissingJoints(serialized: string): string[] {
  missingJointIds.clear();
  const known = new Set(useSceneStore.getState().joints.map((j) => j.id));
  for (const match of serialized.matchAll(/"JOINT"\s*:\s*"([^"]+)"/g)) {
    const id = match[1]!;
    if (id !== NO_JOINT && !known.has(id)) missingJointIds.add(id);
  }
  return [...missingJointIds];
}

export function movableJoints() {
  return useSceneStore.getState().joints.filter((j) => j.type !== 'fixed');
}

function jointMenu(): Blockly.MenuOption[] {
  const options: Blockly.MenuOption[] = movableJoints().map((j) => [`${j.name} (${j.type})`, j.id]);
  for (const id of missingJointIds) options.push([`⚠ missing joint`, id]);
  if (options.length === 0) options.push(['(no movable joints)', NO_JOINT]);
  return options;
}

function unitFor(jointId: string): string {
  const joint = useSceneStore.getState().joints.find((j) => j.id === jointId);
  if (!joint) return '';
  return joint.type === 'prismatic' ? 'm' : '°';
}

function jointField(block: Blockly.Block): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(jointMenu, function (this: Blockly.FieldDropdown, value: string) {
    const unit = block.getField('UNIT');
    if (unit) unit.setValue(unitFor(value));
    return value;
  });
}

/** JavaScript string literal for a joint id. */
const quote = (value: string) => JSON.stringify(value);

// ── Generation diagnostics ──────────────────────────────────────────────────

export interface GenerationContext {
  usesDrive: boolean;
  jointIds: Set<string>;
  jointTargets: { jointId: string; target: number; label: string; mode: 'actuator' | 'preview' }[];
}

let diagnostics: GenerationContext | null = null;
export function beginDiagnostics(): GenerationContext {
  diagnostics = { usesDrive: false, jointIds: new Set(), jointTargets: [] };
  return diagnostics;
}
export function endDiagnostics(): void {
  diagnostics = null;
}

/** The literal number in a value input (a number shadow or block), if any. */
function literalNumber(block: Blockly.Block, input: string): number | null {
  const target = block.getInputTargetBlock(input);
  if (target?.type !== 'math_number') return null;
  const value = Number(target.getFieldValue('NUM'));
  return Number.isFinite(value) ? value : null;
}

function value(block: Blockly.Block, generator: JavascriptGenerator, input: string, order = Order.NONE): string {
  // Empty inputs are reported as errors before running (see generator.ts); this default never runs.
  return generator.valueToCode(block, input, order) || 'undefined';
}

// ── Block definitions ───────────────────────────────────────────────────────

const numberInput = (name: string, check = 'Number') => ({ type: 'input_value', name, check });

const JSON_BLOCKS = [
  // Program
  { type: 'robot_start', message0: 'when program starts', nextStatement: null, colour: COLORS.program, tooltip: 'Your program starts here. Only blocks attached below this block run.', hat: 'cap' },
  { type: 'robot_forever', message0: 'forever', message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, colour: COLORS.program, tooltip: 'Repeat the blocks inside until you press Stop.' },
  { type: 'robot_stop_program', message0: 'stop program', previousStatement: null, colour: COLORS.program, tooltip: 'End the program here. The robot is stopped.' },
  // Movement
  { type: 'robot_move_forward', message0: 'move forward speed %1 for %2 ms', args0: [numberInput('SPEED'), numberInput('DURATION')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Drive forward. Speed 0 … 1 (fraction of the maximum, scaled by the speed setting). Waits until the time is up.' },
  { type: 'robot_move_backward', message0: 'move backward speed %1 for %2 ms', args0: [numberInput('SPEED'), numberInput('DURATION')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Drive backward. Speed 0 … 1. Waits until the time is up.' },
  { type: 'robot_drive_at_speed', message0: 'drive at speed %1', args0: [numberInput('SPEED')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Keep driving at this speed: −1 (full reverse) … 1 (full forward). 0 stops driving.' },
  { type: 'robot_turn_left', message0: 'turn left rate %1 for %2 ms', args0: [numberInput('RATE'), numberInput('DURATION')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Turn left in place. Rate 0 … 1. Waits until the time is up.' },
  { type: 'robot_turn_right', message0: 'turn right rate %1 for %2 ms', args0: [numberInput('RATE'), numberInput('DURATION')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Turn right in place. Rate 0 … 1. Waits until the time is up.' },
  { type: 'robot_set_speed', message0: 'set drive speed to %1 %%', args0: [numberInput('PERCENT')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'The speed setting (0 … 100 %), like the slider in the control panel.' },
  { type: 'robot_set_turn_rate', message0: 'set turn rate to %1', args0: [numberInput('RATE')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Keep turning: −1 (right) … 1 (left). 0 stops turning. Combine with "drive at speed" for an arc.' },
  { type: 'robot_stop', message0: 'stop robot', previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Stop all robot movement immediately.' },
  { type: 'robot_reset', message0: 'reset robot', previousStatement: null, nextStatement: null, colour: COLORS.movement, tooltip: 'Stop and return the robot to its design pose.' },
  // Timing
  { type: 'robot_wait', message0: 'wait %1 ms', args0: [numberInput('MS')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.timing, tooltip: 'Wait this many milliseconds (up to 60000). The robot keeps doing what it was doing.' },
  { type: 'robot_wait_seconds', message0: 'wait %1 seconds', args0: [numberInput('SECONDS')], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.timing, tooltip: 'Wait this many seconds (up to 60).' },
  { type: 'robot_every', message0: 'every %1 ms repeat', args0: [numberInput('MS')], message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], inputsInline: true, previousStatement: null, colour: COLORS.timing, tooltip: 'Run the blocks inside, wait, and repeat until you press Stop.' },
  // Math
  { type: 'robot_min_max', message0: '%1 of %2 and %3', args0: [{ type: 'field_dropdown', name: 'OP', options: [['min', 'MIN'], ['max', 'MAX']] }, numberInput('A'), numberInput('B')], inputsInline: true, output: 'Number', style: 'math_blocks', tooltip: 'The smaller (min) or larger (max) of two numbers.' },
  // Output
  { type: 'robot_print', message0: 'print %1', args0: [{ type: 'input_value', name: 'TEXT' }], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.output, tooltip: 'Write a message in the console.' },
  { type: 'robot_log_value', message0: 'log %1 = %2', args0: [{ type: 'field_input', name: 'LABEL', text: 'value' }, { type: 'input_value', name: 'VALUE' }], inputsInline: true, previousStatement: null, nextStatement: null, colour: COLORS.output, tooltip: 'Write a named value in the console.' },
  { type: 'robot_report', message0: 'report robot status', previousStatement: null, nextStatement: null, colour: COLORS.output, tooltip: 'Write the robot status, speed setting and distance driven in the console.' },
];

let registered = false;

export function registerRobotBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.common.defineBlocksWithJsonArray(JSON_BLOCKS);

  Blockly.Blocks.robot_set_joint_target = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('set joint').appendField(jointField(this), 'JOINT');
      this.appendValueInput('TARGET').setCheck('Number').appendField('target');
      this.appendDummyInput().appendField(new Blockly.FieldLabel('°'), 'UNIT').appendField(new Blockly.FieldCheckbox('TRUE'), 'WAIT').appendField('wait');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(COLORS.joints);
      this.setTooltip('Move a joint with its servo or joint actuator. Degrees for rotating joints, meters for sliding joints. With "wait", the program continues when the joint arrives.');
    },
  };
  Blockly.Blocks.robot_preview_joint = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('preview joint').appendField(jointField(this), 'JOINT');
      this.appendValueInput('TARGET').setCheck('Number').appendField('at');
      this.appendDummyInput().appendField(new Blockly.FieldLabel('°'), 'UNIT');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(COLORS.joints);
      this.setTooltip('Jump a joint to a position (kinematic preview, no actuator needed). Must be within the joint limits.');
    },
  };
  Blockly.Blocks.robot_joint_info = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['position', 'position'], ['lower limit', 'lower'], ['upper limit', 'upper']]), 'PROP')
        .appendField('of joint')
        .appendField(jointField(this), 'JOINT');
      this.setOutput(true, 'Number');
      this.setColour(COLORS.joints);
      this.setTooltip('A joint value: degrees for rotating joints, meters for sliding joints.');
    },
  };
  Blockly.Blocks.robot_wait_joint = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('wait until joint').appendField(jointField(this), 'JOINT').appendField('reaches its target');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(COLORS.joints);
      this.setTooltip('Wait until the joint has finished moving.');
    },
  };

  const g = javascriptGenerator.forBlock;
  const track = (fn: (ctx: GenerationContext) => void) => diagnostics && fn(diagnostics);
  const drive = () => track((d) => (d.usesDrive = true));

  g.robot_start = () => '';
  g.robot_forever = (block, gen) => {
    const branch = gen.statementToCode(block, 'DO');
    return `while (true) {\n${gen.INDENT}await __checkpoint();\n${branch}}\n`;
  };
  g.robot_stop_program = () => 'return;\n';

  g.robot_move_forward = (block, gen) => {
    drive();
    return `await robotControl.drive.forward({ speed: ${value(block, gen, 'SPEED')}, durationMs: ${value(block, gen, 'DURATION')} });\n`;
  };
  g.robot_move_backward = (block, gen) => {
    drive();
    return `await robotControl.drive.backward({ speed: ${value(block, gen, 'SPEED')}, durationMs: ${value(block, gen, 'DURATION')} });\n`;
  };
  g.robot_drive_at_speed = (block, gen) => {
    drive();
    return `await robotControl.drive.set(${value(block, gen, 'SPEED')});\n`;
  };
  g.robot_turn_left = (block, gen) => {
    drive();
    return `await robotControl.turn.left({ rate: ${value(block, gen, 'RATE')}, durationMs: ${value(block, gen, 'DURATION')} });\n`;
  };
  g.robot_turn_right = (block, gen) => {
    drive();
    return `await robotControl.turn.right({ rate: ${value(block, gen, 'RATE')}, durationMs: ${value(block, gen, 'DURATION')} });\n`;
  };
  g.robot_set_speed = (block, gen) => `await robotControl.setSpeedPercent(${value(block, gen, 'PERCENT')});\n`;
  g.robot_set_turn_rate = (block, gen) => {
    drive();
    return `await robotControl.turn.set(${value(block, gen, 'RATE')});\n`;
  };
  g.robot_stop = () => 'await robotControl.stop();\n';
  g.robot_reset = () => 'await robotControl.reset();\n';

  g.robot_wait = (block, gen) => `await wait(${value(block, gen, 'MS')});\n`;
  g.robot_wait_seconds = (block, gen) => `await wait((${value(block, gen, 'SECONDS', Order.MULTIPLICATION)}) * 1000);\n`;
  g.robot_every = (block, gen) => {
    const branch = gen.statementToCode(block, 'DO');
    return `while (true) {\n${gen.INDENT}await __checkpoint();\n${branch}${gen.INDENT}await wait(${value(block, gen, 'MS')});\n}\n`;
  };

  /** Target in API units: degrees → radians for rotating joints. */
  const jointTarget = (block: Blockly.Block, gen: JavascriptGenerator, mode: 'actuator' | 'preview', label: string) => {
    const jointId = block.getFieldValue('JOINT') as string;
    const joint = useSceneStore.getState().joints.find((j) => j.id === jointId);
    const raw = value(block, gen, 'TARGET', joint?.type === 'prismatic' ? Order.NONE : Order.MULTIPLICATION);
    const literal = literalNumber(block, 'TARGET');
    track((d) => {
      d.jointIds.add(jointId);
      if (literal !== null && joint) d.jointTargets.push({ jointId, target: joint.type === 'prismatic' ? literal : literal / DEG, label, mode });
    });
    const expr = joint?.type === 'prismatic' ? raw : `(${raw}) * Math.PI / 180`;
    return { jointId, expr };
  };
  g.robot_set_joint_target = (block, gen) => {
    const { jointId, expr } = jointTarget(block, gen, 'actuator', 'Set joint target');
    const call = `robotControl.joint(${quote(jointId)}).setTarget(${expr})`;
    return block.getFieldValue('WAIT') === 'TRUE' ? `await ${call};\n` : `${call};\n`;
  };
  g.robot_preview_joint = (block, gen) => {
    const { jointId, expr } = jointTarget(block, gen, 'preview', 'Preview joint');
    return `await robotControl.joint(${quote(jointId)}).preview(${expr});\n`;
  };
  g.robot_joint_info = (block) => {
    const jointId = block.getFieldValue('JOINT') as string;
    const prop = block.getFieldValue('PROP') as string;
    track((d) => d.jointIds.add(jointId));
    const joint = useSceneStore.getState().joints.find((j) => j.id === jointId);
    const read = `(await robot.jointInfo(${quote(jointId)})).${prop}`;
    return [joint?.type === 'prismatic' ? read : `(${read} * 180 / Math.PI)`, Order.FUNCTION_CALL];
  };
  g.robot_wait_joint = (block) => {
    const jointId = block.getFieldValue('JOINT') as string;
    track((d) => d.jointIds.add(jointId));
    return `await robot.waitForJoint(${quote(jointId)});\n`;
  };

  g.robot_min_max = (block, gen) => {
    const fn = block.getFieldValue('OP') === 'MIN' ? 'Math.min' : 'Math.max';
    return [`${fn}(${value(block, gen, 'A', Order.COMMA)}, ${value(block, gen, 'B', Order.COMMA)})`, Order.FUNCTION_CALL];
  };
  g.robot_print = (block, gen) => `console.log(${value(block, gen, 'TEXT')});\n`;
  g.robot_log_value = (block, gen) => `console.log(${quote(`${block.getFieldValue('LABEL')} =`)}, ${value(block, gen, 'VALUE', Order.COMMA)});\n`;
  g.robot_report = () =>
    'console.log(await (async () => { const s = await robotControl.getState(); return "Robot " + s.movement.status + " · speed setting " + s.speedPercent + " % · distance " + s.movement.distance.toFixed(3) + " m"; })());\n';
}

/** Blocks that need a joint: used to show a hint when the robot has no movable joints. */
export const JOINT_BLOCK_TYPES = ['robot_set_joint_target', 'robot_preview_joint', 'robot_joint_info', 'robot_wait_joint'] as const;
