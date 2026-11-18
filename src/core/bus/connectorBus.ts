import type { BusChannel, BusChannels } from './channels';

export type BusHandler<C extends BusChannel> = (payload: BusChannels[C]) => void;

export interface BusEnvelope {
  channel: BusChannel;
  payload: unknown;
  timestamp: number;
}

type AnyHandler = (payload: unknown) => void;
type TapHandler = (envelope: BusEnvelope) => void;

/**
 * Minimal typed publish/subscribe bus with no external dependencies.
 * A handler that throws is isolated so one faulty module cannot break others.
 */
export class ConnectorBus {
  private handlers = new Map<BusChannel, Set<AnyHandler>>();
  private taps = new Set<TapHandler>();

  subscribe<C extends BusChannel>(channel: C, handler: BusHandler<C>): () => void {
    const set = this.handlers.get(channel) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(channel, set);
    return () => {
      set.delete(handler as AnyHandler);
    };
  }

  /** Observe every message on every channel (used by the Events log). */
  tap(handler: TapHandler): () => void {
    this.taps.add(handler);
    return () => {
      this.taps.delete(handler);
    };
  }

  publish<C extends BusChannel>(channel: C, payload: BusChannels[C]): void {
    const envelope: BusEnvelope = { channel, payload, timestamp: Date.now() };
    for (const tap of this.taps) this.safeCall(() => tap(envelope));
    const set = this.handlers.get(channel);
    if (!set) return;
    for (const handler of set) this.safeCall(() => handler(payload));
  }

  clear(): void {
    this.handlers.clear();
    this.taps.clear();
  }

  private safeCall(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      console.error('[ConnectorBus] handler failed', error);
    }
  }
}

/** Application-wide bus instance. */
export const bus = new ConnectorBus();
