import type { HostMessage } from './messageProtocol';

/**
 * A running sandbox (the isolated place where one program executes).
 * The real implementation is an opaque-origin iframe with a Web Worker
 * (sandboxHost.ts); unit tests inject a fake with the same shape.
 */
export interface SandboxHandle {
  /** Send a message to the program's worker. */
  send: (message: HostMessage) => void;
  /** Kill the worker immediately (works even during an endless loop) and remove the sandbox. */
  destroy: () => void;
}

export interface SandboxCallbacks {
  /** A raw message from the worker. It is NOT trusted: the manager validates it. */
  onWorkerMessage: (raw: unknown) => void;
  /** The worker crashed with an error that the program runtime could not report. */
  onWorkerError: (message: string, line?: number) => void;
  /** The sandbox could not be created (for example blocked by the hosting page). */
  onStartFailed: (message: string) => void;
}

export interface SandboxStartOptions extends SandboxCallbacks {
  sessionId: string;
  /** Complete worker script: the restricted runtime followed by the user's program. */
  workerSource: string;
}

export type SandboxFactory = (options: SandboxStartOptions) => SandboxHandle;
