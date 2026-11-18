/**
 * Execution states of a Code Studio program run.
 *
 *   idle → preparing → running ⇄ paused → stopping → idle      (Stop)
 *                         └──────────────→ completed | error   (finished / failed / timed out)
 */
export type ExecutionState = 'idle' | 'preparing' | 'running' | 'paused' | 'stopping' | 'completed' | 'error';

/** Why a run ended. */
export type ExecutionOutcome = 'completed' | 'stopped' | 'error' | 'timeout';

export interface ExecutionError {
  message: string;
  /** 1-based line in the user's program, when known. */
  line?: number;
  kind: 'syntax' | 'runtime' | 'command' | 'timeout' | 'sandbox' | 'security' | 'validation';
}

export const EXECUTION_STATE_LABEL: Record<ExecutionState, string> = {
  idle: 'Idle',
  preparing: 'Preparing',
  running: 'Running',
  paused: 'Paused',
  stopping: 'Stopping',
  completed: 'Completed',
  error: 'Error',
};
