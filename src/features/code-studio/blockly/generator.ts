import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { useSceneStore } from '../../../stores/sceneStore';
import type { ProgramRequirements } from '../utils/programValidation';
import { setupBlockly } from './blocklySetup';
import { beginDiagnostics, endDiagnostics, NO_JOINT, primeMissingJoints } from './robotBlocks';
import { SUPPORTED_BLOCK_TYPES } from './toolbox';
import { NO_SENSOR, primeMissingSensors, SENSOR_BLOCK_TYPES } from './sensorBlocks';
import { insideFrameHandler } from './cameraBlocks';

/**
 * Blockly → JavaScript, with checks first.
 *
 * Only the stack under the single "when program starts" block runs. Before any
 * code is produced, the stack is checked: unsupported blocks, empty inputs and
 * joints that no longer exist are reported as errors (with the block id, so
 * the editor can highlight the block). A program with errors is never run.
 */

export interface BlockIssue {
  blockId?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface GeneratedProgram {
  ok: boolean;
  code: string;
  requirements: ProgramRequirements;
  issues: BlockIssue[];
}

const BLOCK_LABEL: Record<string, string> = {
  controls_if: 'If',
  controls_repeat_ext: 'Repeat',
  controls_whileUntil: 'Repeat while / until',
  logic_compare: 'Compare',
  logic_operation: 'And / Or',
  logic_negate: 'Not',
  math_arithmetic: 'Arithmetic',
  math_random_int: 'Random number',
  variables_set: 'Set variable',
  math_change: 'Change variable',
};

function labelOf(block: Blockly.Block): string {
  if (BLOCK_LABEL[block.type]) return BLOCK_LABEL[block.type]!;
  const text = Blockly.Block.prototype.toString.call(block, 40).replace(/\?/g, '…').trim();
  return text || block.type;
}

/** Check the blocks that will run. */
function checkStack(start: Blockly.Block, issues: BlockIssue[]): void {
  const jointIds = new Set(useSceneStore.getState().joints.map((j) => j.id));
  const sensors = useSceneStore.getState().sensors;
  for (const block of start.getDescendants(false)) {
    if (!block.isEnabled()) continue;
    if (!SUPPORTED_BLOCK_TYPES.has(block.type) || !javascriptGenerator.forBlock[block.type]) {
      issues.push({ blockId: block.id, message: `The block "${labelOf(block)}" is not supported in robot programs.`, severity: 'error' });
      continue;
    }
    for (const input of block.inputList) {
      if (input.connection?.type === Blockly.ConnectionType.INPUT_VALUE && !input.connection.targetBlock()) {
        issues.push({ blockId: block.id, message: `The block "${labelOf(block)}" is missing a value.`, severity: 'error' });
      }
    }
    const joint = block.getField('JOINT');
    if (joint) {
      const id = joint.getValue() as string;
      if (id === NO_JOINT) issues.push({ blockId: block.id, message: 'This robot has no movable joints for this block.', severity: 'error' });
      else if (!jointIds.has(id)) issues.push({ blockId: block.id, message: 'A block refers to a joint that no longer exists in this robot. Choose a joint again.', severity: 'error' });
    }
    // Phase 8: "value of this camera frame" only exists inside "every frame from camera".
    if (block.type === 'camera_frame_value' && !insideFrameHandler(block)) {
      issues.push({ blockId: block.id, message: 'Put "value of this camera frame" inside an "every frame from camera … do" block.', severity: 'error' });
    }
    // Phase 6: sensor blocks must point at an existing sensor of the right type.
    const sensorField = block.getField('SENSOR');
    if (sensorField) {
      const id = sensorField.getValue() as string;
      const wanted = SENSOR_BLOCK_TYPES[block.type];
      const sensor = sensors.find((s) => s.id === id);
      if (id === NO_SENSOR) issues.push({ blockId: block.id, message: 'This robot has no sensor of the kind this block needs. Add one in Build Mode (Inspector → Sensors).', severity: 'error' });
      else if (!sensor) issues.push({ blockId: block.id, message: `A block refers to the sensor "${id}", which no longer exists in this robot. Choose a sensor again.`, severity: 'error' });
      else if (wanted && wanted !== 'any' && sensor.type !== wanted) issues.push({ blockId: block.id, message: `The sensor "${id}" is not the kind this block needs.`, severity: 'error' });
      else if (!sensor.enabled) issues.push({ blockId: block.id, message: `The sensor "${id}" is disabled; its readings will be marked invalid.`, severity: 'warning' });
    }
  }
}

export function generateFromWorkspace(workspace: Blockly.Workspace): GeneratedProgram {
  setupBlockly();
  const issues: BlockIssue[] = [];
  const empty: ProgramRequirements = { usesDrive: false, jointIds: [], jointTargets: [] };
  const tops = workspace.getTopBlocks(true).filter((b) => b.isEnabled());
  const starts = tops.filter((b) => b.type === 'robot_start');
  if (starts.length === 0) {
    issues.push({ message: 'Add a "when program starts" block and attach your blocks under it.', severity: 'error' });
    return { ok: false, code: '', requirements: empty, issues };
  }
  if (starts.length > 1) {
    for (const extra of starts.slice(1)) issues.push({ blockId: extra.id, message: 'Use only one "when program starts" block.', severity: 'error' });
  }
  const start = starts[0]!;
  const loose = tops.filter((b) => b !== start && b.type !== 'robot_start');
  if (loose.length > 0) {
    issues.push({ blockId: loose[0]!.id, message: `${loose.length} block group(s) are not attached to "when program starts" and will not run.`, severity: 'warning' });
  }
  checkStack(start, issues);
  if (issues.some((i) => i.severity === 'error')) return { ok: false, code: '', requirements: empty, issues };

  const ctx = beginDiagnostics();
  try {
    javascriptGenerator.init(workspace);
    const body = javascriptGenerator.blockToCode(start);
    const code = javascriptGenerator.finish(typeof body === 'string' ? body : body[0]);
    const header = '// Generated from blocks. Edit the blocks, not this code.\n';
    return {
      ok: true,
      code: header + code.trim() + '\n',
      requirements: { usesDrive: ctx.usesDrive, jointIds: [...ctx.jointIds], jointTargets: ctx.jointTargets },
      issues,
    };
  } catch (error) {
    issues.push({ message: `The blocks could not be turned into code: ${String(error instanceof Error ? error.message : error)}`, severity: 'error' });
    return { ok: false, code: '', requirements: empty, issues };
  } finally {
    endDiagnostics();
  }
}

/** Load a saved Blockly program into a workspace. Returns the joint ids it refers to that no longer exist. */
export function loadWorkspace(workspace: Blockly.Workspace, serialized: string): { ok: boolean; missingJoints: string[]; error?: string } {
  setupBlockly();
  const missingJoints = primeMissingJoints(serialized);
  primeMissingSensors(serialized);
  try {
    const state = JSON.parse(serialized || '{}') as Record<string, unknown>;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(state, workspace);
    } finally {
      Blockly.Events.enable();
    }
    return { ok: true, missingJoints };
  } catch (error) {
    return { ok: false, missingJoints, error: String(error instanceof Error ? error.message : error) };
  }
}

export function saveWorkspace(workspace: Blockly.Workspace): string {
  return JSON.stringify(Blockly.serialization.workspaces.save(workspace));
}

/** Generate code from a saved program without showing it (headless workspace). */
export function generateFromSource(serialized: string): GeneratedProgram {
  setupBlockly();
  const workspace = new Blockly.Workspace();
  try {
    const loaded = loadWorkspace(workspace, serialized);
    if (!loaded.ok) {
      return { ok: false, code: '', requirements: { usesDrive: false, jointIds: [], jointTargets: [] }, issues: [{ message: `This block program could not be read: ${loaded.error}`, severity: 'error' }] };
    }
    return generateFromWorkspace(workspace);
  } finally {
    workspace.dispose();
  }
}
