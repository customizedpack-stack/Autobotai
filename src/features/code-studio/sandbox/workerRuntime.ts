/**
 * The restricted runtime that runs INSIDE the sandbox worker, before the
 * user's program. It is written as a self-contained function (no imports, no
 * outer variables) because its source text is copied into the worker with
 * Function.prototype.toString(). Unit tests call it directly with a fake scope.
 *
 * What it does:
 * 1. Removes network, storage and code-loading APIs from the worker scope.
 * 2. Defines the program API as read-only globals: robotControl, robotSensors (Phase 6),
 *    robot, wait, print, console, RobotCommandError, plus tracked setTimeout / setInterval.
 * 3. Turns every API call into an allowlisted message for the host.
 * 4. Supports cooperative pause (__checkpoint) and reports done / fail.
 *
 * It is defense in depth only: the real boundary is the opaque-origin iframe
 * with a strict Content Security Policy (see sandboxHost.ts).
 */

export interface RuntimeScope {
  postMessage: (message: unknown) => void;
  addEventListener: (type: string, listener: (event: { data?: unknown; error?: unknown; message?: string; reason?: unknown; preventDefault?: () => void }) => void) => void;
  setTimeout: (fn: () => void, ms?: number) => number;
  clearTimeout: (id: number) => void;
}

export interface RuntimeOptions {
  sessionId: string;
  maxLogLength: number;
  /** Lines in the worker script before the first line of the user's program. */
  lineOffset: number;
  /** Outgoing messages per second; above it output is dropped and robot calls fail (defaults: no limit). */
  maxMessagesPerSecond?: number;
  /** Outgoing messages per second at which the program is ended as a flood. */
  terminateAtMessagesPerSecond?: number;
}

export interface RuntimeHandle {
  start: (main: () => Promise<unknown>) => void;
}

export function araiWorkerRuntime(scope: RuntimeScope, options: RuntimeOptions): RuntimeHandle {
  'use strict';
  const { sessionId, maxLogLength, lineOffset } = options;
  const softLimit = options.maxMessagesPerSecond ?? Number.POSITIVE_INFINITY;
  const hardLimit = options.terminateAtMessagesPerSecond ?? Number.POSITIVE_INFINITY;
  let windowStart = Date.now();
  let windowCount = 0;
  let dropNoticeSent = false;
  const post = scope.postMessage.bind(scope);
  const realSetTimeout = scope.setTimeout.bind(scope);
  const realClearTimeout = scope.clearTimeout.bind(scope);
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const userTimers = new Map<number, number>();
  const resumeWaiters: (() => void)[] = [];
  let seq = 0;
  let outstanding = 0;
  let mainSettled = false;
  let finished = false;
  let started = false;
  let paused = false;
  let lastYield = Date.now();
  let timerSeq = 0;
  /** Phase 6: callbacks of active sensor subscriptions (subscription id → callback). */
  const sensorCallbacks = new Map<number, (reading: unknown) => unknown>();

  const send = (kind: string, extra: Record<string, unknown>) => {
    if (finished && kind !== 'done' && kind !== 'fail') return;
    post({ v: 1, kind, sessionId, ...extra });
  };

  // 1. Remove APIs a robot program never needs. (The iframe's CSP blocks them too.)
  const blocked = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches',
    'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection', 'Request',
    'postMessage', 'close', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'Atomics', 'SharedArrayBuffer',
  ];
  for (const name of blocked) {
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false, enumerable: false });
    } catch {
      /* not present in this scope */
    }
  }

  class RobotCommandError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'RobotCommandError';
    }
  }

  const lineOf = (error: unknown): number | undefined => {
    const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
    // The first stack frame that lies inside the user's program (frames in the runtime come before it).
    for (const match of stack.matchAll(/:(\d+):(\d+)\)?\s*$/gm)) {
      const line = Number(match[1]) - lineOffset;
      if (line >= 1) return line;
    }
    return undefined;
  };

  const describe = (error: unknown): string => {
    if (error instanceof RobotCommandError) return error.message;
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return `Uncaught value: ${String(error)}`;
  };

  const fail = (error: unknown) => {
    if (finished) return;
    finished = true;
    send('fail', { message: describe(error), line: lineOf(error) });
  };

  /**
   * Outgoing message rate, enforced at the source: a flood must never pile up in the
   * browser's message queues (the host also checks, as a second layer).
   */
  const rate = (): 'ok' | 'drop' | 'flood' => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      windowCount = 0;
      dropNoticeSent = false;
    }
    windowCount += 1;
    if (windowCount > hardLimit) {
      if (!finished) {
        finished = true;
        send('fail', { message: `The program sent too many messages (more than ${hardLimit} per second) and was stopped.`, code: 'flood' });
      }
      return 'flood';
    }
    return windowCount > softLimit ? 'drop' : 'ok';
  };

  const checkDone = () => {
    realSetTimeout(() => {
      if (!finished && mainSettled && outstanding === 0) {
        finished = true;
        send('done', {});
      }
    }, 0);
  };

  scope.addEventListener('message', (event) => {
    const data = event.data as { v?: number; kind?: string; id?: number; ok?: boolean; value?: unknown; error?: string; subscriptionId?: number; reading?: unknown } | undefined;
    if (!data || data.v !== 1) return;
    if (data.kind === 'result' && typeof data.id === 'number') {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      outstanding -= 1;
      if (data.ok) entry.resolve(data.value);
      else entry.reject(new RobotCommandError(String(data.error ?? 'Command failed.')));
      checkDone();
    } else if (data.kind === 'sensor' && typeof data.subscriptionId === 'number') {
      const callback = sensorCallbacks.get(data.subscriptionId);
      if (!callback || paused || finished) return;
      try {
        const result = callback(data.reading) as { then?: unknown } | undefined;
        if (result && typeof result.then === 'function') (result as Promise<unknown>).then(undefined, (error: unknown) => fail(error));
      } catch (error) {
        fail(error);
      }
    } else if (data.kind === 'pause') {
      paused = true;
    } else if (data.kind === 'resume') {
      paused = false;
      for (const wake of resumeWaiters.splice(0)) wake();
    }
  });
  scope.addEventListener('unhandledrejection', (event) => {
    event.preventDefault?.();
    fail(event.reason);
  });
  scope.addEventListener('error', (event) => {
    event.preventDefault?.();
    fail(event.error ?? new Error(String(event.message ?? 'Unknown error')));
  });

  /** Send one request to the host. Resolves with the host's answer. */
  const call = (op: string, args: Record<string, unknown>): Promise<unknown> => {
    if (finished) return new Promise(() => undefined);
    const allowed = rate();
    if (allowed === 'flood') return new Promise(() => undefined);
    if (allowed === 'drop') return Promise.reject(new RobotCommandError(`Too many messages: the limit is ${softLimit} per second.`));
    return new Promise((resolve, reject) => {
      seq += 1;
      pending.set(seq, { resolve, reject });
      outstanding += 1;
      send('call', { id: seq, op, args });
    });
  };

  /** Copy only known keys with plain values, so nothing unexpected crosses the boundary. */
  const pick = (options: unknown, keys: readonly string[], rename: Record<string, string> = {}): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (options === undefined || options === null) return out;
    if (typeof options !== 'object') throw new TypeError('Options must be an object, for example { speed: 0.5, durationMs: 1000 }.');
    const source = options as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const target = rename[key] ?? key;
      if (!keys.includes(target)) throw new TypeError(`Unknown option "${key}". Allowed: ${keys.join(', ')}.`);
      const value = source[key];
      out[target] = value === null || ['number', 'string', 'boolean', 'undefined'].includes(typeof value) ? value : String(value);
    }
    return out;
  };
  const plain = (value: unknown) => (value === null || ['number', 'string', 'boolean', 'undefined'].includes(typeof value) ? value : String(value));

  /** Cooperative pause point. Generated Blockly loops call it every iteration. */
  const checkpoint = async (): Promise<void> => {
    if (finished) return new Promise(() => undefined);
    if (paused || Date.now() - lastYield >= 15) {
      await new Promise<void>((resolve) => realSetTimeout(resolve, 0));
      lastYield = Date.now();
    }
    while (paused) {
      outstanding += 1;
      await new Promise<void>((resolve) => resumeWaiters.push(resolve));
      outstanding -= 1;
    }
  };

  const format = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
      const text = JSON.stringify(value);
      return text === undefined ? String(value) : text;
    } catch {
      return String(value);
    }
  };
  const logger = (level: 'info' | 'warning' | 'error') => (...values: unknown[]) => {
    if (finished) return;
    const allowed = rate();
    if (allowed === 'flood') return;
    if (allowed === 'drop') {
      if (!dropNoticeSent) {
        dropNoticeSent = true;
        send('log', { level: 'warning', text: `Some output was not shown: more than ${softLimit} messages per second.` });
      }
      return;
    }
    send('log', { level, text: values.map(format).join(' ').slice(0, maxLogLength) });
  };
  const programConsole = Object.freeze({
    log: logger('info'),
    info: logger('info'),
    debug: logger('info'),
    warn: logger('warning'),
    error: logger('error'),
  });

  const robotControl = Object.freeze({
    drive: Object.freeze({
      forward: (options?: unknown) => call('drive.forward', pick(options, ['speed', 'durationMs'])),
      backward: (options?: unknown) => call('drive.backward', pick(options, ['speed', 'durationMs'])),
      set: (speed: unknown) => call('drive.set', { speed: plain(speed) }),
    }),
    turn: Object.freeze({
      // `rate` as in the brief; `speed` (the Phase 3 option name) is accepted too.
      left: (options?: unknown) => call('turn.left', pick(options, ['rate', 'durationMs'], { speed: 'rate' })),
      right: (options?: unknown) => call('turn.right', pick(options, ['rate', 'durationMs'], { speed: 'rate' })),
      set: (rate: unknown) => call('turn.set', { rate: plain(rate) }),
    }),
    stop: () => call('stop', {}),
    reset: () => call('reset', {}),
    joint: (jointId: unknown) =>
      Object.freeze({
        setTarget: (target: unknown) => call('joint.setTarget', { jointId: String(jointId), target: plain(target) }),
        preview: (target: unknown) => call('joint.preview', { jointId: String(jointId), target: plain(target) }),
      }),
    setSpeedPercent: (value: unknown) => call('setSpeedPercent', { value: plain(value) }),
    getState: () => call('getState', {}),
  });

  // ── Phase 6: robotSensors. Reads go to the host's sensor API (C3); no engine access. ──
  type Reading = { valid?: boolean; error?: string; [key: string]: unknown };
  const sensorHandle = (type: 'distance' | 'encoder' | 'imu', sensorId: unknown) => {
    const id = String(sensorId);
    const read = () => call('sensor.read', { sensorId: id, type }) as Promise<Reading>;
    const subscribe = async (callback: unknown, options?: unknown) => {
      if (typeof callback !== 'function') throw new TypeError('subscribe needs a function, for example subscribe((reading) => console.log(reading)).');
      const result = (await call('sensor.subscribe', { sensorId: id, type, ...pick(options, ['maxHz']) })) as { subscriptionId: number; maxHz: number };
      const subscriptionId = result.subscriptionId;
      let active = true;
      sensorCallbacks.set(subscriptionId, callback as (reading: unknown) => unknown);
      // An active subscription keeps the program running (like a pending timer) until it is unsubscribed.
      outstanding += 1;
      return Object.freeze({
        id: subscriptionId,
        maxHz: result.maxHz,
        unsubscribe: async () => {
          if (!active) return false;
          active = false;
          sensorCallbacks.delete(subscriptionId);
          outstanding -= 1;
          await call('sensor.unsubscribe', { subscriptionId });
          checkDone();
          return true;
        },
      });
    };
    /** The next new reading of this sensor (valid or not). */
    const waitForReading = () =>
      new Promise<Reading>((resolve, reject) => {
        let sub: { unsubscribe: () => Promise<boolean> } | null = null;
        let done: Reading | null = null;
        subscribe((reading: Reading) => {
          if (done) return;
          done = reading;
          if (sub) sub.unsubscribe().then(() => resolve(reading), reject);
        }).then((s) => {
          sub = s;
          if (done) s.unsubscribe().then(() => resolve(done!), reject);
        }, reject);
      });
    /** A valid reading; waits briefly while the sensor warms up, otherwise throws with the sensor's reason. */
    const readValid = async (): Promise<Reading> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reading = await read();
        if (reading.valid) return reading;
        if (!/^(Warming up|No reading yet)/.test(String(reading.error))) throw new RobotCommandError(`Sensor "${id}": ${String(reading.error)}`);
        await waitForReading();
      }
      throw new RobotCommandError(`Sensor "${id}" has no valid reading yet.`);
    };
    return { id, read, subscribe, waitForReading, readValid };
  };
  const axisOf = (axis: unknown, allowed: readonly string[]) => {
    const a = String(axis);
    if (!allowed.includes(a)) throw new TypeError(`Unknown axis "${a}". Use ${allowed.join(', ')}.`);
    return a;
  };
  const robotSensors = Object.freeze({
    list: () => call('sensor.list', {}),
    odometry: () => call('sensor.odometry', {}),
    distance: (sensorId: unknown) => {
      const h = sensorHandle('distance', sensorId);
      return Object.freeze({
        read: h.read,
        subscribe: h.subscribe,
        waitForReading: h.waitForReading,
        /** Distance in meters. Nothing in range → Infinity. Closer than the minimum range → the minimum range. */
        meters: async () => {
          const r = await h.readValid();
          if (r.status === 'no-hit') return Number.POSITIVE_INFINITY;
          if (r.status === 'too-close') return r.minRange as number;
          return r.distance as number;
        },
        /** Is something within range (or within maxMeters, when given)? */
        isObstacleDetected: async (maxMeters?: unknown) => {
          const r = await h.readValid();
          if (!r.detected) return false;
          if (maxMeters === undefined || maxMeters === null) return true;
          return r.status === 'too-close' || (r.distance as number) <= Number(maxMeters);
        },
      });
    },
    encoder: (sensorId: unknown) => {
      const h = sensorHandle('encoder', sensorId);
      const fields = ['angle', 'revolutions', 'ticks', 'angularVelocity', 'distance'];
      return Object.freeze({
        read: h.read,
        subscribe: h.subscribe,
        waitForReading: h.waitForReading,
        reset: () => call('sensor.resetEncoder', { sensorId: h.id }),
        /** One value: angle (rad), revolutions, ticks, angularVelocity (rad/s) or distance (m). */
        value: async (field: unknown) => {
          const f = axisOf(field, fields);
          const r = await h.readValid();
          return r[f] as number | null;
        },
      });
    },
    imu: (sensorId: unknown) => {
      const h = sensorHandle('imu', sensorId);
      return Object.freeze({
        read: h.read,
        subscribe: h.subscribe,
        waitForReading: h.waitForReading,
        /** roll, pitch or yaw (rad). */
        orientation: async (angle: unknown) => {
          const a = axisOf(angle, ['roll', 'pitch', 'yaw']);
          return ((await h.readValid()).euler as Record<string, number>)[a];
        },
        /** x, y or z (rad/s). */
        angularVelocity: async (axis: unknown) => ((await h.readValid()).angularVelocity as Record<string, number>)[axisOf(axis, ['x', 'y', 'z'])],
        /** x, y or z (m/s²), gravity not included. */
        linearAcceleration: async (axis: unknown) => ((await h.readValid()).linearAcceleration as Record<string, number>)[axisOf(axis, ['x', 'y', 'z'])],
        /** x, y or z (m/s²): what a real accelerometer reads (includes the reaction to gravity). */
        specificForce: async (axis: unknown) => ((await h.readValid()).specificForce as Record<string, number>)[axisOf(axis, ['x', 'y', 'z'])],
      });
    },
  });

  const robot = Object.freeze({
    joints: () => call('joints', {}),
    jointInfo: (jointId: unknown) => call('joint.info', { jointId: String(jointId) }),
    waitForJoint: (jointId: unknown) => call('joint.wait', { jointId: String(jointId) }),
  });

  const wait = (ms: unknown) => call('wait', { ms: plain(ms) });

  // Tracked timers: the program is not finished while one is pending.
  const trackedSetTimeout = (fn: unknown, ms?: unknown) => {
    if (typeof fn !== 'function') throw new TypeError('setTimeout needs a function.');
    timerSeq += 1;
    const id = timerSeq;
    outstanding += 1;
    const delay = Math.min(Math.max(Number(ms) || 0, 0), 60_000);
    const handle = realSetTimeout(() => {
      if (!userTimers.delete(id)) return;
      outstanding -= 1;
      try {
        (fn as () => void)();
      } catch (error) {
        fail(error);
      }
      checkDone();
    }, delay);
    userTimers.set(id, handle);
    return id;
  };
  const trackedClearTimeout = (id: unknown) => {
    const handle = userTimers.get(id as number);
    if (handle === undefined) return;
    userTimers.delete(id as number);
    realClearTimeout(handle);
    outstanding -= 1;
    checkDone();
  };

  const globals: Record<string, unknown> = {
    robotControl,
    robotSensors,
    robot,
    wait,
    print: programConsole.log,
    console: programConsole,
    RobotCommandError,
    __checkpoint: checkpoint,
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
  };
  for (const [name, value] of Object.entries(globals)) {
    try {
      Object.defineProperty(scope, name, { value, writable: false, configurable: false, enumerable: false });
    } catch {
      /* already defined */
    }
  }

  return {
    start(main) {
      if (started) return;
      started = true;
      send('ready', {});
      let promise: Promise<unknown>;
      try {
        promise = main();
      } catch (error) {
        fail(error);
        return;
      }
      promise.then(
        () => {
          mainSettled = true;
          checkDone();
        },
        (error: unknown) => fail(error),
      );
    },
  };
}

/** Header line that opens the user's program inside the worker script. */
const USER_CODE_OPEN = 'rt.start(async function araiProgram() {';

/**
 * Build the complete worker script: the runtime, then the user's program wrapped
 * in an async function (so `await` works at the top level of the program).
 * The user code is never evaluated with eval / new Function.
 */
export function buildWorkerSource(
  userCode: string,
  options: { sessionId: string; maxLogLength: number; maxMessagesPerSecond?: number; terminateAtMessagesPerSecond?: number },
): { source: string; lineOffset: number } {
  const runtime = araiWorkerRuntime.toString();
  const prefix = ['"use strict";', '(function () {'];
  // The runtime (multi-line) and the options are on the third line; its line count does not depend on the numbers.
  const runtimeLines = runtime.split('\n').length;
  const lineOffset = prefix.length + runtimeLines + 1; // + the USER_CODE_OPEN line
  const init = `const rt = (${runtime})(self, ${JSON.stringify({ ...options, lineOffset })});`;
  const source = `${prefix.join('\n')}\n${init}\n${USER_CODE_OPEN}\n${userCode}\n});\n})();\n`;
  return { source, lineOffset };
}
