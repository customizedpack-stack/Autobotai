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
  /** Requests held while the program is paused; more are rejected (stop() is handled at once, never queued). */
  maxPausedRequests: number;
  /** Incoming worker messages (of any kind) per second per session; more are rejected. */
  maxMessagesPerSecond: number;
  /** Incoming worker messages per second at which the session is ended as abusive. */
  terminateAtMessagesPerSecond: number;
  /** Phase 6: sensor reads (read, list, odometry) per second, counted apart from robot commands. */
  maxSensorReadsPerSecond: number;
  /** Phase 6: active sensor subscriptions per run. */
  maxSensorSubscriptions: number;
  /** Phase 6: most readings per second delivered to one subscription (newest wins). */
  maxSensorHz: number;
  /** Phase 6: encoder resets (a sensor-state change) per second per run, counted apart from reads. */
  maxEncoderResetsPerSecond: number;
  /** Phase 8: camera captures per second per run. */
  maxCameraCapturesPerSecond: number;
  /** Phase 8: captures waiting at once per run. */
  maxCameraPendingCaptures: number;
  /** Phase 8: active camera subscriptions per run. */
  maxCameraSubscriptions: number;
  /** Phase 8: most frames per second delivered to one camera subscription. */
  maxCameraHz: number;
  /** Phase 8: image bytes per second per run (captures and subscription frames together). */
  maxCameraBytesPerSecond: number;
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
  maxPausedRequests: 50,
  maxMessagesPerSecond: 1000,
  terminateAtMessagesPerSecond: 5000,
  maxSensorReadsPerSecond: 200,
  maxSensorSubscriptions: 8,
  maxSensorHz: 20,
  maxEncoderResetsPerSecond: 10,
  maxCameraCapturesPerSecond: 5,
  maxCameraPendingCaptures: 2,
  maxCameraSubscriptions: 2,
  maxCameraHz: 5,
  maxCameraBytesPerSecond: 8_000_000,
};

/** Human-readable summary, shown in the UI and the docs. */
export function describeLimits(limits: ExecutionLimits = DEFAULT_LIMITS): string {
  const minutes = limits.maxRunMs / 60_000;
  return `Up to ${minutes} min of run time, ${limits.maxCommandsPerSecond} robot commands per second, ${limits.maxWaitMs / 1000} s per wait.`;
}
