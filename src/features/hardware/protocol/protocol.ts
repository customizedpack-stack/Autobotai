/**
 * AutoBotAI Explorer Bot serial protocol v1 (browser side).
 *
 * The device side is firmware/esp32-explorer-bot/lib/robot_core. Lines are ASCII,
 * terminated by "\n". The browser can only send the commands encoded here (an
 * allowlist that matches the firmware); every device line is validated before use.
 */

export const PROTOCOL_VERSION = 1;
export const HOST_MAX_LINE = 120;
export const DEVICE_MAX_LINE = 240;
export const MAX_PERMILLE = 1000;
export const MAX_DRIVE_MS = 500;

export type DeviceState = 'idle' | 'connected' | 'armed' | 'fault' | 'estop';
export type DistanceStatus = 'ok' | 'range' | 'err' | 'none';

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

const int = (v: number, lo: number, hi: number, what: string): number => {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new ProtocolError(`${what} must be an integer from ${lo} to ${hi}.`);
  return v;
};

/** Host → device commands. Nothing else can be sent. */
export const encode = {
  hello: () => `HELLO ${PROTOCOL_VERSION}`,
  ping: (seq: number) => `PING ${int(seq, 0, 999_999_999, 'seq')}`,
  status: () => 'STATUS',
  arm: (session: string) => {
    if (!/^[0-9a-f]{8}$/.test(session)) throw new ProtocolError('Invalid session id.');
    return `ARM ${session}`;
  },
  disarm: () => 'DISARM',
  drive: (seq: number, left: number, right: number, ms: number) =>
    `DRIVE ${int(seq, 0, 999_999_999, 'seq')} ${int(left, -MAX_PERMILLE, MAX_PERMILLE, 'left')} ${int(right, -MAX_PERMILLE, MAX_PERMILLE, 'right')} ${int(ms, 1, MAX_DRIVE_MS, 'duration')}`,
  stop: () => 'STOP',
  estop: () => 'ESTOP',
  resetEstop: () => 'RESET_ESTOP',
  clearFault: () => 'CLEAR_FAULT',
  config: (c: { max: number; accel: number; invl: boolean; invr: boolean; hz: number }) =>
    `CONFIG max=${int(c.max, 0, MAX_PERMILLE, 'max')} accel=${int(c.accel, 100, 10000, 'accel')} invl=${c.invl ? 1 : 0} invr=${c.invr ? 1 : 0} hz=${int(c.hz, 1, 20, 'hz')}`,
  program: (hash: string | null) => {
    if (hash !== null && !/^[0-9a-f]{8}$/.test(hash)) throw new ProtocolError('Invalid program hash.');
    return `PROGRAM ${hash ?? 'clear'}`;
  },
};

export type DeviceMessage =
  | { kind: 'boot'; fw: string; proto: number; reset: 'poweron' | 'watchdog' | 'other' }
  | { kind: 'hello_ok'; proto: number; fw: string; device: string; board: string; session: string; state: DeviceState; caps: string[]; encoders: boolean; maxDriveMs: number; heartbeatMs: number; fault: string | null }
  | { kind: 'pong'; seq: number }
  | { kind: 'ack'; seq: number }
  | { kind: 'err'; seq: number | null; code: string }
  | { kind: 'tel'; t: number; state: DeviceState; enabled: boolean; left: number; right: number; targetLeft: number; targetRight: number; distanceMm: number | null; distanceStatus: DistanceStatus; program: string | null }
  | { kind: 'fault'; code: string }
  | { kind: 'estop_active'; source: 'host' | 'button' }
  | { kind: 'armed' | 'disarmed' | 'stopped' | 'estop_cleared' | 'fault_cleared' | 'lease_expired' | 'link_lost' }
  | { kind: 'config_ok'; max: number; accel: number; invl: boolean; invr: boolean; hz: number }
  | { kind: 'program_ok'; hash: string | null }
  | { kind: 'status'; state: DeviceState; enabled: boolean; fault: string | null; program: string | null; max: number }
  | { kind: 'sensor'; id: string; code: string };

export type ParseResult = { ok: true; message: DeviceMessage } | { ok: false; reason: string };

const STATES = new Set<DeviceState>(['idle', 'connected', 'armed', 'fault', 'estop']);
const DIST = new Set<DistanceStatus>(['ok', 'range', 'err', 'none']);
const CODE = /^[a-z][a-z0-9_]{0,31}$/;
const NAME = /^[a-z0-9][a-z0-9._-]{0,39}$/;

class Fields {
  private readonly map: Map<string, string>;
  constructor(map: Map<string, string>) {
    this.map = map;
  }
  str(key: string, re: RegExp): string {
    const v = this.map.get(key);
    if (v === undefined || !re.test(v)) throw new ProtocolError(`bad ${key}`);
    return v;
  }
  num(key: string, lo: number, hi: number): number {
    const v = this.map.get(key);
    if (v === undefined || !/^-?\d{1,10}$/.test(v)) throw new ProtocolError(`bad ${key}`);
    const n = Number(v);
    if (n < lo || n > hi) throw new ProtocolError(`${key} out of range`);
    return n;
  }
  bit(key: string): boolean {
    return this.num(key, 0, 1) === 1;
  }
  state(key: string): DeviceState {
    const v = this.map.get(key) as DeviceState;
    if (!STATES.has(v)) throw new ProtocolError(`bad ${key}`);
    return v;
  }
  dash(key: string, re: RegExp): string | null {
    const v = this.map.get(key);
    if (v === '-') return null;
    return this.str(key, re);
  }
}

function fields(tokens: string[], allowed: string[]): Fields {
  const map = new Map<string, string>();
  for (const t of tokens) {
    const eq = t.indexOf('=');
    if (eq <= 0) throw new ProtocolError(`unexpected token "${t.slice(0, 20)}"`);
    const key = t.slice(0, eq);
    if (!allowed.includes(key)) throw new ProtocolError(`unknown field "${key.slice(0, 20)}"`);
    if (map.has(key)) throw new ProtocolError(`duplicate field "${key}"`);
    map.set(key, t.slice(eq + 1));
  }
  return new Fields(map);
}

const seqOf = (t: string | undefined): number => {
  if (t === undefined || !/^\d{1,9}$/.test(t)) throw new ProtocolError('bad seq');
  return Number(t);
};

/** Parse and validate one device line. Anything unexpected is rejected, never guessed. */
export function parseDeviceLine(line: string): ParseResult {
  try {
    if (line.length === 0 || line.length > DEVICE_MAX_LINE) throw new ProtocolError('bad length');
    if (!/^[\x20-\x7e]+$/.test(line)) throw new ProtocolError('non-printable characters');
    const [head, ...rest] = line.split(' ').filter(Boolean);
    let message: DeviceMessage;
    switch (head) {
      case 'BOOT': {
        const f = fields(rest, ['fw', 'proto', 'reset']);
        const reset = f.str('reset', /^(poweron|watchdog|other)$/) as 'poweron' | 'watchdog' | 'other';
        message = { kind: 'boot', fw: f.str('fw', /^\d+\.\d+\.\d+$/), proto: f.num('proto', 0, 1000), reset };
        break;
      }
      case 'HELLO_OK': {
        const f = fields(rest, ['proto', 'fw', 'device', 'board', 'session', 'state', 'caps', 'enc', 'maxdrivems', 'hbms', 'fault']);
        message = {
          kind: 'hello_ok',
          proto: f.num('proto', 0, 1000),
          fw: f.str('fw', /^\d+\.\d+\.\d+$/),
          device: f.str('device', NAME),
          board: f.str('board', NAME),
          session: f.str('session', /^[0-9a-f]{8}$/),
          state: f.state('state'),
          caps: f.str('caps', /^[a-z]+(,[a-z]+){0,7}$/).split(','),
          encoders: f.bit('enc'),
          maxDriveMs: f.num('maxdrivems', 1, 10000),
          heartbeatMs: f.num('hbms', 100, 60000),
          fault: f.dash('fault', CODE),
        };
        break;
      }
      case 'PONG':
        if (rest.length !== 1) throw new ProtocolError('bad PONG');
        message = { kind: 'pong', seq: seqOf(rest[0]) };
        break;
      case 'ACK':
        if (rest.length !== 1) throw new ProtocolError('bad ACK');
        message = { kind: 'ack', seq: seqOf(rest[0]) };
        break;
      case 'ERR': {
        const f = fields(rest, ['seq', 'code']);
        const hasSeq = rest.some((t) => t.startsWith('seq='));
        message = { kind: 'err', seq: hasSeq ? f.num('seq', 0, 999_999_999) : null, code: f.str('code', CODE) };
        break;
      }
      case 'TEL': {
        const f = fields(rest, ['t', 'st', 'en', 'l', 'r', 'tl', 'tr', 'd', 'ds', 'prog']);
        const d = f.num('d', -1, 10000);
        message = {
          kind: 'tel',
          t: f.num('t', 0, 4294967295),
          state: f.state('st'),
          enabled: f.bit('en'),
          left: f.num('l', -MAX_PERMILLE, MAX_PERMILLE),
          right: f.num('r', -MAX_PERMILLE, MAX_PERMILLE),
          targetLeft: f.num('tl', -MAX_PERMILLE, MAX_PERMILLE),
          targetRight: f.num('tr', -MAX_PERMILLE, MAX_PERMILLE),
          distanceMm: d < 0 ? null : d,
          distanceStatus: (() => {
            const v = f.str('ds', /^[a-z]+$/) as DistanceStatus;
            if (!DIST.has(v)) throw new ProtocolError('bad ds');
            return v;
          })(),
          program: f.dash('prog', /^[0-9a-f]{8}$/),
        };
        break;
      }
      case 'FAULT':
        message = { kind: 'fault', code: fields(rest, ['code']).str('code', CODE) };
        break;
      case 'ESTOP_ACTIVE': {
        const src = rest.length === 0 ? 'host' : fields(rest, ['source']).str('source', /^button$/);
        message = { kind: 'estop_active', source: src === 'button' ? 'button' : 'host' };
        break;
      }
      case 'ARMED':
      case 'DISARMED':
      case 'STOPPED':
      case 'ESTOP_CLEARED':
      case 'FAULT_CLEARED':
      case 'LEASE_EXPIRED':
      case 'LINK_LOST':
        if (rest.length) throw new ProtocolError(`unexpected data after ${head}`);
        message = { kind: head.toLowerCase() as 'armed' };
        break;
      case 'CONFIG_OK': {
        const f = fields(rest, ['max', 'accel', 'invl', 'invr', 'hz']);
        message = { kind: 'config_ok', max: f.num('max', 0, MAX_PERMILLE), accel: f.num('accel', 100, 10000), invl: f.bit('invl'), invr: f.bit('invr'), hz: f.num('hz', 1, 20) };
        break;
      }
      case 'PROGRAM_OK':
        message = { kind: 'program_ok', hash: fields(rest, ['hash']).dash('hash', /^[0-9a-f]{8}$/) };
        break;
      case 'STATUS': {
        const f = fields(rest, ['st', 'en', 'fault', 'prog', 'max']);
        message = { kind: 'status', state: f.state('st'), enabled: f.bit('en'), fault: f.dash('fault', CODE), program: f.dash('prog', /^[0-9a-f]{8}$/), max: f.num('max', 0, MAX_PERMILLE) };
        break;
      }
      case 'SENSOR': {
        const f = fields(rest, ['id', 'code']);
        message = { kind: 'sensor', id: f.str('id', NAME), code: f.str('code', CODE) };
        break;
      }
      default:
        throw new ProtocolError(`unknown message "${String(head).slice(0, 20)}"`);
    }
    return { ok: true, message };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Splits a byte/character stream into lines; drops (and reports) overlong lines. */
export class LineSplitter {
  private buffer = '';
  private overflow = false;
  private readonly onLine: (line: string) => void;
  private readonly onOverflow: () => void;
  private readonly max: number;
  constructor(onLine: (line: string) => void, onOverflow: () => void, max = DEVICE_MAX_LINE) {
    this.onLine = onLine;
    this.onOverflow = onOverflow;
    this.max = max;
  }
  push(chunk: string): void {
    for (const ch of chunk) {
      if (ch === '\r') continue;
      if (ch === '\n') {
        if (this.overflow) this.onOverflow();
        else if (this.buffer.length) this.onLine(this.buffer);
        this.buffer = '';
        this.overflow = false;
        continue;
      }
      if (this.buffer.length >= this.max) {
        this.overflow = true;
        continue;
      }
      this.buffer += ch;
    }
  }
}

/** Short stable hash (FNV-1a, 32 bit, hex) used to identify a prepared program on the device. Not a security measure. */
export function programHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
