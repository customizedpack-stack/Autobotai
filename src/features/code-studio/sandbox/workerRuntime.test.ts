import { describe, expect, it } from 'vitest';
import { araiWorkerRuntime, buildWorkerSource, type RuntimeScope } from './workerRuntime';

/** A fake worker scope that records outgoing messages and can deliver incoming ones. */
function fakeScope() {
  const sent: Record<string, unknown>[] = [];
  const listeners: Record<string, ((e: Record<string, unknown>) => void)[]> = {};
  const scope = {
    postMessage: (m: unknown) => sent.push(m as Record<string, unknown>),
    addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => (listeners[type] ??= []).push(fn),
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    fetch: () => 'network',
    XMLHttpRequest: class {},
    WebSocket: class {},
    importScripts: () => undefined,
    indexedDB: {},
  } as unknown as RuntimeScope & Record<string, unknown>;
  const deliver = (data: unknown) => listeners.message?.forEach((fn) => fn({ data }));
  return { scope, sent, deliver };
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const g = (scope: unknown) => scope as Record<string, any>;

describe('sandbox worker runtime', () => {
  it('removes network, storage and code-loading APIs and defines the program API read-only', () => {
    const { scope } = fakeScope();
    araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'postMessage', 'close', 'setInterval']) {
      expect(g(scope)[name], name).toBeUndefined();
    }
    expect(typeof g(scope).robotControl.drive.forward).toBe('function');
    expect(typeof g(scope).robot.joints).toBe('function');
    expect(typeof g(scope).wait).toBe('function');
    expect(Object.isFrozen(g(scope).robotControl)).toBe(true);
    expect(() => {
      'use strict';
      g(scope).robotControl = {};
    }).toThrow();
    expect(() => {
      'use strict';
      g(scope).fetch = () => 'x';
    }).toThrow();
  });

  it('turns API calls into allowlisted messages and resolves with the host answer', async () => {
    const { scope, sent, deliver } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 'run_9', maxLogLength: 100, lineOffset: 0 });
    let result: unknown;
    rt.start(async () => {
      result = await g(scope).robotControl.drive.forward({ speed: 0.5, durationMs: 2000 });
    });
    expect(sent[0]).toEqual({ v: 1, kind: 'ready', sessionId: 'run_9' });
    expect(sent[1]).toEqual({ v: 1, kind: 'call', sessionId: 'run_9', id: 1, op: 'drive.forward', args: { speed: 0.5, durationMs: 2000 } });
    deliver({ v: 1, kind: 'result', id: 1, ok: true, value: { status: 'completed' } });
    await tick();
    expect(result).toEqual({ status: 'completed' });
    expect(sent.at(-1)).toEqual({ v: 1, kind: 'done', sessionId: 'run_9' });
  });

  it('accepts `rate` or `speed` for turns and refuses unknown options before sending', async () => {
    const { scope, sent } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    rt.start(async () => {
      void g(scope).robotControl.turn.left({ speed: 0.3 });
      void g(scope).robotControl.turn.right({ rate: 0.2, durationMs: 100 });
      g(scope).robotControl.drive.forward({ sped: 1 });
    });
    await tick();
    expect(sent[1]!.args).toEqual({ rate: 0.3 });
    expect(sent[2]!.args).toEqual({ rate: 0.2, durationMs: 100 });
    expect(sent.at(-1)).toMatchObject({ kind: 'fail', message: 'TypeError: Unknown option "sped". Allowed: speed, durationMs.' });
  });

  it('rejects with RobotCommandError when the host refuses a command; uncaught it ends the program', async () => {
    const { scope, sent, deliver } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    rt.start(async () => {
      await g(scope).robotControl.joint('j1').setTarget(9);
    });
    deliver({ v: 1, kind: 'result', id: 1, ok: false, error: 'Above the upper limit (3.142).' });
    await tick();
    expect(sent.at(-1)).toMatchObject({ v: 1, kind: 'fail', sessionId: 's', message: 'Above the upper limit (3.142).' });
  });

  it('can catch a RobotCommandError and continue', async () => {
    const { scope, sent, deliver } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    rt.start(async () => {
      try {
        await g(scope).robotControl.drive.set(5);
      } catch (error) {
        g(scope).console.log('caught', (error as Error).name);
      }
    });
    deliver({ v: 1, kind: 'result', id: 1, ok: false, error: 'speed must be between −1 and 1.' });
    await tick();
    expect(sent.find((m) => m.kind === 'log')).toMatchObject({ level: 'info', text: 'caught RobotCommandError' });
    expect(sent.at(-1)!.kind).toBe('done');
  });

  it('formats and truncates console output', async () => {
    const { scope, sent } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 20, lineOffset: 0 });
    rt.start(async () => {
      g(scope).console.log('x', 1, { a: true });
      g(scope).console.warn('careful');
      g(scope).print('y'.repeat(50));
    });
    await tick();
    const logs = sent.filter((m) => m.kind === 'log');
    expect(logs[0]).toMatchObject({ level: 'info', text: 'x 1 {"a":true}' });
    expect(logs[1]).toMatchObject({ level: 'warning', text: 'careful' });
    expect((logs[2]!.text as string).length).toBe(20);
  });

  it('is not done while a call or a timer is pending, even when main() is not awaited', async () => {
    const { scope, sent, deliver } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    rt.start(async () => {
      void (async () => {
        await g(scope).wait(10);
        g(scope).setTimeout(() => g(scope).console.log('timer'), 20);
      })();
    });
    await tick(20);
    expect(sent.some((m) => m.kind === 'done')).toBe(false);
    deliver({ v: 1, kind: 'result', id: 1, ok: true, value: {} });
    await tick(10);
    expect(sent.some((m) => m.kind === 'done')).toBe(false);
    await tick(40);
    expect(sent.filter((m) => m.kind === 'log').map((m) => m.text)).toEqual(['timer']);
    expect(sent.at(-1)!.kind).toBe('done');
  });

  it('holds at a checkpoint while paused and continues after resume', async () => {
    const { scope, sent, deliver } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    let count = 0;
    rt.start(async () => {
      for (let i = 0; i < 3; i++) {
        await g(scope).__checkpoint();
        count += 1;
      }
    });
    deliver({ v: 1, kind: 'pause' });
    await tick(30);
    const held = count;
    expect(held).toBeLessThan(3);
    expect(sent.some((m) => m.kind === 'done')).toBe(false);
    deliver({ v: 1, kind: 'resume' });
    await tick(30);
    expect(count).toBe(3);
    expect(sent.at(-1)!.kind).toBe('done');
  });

  it('reports errors with the line number in the user program', () => {
    const { source, lineOffset } = buildWorkerSource('const a = 1;\nnull.x;', { sessionId: 's', maxLogLength: 100 });
    const lines = source.split('\n');
    expect(lines[lineOffset - 1]).toBe('rt.start(async function araiProgram() {');
    expect(lines[lineOffset]).toBe('const a = 1;');
    expect(lines[lineOffset + 1]).toBe('null.x;');
    expect(source).not.toMatch(/\beval\(|new Function/);
  });

  it('ignores host messages with another version and results for unknown calls', async () => {
    const { scope, sent, deliver } = fakeScope();
    const rt = araiWorkerRuntime(scope, { sessionId: 's', maxLogLength: 100, lineOffset: 0 });
    rt.start(async () => {
      await g(scope).wait(1);
    });
    deliver({ v: 2, kind: 'result', id: 1, ok: true });
    deliver({ v: 1, kind: 'result', id: 99, ok: true });
    await tick(10);
    expect(sent.some((m) => m.kind === 'done')).toBe(false);
  });
});
