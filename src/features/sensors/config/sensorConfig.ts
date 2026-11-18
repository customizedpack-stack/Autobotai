import type { RobotController } from '../../../types/actuator';
import type { RobotJoint } from '../../../types/joint';
import type { SceneObject, Vec3 } from '../../../types/scene';
import { SENSOR_RATES, type DistanceSensorConfig, type EncoderSensorConfig, type ImuSensorConfig, type RobotSensor, type SensorRate, type SensorType } from '../../../types/sensor';
import { measureDriveGeometry } from '../../robot-model/drive';

/**
 * Sensor configuration: limits, defaults, validation and load-time cleanup.
 * Pure functions; the C1 Robot Model Connector applies validated changes.
 */

export const SENSOR_LIMITS = {
  range: { min: 0, max: 10 },
  fov: { min: 0, max: Math.PI },
  rays: { min: 1, max: 15 },
  ticksPerRevolution: { min: 1, max: 100_000 },
  offset: 2,
} as const;

export const SENSOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

export const DEFAULT_RATE: Record<SensorType, SensorRate> = { distance: 20, encoder: 60, imu: 60 };

export const SENSOR_TYPE_LABEL: Record<SensorType, string> = { distance: 'Distance sensor', encoder: 'Wheel encoder', imu: 'IMU' };

export interface SensorModel {
  objects: readonly SceneObject[];
  joints: readonly RobotJoint[];
  controllers?: readonly RobotController[];
  sensors?: readonly RobotSensor[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);

export function defaultDistance(partId: string, id = 'front-distance', name = 'Front Distance Sensor'): DistanceSensorConfig {
  return { id, type: 'distance', name, enabled: true, rateHz: DEFAULT_RATE.distance, partId, position: [0, 0, 0], rotation: [0, 0, 0], minRange: 0.02, maxRange: 4, fov: 0, rays: 1, ignoreGround: true };
}

export function defaultEncoder(jointId: string, id: string, name: string, invert = false): EncoderSensorConfig {
  return { id, type: 'encoder', name, enabled: true, rateHz: DEFAULT_RATE.encoder, jointId, ticksPerRevolution: 360, invert };
}

export function defaultImu(partId: string, id = 'main-imu', name = 'Main IMU'): ImuSensorConfig {
  return { id, type: 'imu', name, enabled: true, rateHz: DEFAULT_RATE.imu, partId, position: [0, 0, 0], rotation: [0, 0, 0], frame: 'sensor' };
}

/** A free id based on `base` ("front-distance", "front-distance-2", …). */
export function uniqueSensorId(base: string, sensors: readonly RobotSensor[]): string {
  const clean = (base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sensor').replace(/^[^a-z]+/, '') || 'sensor';
  const stem = clean.slice(0, 36);
  const taken = new Set(sensors.map((s) => s.id));
  if (!taken.has(stem)) return stem;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${stem}-${i}`)) return `${stem}-${i}`;
  return `${stem}-${Date.now() % 10000}`;
}

/**
 * The standard sensor set for a robot: a distance sensor on the first distance-sensor
 * part, two wheel encoders on the drive wheels (counting up when driving forward), and
 * an IMU on the first IMU part or else on the drive's root part. Only what fits is added.
 */
export function defaultSensorsFor(model: SensorModel): RobotSensor[] {
  const out: RobotSensor[] = [];
  const existing = model.sensors ?? [];
  const all = () => [...existing, ...out];
  const distancePart = model.objects.find((o) => o.metadata.componentId === 'sensor-distance');
  if (distancePart && !existing.some((s) => s.type === 'distance' && s.partId === distancePart.id)) {
    out.push(defaultDistance(distancePart.id, uniqueSensorId('front-distance', all())));
  }
  const drive = model.controllers?.find((c) => c.type === 'differentialDrive');
  if (drive) {
    const geometry = measureDriveGeometry(drive, model.objects, model.joints);
    for (const [side, jointId] of [
      ['left', drive.leftJointId],
      ['right', drive.rightJointId],
    ] as const) {
      if (existing.some((s) => s.type === 'encoder' && s.jointId === jointId)) continue;
      if (!model.joints.some((j) => j.id === jointId && j.type === 'revolute')) continue;
      const spin = geometry.ok ? geometry.geometry[side].spinSign : 1;
      out.push(defaultEncoder(jointId, uniqueSensorId(`${side}-encoder`, all()), `${side === 'left' ? 'Left' : 'Right'} Wheel Encoder`, spin < 0));
    }
  }
  const imuPart = model.objects.find((o) => o.metadata.componentId === 'sensor-imu') ?? (drive ? model.objects.find((o) => o.id === drive.rootComponentId) : undefined);
  if (imuPart && !existing.some((s) => s.type === 'imu')) out.push(defaultImu(imuPart.id, uniqueSensorId('main-imu', all())));
  return out;
}

/** Errors for one sensor in the context of the model (and the other sensors). Empty = valid. */
export function validateSensor(sensor: RobotSensor, model: SensorModel, others: readonly RobotSensor[] = []): string[] {
  const errors: string[] = [];
  if (!SENSOR_ID_PATTERN.test(sensor.id)) errors.push('Sensor id must start with a letter and use only lowercase letters, digits and dashes (up to 40).');
  if (others.some((s) => s.id === sensor.id)) errors.push(`Another sensor already uses the id "${sensor.id}".`);
  if (!sensor.name.trim()) errors.push('Sensor name must not be empty.');
  if (!(SENSOR_RATES as readonly number[]).includes(sensor.rateHz)) errors.push(`Update rate must be one of ${SENSOR_RATES.join(', ')} Hz.`);
  const offsetOk = (v: Vec3) => isVec3(v) && v.every((n) => Math.abs(n) <= SENSOR_LIMITS.offset);
  switch (sensor.type) {
    case 'distance':
      if (!model.objects.some((o) => o.id === sensor.partId)) errors.push('The part this sensor is mounted on does not exist.');
      if (!offsetOk(sensor.position)) errors.push(`Mount position must be within ±${SENSOR_LIMITS.offset} m.`);
      if (!isVec3(sensor.rotation)) errors.push('Mount rotation must be three numbers.');
      if (!finite(sensor.maxRange) || sensor.maxRange <= 0 || sensor.maxRange > SENSOR_LIMITS.range.max) errors.push(`Maximum range must be above 0 and at most ${SENSOR_LIMITS.range.max} m.`);
      if (!finite(sensor.minRange) || sensor.minRange < 0 || sensor.minRange >= sensor.maxRange) errors.push('Minimum range must be 0 or more and below the maximum range.');
      if (!Number.isInteger(sensor.rays) || sensor.rays < SENSOR_LIMITS.rays.min || sensor.rays > SENSOR_LIMITS.rays.max) errors.push(`Ray count must be a whole number from 1 to ${SENSOR_LIMITS.rays.max}.`);
      if (!finite(sensor.fov) || sensor.fov < 0 || sensor.fov > SENSOR_LIMITS.fov.max) errors.push('Field of view must be between 0 and 180°.');
      if (sensor.rays > 1 && sensor.fov <= 0) errors.push('Several rays need a field of view above 0°.');
      break;
    case 'encoder': {
      const joint = model.joints.find((j) => j.id === sensor.jointId);
      if (!joint) errors.push('The wheel joint of this encoder does not exist.');
      else if (joint.type !== 'revolute') errors.push(`Encoders need a revolute joint; "${joint.name}" is ${joint.type}.`);
      if (!Number.isInteger(sensor.ticksPerRevolution) || sensor.ticksPerRevolution < 1 || sensor.ticksPerRevolution > SENSOR_LIMITS.ticksPerRevolution.max) {
        errors.push(`Ticks per revolution must be a whole number from 1 to ${SENSOR_LIMITS.ticksPerRevolution.max}.`);
      }
      break;
    }
    case 'imu':
      if (!model.objects.some((o) => o.id === sensor.partId)) errors.push('The part this IMU is fixed to does not exist.');
      if (!offsetOk(sensor.position)) errors.push(`Mount position must be within ±${SENSOR_LIMITS.offset} m.`);
      if (!isVec3(sensor.rotation)) errors.push('Mount rotation must be three numbers.');
      if (sensor.frame !== 'sensor' && sensor.frame !== 'world') errors.push('Frame must be "sensor" or "world".');
      break;
  }
  return errors;
}

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Clean the stored `sensors` list when a project loads. Readable entries are kept;
 * bad values are replaced by defaults, entries pointing at missing parts or joints are
 * kept but disabled, and every change is reported as a warning. Unknown fields are kept.
 * Returns undefined when the project has no sensor list (older projects stay unchanged).
 */
export function sanitizeSensors(raw: unknown, model: SensorModel, warnings: string[]): RobotSensor[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    warnings.push('The sensor list was not readable and was ignored.');
    return [];
  }
  const out: RobotSensor[] = [];
  raw.forEach((entry, index) => {
    if (!isObject(entry) || !['distance', 'encoder', 'imu'].includes(entry.type as string)) {
      warnings.push(`Sensor #${index + 1} has an unknown type and was skipped.`);
      return;
    }
    const type = entry.type as SensorType;
    const label = typeof entry.name === 'string' && entry.name.trim() ? entry.name : `Sensor ${index + 1}`;
    const fixed: string[] = [];
    let id = typeof entry.id === 'string' && SENSOR_ID_PATTERN.test(entry.id) ? entry.id : '';
    if (!id || out.some((s) => s.id === id)) {
      const next = uniqueSensorId(typeof entry.id === 'string' ? entry.id : `${type}-sensor`, out);
      fixed.push(`id "${String(entry.id)}" → "${next}"`);
      id = next;
    }
    const rateHz = (SENSOR_RATES as readonly number[]).includes(entry.rateHz as number) ? (entry.rateHz as SensorRate) : DEFAULT_RATE[type];
    if (rateHz !== entry.rateHz) fixed.push(`update rate → ${rateHz} Hz`);
    const base = { ...entry, id, type, name: label, enabled: entry.enabled !== false, rateHz };
    let sensor: RobotSensor;
    const vec = (key: string): Vec3 => {
      const v = entry[key];
      if (isVec3(v) && v.every((n) => Math.abs(n) <= SENSOR_LIMITS.offset * (key === 'rotation' ? 4 : 1))) return v;
      if (v !== undefined) fixed.push(`${key} → 0, 0, 0`);
      return [0, 0, 0];
    };
    if (type === 'distance') {
      const d = defaultDistance(String(entry.partId ?? ''), id, label);
      const maxRange = finite(entry.maxRange) && entry.maxRange > 0 && entry.maxRange <= SENSOR_LIMITS.range.max ? entry.maxRange : d.maxRange;
      const minRange = finite(entry.minRange) && entry.minRange >= 0 && entry.minRange < maxRange ? entry.minRange : Math.min(d.minRange, maxRange / 2);
      const rays = Number.isInteger(entry.rays) && (entry.rays as number) >= 1 && (entry.rays as number) <= SENSOR_LIMITS.rays.max ? (entry.rays as number) : 1;
      const fov = finite(entry.fov) && entry.fov >= 0 && entry.fov <= Math.PI ? entry.fov : 0;
      if (maxRange !== entry.maxRange || minRange !== entry.minRange || rays !== entry.rays || fov !== entry.fov) fixed.push('range or ray settings → defaults');
      sensor = { ...base, type, partId: d.partId, position: vec('position'), rotation: vec('rotation'), minRange, maxRange, rays, fov: rays > 1 && fov === 0 ? Math.PI / 4 : fov, ignoreGround: entry.ignoreGround !== false } as DistanceSensorConfig;
    } else if (type === 'encoder') {
      const tpr = Number.isInteger(entry.ticksPerRevolution) && (entry.ticksPerRevolution as number) >= 1 && (entry.ticksPerRevolution as number) <= SENSOR_LIMITS.ticksPerRevolution.max ? (entry.ticksPerRevolution as number) : 360;
      if (tpr !== entry.ticksPerRevolution) fixed.push('ticks per revolution → 360');
      sensor = { ...base, type, jointId: String(entry.jointId ?? ''), ticksPerRevolution: tpr, invert: entry.invert === true } as EncoderSensorConfig;
    } else {
      sensor = { ...base, type, partId: String(entry.partId ?? ''), position: vec('position'), rotation: vec('rotation'), frame: entry.frame === 'world' ? 'world' : 'sensor' } as ImuSensorConfig;
    }
    if (fixed.length) warnings.push(`Sensor "${label}": ${fixed.join(', ')}.`);
    const problems = validateSensor(sensor, model, out);
    if (problems.length && sensor.enabled) {
      sensor = { ...sensor, enabled: false };
      warnings.push(`Sensor "${label}" was disabled: ${problems.join(' ')}`);
    }
    out.push(sensor);
  });
  return out;
}
