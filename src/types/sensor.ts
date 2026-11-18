import type { Vec3 } from './scene';

/**
 * Sensor configuration (Phase 6). Saved with the robot project in the optional
 * `sensors` list. Only configuration is saved; live readings are runtime state.
 *
 * Every sensor has a short, readable id (for example "front-distance") that
 * programs use: robotSensors.distance("front-distance").read().
 */
export type SensorType = 'distance' | 'encoder' | 'imu';

/** Update-rate presets (Hz). Sensors are sampled from the 60 Hz simulation tick, so 60 Hz is the maximum. */
export const SENSOR_RATES = [10, 20, 30, 60] as const;
export type SensorRate = (typeof SENSOR_RATES)[number];

interface SensorBase {
  /** Unique within the project: lowercase letters, digits and dashes, 1 … 40 characters, starting with a letter. */
  id: string;
  type: SensorType;
  name: string;
  enabled: boolean;
  rateHz: SensorRate;
}

/**
 * Distance sensor: one ray, or several rays spread across a field of view.
 * The sensor looks along its local +X axis.
 */
export interface DistanceSensorConfig extends SensorBase {
  type: 'distance';
  /** Robot part the sensor is mounted on. */
  partId: string;
  /** Mount position relative to the part (m). */
  position: Vec3;
  /** Mount rotation relative to the part (Euler XYZ, rad). */
  rotation: Vec3;
  /** Closer hits are reported as "too close" (m). */
  minRange: number;
  /** Farther than this is "no hit" (m). */
  maxRange: number;
  /** Total spread of the rays around +X in the sensor's XZ plane (rad). 0 with one ray. */
  fov: number;
  /** Number of rays, 1 … 15. */
  rays: number;
  /** Ignore the ground plane (recommended for sensors that look forward). */
  ignoreGround: boolean;
}

/** Wheel encoder on a revolute joint. */
export interface EncoderSensorConfig extends SensorBase {
  type: 'encoder';
  jointId: string;
  /** Ticks per full revolution, 1 … 100 000. */
  ticksPerRevolution: number;
  /**
   * false: positive = the joint's positive rotation about its axis.
   * true: the sign is flipped. Default sensors set it so that driving FORWARD counts up.
   */
  invert: boolean;
}

/** Inertial measurement unit fixed to a part. */
export interface ImuSensorConfig extends SensorBase {
  type: 'imu';
  partId: string;
  position: Vec3;
  rotation: Vec3;
  /** Frame of the angular velocity and acceleration vectors. Orientation is always sensor-to-world. */
  frame: 'sensor' | 'world';
}

export type RobotSensor = DistanceSensorConfig | EncoderSensorConfig | ImuSensorConfig;
