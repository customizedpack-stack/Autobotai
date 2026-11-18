import vm from 'node:vm';
import { setScheduler } from '../controls/movementEngine';
import { connectConsoleToBus } from '../../stores/consoleStore';
import { connectCommandBus } from '../controls/commandBus';
import { connectExecutionManager } from './runtime/executionManager';
import { connectProgramStore } from './storage/programStore';
import type { SandboxFactory } from './runtime/sandboxTypes';

// The app wires these at start-up (bootstrap.ts); tests wire them here.
connectConsoleToBus();
connectCommandBus();
connectProgramStore();
connectExecutionManager();

/**
 * Test helpers for Code Studio.
 *
 * `inProcessSandbox` runs the REAL worker script (restricted runtime + user
 * program) in a separate Node VM context whose global object plays the role of
 * the worker scope. Messages are structured-cloned in both directions, as in
 * a browser. Destroying it drops all further messages and timers, like
 * terminating a worker. (Endless loops are tested in the browser suite, where
 * a real worker can be killed.)
 */
export function inProcessSandbox(): (lineOffset: number) => SandboxFactory {
  return () =>
    ({ workerSource, onWorkerMessage, onWorkerError }) => {
      let dead = false;
      const listeners = new Map<string, Set<(event: unknown) => void>>();
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const later = (fn: () => void, ms = 0) => {
        const handle = setTimeout(() => {
          timers.delete(handle);
          if (!dead) fn();
        }, ms);
        timers.add(handle);
        return handle;
      };
      const scope: Record<string, unknown> = {
        postMessage: (message: unknown) => {
          const copy = structuredClone(message);
          later(() => onWorkerMessage(copy));
        },
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(listener);
        },
        setTimeout: (fn: () => void, ms?: number) => later(fn, ms) as unknown as number,
        clearTimeout: (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
        fetch: () => Promise.resolve('network!'),
        indexedDB: {},
        importScripts: () => undefined,
      };
      scope.self = scope;
      const context = vm.createContext(scope);
      const dispatch = (type: string, event: Record<string, unknown>) => {
        for (const listener of listeners.get(type) ?? []) listener({ preventDefault: () => undefined, ...event });
      };
      // Unhandled rejections inside the VM surface on the host process; forward them like a worker would.
      later(() => {
        try {
          vm.runInContext(workerSource, context);
        } catch (error) {
          onWorkerError(String(error instanceof Error ? error.message : error));
        }
      });
      return {
        send: (message) => {
          const copy = structuredClone(message);
          later(() => dispatch('message', { data: copy }));
        },
        destroy: () => {
          dead = true;
          for (const handle of timers) clearTimeout(handle);
          timers.clear();
        },
      };
    };
}

/** A real-time engine clock for integration tests (~60 Hz using timers). */
export function useTimerScheduler(): void {
  setScheduler({
    request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  });
}

export const until = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};
