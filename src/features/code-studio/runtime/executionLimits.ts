/**
 * Execution limits for Code Studio programs. They protect the app and the
 * robot from runaway programs. Tests may pass smaller values to the manager.
 */
export interface ExecutionLimits {
  /** Longest a program may RUN (paused time does not count), ms. */
  maxRunMs: number;
  /** Robot commands (drive, turn, stop, reset, joints, speed) per second. */
  maxCommandsPerSecond: number;
  /** Longest single wait(), ms. Matches the C2 maximum command duration. */
  maxWaitMs: number;
  /** Console messages per second; extra messages are dropped with one warning. */
  maxLogsPerSecond: number;
  /** Console messages per run. */
  maxLogsPerRun: number;
  /** Longest console message, characters. */
  maxLogLength: number;
  /** The sandbox must report ready within this time, ms. */
  startTimeoutMs: number;
  /** Malformed messages tolerated before the run is ended as a security error. */
  maxInvalidMessages: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  maxRunMs: 5 * 60_000,
  maxCommandsPerSecond: 30,
  maxWaitMs: 60_000,
  maxLogsPerSecond: 50,
  maxLogsPerRun: 1000,
  maxLogLength: 500,
  startTimeoutMs: 5000,
  maxInvalidMessages: 20,
};

/** Human-readable summary, shown in the UI and the docs. */
export function describeLimits(limits: ExecutionLimits = DEFAULT_LIMITS): string {
  const minutes = limits.maxRunMs / 60_000;
  return `Up to ${minutes} min of run time, ${limits.maxCommandsPerSecond} robot commands per second, ${limits.maxWaitMs / 1000} s per wait.`;
}
