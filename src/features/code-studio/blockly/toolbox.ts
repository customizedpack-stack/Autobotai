import { COLORS } from './robotBlocks';

/**
 * The Blockly toolbox: the categories from the Phase 4 brief.
 * Number inputs come with editable number shadows so every block is ready to use.
 */
const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
const text = (value: string) => ({ shadow: { type: 'text', fields: { TEXT: value } } });
const block = (type: string, inputs?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ kind: 'block', type, ...(inputs ? { inputs } : {}), ...extra });

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Program',
      colour: COLORS.program,
      contents: [
        block('robot_start'),
        block('robot_wait', { MS: num(1000) }),
        block('controls_repeat_ext', { TIMES: num(4) }),
        block('controls_whileUntil', undefined, { fields: { MODE: 'UNTIL' } }),
        block('robot_forever'),
        block('controls_if'),
        block('controls_if', undefined, { extraState: { hasElse: true } }),
        block('robot_stop_program'),
      ],
    },
    {
      kind: 'category',
      name: 'Movement',
      colour: COLORS.movement,
      contents: [
        block('robot_move_forward', { SPEED: num(0.5), DURATION: num(2000) }),
        block('robot_move_backward', { SPEED: num(0.5), DURATION: num(1000) }),
        block('robot_drive_at_speed', { SPEED: num(0.5) }),
        block('robot_turn_left', { RATE: num(0.5), DURATION: num(1000) }),
        block('robot_turn_right', { RATE: num(0.5), DURATION: num(1000) }),
        block('robot_set_speed', { PERCENT: num(50) }),
        block('robot_set_turn_rate', { RATE: num(0.3) }),
        block('robot_stop'),
        block('robot_reset'),
      ],
    },
    {
      kind: 'category',
      name: 'Robot Joints',
      colour: COLORS.joints,
      contents: [
        block('robot_set_joint_target', { TARGET: num(45) }),
        block('robot_preview_joint', { TARGET: num(30) }),
        block('robot_joint_info'),
        block('robot_wait_joint'),
      ],
    },
    {
      kind: 'category',
      name: 'Timing',
      colour: COLORS.timing,
      contents: [block('robot_wait', { MS: num(1000) }), block('robot_wait_seconds', { SECONDS: num(1) }), block('robot_every', { MS: num(500) })],
    },
    {
      kind: 'category',
      name: 'Logic',
      categorystyle: 'logic_category',
      contents: [
        block('controls_if'),
        block('controls_if', undefined, { extraState: { hasElse: true } }),
        block('logic_compare', { A: num(0), B: num(0) }),
        block('logic_operation'),
        block('logic_negate'),
        block('logic_boolean'),
      ],
    },
    {
      kind: 'category',
      name: 'Math',
      categorystyle: 'math_category',
      contents: [
        block('math_number'),
        block('math_arithmetic', { A: num(1), B: num(1) }),
        block('robot_min_max', { A: num(1), B: num(2) }),
        block('math_random_int', { FROM: num(1), TO: num(10) }),
      ],
    },
    { kind: 'category', name: 'Variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
    {
      kind: 'category',
      name: 'Output',
      colour: COLORS.output,
      contents: [block('robot_print', { TEXT: text('Hello robot') }), block('robot_log_value', { VALUE: num(0) }), block('robot_report'), block('text')],
    },
  ],
};

/** Every block type offered in the toolbox (plus variable blocks). Generation refuses anything else. */
export const SUPPORTED_BLOCK_TYPES = new Set<string>([
  'robot_start', 'robot_wait', 'controls_repeat_ext', 'controls_whileUntil', 'robot_forever', 'controls_if', 'robot_stop_program',
  'robot_move_forward', 'robot_move_backward', 'robot_drive_at_speed', 'robot_turn_left', 'robot_turn_right', 'robot_set_speed',
  'robot_set_turn_rate', 'robot_stop', 'robot_reset', 'robot_set_joint_target', 'robot_preview_joint', 'robot_joint_info', 'robot_wait_joint',
  'robot_wait_seconds', 'robot_every', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'math_number',
  'math_arithmetic', 'robot_min_max', 'math_random_int', 'variables_get', 'variables_set', 'math_change', 'robot_print', 'robot_log_value',
  'robot_report', 'text',
]);
