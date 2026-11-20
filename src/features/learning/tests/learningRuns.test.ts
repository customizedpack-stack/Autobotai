import { describe, expect, it } from 'vitest';
import { useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useBlueprintStore } from '../../blueprint/blueprintStore';
import { configureExecution, runProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { programsForProject, useProgramStore } from '../../code-studio/storage/programStore';
import { endControlSession, setWorkspaceMode } from '../../controls/controlSession';
import { setScheduler } from '../../controls/movementEngine';
import { useConsoleStore } from '../../../stores/consoleStore';
import { findProjectDefinition } from '../catalog/projects';
import { runCheck } from '../engine/checks';
import { connectLearningEvidence } from '../engine/evidence';
import { createFromDefinition } from '../engine/projectFactory';

/**
 * Integration: library projects run their REAL starter programs through the existing
 * Code Studio sandbox and Command Bus (kinematic engine, in-process sandbox).
 */
connectLearningEvidence();

async function runStarter(id: string) {
  localStorage.clear();
  endControlSession();
  useSceneStore.getState().closeProject();
  useProjectStore.setState({ projects: {} });
  const def = findProjectDefinition(id)!;
  const r = createFromDefinition(def, { kind: 'robot', complete: true });
  if (!r.ok) throw new Error(r.error);
  const project = useProjectStore.getState().projects[r.project.id]!;
  useSceneStore.getState().loadProject(project);
  useBlueprintStore.getState().load(project.id, project.blueprint);
  setWorkspaceMode('code');
  configureExecution({ sandbox: inProcessSandbox() });
  setScheduler({ request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number, cancel: (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>) });
  useExecutionStore.getState().set({ ...IDLE_STATUS });
  const program = programsForProject(useProgramStore.getState().programs, project.id)[0]!;
  const run = runProgram({ programId: program.id, programName: program.name, language: 'javascript', code: program.source });
  expect(run.ok).toBe(true);
  return { project, program };
}

describe('Starter programs run through the existing Code Studio runtime', () => {
  it('Pick & Place: the arm visits the poses and returns home', async () => {
    const { project } = await runStarter('pick-and-place-arm');
    let maxShoulder = 0;
    const off = useRobotStateStore.subscribe((s) => {
      for (const v of Object.values(s.jointPositions)) maxShoulder = Math.max(maxShoulder, Math.abs(v));
    });
    await until(() => useExecutionStore.getState().state === 'completed' || useExecutionStore.getState().state === 'error', 20000);
    off();
    expect(useExecutionStore.getState().error).toBeNull();
    expect(useExecutionStore.getState().state).toBe('completed');
    expect(maxShoulder).toBeGreaterThan(0.5);
    const text = useConsoleStore.getState().entries.map((e) => e.message).join('\n');
    expect(text).toContain('Reach the pick spot');
    expect(text).toContain('Return home');
    expect(runCheck({ kind: 'programRun', physics: false }, { projectId: project.id }).ok).toBe(true);
    setScheduler(null);
  }, 30000);

  it('Delivery: drives until the encoder reaches the target distance', async () => {
    const { project } = await runStarter('delivery-robot');
    await until(() => ['completed', 'error'].includes(useExecutionStore.getState().state), 25000);
    expect(useExecutionStore.getState().error).toBeNull();
    const text = useConsoleStore.getState().entries.map((e) => e.message).join('\n');
    const delivered = /Delivered after (\d+\.\d+) m/.exec(text);
    expect(delivered).not.toBeNull();
    expect(Number(delivered![1])).toBeGreaterThanOrEqual(1.5);
    expect(runCheck({ kind: 'programRun', physics: false }, { projectId: project.id }).ok).toBe(true);
    setScheduler(null);
  }, 35000);
});
