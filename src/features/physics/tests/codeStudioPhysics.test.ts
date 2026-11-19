import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { activeMovementController, isLoopRunning } from '../../controls/movementEngine';
import { byName, events, openExplorer } from '../../controls/testUtils';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useCodeStudioStore } from '../../code-studio/codeStudioStore';
import { createProgram } from '../../code-studio/programActions';
import { runActiveProgram } from '../../code-studio/runActions';
import { configureExecution, runProgram, stopProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { useProgramStore } from '../../code-studio/storage/programStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { pauseSimulation, resumeSimulation, selectEngine, setSimulationScheduler, stopSimulation } from '../simulation/simulationManager';
import { useSimulationStore } from '../simulation/simulationStore';

/** Code Studio programs in physics mode: sandbox → bridge → Robot Control API → C2 → physics adapter. */

const x = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id]?.position[0] ?? 0;
const state = () => useExecutionStore.getState().state;
const realTime = () =>
  setSimulationScheduler({
    request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  });

beforeEach(() => {
  openExplorer(false);
  setWorkspaceMode('code');
  useExecutionStore.getState().set({ ...IDLE_STATUS });
  configureExecution({ sandbox: inProcessSandbox() });
  realTime();
});
afterEach(async () => {
  stopProgram();
  await selectEngine('kinematic');
  setSimulationScheduler(null);
  configureExecution();
});

describe('Code Studio with the physics engine', () => {
  it('program commands reach the physics adapter through C2 and move the robot physically', async () => {
    await selectEngine('physics');
    expect(activeMovementController()).toBe('physics');
    useRobotStateStore.getState().setSpeedPercent(100);
    expect(runProgram({ programId: 'p1', programName: 'Physics drive', language: 'javascript', code: 'await robotControl.drive.forward({ speed: 1, durationMs: 800 });' }).ok).toBe(true);
    await until(() => state() === 'completed', 8000);
    expect(x()).toBeGreaterThan(0.1);
    const accepted = events('command.accepted').map((e) => e.command as { type: string; source: string });
    expect(accepted.some((c) => c.type === 'drive' && c.source === 'code')).toBe(true);
    // Only the physics controller moved the robot.
    expect(isLoopRunning()).toBe(false);
  });

  it('Run starts a stopped physics simulation for the program', async () => {
    useProgramStore.setState({ programs: {}, lastOpened: {} });
    useCodeStudioStore.getState().clearAll();
    createProgram('javascript', 'Auto start', 'await robotControl.drive.set(0.5);\nawait wait(200);\nawait robotControl.stop();\n');
    useSimulationStore.getState().set({ engine: 'physics', state: 'stopped' });
    expect(await runActiveProgram()).toBe(true);
    expect(useSimulationStore.getState().state).toBe('running');
    await until(() => state() === 'completed', 8000);
  });

  it('pausing the simulation pauses the program; resuming resumes it; stopping the simulation stops it', async () => {
    await selectEngine('physics');
    runProgram({ programId: 'p2', programName: 'Long', language: 'javascript', code: 'await robotControl.drive.set(1);\nawait wait(2000);\nconsole.log("done");' });
    await until(() => state() === 'running' && useRobotStateStore.getState().movement.intent.linear === 1, 8000);
    pauseSimulation();
    expect(state()).toBe('paused');
    resumeSimulation();
    expect(state()).toBe('running');
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(1);
    stopSimulation();
    expect(state()).toBe('idle');
    expect(useExecutionStore.getState().lastOutcome).toBe('stopped');
  });

  it('switching the engine stops a running program', async () => {
    await selectEngine('physics');
    runProgram({ programId: 'p3', programName: 'Long', language: 'javascript', code: 'await robotControl.drive.set(1);\nawait wait(5000);' });
    await until(() => state() === 'running', 8000);
    await selectEngine('kinematic');
    expect(state()).toBe('idle');
  });

  it('Run refuses while the simulation is paused, with a clear message', async () => {
    useProgramStore.setState({ programs: {}, lastOpened: {} });
    useCodeStudioStore.getState().clearAll();
    createProgram('javascript', 'Paused', 'await robotControl.stop();');
    await selectEngine('physics');
    pauseSimulation();
    expect(await runActiveProgram()).toBe(false);
    expect(useExecutionStore.getState().error?.message).toBe('The physics simulation is paused. Resume it to run the program.');
  });

  it('a Blockly program runs on the physics engine through the same path', async () => {
    await selectEngine('physics');
    const { generateFromSource } = await import('../../code-studio/blockly/generator');
    const { starterBlocklyWorkspace } = await import('../../code-studio/storage/starterPrograms');
    useRobotStateStore.getState().setSpeedPercent(100);
    const blocks = generateFromSource(starterBlocklyWorkspace().replace('"NUM":2000', '"NUM":800').replace('"NUM":1000', '"NUM":100'));
    expect(blocks.ok).toBe(true);
    expect(runProgram({ programId: 'p_bp', programName: 'Blocks on physics', language: 'blockly', code: blocks.code, requirements: blocks.requirements }).ok).toBe(true);
    await until(() => state() === 'completed', 10000);
    expect(Math.hypot(x(), useRobotStateStore.getState().rootPoses[byName('Chassis').id]?.position[2] ?? 0)).toBeGreaterThan(0.05);
    const accepted = events('command.accepted').map((e) => e.command as { source: string });
    expect(accepted.some((c) => c.source === 'code')).toBe(true);
    expect(activeMovementController()).toBe('physics');
  });
});
