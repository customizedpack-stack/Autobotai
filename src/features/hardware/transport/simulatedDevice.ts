import { DeviceCore, type CoreDistStatus, type ResetReason } from '../device/deviceCore';
import { HOST_MAX_LINE } from '../protocol/protocol';
import { TransportError, type HardwareTransport, type TransportHandlers } from './types';

/**
 * SIMULATED DEVICE — no hardware involved.
 *
 * Runs the firmware's protocol and safety logic (DeviceCore, a port of the
 * firmware core checked against the same vectors) inside this page, with a
 * scripted distance value. It exists for tests, demos and learning the workflow.
 * Results obtained with it are never physical hardware results, and the UI labels
 * it "Simulated device (no hardware)" everywhere.
 *
 * The device keeps running between connections (like a real board on a USB cable),
 * so latched faults and the emergency stop survive a reconnect.
 */

export class SimulatedExplorerDevice {
  private core: DeviceCore;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listener: ((line: string) => void) | null = null;
  private linkDown = false;
  /** Simulates a board without the AutoBotAI firmware: it never answers. */
  private silent = false;
  private startedAt = performance.now();
  private distanceMm: number | null = 420;
  private distanceStatus: CoreDistStatus = 'ok';
  private wobble = true;
  /** Device-side record of what the host sent (tests inspect it; bounded). */
  readonly received: string[] = [];

  constructor() {
    this.core = new DeviceCore((line) => this.emit(line));
    this.boot('poweron');
  }

  private now(): number {
    return Math.floor(performance.now() - this.startedAt);
  }

  private emit(line: string): void {
    if (this.linkDown || this.silent || !this.listener) return;
    const deliver = this.listener;
    setTimeout(() => deliver(line), 2);
  }

  /** Power-on or reset (for example a watchdog reset). Motors are disabled after any boot. */
  boot(reason: ResetReason): void {
    this.startedAt = performance.now();
    this.core = new DeviceCore((line) => this.emit(line));
    this.core.begin(0, reason, (Math.random() * 0xffffffff) >>> 0);
    if (!this.timer) this.timer = setInterval(() => this.step(), 10);
  }

  private step(): void {
    const now = this.now();
    if (this.distanceMm !== null && this.distanceStatus === 'ok') {
      const mm = this.wobble ? Math.round(this.distanceMm + 3 * Math.sin(now / 300)) : this.distanceMm;
      this.core.setDistance(mm, 'ok', now);
    } else this.core.setDistance(0, this.distanceStatus, now);
    this.core.tick(now);
  }

  attach(listener: (line: string) => void): void {
    this.listener = listener;
    this.linkDown = false;
  }

  detach(): void {
    this.listener = null;
  }

  receive(line: string): void {
    if (this.linkDown || this.silent) return;
    this.received.push(line);
    if (this.received.length > 500) this.received.shift();
    this.core.onLine(line, this.now());
  }

  // ── Test and demo controls (fault injection) ──
  /** Silently break the link in both directions (like a cable pulled mid-message, without a close event). */
  cutLink(): void {
    this.linkDown = true;
  }
  restoreLink(): void {
    this.linkDown = false;
  }
  /** A board that does not run the AutoBotAI firmware (no answers at all). */
  setSilent(silent: boolean): void {
    this.silent = silent;
  }
  setDistance(mm: number | null, status: CoreDistStatus = mm === null ? 'range' : 'ok', wobble = true): void {
    this.distanceMm = mm;
    this.distanceStatus = status;
    this.wobble = wobble;
  }
  pressStopButton(): void {
    this.core.localEStop();
  }
  injectGarbage(line: string): void {
    this.emit(line);
  }
  get state() {
    return this.core.state;
  }
  get outputs() {
    return this.core.outputs;
  }
  get config() {
    return this.core.config;
  }
}

let shared: SimulatedExplorerDevice | null = null;

/** The one simulated device of this page (created on first use). */
export function simulatedDevice(): SimulatedExplorerDevice {
  if (!shared) {
    shared = new SimulatedExplorerDevice();
    // Exposed for the browser tests (fault injection). Clearly a simulation hook; it has no hardware access.
    (window as unknown as { __araiSimulatedDevice?: SimulatedExplorerDevice }).__araiSimulatedDevice = shared;
  }
  return shared;
}

export class SimulatedTransport implements HardwareTransport {
  readonly kind = 'simulated' as const;
  readonly label = 'Simulated device (no hardware)';
  private handlers: TransportHandlers | null = null;
  private open_ = false;

  private readonly device: SimulatedExplorerDevice;

  constructor(device: SimulatedExplorerDevice = simulatedDevice()) {
    this.device = device;
  }

  open(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    this.open_ = true;
    this.device.restoreLink();
    this.device.attach((line) => {
      if (this.open_) this.handlers?.onLine(line);
    });
    return Promise.resolve();
  }

  write(line: string): Promise<void> {
    if (!this.open_) return Promise.reject(new TransportError('closed', 'Not connected.'));
    if (line.length > HOST_MAX_LINE || /[\r\n]/.test(line)) return Promise.reject(new TransportError('write-failed', 'Invalid command line.'));
    this.device.receive(line);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.open_ = false;
    this.device.detach();
    return Promise.resolve();
  }
}
