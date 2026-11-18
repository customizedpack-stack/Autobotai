import { create } from 'zustand';
import { bus, type BusEnvelope } from '../core/bus/connectorBus';
import type { LogEntry, LogInput, LogLevel } from '../types/console';

const MAX_ENTRIES = 500;
const MAX_EVENTS = 300;

export const ALL_LEVELS: readonly LogLevel[] = ['info', 'success', 'warning', 'error', 'debug'];

interface ConsoleState {
  entries: LogEntry[];
  events: BusEnvelope[];
  levelFilter: Record<LogLevel, boolean>;
  add: (input: LogInput) => void;
  addEvent: (event: BusEnvelope) => void;
  clear: () => void;
  clearEvents: () => void;
  toggleLevel: (level: LogLevel) => void;
}

let nextId = 1;

export const useConsoleStore = create<ConsoleState>((set) => ({
  entries: [],
  events: [],
  levelFilter: { info: true, success: true, warning: true, error: true, debug: false },
  add: (input) =>
    set((state) => ({
      entries: [...state.entries, { ...input, id: nextId++, timestamp: Date.now() }].slice(-MAX_ENTRIES),
    })),
  addEvent: (event) => set((state) => ({ events: [...state.events, event].slice(-MAX_EVENTS) })),
  clear: () => set({ entries: [] }),
  clearEvents: () => set({ events: [] }),
  toggleLevel: (level) =>
    set((state) => ({ levelFilter: { ...state.levelFilter, [level]: !state.levelFilter[level] } })),
}));

let connected = false;

/** Wire the console to the Connector Bus. Safe to call more than once. */
export function connectConsoleToBus(): void {
  if (connected) return;
  connected = true;
  bus.subscribe('console.log', (input) => useConsoleStore.getState().add(input));
  bus.tap((envelope) => {
    if (envelope.channel !== 'console.log') useConsoleStore.getState().addEvent(envelope);
  });
}
