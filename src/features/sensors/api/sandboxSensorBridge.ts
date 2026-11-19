import { log } from '../../../utils/logger';
import type { SensorReading } from '../core/sensorTypes';
import { currentProjectId, listSensors, odometryCopy, readSensorCopy, requireSensor, resetEncoderCounter, SensorApiError, sensorReadings } from './sensorApi';

/**
 * Sandbox side of the sensor API, one per program run (owned by the HostBridge).
 *
 * - Every request is checked: the run must still be the current one (the host drops
 *   messages from old sessions before they get here), the project must be the one the
 *   run started in, the sensor id and type must exist, and the limits hold.
 * - Subscriptions belong to this run only. Each delivers at most `maxHz` readings per
 *   second (the newest reading wins), nothing while the program is paused, and all of
 *   them end when the run ends (Stop, finish, error, worker terminated).
 * - Encoder resets CHANGE sensor state, so they have their own per-run limit
 *   (`maxEncoderResetsPerSecond`), separate from reads. A new run starts with fresh counters.
 */

export type SensorOp = 'sensor.list' | 'sensor.read' | 'sensor.subscribe' | 'sensor.unsubscribe' | 'sensor.resetEncoder' | 'sensor.odometry';

export interface SensorPush {
  v: 1;
  kind: 'sensor';
  subscriptionId: number;
  reading: SensorReading;
}

export interface SandboxSensorLimits {
  maxSensorReadsPerSecond: number;
  maxSensorSubscriptions: number;
  maxSensorHz: number;
  /** Optional for older callers; defaults to 10. */
  maxEncoderResetsPerSecond?: number;
}

interface Subscription {
  id: number;
  sensorId: string;
  intervalMs: number;
  lastSent: number;
  pending: SensorReading | null;
  timer: ReturnType<typeof setTimeout> | null;
  stop: () => void;
}

export class SandboxSensorBridge {
  private readonly sessionId: string;
  private readonly projectId: string | null;
  private readonly limits: SandboxSensorLimits;
  private readonly push: (message: SensorPush) => void;
  private readonly now: () => number;
  private readonly subscriptions = new Map<number, Subscription>();
  private readonly readTimes: number[] = [];
  private readonly resetTimes: number[] = [];
  private nextId = 1;
  private paused = false;
  private disposed = false;

  constructor(options: { sessionId: string; limits: SandboxSensorLimits; push: (message: SensorPush) => void; now?: () => number }) {
    this.sessionId = options.sessionId;
    this.limits = options.limits;
    this.push = options.push;
    this.now = options.now ?? (() => performance.now());
    this.projectId = currentProjectId();
  }

  get activeSubscriptions(): number {
    return this.subscriptions.size;
  }

  handle(op: SensorOp, args: Record<string, unknown>): Promise<unknown> {
    try {
      if (this.disposed) throw new SensorApiError('The program is no longer running.');
      if (currentProjectId() !== this.projectId) throw new SensorApiError('The robot project changed. Run the program again.');
      switch (op) {
        case 'sensor.list':
          this.countRead();
          return Promise.resolve(listSensors());
        case 'sensor.read':
          this.countRead();
          return Promise.resolve(readSensorCopy(args.sensorId as string, args.type as string));
        case 'sensor.odometry':
          this.countRead();
          return Promise.resolve(odometryCopy());
        case 'sensor.resetEncoder':
          this.countReset();
          return Promise.resolve(resetEncoderCounter(args.sensorId as string));
        case 'sensor.subscribe':
          return Promise.resolve(this.subscribe(args.sensorId as string, args.type as string, args.maxHz as number | undefined));
        case 'sensor.unsubscribe':
          return Promise.resolve(this.unsubscribe(args.subscriptionId as number));
      }
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new SensorApiError(String(error)));
    }
  }

  private countRead(): void {
    const now = this.now();
    while (this.readTimes.length > 0 && now - this.readTimes[0]! >= 1000) this.readTimes.shift();
    if (this.readTimes.length >= this.limits.maxSensorReadsPerSecond) {
      throw new SensorApiError(`Too many sensor reads: the limit is ${this.limits.maxSensorReadsPerSecond} per second. Add a wait, or use subscribe().`);
    }
    this.readTimes.push(now);
  }

  /** Encoder resets per second for this run (rejected requests change nothing). */
  private countReset(): void {
    const limit = this.limits.maxEncoderResetsPerSecond ?? 10;
    const now = this.now();
    while (this.resetTimes.length > 0 && now - this.resetTimes[0]! >= 1000) this.resetTimes.shift();
    if (this.resetTimes.length >= limit) {
      throw new SensorApiError(`Too many encoder resets: the limit is ${limit} per second. Reset once, then read the encoder.`);
    }
    this.resetTimes.push(now);
  }

  private subscribe(sensorId: string, type: string, maxHz?: number): { subscriptionId: number; sensorId: string; maxHz: number } {
    requireSensor(sensorId, type);
    if (this.subscriptions.size >= this.limits.maxSensorSubscriptions) {
      throw new SensorApiError(`Too many sensor subscriptions: the limit is ${this.limits.maxSensorSubscriptions} per program. Unsubscribe one first.`);
    }
    if (maxHz !== undefined && !(maxHz > 0)) throw new SensorApiError('maxHz must be above 0.');
    const hz = Math.min(maxHz ?? this.limits.maxSensorHz, this.limits.maxSensorHz);
    const id = this.nextId++;
    const sub: Subscription = { id, sensorId, intervalMs: 1000 / hz, lastSent: -Infinity, pending: null, timer: null, stop: () => undefined };
    sub.stop = sensorReadings.subscribe(sensorId, (reading) => this.onReading(sub, reading));
    this.subscriptions.set(id, sub);
    log.info('code', `Program subscribed to sensor "${sensorId}" (up to ${Number(hz.toFixed(1))} readings per second).`, { sessionId: this.sessionId });
    return { subscriptionId: id, sensorId, maxHz: hz };
  }

  private unsubscribe(id: number): { ok: boolean } {
    const sub = this.subscriptions.get(id);
    if (!sub) return { ok: false };
    this.end(sub);
    return { ok: true };
  }

  private end(sub: Subscription): void {
    sub.stop();
    if (sub.timer) clearTimeout(sub.timer);
    sub.timer = null;
    sub.pending = null;
    this.subscriptions.delete(sub.id);
  }

  private onReading(sub: Subscription, reading: SensorReading): void {
    if (this.disposed) return;
    if (currentProjectId() !== this.projectId) {
      this.end(sub);
      return;
    }
    sub.pending = reading;
    this.deliver(sub);
  }

  /** Send the newest pending reading if the interval allows; otherwise schedule it. Never while paused. */
  private deliver(sub: Subscription): void {
    if (this.paused || this.disposed || !sub.pending || sub.timer) return;
    const wait = sub.lastSent + sub.intervalMs - this.now();
    if (wait > 0) {
      sub.timer = setTimeout(() => {
        sub.timer = null;
        this.deliver(sub);
      }, wait);
      return;
    }
    const reading = sub.pending;
    sub.pending = null;
    sub.lastSent = this.now();
    this.push({ v: 1, kind: 'sensor', subscriptionId: sub.id, reading });
  }

  pause(): void {
    this.paused = true;
    for (const sub of this.subscriptions.values()) {
      if (sub.timer) clearTimeout(sub.timer);
      sub.timer = null;
    }
  }

  resume(): void {
    this.paused = false;
    for (const sub of this.subscriptions.values()) this.deliver(sub);
  }

  /** End every subscription (Stop, finish, error, worker terminated). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const sub of [...this.subscriptions.values()]) this.end(sub);
  }
}
