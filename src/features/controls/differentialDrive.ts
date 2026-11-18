/**
 * Differential-drive kinematics. Pure functions, no React, no stores.
 *
 *   v_left  = v − ω · trackWidth / 2
 *   v_right = v + ω · trackWidth / 2
 *   ω_left  = v_left  / wheelRadius
 *   ω_right = v_right / wheelRadius
 *
 * v is the forward speed (m/s), ω the turn rate (rad/s, positive = turn left).
 */

export interface Twist {
  /** Forward speed, m/s. */
  linear: number;
  /** Turn rate, rad/s. Positive turns left (counter-clockwise seen from above). */
  angular: number;
}

export interface DriveDimensions {
  wheelRadius: number;
  trackWidth: number;
}

export interface WheelSpeeds {
  /** Wheel rim speeds, m/s. */
  leftLinear: number;
  rightLinear: number;
  /** Wheel angular speeds, rad/s. */
  leftAngular: number;
  rightAngular: number;
}

export type WheelSpeedResult = { ok: true; speeds: WheelSpeeds } | { ok: false; errors: string[] };

export function validateDimensions({ wheelRadius, trackWidth }: DriveDimensions): string[] {
  const errors: string[] = [];
  if (!(Number.isFinite(wheelRadius) && wheelRadius > 0)) errors.push('Wheel radius must be a positive number.');
  if (!(Number.isFinite(trackWidth) && trackWidth > 0)) errors.push('Track width must be a positive number.');
  return errors;
}

export function computeWheelSpeeds(twist: Twist, dims: DriveDimensions): WheelSpeedResult {
  const errors = validateDimensions(dims);
  if (!Number.isFinite(twist.linear) || !Number.isFinite(twist.angular)) errors.push('Speed and turn rate must be numbers.');
  if (errors.length) return { ok: false, errors };
  const half = (twist.angular * dims.trackWidth) / 2;
  const leftLinear = twist.linear - half;
  const rightLinear = twist.linear + half;
  return {
    ok: true,
    speeds: { leftLinear, rightLinear, leftAngular: leftLinear / dims.wheelRadius, rightAngular: rightLinear / dims.wheelRadius },
  };
}

/** Inverse: the robot twist that the given wheel rim speeds produce. */
export function twistFromWheels(leftLinear: number, rightLinear: number, trackWidth: number): Twist {
  return { linear: (leftLinear + rightLinear) / 2, angular: (rightLinear - leftLinear) / trackWidth };
}

export interface DriveLimits {
  maxLinearSpeed: number;
  maxAngularSpeed: number;
}

/**
 * Turn a normalized intent (−1 … 1 for each axis, as from keys or buttons)
 * and a speed setting (0 … 1) into a twist.
 */
export function twistFromIntent(intent: { linear: number; angular: number }, speedFraction: number, limits: DriveLimits): Twist {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const s = Math.max(0, Math.min(1, speedFraction));
  return { linear: clamp(intent.linear) * s * limits.maxLinearSpeed, angular: clamp(intent.angular) * s * limits.maxAngularSpeed };
}

/**
 * Scale both wheels down together so neither exceeds its motor's maximum
 * angular speed. Scaling both keeps the path shape (same turn radius).
 */
export function limitWheelSpeeds(speeds: WheelSpeeds, maxLeft: number, maxRight: number): { speeds: WheelSpeeds; limited: boolean } {
  const factor = Math.min(
    1,
    Math.abs(speeds.leftAngular) > maxLeft ? maxLeft / Math.abs(speeds.leftAngular) : 1,
    Math.abs(speeds.rightAngular) > maxRight ? maxRight / Math.abs(speeds.rightAngular) : 1,
  );
  if (factor >= 1) return { speeds, limited: false };
  return {
    limited: true,
    speeds: {
      leftLinear: speeds.leftLinear * factor,
      rightLinear: speeds.rightLinear * factor,
      leftAngular: speeds.leftAngular * factor,
      rightAngular: speeds.rightAngular * factor,
    },
  };
}

/** Planar pose: x/z position and heading (yaw about +Y; heading 0 faces +X). */
export interface PlanarPose {
  x: number;
  z: number;
  heading: number;
}

/**
 * Exact integration of a constant twist over dt (unicycle model).
 * Forward direction for heading h is (cos h, 0, −sin h).
 */
export function integratePose(pose: PlanarPose, twist: Twist, dt: number): PlanarPose {
  const { linear: v, angular: w } = twist;
  const h = pose.heading;
  if (Math.abs(w) < 1e-9) {
    return { x: pose.x + v * Math.cos(h) * dt, z: pose.z - v * Math.sin(h) * dt, heading: h };
  }
  const h2 = h + w * dt;
  return {
    x: pose.x + (v / w) * (Math.sin(h2) - Math.sin(h)),
    z: pose.z + (v / w) * (Math.cos(h2) - Math.cos(h)),
    heading: h2,
  };
}
