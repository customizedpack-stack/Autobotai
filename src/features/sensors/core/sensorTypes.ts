import type { Vec3 } from '../../../types/scene';
import type { SensorType } from '../../../types/sensor';
import type { Quat } from '../../physics/engine/quat';

/**
 * Sensor readings (Phase 6, C3 Sensor Stream). Plain data: they cross the
 * sandbox boundary as they are. Units: meters, radians, seconds, m/s, rad/s, m/s².
 */

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** Which engine produced the reading. */
export type SensorSourceKind = 'physics' | 'kinematic';

export interface ReadingBase {
  sensorId: string;
  type: SensorType;
  /** Host clock when the sample was taken (ms, performance.now()). */
  timestamp: number;
  /** Simulated time of the sample (s since the simulation or control session started). */
  simTime: number;
  source: SensorSourceKind;
  /**
   * false when the value cannot be trusted: sensor disabled, warming up, the needed
   * engine is not running, or the sensor's part or joint is missing. `error` says why.
   */
  valid: boolean;
  /** true when the reading is older than two sample periods while the simulation runs, or the simulation is paused. */
  stale: boolean;
  /** Increments with every new sample of this sensor (0 = none yet). */
  sequence: number;
  error?: string;
}

/**
 * One ray. `distance` is null when nothing is within range. A hit closer than the
 * minimum range is "too-close": detected = true, distance = null.
 */
export interface DistanceRay {
  /** Angle of this ray from the sensor's +X axis, about the sensor's Y axis (rad, positive = left). */
  angle: number;
  distance: number | null;
  detected: boolean;
  status: 'hit' | 'no-hit' | 'too-close';
  hitPoint?: XYZ;
  hitNormal?: XYZ;
}

export interface DistanceReading extends ReadingBase {
  type: 'distance';
  /** Nearest valid hit over all rays (m), or null for no hit (never 0 for no hit). */
  distance: number | null;
  /** Something is within the maximum range (including "too close"). */
  detected: boolean;
  status: 'hit' | 'no-hit' | 'too-close';
  minRange: number;
  maxRange: number;
  hitPoint?: XYZ;
  hitNormal?: XYZ;
  /** World position and direction of the sensor (center ray). */
  origin: XYZ;
  direction: XYZ;
  /** Every ray, left to right (one entry for a single-ray sensor). */
  rays: DistanceRay[];
}

export interface EncoderReading extends ReadingBase {
  type: 'encoder';
  jointId: string;
  /** Wheel angle since the last encoder reset, continuous over many turns (rad). */
  angle: number;
  /** Angle change since the previous reading of this sensor (rad). */
  angleDelta: number;
  /** Measured wheel speed (rad/s). */
  angularVelocity: number;
  revolutions: number;
  /** Whole ticks: trunc(revolutions × ticks per revolution). */
  ticks: number;
  ticksPerRevolution: number;
  /** Distance rolled (angle × wheel radius) when the wheel radius is known, else null (m). */
  distance: number | null;
}

export interface ImuReading extends ReadingBase {
  type: 'imu';
  /** Rotation from the sensor frame to the world frame. */
  orientation: Quat;
  /** Same orientation as roll (about X), pitch (about Z) and yaw (about Y), rad. */
  euler: { roll: number; pitch: number; yaw: number };
  /** Angular velocity (rad/s), in `frame`. */
  angularVelocity: XYZ;
  /** Kinematic acceleration with gravity NOT included (m/s²), in `frame`. Zero when resting. */
  linearAcceleration: XYZ;
  /** What a real accelerometer measures: acceleration minus gravity (m/s²), in `frame`. About +9.81 up when resting. */
  specificForce: XYZ;
  frame: 'sensor' | 'world';
}

export type SensorReading = DistanceReading | EncoderReading | ImuReading;

/** Wheel odometry estimated from the two drive encoders. Separate from the true (physics) pose. */
export interface OdometryEstimate {
  available: boolean;
  /** Why it is not available. */
  reason?: string;
  leftDistance: number;
  rightDistance: number;
  /** Mean of both wheels (m, signed: forward positive). */
  distance: number;
  /** Estimated heading change since the start or reset (rad, positive = left). */
  heading: number;
  /** Estimated position (m) in the ground plane. */
  x: number;
  z: number;
}

/**
 * What a sensor needs from the active engine. The physics source reads Rapier
 * bodies; the kinematic source reads the kinematic runtime pose.
 */
export interface SensorSource {
  readonly kind: SensorSourceKind;
  /** Changes when the world is rebuilt or the robot jumps (reset): histories must restart. */
  generation(): number;
  /** World pose of a part (no scale), or null when the part does not exist. */
  partPose(partId: string): { position: Vec3; rotation: Quat } | null;
  /** Velocity of the point `worldPoint` fixed to the part, and the part's angular velocity (world). Null: not provided (computed from poses). */
  pointVelocity(partId: string, worldPoint: Vec3): { linear: Vec3; angular: Vec3 } | null;
  /** Joint angle (rad, may wrap at ±π). Null when the joint does not exist. */
  jointAngle(jointId: string): number | null;
  /** Measured joint rate (rad/s), or null when not provided (computed from angles). */
  jointRate(jointId: string): number | null;
  /**
   * First environment hit along a ray, or null for no hit. Undefined: this engine cannot cast rays.
   * The robot's own parts are never hit.
   */
  castRay(origin: Vec3, direction: Vec3, maxDistance: number, ignoreGround: boolean): { distance: number; point: Vec3; normal: Vec3 } | null | undefined;
  /** Gravity vector (m/s²), e.g. [0, -9.81, 0], or zeros when gravity is off. */
  gravity(): Vec3;
}

export const xyz = (v: Vec3): XYZ => ({ x: v[0], y: v[1], z: v[2] });
