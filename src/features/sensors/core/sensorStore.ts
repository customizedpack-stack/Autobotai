import { create } from 'zustand';
import type { OdometryEstimate, SensorReading, SensorSourceKind } from './sensorTypes';

/**
 * Snapshot of the sensor stream for the UI, refreshed by the sensor manager at most
 * 10 times per second (never once per physics step). Runtime only, never saved.
 */
export interface SensorUiState {
  /** off: no engine is running sensors (Build Mode, or Physics stopped). */
  stream: 'off' | 'running' | 'paused';
  source: SensorSourceKind | null;
  /** Increases with every start of the stream. */
  session: number;
  readings: Record<string, SensorReading>;
  odometry: OdometryEstimate | null;
  /** Show sensor rays and hit points in the viewport. */
  showRays: boolean;
  set: (patch: Partial<Omit<SensorUiState, 'set'>>) => void;
}

export const useSensorStore = create<SensorUiState>((set) => ({
  stream: 'off',
  source: null,
  session: 0,
  readings: {},
  odometry: null,
  showRays: true,
  set: (patch) => set(patch),
}));
