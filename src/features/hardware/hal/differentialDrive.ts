import type { HardwareCalibration, HardwareProfile } from '../../blueprint/model/types';

/**
 * Hardware Abstraction Layer — differential drive.
 *
 * The robot programming API is the existing one (robotControl.drive / turn / stop,
 * robotSensors.distance). Programs never talk to hardware: the Command Bus (C2)
 * turns their commands into a movement intent, and an adapter applies it:
 *  - Simulation Adapter: the existing movement engine (kinematic or Rapier physics);
 *  - Physical Hardware Adapter: this module converts the same intent into limited
 *    wheel commands for the device (DRIVE with a short lease).
 * The adapter in use is always chosen explicitly (see hardwareStore.executionTarget).
 *
 * This is open-loop control: the reference motors have no encoders, so speeds are
 * duty-cycle commands, not measured wheel speeds.
 */

export interface WheelCommand {
  /** Signed duty in permille (−1000 … 1000), already within the profile's speed limit. */
  left: number;
  right: number;
}

export const ZERO: WheelCommand = { left: 0, right: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Mix a normalized intent (linear, angular in −1 … 1; positive angular = turn left)
 * and the speed setting (0 … 100 %) into left / right wheel duties.
 * Non-finite or out-of-range input never produces more than the speed limit.
 */
export function mixDifferential(linear: number, angular: number, speedPercent: number, profile: Pick<HardwareProfile, 'limits'> & { calibration: Pick<HardwareCalibration, 'pwmMinPermille'> }): WheelCommand {
  const lin = Number.isFinite(linear) ? clamp(linear, -1, 1) : 0;
  const ang = Number.isFinite(angular) ? clamp(angular, -1, 1) : 0;
  const pct = Number.isFinite(speedPercent) ? clamp(speedPercent, 0, 100) / 100 : 0;
  let l = lin - ang;
  let r = lin + ang;
  const m = Math.max(1, Math.abs(l), Math.abs(r));
  l /= m;
  r /= m;
  const max = clamp(Math.round(profile.limits.maxSpeedPermille), 0, 1000);
  const minDuty = clamp(Math.round(profile.calibration.pwmMinPermille), 0, max);
  const scale = (v: number) => {
    const raw = v * pct * max;
    if (Math.abs(raw) < 0.5) return 0;
    // Below the measured start-up duty the motor only hums: lift small commands to it (never above the limit).
    const mag = Math.max(minDuty, Math.abs(raw));
    return Math.round(Math.sign(raw) * Math.min(max, mag));
  };
  return { left: scale(l), right: scale(r) };
}

/** Fixed low-speed jog commands (fraction of the speed limit) for the Hardware Monitor and calibration. */
export type JogDirection = 'forward' | 'backward' | 'left' | 'right' | 'left-wheel' | 'right-wheel';

export function jogCommand(direction: JogDirection, fraction: number, profile: HardwareProfile): WheelCommand {
  const f = clamp(fraction, 0, 0.5);
  const v = Math.round(f * clamp(profile.limits.maxSpeedPermille, 0, 1000));
  switch (direction) {
    case 'forward':
      return { left: v, right: v };
    case 'backward':
      return { left: -v, right: -v };
    case 'left':
      return { left: -v, right: v };
    case 'right':
      return { left: v, right: -v };
    case 'left-wheel':
      return { left: v, right: 0 };
    case 'right-wheel':
      return { left: 0, right: v };
  }
}

/** Apply the measured distance offset to a raw physical reading (mm → m). */
export function physicalDistanceMeters(rawMm: number | null, calibration: Pick<HardwareCalibration, 'distanceOffsetMm'>): number | null {
  if (rawMm === null) return null;
  return Math.max(0, rawMm + calibration.distanceOffsetMm) / 1000;
}
