import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotSensor, SensorType } from '../../../types/sensor';
import { SENSOR_ID_PATTERN } from '../config/sensorConfig';
import { currentOdometry, readSensor, resetEncoder, sensorConfig, sensorConfigs } from '../core/sensorManager';
import { sensorStream } from '../stream/sensorStream';
import type { OdometryEstimate, SensorReading } from '../core/sensorTypes';

/**
 * Host-side Sensor API (C3). The only way user programs reach sensors: the sandbox
 * bridge calls these functions, which return plain data copies. Programs never get
 * Rapier objects, stores or the stream itself.
 */

export class SensorApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SensorApiError';
  }
}

/** What a program may know about a sensor (configuration only). */
export interface SensorInfo {
  id: string;
  type: SensorType;
  name: string;
  enabled: boolean;
  rateHz: number;
  partId?: string;
  jointId?: string;
}

function info(s: RobotSensor): SensorInfo {
  return {
    id: s.id,
    type: s.type,
    name: s.name,
    enabled: s.enabled,
    rateHz: s.rateHz,
    ...(s.type === 'encoder' ? { jointId: s.jointId } : { partId: s.partId }),
  };
}

const KIND: Record<SensorType, string> = { distance: 'a distance sensor', encoder: 'a wheel encoder', imu: 'an IMU' };
const kindOf = (type: SensorType) => KIND[type];

export function listSensors(): SensorInfo[] {
  return sensorConfigs().map(info);
}

/** The sensor with this id and type, or a clear error. `type` 'any' accepts every type. */
export function requireSensor(sensorId: string, type: string): RobotSensor {
  if (typeof sensorId !== 'string' || !SENSOR_ID_PATTERN.test(sensorId)) throw new SensorApiError(`"${String(sensorId).slice(0, 40)}" is not a valid sensor id (lowercase letters, digits and dashes).`);
  if (!['distance', 'encoder', 'imu', 'any'].includes(type)) throw new SensorApiError(`Unknown sensor type "${String(type).slice(0, 20)}".`);
  const sensor = sensorConfig(sensorId);
  if (!sensor) {
    const ids = sensorConfigs().map((s) => s.id);
    throw new SensorApiError(`This robot has no sensor "${sensorId}".${ids.length ? ` Sensors: ${ids.join(', ')}.` : ' It has no sensors.'}`);
  }
  if (type !== 'any' && sensor.type !== type) throw new SensorApiError(`"${sensorId}" is ${kindOf(sensor.type)}, not ${kindOf(type as SensorType)}.`);
  return sensor;
}

/** Latest reading as a plain copy. Disabled sensors resolve with valid: false and error "Sensor is disabled.". */
export function readSensorCopy(sensorId: string, type: string): SensorReading {
  requireSensor(sensorId, type);
  return structuredClone(readSensor(sensorId)!);
}

export function resetEncoderCounter(sensorId: string): { ok: true } {
  requireSensor(sensorId, 'encoder');
  const result = resetEncoder(sensorId);
  if (!result.ok) throw new SensorApiError(result.error);
  return { ok: true };
}

export function odometryCopy(): OdometryEstimate {
  return structuredClone(currentOdometry() ?? { available: false, reason: 'Sensors are not running (start the simulation in Control Mode or Code Studio).', leftDistance: 0, rightDistance: 0, distance: 0, heading: 0, x: 0, z: 0 });
}

/** The project the sensors belong to (subscriptions are tied to it). */
export function currentProjectId(): string | null {
  return useSceneStore.getState().projectId;
}

export const sensorReadings = { subscribe: (id: string, listener: (r: SensorReading) => void) => sensorStream.subscribe(id, listener) };
