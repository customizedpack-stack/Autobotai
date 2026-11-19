import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';
import { sensorField } from './sensorBlocks';

/**
 * Phase 8 "Camera" blocks. They generate calls to the restricted robotCamera API only
 * (the same one JavaScript programs use). Images are simulated; the blocks give numbers
 * computed from them (brightness, mean color). There is no object recognition.
 */

export const CAMERA_COLOR = '#0EA5E9';
/** Name of the frame inside "every frame from camera … do". */
export const FRAME_VAR = 'cameraFrame__';
const quote = (value: string) => JSON.stringify(value);
const cameraId = (block: Blockly.Block) => quote(block.getFieldValue('SENSOR') as string);

export const CAMERA_BLOCK_TYPES = ['camera_count', 'camera_is_ready', 'camera_brightness', 'camera_color', 'camera_capture', 'camera_on_frame', 'camera_frame_value', 'camera_unsubscribe_all'] as const;

/** True when the block sits inside an "every frame from camera" block. */
export function insideFrameHandler(block: Blockly.Block): boolean {
  for (let p = block.getSurroundParent(); p; p = p.getSurroundParent()) if (p.type === 'camera_on_frame') return true;
  return false;
}

let registered = false;

export function registerCameraBlocks(): void {
  if (registered) return;
  registered = true;
  const B = Blockly.Blocks;
  const output = (block: Blockly.Block, check: string | null, tooltip: string) => {
    block.setOutput(true, check);
    block.setColour(CAMERA_COLOR);
    block.setTooltip(tooltip);
  };
  const statement = (block: Blockly.Block, tooltip: string) => {
    block.setPreviousStatement(true);
    block.setNextStatement(true);
    block.setColour(CAMERA_COLOR);
    block.setTooltip(tooltip);
  };

  B.camera_count = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('number of cameras');
      output(this, 'Number', 'How many cameras this robot has.');
    },
  };
  B.camera_is_ready = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('camera').appendField(sensorField('camera'), 'SENSOR').appendField('is ready');
      output(this, 'Boolean', 'True when the camera is enabled and the 3D view can make images.');
    },
  };
  B.camera_brightness = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('brightness (0–100) seen by camera').appendField(sensorField('camera'), 'SENSOR');
      output(this, 'Number', 'Takes a new image and gives its mean brightness: 0 is black, 100 is white. A wall right in front of the camera fills the image with its color.');
    },
  };
  B.camera_color = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['red', 'r'], ['green', 'g'], ['blue', 'b']]), 'CHANNEL')
        .appendField('(0–255) seen by camera')
        .appendField(sensorField('camera'), 'SENSOR');
      output(this, 'Number', 'Takes a new image and gives the mean of one color channel.');
    },
  };
  B.camera_capture = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('capture image from camera').appendField(sensorField('camera'), 'SENSOR');
      output(this, null, 'A new image: width, height, brightness, meanColor and the pixels (gray). Use with "print" or "log".');
    },
  };
  B.camera_on_frame = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('every frame from camera').appendField(sensorField('camera'), 'SENSOR').appendField('at most');
      this.appendValueInput('HZ').setCheck('Number');
      this.appendDummyInput().appendField('per second');
      this.appendStatementInput('DO').appendField('do');
      this.setInputsInline(true);
      statement(this, 'Runs the blocks inside for each new camera image (at most 5 per second) while the rest of the program continues. Use "value of this camera frame" inside. Ends with "stop camera subscriptions" or Stop.');
    },
  };
  B.camera_frame_value = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['brightness (0–100)', 'brightness'], ['red (0–255)', 'r'], ['green (0–255)', 'g'], ['blue (0–255)', 'b'], ['frame number', 'frame']]), 'FIELD')
        .appendField('of this camera frame');
      output(this, 'Number', 'Only inside "every frame from camera … do".');
    },
  };
  B.camera_unsubscribe_all = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('stop camera subscriptions');
      statement(this, 'End every "every frame from camera" of this program.');
    },
  };

  const g = javascriptGenerator.forBlock;
  const capture = (block: Blockly.Block) => `(await robotCamera.capture(${cameraId(block)}, { format: "none" }))`;
  g.camera_count = () => ['(await robotCamera.list()).length', Order.MEMBER];
  g.camera_is_ready = (block) => [`(((s) => s.enabled && s.rendererReady)(await robotCamera.getState(${cameraId(block)})))`, Order.FUNCTION_CALL];
  g.camera_brightness = (block) => [`${capture(block)}.brightness`, Order.MEMBER];
  g.camera_color = (block) => [`${capture(block)}.meanColor.${block.getFieldValue('CHANNEL') as string}`, Order.MEMBER];
  g.camera_capture = (block) => [`(await robotCamera.capture(${cameraId(block)}, { format: "gray" }))`, Order.AWAIT];
  g.camera_on_frame = (block) => {
    const hz = javascriptGenerator.valueToCode(block, 'HZ', Order.NONE) || '2';
    const body = javascriptGenerator.statementToCode(block, 'DO');
    return `await robotCamera.subscribe(${cameraId(block)}, async (${FRAME_VAR}) => {\n${body}}, { maxHz: ${hz}, format: "none" });\n`;
  };
  g.camera_frame_value = (block) => {
    const field = block.getFieldValue('FIELD') as string;
    const path = field === 'brightness' || field === 'frame' ? field : `meanColor.${field}`;
    return [`${FRAME_VAR}.${path}`, Order.MEMBER];
  };
  g.camera_unsubscribe_all = () => 'await robotCamera.unsubscribeAll();\n';
}
