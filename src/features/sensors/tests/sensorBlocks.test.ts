import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { byName, openExplorer } from '../../controls/testUtils';
import { generateFromSource } from '../../code-studio/blockly/generator';
import { configureExecution, runProgram, stopProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { selectEngine, setEnvironment, setSimulationScheduler } from '../../physics/simulation/simulationManager';
import { robotModel } from '../../robot-model/robotModelConnector';
import { useConsoleStore } from '../../../stores/consoleStore';
import { useRobotStateStore } from '../../../stores/robotStateStore';

/** Blockly "Sensors" blocks: generated code uses robotSensors only, and runs in the sandbox. */

const num = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const program = (blocks: unknown) => JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 0, y: 0, next: { block: blocks } }] } });
const state = () => useExecutionStore.getState().state;
const messages = () => useConsoleStore.getState().entries.map((e) => e.message);

beforeEach(() => {
  openExplorer(false);
  setWorkspaceMode('code');
  useExecutionStore.getState().set({ ...IDLE_STATUS });
  useConsoleStore.setState({ entries: [], events: [] });
  configureExecution({ sandbox: inProcessSandbox() });
  setSimulationScheduler({
    request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  });
});
afterEach(async () => {
  stopProgram();
  await selectEngine('kinematic');
  setSimulationScheduler(null);
  configureExecution();
});

describe('Blockly Sensors blocks', () => {
  it('generate robotSensors calls only (no store or engine access)', () => {
    const generated = generateFromSource(
      program({
        type: 'robot_log_value',
        fields: { LABEL: 'd' },
        inputs: { VALUE: { block: { type: 'sensor_distance_m', fields: { SENSOR: 'front-distance' } } } },
        next: {
          block: {
            type: 'sensor_encoder_reset',
            fields: { SENSOR: 'left-encoder' },
            next: { block: { type: 'robot_log_value', fields: { LABEL: 'yaw' }, inputs: { VALUE: { block: { type: 'sensor_imu_orientation', fields: { SENSOR: 'main-imu', ANGLE: 'yaw' } } } } } },
          },
        },
      }),
    );
    expect(generated.ok).toBe(true);
    expect(generated.code).toContain('robotSensors.distance("front-distance").meters()');
    expect(generated.code).toContain('await robotSensors.encoder("left-encoder").reset();');
    expect(generated.code).toContain('robotSensors.imu("main-imu").orientation("yaw")');
    expect(generated.code).not.toMatch(/Store|getState\(\)\.|physics|rapier|sensorManager/i);
  });

  it('a deleted or wrong sensor stops the program before it runs', () => {
    const missing = generateFromSource(program({ type: 'sensor_encoder_reset', fields: { SENSOR: 'gone-encoder' } }));
    expect(missing.ok).toBe(false);
    expect(missing.issues[0]!.message).toMatch(/sensor "gone-encoder", which no longer exists/);
    robotModel.updateSensor('main-imu', { enabled: false });
    const disabled = generateFromSource(program({ type: 'sensor_wait_reading', fields: { SENSOR: 'main-imu' } }));
    expect(disabled.ok).toBe(true);
    expect(disabled.issues.some((i) => i.severity === 'warning' && /disabled/.test(i.message))).toBe(true);
  });

  it('obstacle avoidance: drive until the wall is closer than 0.4 m, then stop (physics)', async () => {
    await selectEngine('physics');
    setEnvironment('obstacles');
    useRobotStateStore.getState().setSpeedPercent(100);
    const generated = generateFromSource(
      program({
        type: 'robot_drive_at_speed',
        inputs: { SPEED: num(0.6) },
        next: {
          block: {
            type: 'sensor_wait_until_distance',
            fields: { SENSOR: 'front-distance', OP: '<' },
            inputs: { METERS: num(0.4) },
            next: {
              block: {
                type: 'robot_stop',
                next: { block: { type: 'robot_log_value', fields: { LABEL: 'distance' }, inputs: { VALUE: { block: { type: 'sensor_distance_m', fields: { SENSOR: 'front-distance' } } } } } },
              },
            },
          },
        },
      }),
    );
    expect(generated.ok).toBe(true);
    expect(runProgram({ programId: 'p_avoid', programName: 'Avoid', language: 'blockly', code: generated.code, requirements: generated.requirements }).ok).toBe(true);
    await until(() => state() === 'completed', 15000);
    const line = messages().find((m) => m.startsWith('Program: distance = '))!;
    const d = Number(line.split('= ')[1]);
    expect(d).toBeLessThan(0.4);
    expect(d).toBeGreaterThan(0.1);
    // The robot stopped before the wall (wall face at x = 1.35).
    const x = useRobotStateStore.getState().rootPoses[byName('Chassis').id]!.position[0];
    expect(x).toBeLessThan(1.35 - 0.2);
  });
});
