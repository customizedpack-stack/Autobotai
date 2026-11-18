import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import * as En from 'blockly/msg/en';
import { registerRobotBlocks } from './robotBlocks';

/**
 * One-time Blockly setup: English messages, the library blocks used in the
 * toolbox, the custom AutoBotAI robot blocks and their generators, and the
 * loop trap that makes every loop a pause point.
 */
let ready = false;

export function setupBlockly(): typeof Blockly {
  if (ready) return Blockly;
  ready = true;
  Blockly.setLocale(En as unknown as Record<string, string>);
  // Every loop iteration yields to the runtime: Pause works inside loops and
  // a "forever" loop never blocks the sandbox's message handling.
  javascriptGenerator.INFINITE_LOOP_TRAP = 'await __checkpoint();\n';
  registerRobotBlocks();
  return Blockly;
}

export { Blockly };
