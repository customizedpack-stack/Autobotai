import { describe, expect, it } from 'vitest';
import { parseFrameMessage, parseWorkerMessage, SANDBOX_OPS, validateArgs } from './messageProtocol';

const S = 'run_1';

describe('sandbox message protocol', () => {
  it('accepts the allowlisted message kinds of the current session', () => {
    expect(parseWorkerMessage({ v: 1, kind: 'ready', sessionId: S }, S).ok).toBe(true);
    expect(parseWorkerMessage({ v: 1, kind: 'done', sessionId: S }, S).ok).toBe(true);
    const call = parseWorkerMessage({ v: 1, kind: 'call', sessionId: S, id: 3, op: 'drive.forward', args: { speed: 0.5 } }, S);
    expect(call.ok && call.value.kind === 'call' && call.value.op).toBe('drive.forward');
    const log = parseWorkerMessage({ v: 1, kind: 'log', sessionId: S, level: 'warning', text: 'hi' }, S);
    expect(log.ok && log.value.kind === 'log' && log.value.level).toBe('warning');
    const fail = parseWorkerMessage({ v: 1, kind: 'fail', sessionId: S, message: 'TypeError: x', line: 4 }, S);
    expect(fail.ok && fail.value.kind === 'fail' && fail.value.line).toBe(4);
  });

  it('rejects messages from another session, other versions and malformed shapes', () => {
    expect(parseWorkerMessage({ v: 1, kind: 'ready', sessionId: 'run_old' }, S)).toEqual({ ok: false, reason: 'Message from another session.' });
    expect(parseWorkerMessage({ v: 2, kind: 'ready', sessionId: S }, S).ok).toBe(false);
    expect(parseWorkerMessage(null, S).ok).toBe(false);
    expect(parseWorkerMessage('ready', S).ok).toBe(false);
    expect(parseWorkerMessage([1, 2], S).ok).toBe(false);
    expect(parseWorkerMessage({ v: 1, kind: 'call', sessionId: S, id: 0, op: 'stop' }, S).ok).toBe(false);
    expect(parseWorkerMessage({ v: 1, kind: 'call', sessionId: S, id: 1.5, op: 'stop' }, S).ok).toBe(false);
    expect(parseWorkerMessage({ v: 1, kind: 'log', sessionId: S, level: 'debug-secret', text: 'x' }, S).ok).toBe(false);
  });

  it('only allows the listed operations (no store, engine, DOM or network access)', () => {
    for (const op of ['setState', 'movementEngine.step', 'localStorage', 'fetch', 'eval', '__proto__', 'constructor', 'toString']) {
      const result = parseWorkerMessage({ v: 1, kind: 'call', sessionId: S, id: 1, op }, S);
      expect(result.ok, op).toBe(false);
    }
    expect(Object.keys(SANDBOX_OPS)).toEqual([
      'drive.forward', 'drive.backward', 'drive.set', 'turn.left', 'turn.right', 'turn.set', 'stop', 'reset',
      'joint.setTarget', 'joint.preview', 'joint.wait', 'joint.info', 'joints', 'setSpeedPercent', 'getState', 'wait',
      // Phase 6: read-only sensor operations (C3).
      'sensor.list', 'sensor.read', 'sensor.subscribe', 'sensor.unsubscribe', 'sensor.resetEncoder', 'sensor.odometry',
    ]);
  });

  it('rejects unknown message kinds', () => {
    for (const kind of ['result', 'pause', 'sensor', 'eval', 'exec']) {
      expect(parseWorkerMessage({ v: 1, kind, sessionId: S }, S).ok, kind).toBe(false);
    }
  });

  it('validates arguments: known keys, primitive types, finite numbers', () => {
    expect(validateArgs('drive.forward', { speed: 0.5, durationMs: 1000 })).toEqual({ ok: true, value: { speed: 0.5, durationMs: 1000 } });
    expect(validateArgs('drive.forward', undefined)).toEqual({ ok: true, value: {} });
    expect(validateArgs('drive.forward', { speed: 'fast' })).toEqual({ ok: false, reason: 'speed must be a number.' });
    expect(validateArgs('drive.forward', { speed: Number.NaN }).ok).toBe(false);
    expect(validateArgs('drive.forward', { speed: Infinity }).ok).toBe(false);
    expect(validateArgs('drive.forward', { turbo: true })).toEqual({ ok: false, reason: 'Unknown option "turbo".' });
    expect(validateArgs('drive.set', {})).toEqual({ ok: false, reason: 'speed is required.' });
    expect(validateArgs('joint.setTarget', { jointId: '', target: 1 }).ok).toBe(false);
    expect(validateArgs('wait', { ms: [1] }).ok).toBe(false);
    expect(validateArgs('stop', { x: 1 }).ok).toBe(false);
    expect(validateArgs('stop', Object.create({ inherited: 1 })).ok).toBe(false);
  });

  it('validates frame envelopes', () => {
    expect(parseFrameMessage({ t: 'fromWorker', msg: { a: 1 } }).ok).toBe(true);
    expect(parseFrameMessage({ t: 'workerError', message: 'boom', line: 3 })).toEqual({ ok: true, value: { t: 'workerError', message: 'boom', line: 3 } });
    expect(parseFrameMessage({ t: 'startFailed' })).toEqual({ ok: true, value: { t: 'startFailed', message: 'The sandbox could not start.' } });
    expect(parseFrameMessage({ t: 'navigate', url: 'x' }).ok).toBe(false);
  });
});
