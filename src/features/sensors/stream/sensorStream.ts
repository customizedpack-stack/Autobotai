import type { SensorReading } from '../core/sensorTypes';
import { RingBuffer } from './ringBuffer';

/**
 * C3 Sensor Stream: latest reading and a bounded history per sensor, with
 * subscriptions. The sensor manager is the ONLY publisher; workspace panels,
 * Blockly and JavaScript programs (through the sandbox bridge) are subscribers.
 *
 * Lifecycle events (started, stopped, enabled, disabled, error, reset) go on the
 * Connector Bus ('sensor.event', 'sensor.stream'). Readings do NOT go on the bus:
 * at up to 60 Hz per sensor they would flood it and the Bus Events panel.
 */

export const HISTORY_SIZE = 120;

type Listener = (reading: SensorReading) => void;

export class SensorStream {
  private readonly latestById = new Map<string, SensorReading>();
  private readonly historyById = new Map<string, RingBuffer<SensorReading>>();
  private readonly listeners = new Map<string, Set<Listener>>();

  /** Store and deliver one reading. A failing listener never stops the others. */
  publish(reading: SensorReading): void {
    this.latestById.set(reading.sensorId, reading);
    let history = this.historyById.get(reading.sensorId);
    if (!history) {
      history = new RingBuffer(HISTORY_SIZE);
      this.historyById.set(reading.sensorId, history);
    }
    history.push(reading);
    for (const key of [reading.sensorId, '*']) {
      const set = this.listeners.get(key);
      if (!set) continue;
      for (const listener of [...set]) {
        try {
          listener(reading);
        } catch (error) {
          console.error('Sensor stream listener failed:', error);
        }
      }
    }
  }

  /** Listen to one sensor, or to all with '*'. Returns the unsubscribe function (safe to call twice). */
  subscribe(sensorId: string, listener: Listener): () => void {
    let set = this.listeners.get(sensorId);
    if (!set) {
      set = new Set();
      this.listeners.set(sensorId, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(sensorId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(sensorId);
    };
  }

  latest(sensorId: string): SensorReading | undefined {
    return this.latestById.get(sensorId);
  }

  history(sensorId: string): SensorReading[] {
    return this.historyById.get(sensorId)?.toArray() ?? [];
  }

  /** Number of active listeners (tests and leak checks). */
  get listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  /** Forget readings (one sensor, or all). Subscriptions stay. */
  clear(sensorId?: string): void {
    if (sensorId) {
      this.latestById.delete(sensorId);
      this.historyById.delete(sensorId);
    } else {
      this.latestById.clear();
      this.historyById.clear();
    }
  }
}

export const sensorStream = new SensorStream();
