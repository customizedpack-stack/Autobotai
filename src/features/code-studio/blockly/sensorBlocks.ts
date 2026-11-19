import * as Blockly from 'blockly/core';
import { javascriptGenerator, Order } from 'blockly/javascript';
import { useSceneStore } from '../../../stores/sceneStore';
import type { SensorType } from '../../../types/sensor';

/**
 * Phase 6 "Sensors" blocks. They generate calls to the restricted robotSensors API
 * only (the same one JavaScript programs use). Sensor dropdowns list the open robot's
 * sensors; a sensor that no longer exists stays visible as "missing" and stops the
 * program before it runs (see generator.ts).
 */

export const SENSOR_COLOR = '#14B8A6';
export const NO_SENSOR = '__none__';
const RAD_TO_DEG_CODE = '(180 / Math.PI)';

const missingSensorIds = new Set<string>();

/** Before loading a saved workspace, remember sensor ids that no longer exist so they stay visible. */
export function primeMissingSensors(serialized: string): string[] {
  missingSensorIds.clear();
  const known = new Set(useSceneStore.getState().sensors.map((s) => s.id));
  for (const match of serialized.matchAll(/"SENSOR"\s*:\s*"([^"]+)"/g)) {
    const id = match[1]!;
    if (id !== NO_SENSOR && !known.has(id)) missingSensorIds.add(id);
  }
  return [...missingSensorIds];
}

const TYPE_NAME: Record<SensorType | 'any', string> = { distance: 'distance sensors', encoder: 'wheel encoders', imu: 'IMUs', camera: 'cameras', any: 'sensors' };

function sensorMenu(type: SensorType | 'any'): () => Blockly.MenuOption[] {
  return () => {
    const options: Blockly.MenuOption[] = useSceneStore
      .getState()
      .sensors.filter((s) => (type === 'any' ? s.type !== 'camera' : s.type === type))
      .map((s) => [`${s.name} (${s.id})${s.enabled ? '' : ' · off'}`, s.id]);
    for (const id of missingSensorIds) options.push([`⚠ missing sensor ${id}`, id]);
    if (options.length === 0) options.push([`(no ${TYPE_NAME[type]})`, NO_SENSOR]);
    return options;
  };
}

/** Which sensor type a block's SENSOR field must have ('any' accepts every type). */
export const SENSOR_BLOCK_TYPES: Record<string, SensorType | 'any'> = {
  sensor_read_distance: 'distance',
  sensor_distance_m: 'distance',
  sensor_obstacle: 'distance',
  sensor_obstacle_within: 'distance',
  sensor_compare_distance: 'distance',
  sensor_wait_until_distance: 'distance',
  sensor_read_encoder: 'encoder',
  sensor_encoder_value: 'encoder',
  sensor_encoder_reset: 'encoder',
  sensor_read_imu: 'imu',
  sensor_imu_orientation: 'imu',
  sensor_imu_angular_velocity: 'imu',
  sensor_imu_acceleration: 'imu',
  sensor_wait_reading: 'any',
  sensor_is_valid: 'any',
  // Phase 8: camera blocks (cameraBlocks.ts) use the same SENSOR field and checks.
  camera_brightness: 'camera',
  camera_color: 'camera',
  camera_capture: 'camera',
  camera_is_ready: 'camera',
  camera_on_frame: 'camera',
};

export function sensorField(type: SensorType | 'any'): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(sensorMenu(type));
}

const quote = (value: string) => JSON.stringify(value);

/** robotSensors.<type>("id"), with the type taken from the robot for 'any' fields. */
function handle(block: Blockly.Block): string {
  const id = block.getFieldValue('SENSOR') as string;
  const wanted = SENSOR_BLOCK_TYPES[block.type]!;
  const type = wanted === 'any' ? (useSceneStore.getState().sensors.find((s) => s.id === id)?.type ?? 'distance') : wanted;
  return `robotSensors.${type}(${quote(id)})`;
}

let registered = false;

export function registerSensorBlocks(): void {
  if (registered) return;
  registered = true;
  const B = Blockly.Blocks;
  const output = (block: Blockly.Block, check: string | null, tooltip: string) => {
    block.setOutput(true, check);
    block.setColour(SENSOR_COLOR);
    block.setTooltip(tooltip);
  };
  const statement = (block: Blockly.Block, tooltip: string) => {
    block.setPreviousStatement(true);
    block.setNextStatement(true);
    block.setColour(SENSOR_COLOR);
    block.setTooltip(tooltip);
  };

  // ── Distance ──
  B.sensor_read_distance = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('read distance sensor').appendField(sensorField('distance'), 'SENSOR');
      output(this, null, 'The full distance reading: distance (m or null), detected, status, hit point, every ray, valid. Use with "print" or "log".');
    },
  };
  B.sensor_distance_m = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('distance (m) from').appendField(sensorField('distance'), 'SENSOR');
      output(this, 'Number', 'Distance to the nearest obstacle in meters. Nothing in range gives Infinity; closer than the minimum range gives the minimum range. Needs the Physics engine.');
    },
  };
  B.sensor_obstacle = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('obstacle detected by').appendField(sensorField('distance'), 'SENSOR');
      output(this, 'Boolean', 'True when something is within the sensor\'s maximum range.');
    },
  };
  B.sensor_obstacle_within = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('obstacle closer than');
      this.appendValueInput('METERS').setCheck('Number');
      this.appendDummyInput().appendField('m on').appendField(sensorField('distance'), 'SENSOR');
      this.setInputsInline(true);
      output(this, 'Boolean', 'True when the nearest obstacle is closer than this many meters.');
    },
  };
  B.sensor_compare_distance = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('distance from')
        .appendField(sensorField('distance'), 'SENSOR')
        .appendField(new Blockly.FieldDropdown([['<', '<'], ['≤', '<='], ['>', '>'], ['≥', '>=']]), 'OP');
      this.appendValueInput('METERS').setCheck('Number');
      this.appendDummyInput().appendField('m');
      this.setInputsInline(true);
      output(this, 'Boolean', 'Compare the measured distance with a value in meters.');
    },
  };
  B.sensor_wait_until_distance = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('wait until distance from')
        .appendField(sensorField('distance'), 'SENSOR')
        .appendField(new Blockly.FieldDropdown([['<', '<'], ['>', '>']]), 'OP');
      this.appendValueInput('METERS').setCheck('Number');
      this.appendDummyInput().appendField('m');
      this.setInputsInline(true);
      statement(this, 'Wait, checking every new reading, until the distance is below (or above) the value. The robot keeps doing what it was doing.');
    },
  };

  // ── Encoders ──
  B.sensor_read_encoder = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('read encoder').appendField(sensorField('encoder'), 'SENSOR');
      output(this, null, 'The full encoder reading: angle, revolutions, ticks, angular velocity, distance, valid.');
    },
  };
  B.sensor_encoder_value = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['wheel angle (°)', 'angle'],
            ['revolutions', 'revolutions'],
            ['ticks', 'ticks'],
            ['wheel speed (°/s)', 'angularVelocity'],
            ['distance rolled (m)', 'distance'],
          ]),
          'FIELD',
        )
        .appendField('of encoder')
        .appendField(sensorField('encoder'), 'SENSOR');
      output(this, 'Number', 'A wheel encoder value since its last reset. Driving forward counts up.');
    },
  };
  B.sensor_encoder_reset = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('reset encoder').appendField(sensorField('encoder'), 'SENSOR');
      statement(this, 'Set the encoder counter back to 0.');
    },
  };

  // ── IMU ──
  B.sensor_read_imu = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('read IMU').appendField(sensorField('imu'), 'SENSOR');
      output(this, null, 'The full IMU reading: orientation, angular velocity, linear acceleration (without gravity), specific force, valid.');
    },
  };
  B.sensor_imu_orientation = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['heading (yaw)', 'yaw'], ['pitch', 'pitch'], ['roll', 'roll']]), 'ANGLE')
        .appendField('(°) of IMU')
        .appendField(sensorField('imu'), 'SENSOR');
      output(this, 'Number', 'Orientation in degrees. Yaw grows when the robot turns left.');
    },
  };
  B.sensor_imu_angular_velocity = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('turn rate')
        .appendField(new Blockly.FieldDropdown([['around up (y)', 'y'], ['around forward (x)', 'x'], ['around side (z)', 'z']]), 'AXIS')
        .appendField('(°/s) of IMU')
        .appendField(sensorField('imu'), 'SENSOR');
      output(this, 'Number', 'Angular velocity in degrees per second, in the IMU frame. Around up (y) is positive when turning left.');
    },
  };
  B.sensor_imu_acceleration = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('acceleration')
        .appendField(new Blockly.FieldDropdown([['forward (x)', 'x'], ['up (y)', 'y'], ['side (z)', 'z']]), 'AXIS')
        .appendField('(m/s², without gravity) of IMU')
        .appendField(sensorField('imu'), 'SENSOR');
      output(this, 'Number', 'Linear acceleration in m/s² in the IMU frame, with gravity removed (0 when resting).');
    },
  };

  // ── Utility ──
  B.sensor_wait_reading = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('wait for a new reading from').appendField(sensorField('any'), 'SENSOR');
      statement(this, 'Wait until the sensor produces its next reading.');
    },
  };
  B.sensor_is_valid = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('reading from').appendField(sensorField('any'), 'SENSOR').appendField('is valid');
      output(this, 'Boolean', 'False when the sensor is disabled, warming up, or needs an engine that is not running.');
    },
  };

  const g = javascriptGenerator.forBlock;
  const v = (block: Blockly.Block, input: string) => javascriptGenerator.valueToCode(block, input, Order.RELATIONAL) || 'undefined';
  g.sensor_read_distance = (block) => [`(await ${handle(block)}.read())`, Order.AWAIT];
  g.sensor_distance_m = (block) => [`(await ${handle(block)}.meters())`, Order.AWAIT];
  g.sensor_obstacle = (block) => [`(await ${handle(block)}.isObstacleDetected())`, Order.AWAIT];
  g.sensor_obstacle_within = (block) => [`(await ${handle(block)}.isObstacleDetected(${v(block, 'METERS')}))`, Order.AWAIT];
  g.sensor_compare_distance = (block) => [`((await ${handle(block)}.meters()) ${block.getFieldValue('OP')} ${v(block, 'METERS')})`, Order.RELATIONAL];
  g.sensor_wait_until_distance = (block) => {
    const h = handle(block);
    return `while (!((await ${h}.meters()) ${block.getFieldValue('OP')} ${v(block, 'METERS')})) {\n  await __checkpoint();\n  await ${h}.waitForReading();\n}\n`;
  };
  g.sensor_read_encoder = (block) => [`(await ${handle(block)}.read())`, Order.AWAIT];
  g.sensor_encoder_value = (block) => {
    const field = block.getFieldValue('FIELD') as string;
    const code = `(await ${handle(block)}.value(${quote(field)}))`;
    return field === 'angle' || field === 'angularVelocity' ? [`(${code} * ${RAD_TO_DEG_CODE})`, Order.MULTIPLICATION] : [code, Order.AWAIT];
  };
  g.sensor_encoder_reset = (block) => `await ${handle(block)}.reset();\n`;
  g.sensor_read_imu = (block) => [`(await ${handle(block)}.read())`, Order.AWAIT];
  g.sensor_imu_orientation = (block) => [`((await ${handle(block)}.orientation(${quote(block.getFieldValue('ANGLE') as string)})) * ${RAD_TO_DEG_CODE})`, Order.MULTIPLICATION];
  g.sensor_imu_angular_velocity = (block) => [`((await ${handle(block)}.angularVelocity(${quote(block.getFieldValue('AXIS') as string)})) * ${RAD_TO_DEG_CODE})`, Order.MULTIPLICATION];
  g.sensor_imu_acceleration = (block) => [`(await ${handle(block)}.linearAcceleration(${quote(block.getFieldValue('AXIS') as string)}))`, Order.AWAIT];
  g.sensor_wait_reading = (block) => `await ${handle(block)}.waitForReading();\n`;
  g.sensor_is_valid = (block) => [`((await ${handle(block)}.read()).valid === true)`, Order.EQUALITY];
}
