import type { SensorType } from '../../../types/sensor';
import type { SensorReading } from '../core/sensorTypes';

const DEG = 180 / Math.PI;
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export const TYPE_SHORT: Record<SensorType, string> = { distance: 'Distance', encoder: 'Encoder', imu: 'IMU', camera: 'Camera' };

/** Status of a reading for badges: active, stale, invalid, off. */
export function readingStatus(reading: SensorReading | undefined, enabled: boolean): { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' } {
  if (!enabled) return { label: 'Disabled', tone: 'neutral' };
  if (!reading) return { label: 'No data', tone: 'neutral' };
  if (!reading.valid) return reading.error?.startsWith('Warming up') ? { label: 'Warming up', tone: 'warn' } : { label: 'Invalid', tone: 'err' };
  if (reading.stale) return { label: 'Stale', tone: 'warn' };
  return { label: 'Active', tone: 'ok' };
}

/** Main value lines of a reading, for panels. */
export function readingLines(reading: SensorReading | undefined): [string, string][] {
  if (!reading) return [];
  if (!reading.valid && !reading.error?.startsWith('Warming up')) return [];
  switch (reading.type) {
    case 'distance':
      return [
        ['Distance', reading.status === 'hit' ? `${f(reading.distance!, 3)} m` : reading.status === 'too-close' ? `< ${f(reading.minRange)} m (too close)` : `none within ${f(reading.maxRange, 1)} m`],
        ['Obstacle', reading.detected ? 'Detected' : 'Clear'],
        ...(reading.rays.length > 1 ? ([['Rays hit', `${reading.rays.filter((r) => r.detected).length} / ${reading.rays.length}`]] as [string, string][]) : []),
      ];
    case 'encoder':
      return [
        ['Angle', `${f(reading.angle)} rad`],
        ['Revolutions', f(reading.revolutions)],
        ['Ticks', String(reading.ticks)],
        ['Speed', `${f(reading.angularVelocity)} rad/s`],
        ...(reading.distance !== null ? ([['Rolled', `${f(reading.distance, 3)} m`]] as [string, string][]) : []),
      ];
    case 'imu': {
      const w = reading.angularVelocity;
      const a = reading.linearAcceleration;
      return [
        ['Yaw / pitch / roll', `${f(reading.euler.yaw * DEG, 1)}° / ${f(reading.euler.pitch * DEG, 1)}° / ${f(reading.euler.roll * DEG, 1)}°`],
        ['Angular velocity', `${f(Math.hypot(w.x, w.y, w.z))} rad/s (y ${f(w.y)})`],
        ['Acceleration', `${f(Math.hypot(a.x, a.y, a.z))} m/s² (x ${f(a.x)})`],
        ['Specific force y', `${f(reading.specificForce.y)} m/s²`],
      ];
    }
  }
}

/** One short value for compact lists. */
export function primaryValue(reading: SensorReading | undefined): string {
  if (!reading) return '—';
  if (!reading.valid) return reading.error?.startsWith('Warming up') ? 'warming up' : 'invalid';
  switch (reading.type) {
    case 'distance':
      return reading.status === 'hit' ? `${f(reading.distance!)} m` : reading.status === 'too-close' ? 'too close' : 'clear';
    case 'encoder':
      return `${f(reading.revolutions)} rev · ${reading.ticks} ticks`;
    case 'imu':
      return `yaw ${f(reading.euler.yaw * DEG, 0)}° · ${f(reading.angularVelocity.y)} rad/s`;
  }
}

/** A number per reading for the history sparkline. */
export function sparkValue(reading: SensorReading): number | null {
  if (!reading.valid) return null;
  switch (reading.type) {
    case 'distance':
      return reading.distance ?? reading.maxRange;
    case 'encoder':
      return reading.angularVelocity;
    case 'imu':
      return reading.angularVelocity.y;
  }
}
