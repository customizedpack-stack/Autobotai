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

  // ── Final review: incoming worker message rate protection ──
  describe('incoming message rate protection', () => {
    /** A fake sandbox driven by the test; records replies and whether it was destroyed. */
    function floodSandbox() {
      const box = { send: null as null | ((raw: unknown) => void), sessionId: '', replies: [] as { ok: boolean; error?: string }[], destroyed: false };
      configureExecution({
        limits: { maxMessagesPerSecond: 100, terminateAtMessagesPerSecond: 1000 },
        sandbox: () => (options) => {
          box.sessionId = options.sessionId;
          box.send = options.onWorkerMessage;
          box.destroyed = false;
          setTimeout(() => options.onWorkerMessage({ v: 1, kind: 'ready', sessionId: options.sessionId }), 0);
          return { send: (m) => box.replies.push(m as { ok: boolean; error?: string }), destroy: () => (box.destroyed = true) };
        },
      });
      return box;
    }
    const call = (box: { sessionId: string }, id: number) => ({ v: 1, kind: 'call', sessionId: box.sessionId, id, op: 'getState', args: {} });

    it('rejects messages above the per-second limit (calls get an error answer) without ending the run', async () => {
      const box = floodSandbox();
      runJs('await wait(10000);');
      await until(() => state() === 'running');
      for (let i = 1; i <= 300; i++) box.send!(call(box, i));
      await new Promise((r) => setTimeout(r, 20));
      const errors = box.replies.filter((r) => !r.ok);
      expect(errors).toHaveLength(201); // 300 calls + the ready message = 301 messages; 100 allowed
      expect(errors[0]!.error).toBe('Too many messages: the limit is 100 per second.');
      expect(box.replies.filter((r) => r.ok)).toHaveLength(99);
      expect(state()).toBe('running');
      expect(messages()).toContain('The program sends more than 100 messages per second; extra messages are rejected.');
    });

    it('ends an abusive session above the termination threshold and ignores its later messages', async () => {
      const box = floodSandbox();
      runJs('await robotControl.drive.set(0.5); await wait(10000);');
      await until(() => state() === 'running');
      box.send!({ v: 1, kind: 'call', sessionId: box.sessionId, id: 1, op: 'drive.set', args: { speed: 0.5 } });
      await until(() => useRobotStateStore.getState().movement.intent.linear === 0.5);
      for (let i = 2; i <= 1200; i++) box.send!({ v: 1, kind: 'log', sessionId: box.sessionId, level: 'info', text: 'spam' });
      expect(state()).toBe('error');
      expect(useExecutionStore.getState().error).toMatchObject({ kind: 'security', message: 'The program sent too many messages (more than 1000 per second) and was stopped.' });
      expect(box.destroyed).toBe(true);
      expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
      const replies = box.replies.length;
      const accepted = events('command.accepted').length;
      for (let i = 0; i < 50; i++) box.send!(call(box, 5000 + i));
      box.send!({ v: 1, kind: 'call', sessionId: box.sessionId, id: 9999, op: 'drive.set', args: { speed: 1 } });
      await new Promise((r) => setTimeout(r, 20));
      expect(box.replies.length).toBe(replies);
      expect(events('command.accepted').length).toBe(accepted);
    });

    it('counts messages per session: a new run starts with a fresh window', async () => {
      const box = floodSandbox();
      runJs('await wait(10000);');
      await until(() => state() === 'running');
      for (let i = 1; i <= 150; i++) box.send!(call(box, i));
      stopProgram();
      box.replies.length = 0;
      runJs('await wait(10000);');
      await until(() => state() === 'running');
      for (let i = 1; i <= 50; i++) box.send!(call(box, i));
      await new Promise((r) => setTimeout(r, 20));
      expect(box.replies.filter((r) => !r.ok)).toHaveLength(0);
      expect(box.replies.filter((r) => r.ok)).toHaveLength(50);
    });

    it('Stop stays responsive during a continuous flood and ends it at once', async () => {
      const box = floodSandbox();
      // Re-install the flood sandbox with a termination threshold that the flood never reaches.
      configureExecution({
        limits: { maxMessagesPerSecond: 100, terminateAtMessagesPerSecond: 1_000_000 },
        sandbox: () => (options) => {
          box.sessionId = options.sessionId;
          let alive = true;
          let id = 0;
          const pump = () => {
            if (!alive) return;
            for (let i = 0; i < 200; i++) options.onWorkerMessage({ v: 1, kind: 'call', sessionId: options.sessionId, id: ++id, op: 'getState', args: {} });
            setTimeout(pump, 0);
          };
          setTimeout(() => {
            options.onWorkerMessage({ v: 1, kind: 'ready', sessionId: options.sessionId });
            pump();
          }, 0);
          return { send: () => undefined, destroy: () => ((alive = false), (box.destroyed = true)) };
        },
      });
      runJs('await wait(10000);');
      await until(() => state() === 'running');
      await new Promise((r) => setTimeout(r, 30));
      const t0 = performance.now();
      stopProgram();
      expect(performance.now() - t0).toBeLessThan(50);
      expect(state()).toBe('idle');
      expect(box.destroyed).toBe(true);
    });

    it('normal Blockly and JavaScript programs still run with the default limits', async () => {
      configureExecution({ sandbox: inProcessSandbox() });
      const { generateFromSource } = await import('../blockly/generator');
      const { starterBlocklyWorkspace } = await import('../storage/starterPrograms');
      useRobotStateStore.getState().setSpeedPercent(100);
      const blocks = generateFromSource(starterBlocklyWorkspace().replace('"NUM":2000', '"NUM":200').replace('"NUM":1000', '"NUM":100'));
      expect(blocks.ok).toBe(true);
      expect(runProgram({ programId: 'p_b', programName: 'Blocks', language: 'blockly', code: blocks.code, requirements: blocks.requirements }).ok).toBe(true);
      await until(() => state() === 'completed', 4000);
      expect(runJs('for (let i = 0; i < 40; i++) { console.log(i); }\nawait robotControl.drive.forward({ speed: 1, durationMs: 100 });').ok).toBe(true);
      await until(() => state() === 'completed', 4000);
      expect(messages()).toContain('Program: 39');
    });

    it('a run-ending report (done / fail) is never rate-filtered, even after a flood', async () => {
      const box = floodSandbox();
      runJs('await wait(10000);');
      await until(() => state() === 'running');
      for (let i = 0; i < 500; i++) box.send!({ v: 1, kind: 'log', sessionId: box.sessionId, level: 'info', text: 'x' });
      box.send!({ v: 1, kind: 'fail', sessionId: box.sessionId, message: 'The program sent too many messages (more than 5000 per second) and was stopped.', code: 'flood' });
      expect(state()).toBe('error');
      expect(useExecutionStore.getState().error?.kind).toBe('security');
    });
  });
});
