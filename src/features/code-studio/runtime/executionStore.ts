import { create } from 'zustand';
import type { ExecutionError, ExecutionOutcome, ExecutionState } from './executionTypes';

/** UI-facing execution status. Written only by the execution manager. Never saved. */
export interface ExecutionStatus {
  state: ExecutionState;
  sessionId: string | null;
  programId: string | null;
  programName: string | null;
  /** Running time of the current or last run (paused time excluded), ms. */
  elapsedMs: number;
  error: ExecutionError | null;
  lastOutcome: ExecutionOutcome | null;
  /** True while a pause request waits for the program to reach its next robot call or checkpoint. */
  pausePending: boolean;
}

export const IDLE_STATUS: ExecutionStatus = {
  state: 'idle',
  sessionId: null,
  programId: null,
  programName: null,
  elapsedMs: 0,
  error: null,
  lastOutcome: null,
  pausePending: false,
};

export const useExecutionStore = create<ExecutionStatus & { set: (patch: Partial<ExecutionStatus>) => void }>((set) => ({
  ...IDLE_STATUS,
  set: (patch) => set(patch),
}));

/** States in which a program session is alive. */
export function isActiveState(state: ExecutionState): boolean {
  return state === 'preparing' || state === 'running' || state === 'paused' || state === 'stopping';
}
