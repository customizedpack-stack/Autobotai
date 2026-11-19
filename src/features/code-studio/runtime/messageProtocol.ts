/**
 * Sandbox message protocol (version 1).
 *
 * The user's program runs in a Web Worker inside a sandboxed, opaque-origin
 * iframe. It can only talk to the app through these messages. The host
 * validates EVERY message against this allowlist before acting on it.
 *
 *   worker → host:  ready | call | log | done | fail
 *   host → worker:  result | pause | resume | sensor (a reading for a subscription, Phase 6)
 *   frame → host:   fromWorker | workerError | startFailed      (envelope)
 *   host → frame:   start | toWorker                           (envelope)
 */

export const PROTOCOL_VERSION = 1;

/** Every operation a program may request. Anything else is rejected. */
export const SANDBOX_OPS = {
  'drive.forward': { speed: 'number?', durationMs: 'number?' },
  'drive.backward': { speed: 'number?', durationMs: 'number?' },
  'drive.set': { speed: 'number' },
  'turn.left': { rate: 'number?', durationMs: 'number?' },
  'turn.right': { rate: 'number?', durationMs: 'number?' },
  'turn.set': { rate: 'number' },
  stop: {},
  reset: {},
  'joint.setTarget': { jointId: 'string', target: 'number' },
  'joint.preview': { jointId: 'string', target: 'number' },
  'joint.wait': { jointId: 'string' },
  'joint.info': { jointId: 'string' },
  joints: {},
  setSpeedPercent: { value: 'number' },
  getState: {},
  wait: { ms: 'number' },
  // ── Phase 6: robotSensors (C3 Sensor Stream). Read-only; never moves the robot. ──
  'sensor.list': {},
  'sensor.read': { sensorId: 'string', type: 'string' },
  'sensor.subscribe': { sensorId: 'string', type: 'string', maxHz: 'number?' },
  'sensor.unsubscribe': { subscriptionId: 'number' },
  'sensor.resetEncoder': { sensorId: 'string' },
  'sensor.odometry': {},
} as const satisfies Record<string, Record<string, ArgType>>;

type ArgType = 'number' | 'number?' | 'string' | 'boolean?';

export type SandboxOp = keyof typeof SANDBOX_OPS;
export type SandboxArgs = Record<string, number | string | boolean | undefined>;
export type LogLevelFromProgram = 'info' | 'warning' | 'error';

export type WorkerMessage =
  | { v: 1; kind: 'ready'; sessionId: string }
  | { v: 1; kind: 'call'; sessionId: string; id: number; op: SandboxOp; args: SandboxArgs }
  | { v: 1; kind: 'log'; sessionId: string; level: LogLevelFromProgram; text: string }
  | { v: 1; kind: 'done'; sessionId: string }
  | { v: 1; kind: 'fail'; sessionId: string; message: string; line?: number; code?: 'flood' };

export type HostMessage =
  | { v: 1; kind: 'result'; id: number; ok: true; value: unknown }
  | { v: 1; kind: 'result'; id: number; ok: false; error: string }
  | { v: 1; kind: 'pause' }
  | { v: 1; kind: 'resume' }
  | { v: 1; kind: 'sensor'; subscriptionId: number; reading: unknown };

export type FrameMessage =
  | { t: 'fromWorker'; msg: unknown }
  | { t: 'workerError'; message: string; line?: number }
  | { t: 'startFailed'; message: string };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const MAX_TEXT = 4000;
const MAX_ARG_KEYS = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isSandboxOp(op: unknown): op is SandboxOp {
  return typeof op === 'string' && hasOwn(SANDBOX_OPS, op);
}

/** Readable name of an argument for error messages. */
const ARG_LABEL: Record<string, string> = { speed: 'speed', durationMs: 'durationMs', rate: 'rate', jointId: 'joint id', target: 'target', value: 'speed percent', ms: 'wait time', sensorId: 'sensor id', type: 'sensor type', maxHz: 'maxHz', subscriptionId: 'subscription id' };

/**
 * Check the arguments of an operation: only known keys, correct primitive types,
 * finite numbers. Value RANGES are checked later by the host bridge and C2,
 * so the program gets the same messages as every other command source.
 */
export function validateArgs(op: SandboxOp, args: unknown): ParseResult<SandboxArgs> {
  if (args === undefined) args = {};
  if (!isPlainObject(args)) return { ok: false, reason: 'Arguments must be a plain object.' };
  const schema = SANDBOX_OPS[op] as Record<string, ArgType>;
  const keys = Object.keys(args);
  if (keys.length > MAX_ARG_KEYS) return { ok: false, reason: 'Too many arguments.' };
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) return { ok: false, reason: `Unknown option "${key.slice(0, 40)}".` };
  }
  const out: SandboxArgs = {};
  for (const [key, type] of Object.entries(schema)) {
    const value = args[key];
    const label = ARG_LABEL[key] ?? key;
    const optional = type.endsWith('?');
    if (value === undefined || value === null) {
      if (!optional) return { ok: false, reason: `${label} is required.` };
      continue;
    }
    if (type.startsWith('number')) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, reason: `${label} must be a number.` };
    } else if (type.startsWith('string')) {
      if (typeof value !== 'string' || value.length === 0 || value.length > 200) return { ok: false, reason: `${label} must be text.` };
    } else if (type.startsWith('boolean')) {
      if (typeof value !== 'boolean') return { ok: false, reason: `${label} must be true or false.` };
    }
    out[key] = value as number | string | boolean;
  }
  return { ok: true, value: out };
}

/** Validate a raw message from the worker. Messages for another session are rejected. */
export function parseWorkerMessage(raw: unknown, sessionId: string): ParseResult<WorkerMessage> {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Message is not an object.' };
  if (raw.v !== PROTOCOL_VERSION) return { ok: false, reason: 'Unsupported protocol version.' };
  if (raw.sessionId !== sessionId) return { ok: false, reason: 'Message from another session.' };
  switch (raw.kind) {
    case 'ready':
    case 'done':
      return { ok: true, value: { v: 1, kind: raw.kind, sessionId } };
    case 'call': {
      if (typeof raw.id !== 'number' || !Number.isInteger(raw.id) || raw.id < 1) return { ok: false, reason: 'Invalid call id.' };
      if (!isSandboxOp(raw.op)) return { ok: false, reason: `Operation "${String(raw.op).slice(0, 40)}" is not allowed.` };
      // Argument problems are reported back to the program as a normal error, so keep the raw args here.
      return { ok: true, value: { v: 1, kind: 'call', sessionId, id: raw.id, op: raw.op, args: (raw.args ?? {}) as SandboxArgs } };
    }
    case 'log': {
      const level = raw.level === 'warning' || raw.level === 'error' ? raw.level : raw.level === 'info' ? 'info' : null;
      if (!level || typeof raw.text !== 'string') return { ok: false, reason: 'Invalid log message.' };
      return { ok: true, value: { v: 1, kind: 'log', sessionId, level, text: raw.text.slice(0, MAX_TEXT) } };
    }
    case 'fail': {
      if (typeof raw.message !== 'string') return { ok: false, reason: 'Invalid failure message.' };
      const line = typeof raw.line === 'number' && Number.isInteger(raw.line) && raw.line > 0 ? raw.line : undefined;
      const code = raw.code === 'flood' ? ('flood' as const) : undefined;
      return { ok: true, value: { v: 1, kind: 'fail', sessionId, message: raw.message.slice(0, MAX_TEXT), line, ...(code ? { code } : {}) } };
    }
    default:
      return { ok: false, reason: `Message kind "${String(raw.kind).slice(0, 40)}" is not allowed.` };
  }
}

/** Validate a message from the sandbox frame (the trusted relay around the worker). */
export function parseFrameMessage(raw: unknown): ParseResult<FrameMessage> {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Frame message is not an object.' };
  switch (raw.t) {
    case 'fromWorker':
      return { ok: true, value: { t: 'fromWorker', msg: raw.msg } };
    case 'workerError': {
      const message = typeof raw.message === 'string' ? raw.message.slice(0, MAX_TEXT) : 'The program crashed.';
      const line = typeof raw.line === 'number' && Number.isInteger(raw.line) && raw.line > 0 ? raw.line : undefined;
      return { ok: true, value: { t: 'workerError', message, line } };
    }
    case 'startFailed':
      return { ok: true, value: { t: 'startFailed', message: typeof raw.message === 'string' ? raw.message.slice(0, MAX_TEXT) : 'The sandbox could not start.' } };
    default:
      return { ok: false, reason: 'Unknown frame message.' };
  }
}
