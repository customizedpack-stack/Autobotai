import { SensorStream } from '../sensors/stream/sensorStream';
import type { DistanceStatus } from './protocol/protocol';

/**
 * Physical telemetry on the C3 Sensor Stream architecture: the same stream class,
 * but its OWN instance. Simulated readings stay in `sensorStream`; physical readings
 * are only here and always carry source: 'physical'. Neither can overwrite the other.
 */

export interface PhysicalReading {
  sensorId: string;
  type: 'distance';
  source: 'physical';
  /** Host time when the line arrived (ms, performance.now()). */
  timestamp: number;
  /** Device clock (ms since its boot). */
  deviceTime: number;
  /** Distance in meters after the calibrated offset, or null. */
  value: number | null;
  unit: 'm';
  valid: boolean;
  status: 'ok' | 'out-of-range' | 'error' | 'no-sensor';
  rawMm: number | null;
  sequence: number;
}

export const physicalReadings = new SensorStream<PhysicalReading>();

export function readingStatus(ds: DistanceStatus): PhysicalReading['status'] {
  return ds === 'ok' ? 'ok' : ds === 'range' ? 'out-of-range' : ds === 'err' ? 'error' : 'no-sensor';
}
