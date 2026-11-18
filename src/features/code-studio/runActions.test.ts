import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../controls/controlSession';
import { setScheduler } from '../controls/movementEngine';
import { openExplorer } from '../controls/testUtils';
import { useConsoleStore } from '../../stores/consoleStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useCodeStudioStore } from './codeStudioStore';
import { createProgram, deleteProgram, openProgram } from './programActions';
import { convertActiveToJavaScript, generateActiveBlockly, runActiveProgram, setGeneratorLoaderForTests } from './runActions';
import { configureExecution, stopProgram } from './runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from './runtime/executionStore';
import { programsForProject, useProgramStore } from './storage/programStore';
import { inProcessSandbox } from './testUtils';

/**
 * Regression (Phase 4 review, defect 3): the lazy Blockly chunk is loaded with an
 * await; whatever changes during that await must cancel the action. The loader is
 * held open with a test hook so each change can be made "during" generation.
 */

let release: () => void = () => undefined;
function holdGenerator(): void {
  setGeneratorLoaderForTests(
    () =>
      new Promise((resolve) => {
        release = () => resolve(import('./blockly/generator'));
      }),
  );
}

const state = () => useExecutionStore.getState().state;
const codeLog = () => useConsoleStore.getState().entries.filter((e) => e.source === 'code').map((e) => e.message);
const CANCELLED = 'Run was cancelled because the open program changed while the blocks were loading. Try again.';

let blocks: ReturnType<typeof createProgram>;
beforeEach(() => {
  openExplorer(false);
  useProgramStore.setState({ programs: {}, lastOpened: {} });
  useCodeStudioStore.getState().clearAll();
  useExecutionStore.getState().set({ ...IDLE_STATUS });
  useConsoleStore.getState().clear();
  setScheduler(null);
  configureExecution({ sandbox: inProcessSandbox() });
  setWorkspaceMode('code');
  blocks = createProgram('blockly', 'Blocks A');
  holdGenerator();
});
afterEach(() => {
  stopProgram();
  setGeneratorLoaderForTests(null);
  configureExecution();
});

describe('Blockly generation is protected against changes during the lazy load', () => {
  it('runs when nothing changed (control case)', async () => {
    const pending = runActiveProgram();
    release();
    expect(await pending).toBe(true);
    expect(['preparing', 'running']).toContain(state());
    expect(useExecutionStore.getState().programId).toBe(blocks!.id);
  });

  it('does not run stale code when another program is opened during generation', async () => {
    const other = createProgram('blockly', 'Blocks B')!;
    openProgram(blocks!.id);
    const pending = runActiveProgram();
    openProgram(other.id);
    release();
    expect(await pending).toBe(false);
    expect(state()).toBe('idle');
    expect(useExecutionStore.getState().sessionId).toBeNull();
    expect(codeLog()).toContain(CANCELLED);
  });

  it('does not run when the project is switched during generation', async () => {
    const pending = runActiveProgram();
    const other = useProjectStore.getState().createProject({ name: 'Other', category: 'mobile', templateId: 'explorer-bot' });
    useSceneStore.getState().loadProject(other);
    release();
    expect(await pending).toBe(false);
    expect(state()).toBe('idle');
  });

  it('does not run when the program is deleted during generation', async () => {
    const pending = runActiveProgram();
    deleteProgram(blocks!.id);
    release();
    expect(await pending).toBe(false);
    expect(state()).toBe('idle');
    expect(useProgramStore.getState().programs[blocks!.id]).toBeUndefined();
  });

  it('does not run after leaving Code Studio, even when returning to the same program before the load finishes', async () => {
    const pending = runActiveProgram();
    setWorkspaceMode('build');
    setWorkspaceMode('code');
    release();
    expect(await pending).toBe(false);
    expect(state()).toBe('idle');
  });

  it('does not run when still outside Code Studio when the load finishes', async () => {
    const pending = runActiveProgram();
    setWorkspaceMode('control');
    release();
    expect(await pending).toBe(false);
    expect(state()).toBe('idle');
  });

  it('Convert to JavaScript is protected the same way', async () => {
    const other = createProgram('blockly', 'Blocks B')!;
    openProgram(blocks!.id);
    const pending = convertActiveToJavaScript();
    openProgram(other.id);
    release();
    expect(await pending).toBe(false);
    const names = programsForProject(useProgramStore.getState().programs, useSceneStore.getState().projectId!).map((p) => p.name);
    expect(names).not.toContain('Blocks A (JavaScript)');
    expect(codeLog()).toContain('Convert to JavaScript was cancelled because the open program changed while the blocks were loading. Try again.');

    openProgram(blocks!.id);
    const ok = convertActiveToJavaScript();
    release();
    expect(await ok).toBe(true);
    const created = programsForProject(useProgramStore.getState().programs, useSceneStore.getState().projectId!).find((p) => p.name === 'Blocks A (JavaScript)');
    expect(created?.language).toBe('javascript');
    expect(created?.source).toContain('await robotControl.drive.forward');
  });

  it('returns null (no unsafe assertion) when the generation context is gone or the program is not a block program', async () => {
    const pending = generateActiveBlockly();
    deleteProgram(blocks!.id);
    release();
    expect(await pending).toBeNull();
    createProgram('javascript');
    expect(await generateActiveBlockly()).toBeNull();
  });
});
