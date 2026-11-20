/**
 * TypeScript port of the firmware safety and protocol core
 * (firmware/esp32-explorer-bot/lib/robot_core/robot_core.cpp).
 *
 * It powers the SIMULATED DEVICE used for browser integration tests and demos.
 * It is NOT physical hardware. Both implementations are checked against the same
 * conformance vectors (firmware/esp32-explorer-bot/test/vectors/protocol-v1.txt),
 * so a change in one that is not made in the other fails the tests.
 */

export type CoreState = 'idle' | 'connected' | 'armed' | 'fault' | 'estop';
export type CoreDistStatus = 'none' | 'ok' | 'range' | 'err';
export type ResetReason = 'poweron' | 'watchdog' | 'other';

export const FIRMWARE_VERSION = '0.1.0';
const PROTOCOL_VERSION = 1;
const DEVICE_NAME = 'explorer-bot-esp32';
const BOARD_NAME = 'esp32-devkitc-v4';
const MAX_LINE = 120;
const MAX_PERMILLE = 1000;
const MAX_DRIVE_MS = 500;
const HEARTBEAT_TIMEOUT_MS = 1000;

export interface CoreConfig {
  maxPermille: number;
  accelPermillePerS: number;
  invertLeft: boolean;
  invertRight: boolean;
  telemetryHz: number;
}

export interface CoreOutputs {
  enabled: boolean;
  left: number;
  right: number;
}

const since = (now: number, then: number) => ((now - then) | 0);
const u32 = (n: number) => n >>> 0;
const intRe = /^-?\d+$/;

export class DeviceCore {
  private st: CoreState = 'idle';
  private cfg: CoreConfig = { maxPermille: 300, accelPermillePerS: 1500, invertLeft: false, invertRight: false, telemetryHz: 10 };
  private out: CoreOutputs = { enabled: false, left: 0, right: 0 };
  private targetLeft = 0;
  private targetRight = 0;
  private curLeft = 0;
  private curRight = 0;
  private leaseUntil = 0;
  private leaseActive = false;
  private lastRx = 0;
  private lastTick = 0;
  private lastTelemetry = 0;
  private session = 0;
  private seed = 0;
  private program = '';
  private faultCode = '';
  private distMm = -1;
  private distStatus: CoreDistStatus = 'none';
  private distAt = 0;

  private readonly write: (line: string) => void;

  constructor(write: (line: string) => void) {
    this.write = write;
  }

  get state(): CoreState {
    return this.st;
  }
  get outputs(): CoreOutputs {
    return { ...this.out };
  }
  get config(): CoreConfig {
    return { ...this.cfg };
  }

  private err(code: string, seq = -1): void {
    this.write(seq >= 0 ? `ERR seq=${seq} code=${code}` : `ERR code=${code}`);
  }
  private stopNow(): void {
    this.targetLeft = this.targetRight = 0;
    this.curLeft = this.curRight = 0;
    this.out.left = this.out.right = 0;
    this.leaseActive = false;
  }
  private disableNow(): void {
    this.stopNow();
    this.out.enabled = false;
  }
  private enterFault(code: string): void {
    this.disableNow();
    this.st = 'fault';
    this.faultCode = code.slice(0, 31);
    this.write(`FAULT code=${this.faultCode}`);
  }
  private parseInt(s: string | undefined, lo: number, hi: number): number | null {
    if (s === undefined || !intRe.test(s) || s.replace('-', '').length > 10) return null;
    const v = Number(s);
    return v < lo || v > hi ? null : v;
  }
  private clamp(v: number): number {
    const m = this.cfg.maxPermille;
    return v > m ? m : v < -m ? -m : v;
  }
  private sessionHex(): string {
    return u32(this.session).toString(16).padStart(8, '0');
  }

  begin(now: number, reason: ResetReason, seed: number): void {
    this.disableNow();
    this.st = 'idle';
    this.session = 0;
    this.seed = u32(seed) || 0x9e3779b9;
    this.program = '';
    this.faultCode = '';
    this.lastRx = this.lastTick = this.lastTelemetry = u32(now);
    this.write(`BOOT fw=${FIRMWARE_VERSION} proto=${PROTOCOL_VERSION} reset=${reason}`);
    if (reason === 'watchdog') this.enterFault('watchdog_reset');
  }

  localEStop(): void {
    if (this.st === 'estop') return;
    this.disableNow();
    this.st = 'estop';
    this.write('ESTOP_ACTIVE source=button');
  }

  setDistance(mm: number, status: CoreDistStatus, now: number): void {
    this.distMm = status === 'ok' ? mm : -1;
    this.distStatus = status;
    this.distAt = u32(now);
  }

  onLine(raw: string, nowIn: number): void {
    const now = u32(nowIn);
    if (raw.length === 0) return;
    if (raw.length > MAX_LINE) return this.err('too_long');
    if (!/^[\x20-\x7e]+$/.test(raw)) return this.err('bad_chars');
    const t = raw.split(' ').filter(Boolean);
    if (t.length === 0) return this.err('bad_format');
    if (t.length > 8) return this.err('bad_format');
    const n = t.length;
    const cmd = t[0]!;

    if (cmd === 'HELLO') {
      const proto = n === 2 ? this.parseInt(t[1], 0, 1000) : null;
      if (proto === null) return this.err('bad_format');
      if (proto !== PROTOCOL_VERSION) return this.err('proto_unsupported');
      this.lastRx = now;
      if (this.st === 'armed') {
        this.disableNow();
        this.st = 'connected';
      }
      if (this.st === 'idle') this.st = 'connected';
      let s = this.seed;
      s = u32(s ^ (s << 13));
      s = u32(s ^ (s >>> 17));
      s = u32(s ^ (s << 5));
      this.seed = s;
      this.session = s || 1;
      this.write(
        `HELLO_OK proto=${PROTOCOL_VERSION} fw=${FIRMWARE_VERSION} device=${DEVICE_NAME} board=${BOARD_NAME} session=${this.sessionHex()} state=${this.st} caps=drive,distance enc=0 maxdrivems=${MAX_DRIVE_MS} hbms=${HEARTBEAT_TIMEOUT_MS} fault=${this.faultCode || '-'}`,
      );
      return;
    }
    if (cmd === 'ESTOP') {
      if (n !== 1) return this.err('bad_format');
      this.lastRx = now;
      this.disableNow();
      this.st = 'estop';
      this.write('ESTOP_ACTIVE');
      return;
    }
    if (this.session === 0) return this.err('no_session');
    switch (cmd) {
      case 'PING': {
        const seq = n === 2 ? this.parseInt(t[1], 0, 999999999) : null;
        if (seq === null) return this.err('bad_format');
        this.lastRx = now;
        this.write(`PONG ${seq}`);
        return;
      }
      case 'STATUS':
        this.lastRx = now;
        this.write(`STATUS st=${this.st} en=${this.out.enabled ? 1 : 0} fault=${this.faultCode || '-'} prog=${this.program || '-'} max=${this.cfg.maxPermille}`);
        return;
      case 'STOP':
        if (n !== 1) return this.err('bad_format');
        this.lastRx = now;
        this.stopNow();
        this.write('STOPPED');
        return;
      case 'DISARM':
        if (n !== 1) return this.err('bad_format');
        this.lastRx = now;
        if (this.st !== 'armed') return this.err('not_armed');
        this.disableNow();
        this.st = 'connected';
        this.write('DISARMED');
        return;
      case 'DRIVE': {
        const seq = n === 5 ? this.parseInt(t[1], 0, 999999999) : null;
        if (seq === null) return this.err('bad_format');
        this.lastRx = now;
        if (this.st !== 'armed') return this.err('not_armed', seq);
        const l = this.parseInt(t[2], -MAX_PERMILLE, MAX_PERMILLE);
        const r = this.parseInt(t[3], -MAX_PERMILLE, MAX_PERMILLE);
        const ms = this.parseInt(t[4], 1, MAX_DRIVE_MS);
        if (l === null || r === null || ms === null) return this.err('range', seq);
        this.targetLeft = this.clamp(l);
        this.targetRight = this.clamp(r);
        this.leaseUntil = u32(now + ms);
        this.leaseActive = true;
        this.write(`ACK ${seq}`);
        return;
      }
      case 'ARM':
        if (n !== 2) return this.err('bad_format');
        this.lastRx = now;
        if (this.st === 'estop') return this.err('estop_active');
        if (this.st === 'fault') return this.err('fault_active');
        if (this.st === 'armed') return this.err('already_armed');
        if (t[1] !== this.sessionHex()) return this.err('bad_session');
        this.stopNow();
        this.out.enabled = true;
        this.st = 'armed';
        this.write('ARMED');
        return;
      case 'RESET_ESTOP':
        if (n !== 1) return this.err('bad_format');
        this.lastRx = now;
        if (this.st !== 'estop') return this.err('not_in_estop');
        this.st = 'connected';
        this.write('ESTOP_CLEARED');
        return;
      case 'CLEAR_FAULT':
        if (n !== 1) return this.err('bad_format');
        this.lastRx = now;
        if (this.st !== 'fault') return this.err('no_fault');
        this.faultCode = '';
        this.st = 'connected';
        this.write('FAULT_CLEARED');
        return;
      case 'CONFIG': {
        this.lastRx = now;
        if (this.st === 'armed') return this.err('not_allowed_while_armed');
        if (n < 2) return this.err('bad_config');
        const next = { ...this.cfg };
        for (const token of t.slice(1)) {
          const eq = token.indexOf('=');
          if (eq < 0) return this.err('bad_config');
          const key = token.slice(0, eq);
          const val = token.slice(eq + 1);
          let v: number | null;
          if (key === 'max' && (v = this.parseInt(val, 0, MAX_PERMILLE)) !== null) next.maxPermille = v;
          else if (key === 'accel' && (v = this.parseInt(val, 100, 10000)) !== null) next.accelPermillePerS = v;
          else if (key === 'invl' && (v = this.parseInt(val, 0, 1)) !== null) next.invertLeft = v === 1;
          else if (key === 'invr' && (v = this.parseInt(val, 0, 1)) !== null) next.invertRight = v === 1;
          else if (key === 'hz' && (v = this.parseInt(val, 1, 20)) !== null) next.telemetryHz = v;
          else return this.err('bad_config');
        }
        this.cfg = next;
        this.write(`CONFIG_OK max=${next.maxPermille} accel=${next.accelPermillePerS} invl=${next.invertLeft ? 1 : 0} invr=${next.invertRight ? 1 : 0} hz=${next.telemetryHz}`);
        return;
      }
      case 'PROGRAM':
        if (n !== 2) return this.err('bad_format');
        this.lastRx = now;
        if (this.st === 'armed') return this.err('not_allowed_while_armed');
        if (t[1] === 'clear') {
          this.program = '';
          this.write('PROGRAM_OK hash=-');
          return;
        }
        if (!/^[0-9a-f]{8}$/.test(t[1]!)) return this.err('bad_format');
        this.program = t[1]!;
        this.write(`PROGRAM_OK hash=${this.program}`);
        return;
      default:
        this.err('unknown_command');
    }
  }

  tick(nowIn: number): void {
    const now = u32(nowIn);
    let dt = since(now, this.lastTick);
    if (dt < 0) dt = 0;
    this.lastTick = now;

    if ((this.st === 'armed' || this.st === 'connected') && since(now, this.lastRx) > HEARTBEAT_TIMEOUT_MS) {
      if (this.st === 'armed') this.enterFault('heartbeat_timeout');
      else {
        this.st = 'idle';
        this.session = 0;
        this.write('LINK_LOST');
      }
    }
    if (this.st === 'armed' && this.leaseActive && since(now, this.leaseUntil) >= 0) {
      this.stopNow();
      this.write('LEASE_EXPIRED');
    }
    if (this.st === 'armed') {
      let step = Math.trunc((this.cfg.accelPermillePerS * dt) / 1000);
      if (step < 1 && dt > 0) step = 1;
      const approach = (cur: number, target: number) => (cur < target ? Math.min(cur + step, target) : cur > target ? Math.max(cur - step, target) : cur);
      this.curLeft = approach(this.curLeft, this.targetLeft);
      this.curRight = approach(this.curRight, this.targetRight);
      this.out.left = this.cfg.invertLeft ? -this.curLeft : this.curLeft;
      this.out.right = this.cfg.invertRight ? -this.curRight : this.curRight;
    } else {
      this.curLeft = this.curRight = 0;
      this.out = { enabled: false, left: 0, right: 0 };
    }
    const period = Math.trunc(1000 / (this.cfg.telemetryHz > 0 ? this.cfg.telemetryHz : 1));
    if (this.st !== 'idle' && since(now, this.lastTelemetry) >= period) {
      this.lastTelemetry = now;
      let ds = this.distStatus;
      if (ds === 'ok' && since(now, this.distAt) > 500) ds = 'err';
      this.write(
        `TEL t=${now} st=${this.st} en=${this.out.enabled ? 1 : 0} l=${this.out.left} r=${this.out.right} tl=${this.targetLeft} tr=${this.targetRight} d=${ds === 'ok' ? this.distMm : -1} ds=${ds} prog=${this.program || '-'}`,
      );
    }
  }
}
