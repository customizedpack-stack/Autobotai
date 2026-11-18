import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bus } from '../../../core/bus/connectorBus';
import { setWorkspaceMode } from '../../controls/controlSession';
import { setScheduler } from '../../controls/movementEngine';
import { byName, events, openExplorer } from '../../controls/testUtils';
import { useConsoleStore } from '../../../stores/consoleStore';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { inProcessSandbox, until, useTimerScheduler } from '../testUtils';
import {
  configureExecution,
  pauseProgram,
  preflight,
  resetRobotFromCodeStudio,
  resumeProgram,
  runProgram,
  stopProgram,
} from './executionManager';
import { IDLE_STATUS, useExecutionStore } from './executionStore';

const state = () => useExecutionStore.getState().state;
const x = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id]?.position[0] ?? 0;
const messages = () => useConsoleStore.getState().entries.filter((e) => e.source === 'code').map((e) => e.message);
const runJs = (code: string) => runProgram({ programId: 'prg_1', programName: 'Test', language: 'javascript', code });

beforeEach(() => {
  openExplorer(false);
  useTimerScheduler();
  useConsoleStore.getState().clear();
  useExecutionStore.getState().set({ ...IDLE_STATUS });
  configureExecution({ sandbox: inProcessSandbox() });
});
afterEach(() => {
  stopProgram();
  configureExecution();
  setScheduler(null);
});

describe('execution manager', () => {
  it('runs a JavaScript program in the sandbox and moves the robot through C2', async () => {
    const result = runJs(`
      console.log("start");
      await robotControl.drive.forward({ speed: 1, durationMs: 300 });
      console.log("end");
    `);
    expect(result.ok).toBe(true);
    expect(useRobotStateStore.getState().mode).toBe('code');
    await until(() => state() === 'completed');
    expect(x()).toBeGreaterThan(0.05);
    expect(messages()).toEqual(expect.arrayContaining(['Program started.', 'Program: start', 'Command accepted: drive.', 'Program: end', 'Program completed. The robot was stopped.']));
    const sources = events('command.accepted').map((e) => (e.command as { source: string }).source);
    expect(new Set(sources)).toEqual(new Set(['code']));
    const lifecycle = events('codeStudio.execution').map((e) => e.state);
    expect(lifecycle).toEqual(['preparing', 'running', 'completed']);
  });

  it('runs the default starter program (main() not awaited) to completion', async () => {
    const { STARTER_JAVASCRIPT } = await import('../storage/starterPrograms');
    useRobotStateStore.getState().setSpeedPercent(100);
    expect(runJs(STARTER_JAVASCRIPT.replace('durationMs: 2000', 'durationMs: 200').replace('durationMs: 1000', 'durationMs: 100')).ok).toBe(true);
    await until(() => state() === 'completed', 4000);
    expect(messages()).toEqual(expect.arrayContaining(['Program: Robot program started', 'Program: Robot program completed']));
    expect(useRobotStateStore.getState().movement.intent).toEqual({ linear: 0, angular: 0 });
  });

  it('Stop ends the program immediately, stops the robot, and ignores late messages', async () => {
    runJs(`await robotControl.drive.set(1); await wait(10000); console.log("never");`);
    await until(() => state() === 'running' && useRobotStateStore.getState().movement.intent.linear === 1);
    const sessionId = useExecutionStore.getState().sessionId;
    stopProgram();
    expect(state()).toBe('idle');
    expect(useExecutionStore.getState().lastOutcome).toBe('stopped');
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
    expect(events('command.accepted').at(-1)!.command).toMatchObject({ type: 'stop', source: 'code' });
    // A late message from the stopped session does nothing.
    const before = events('command.accepted').length;
    bus.publish('console.log', { level: 'info', source: 'system', message: 'noise' });
    await new Promise((r) => setTimeout(r, 50));
    expect(events('command.accepted').length).toBe(before);
    expect(messages()).not.toContain('Program: never');
    expect(messages()).toContain('Program stopped.');
    expect(sessionId).toBeTruthy();
  });

  it('Stop is available after an error and with no program running', () => {
    stopProgram();
    expect(state()).toBe('idle');
    expect(events('command.accepted').at(-1)!.command).toMatchObject({ type: 'stop' });
  });

  it('reports runtime errors with the line number and stops the robot', async () => {
    runJs(`await robotControl.drive.set(1);\nconst robotArm = null;\nrobotArm.move();`);
    await until(() => state() === 'error');
    const { error } = useExecutionStore.getState();
    expect(error?.message).toMatch(/TypeError/);
    expect(error?.line).toBe(3);
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
  });

  it('rejected commands surface as readable errors (C2 message)', async () => {
    runJs(`await robotControl.drive.set(2);`);
    await until(() => state() === 'error');
    expect(useExecutionStore.getState().error?.message).toBe('speed must be between −1 and 1.');
    expect(events('command.rejected').length).toBe(1);
  });

  it('refuses invalid syntax before running, with the line', () => {
    const result = runJs('await robotControl.stop(;\n');
    expect(result.ok).toBe(false);
    expect(state()).toBe('error');
    expect(useExecutionStore.getState().error).toMatchObject({ kind: 'syntax', line: 1 });
  });

  it('refuses a second run while one is active', async () => {
    runJs(`await wait(5000);`);
    const second = runJs(`console.log(1)`);
    expect(second.ok).toBe(false);
    expect(!second.ok && second.issues[0]!.message).toMatch(/already running/);
  });

  it('checks drive readiness before running', () => {
    openExplorer(false, 'robotic-arm');
    const issues = preflight({ language: 'javascript', code: 'await robotControl.drive.forward();' });
    expect(issues[0]!.message).toMatch(/no drive controller/);
    expect(preflight({ language: 'javascript', code: '   ' })[0]!.message).toBe('The program is empty.');
  });

  it('pause stops the robot and holds the program; resume continues', async () => {
    runJs(`await robotControl.drive.set(1); await wait(150); console.log("after wait");`);
    await until(() => useRobotStateStore.getState().movement.intent.linear === 1);
    expect(pauseProgram()).toBe(true);
    expect(state()).toBe('paused');
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(messages()).not.toContain('Program: after wait');
    expect(resumeProgram()).toBe(true);
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(1);
    await until(() => state() === 'completed');
    expect(messages()).toEqual(expect.arrayContaining(['Program paused. The robot was stopped; it continues from the same point when you resume.', 'Program resumed.', 'Program: after wait']));
  });

  it('times out long programs and stops the robot', async () => {
    configureExecution({ sandbox: inProcessSandbox(), limits: { maxRunMs: 200 } });
    runJs(`await robotControl.drive.set(0.5); await wait(10000);`);
    await until(() => state() === 'error', 3000);
    expect(useExecutionStore.getState()).toMatchObject({ lastOutcome: 'timeout', error: { kind: 'timeout' } });
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
  });

  it('leaving Code Studio or closing the project stops the program', async () => {
    runJs(`await robotControl.drive.set(1); await wait(10000);`);
    await until(() => state() === 'running');
    setWorkspaceMode('build');
    expect(state()).toBe('idle');
    expect(messages()).toContain('Program stopped because you left Code Studio.');

    setWorkspaceMode('code');
    runJs(`await wait(10000);`);
    await until(() => state() === 'running');
    const { endControlSession } = await import('../../controls/controlSession');
    endControlSession();
    useSceneStore.getState().closeProject();
    expect(state()).toBe('idle');
    expect(messages()).toContain('Program stopped because the project was closed.');
  });

  it('ends the run when the program floods invalid messages (security)', async () => {
    configureExecution({ sandbox: inProcessSandbox(), limits: { maxInvalidMessages: 3 } });
    // The program cannot reach postMessage directly (it is removed); simulate a hostile worker with a fake sandbox.
    configureExecution({
      limits: { maxInvalidMessages: 3 },
      sandbox: () => (options) => {
        setTimeout(() => {
          options.onWorkerMessage({ v: 1, kind: 'ready', sessionId: options.sessionId });
          for (let i = 0; i < 5; i++) options.onWorkerMessage({ v: 1, kind: 'call', sessionId: options.sessionId, id: 1, op: 'localStorage.getItem' });
        }, 0);
        return { send: () => undefined, destroy: () => undefined };
      },
    });
    runJs('console.log(1)');
    await until(() => state() === 'error');
    expect(useExecutionStore.getState().error?.kind).toBe('security');
  });

  it('reports a sandbox that fails to start or crashes', async () => {
    configureExecution({ sandbox: () => (o) => (setTimeout(() => o.onStartFailed('Workers blocked'), 0), { send: () => undefined, destroy: () => undefined }) });
    runJs('console.log(1)');
    await until(() => state() === 'error');
    expect(useExecutionStore.getState().error).toMatchObject({ kind: 'sandbox' });
    configureExecution({ limits: { startTimeoutMs: 50 }, sandbox: () => () => ({ send: () => undefined, destroy: () => undefined }) });
    runJs('console.log(1)');
    await until(() => state() === 'error');
    expect(useExecutionStore.getState().error?.message).toBe('The code sandbox did not start in time.');
  });

  it('Reset Robot stops the program and uses the API reset (design unchanged)', async () => {
    const design = byName('Chassis').transform;
    runJs(`await robotControl.drive.set(1); await wait(10000);`);
    await until(() => x() > 0.02);
    resetRobotFromCodeStudio();
    expect(state()).toBe('idle');
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
    expect(byName('Chassis').transform).toEqual(design);
    expect(events('command.accepted').at(-1)!.command).toMatchObject({ type: 'reset', source: 'code' });
  });

  it('a worker crash ends the run, stops a moving robot, ignores later messages, and Stop still works', async () => {
    let send: ((raw: unknown) => void) | null = null;
    let crash: ((message: string) => void) | null = null;
    let sessionId = '';
    configureExecution({
      sandbox: () => (options) => {
        sessionId = options.sessionId;
        send = options.onWorkerMessage;
        crash = (m) => options.onWorkerError(m);
        setTimeout(() => options.onWorkerMessage({ v: 1, kind: 'ready', sessionId }), 0);
        return { send: () => undefined, destroy: () => undefined };
      },
    });
    runJs('await robotControl.drive.set(1);');
    await until(() => state() === 'running');
    send!({ v: 1, kind: 'call', sessionId, id: 1, op: 'drive.set', args: { speed: 1 } });
    await until(() => useRobotStateStore.getState().movement.intent.linear === 1);
    crash!('Out of memory');
    expect(state()).toBe('error');
    expect(useExecutionStore.getState().error?.message).toBe('The program crashed: Out of memory');
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
    const accepted = events('command.accepted').length;
    send!({ v: 1, kind: 'call', sessionId, id: 2, op: 'drive.set', args: { speed: 1 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(events('command.accepted').length).toBe(accepted);
    stopProgram();
    expect(events('command.accepted').at(-1)!.command).toMatchObject({ type: 'stop', source: 'code' });
  });
});
