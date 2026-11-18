import { describe, expect, it } from 'vitest';
import { computeWheelSpeeds, integratePose, limitWheelSpeeds, twistFromIntent, twistFromWheels } from './differentialDrive';

const dims = { wheelRadius: 0.07, trackWidth: 0.31 };
const speeds = (linear: number, angular: number) => {
  const r = computeWheelSpeeds({ linear, angular }, dims);
  if (!r.ok) throw new Error(r.errors.join());
  return r.speeds;
};

describe('differential drive', () => {
  it('forward: both wheels turn forward at v / r', () => {
    const s = speeds(0.25, 0);
    expect(s.leftLinear).toBeCloseTo(0.25);
    expect(s.rightLinear).toBeCloseTo(0.25);
    expect(s.leftAngular).toBeCloseTo(0.25 / 0.07);
    expect(s.rightAngular).toBeCloseTo(0.25 / 0.07);
  });

  it('backward: both wheels turn backward', () => {
    const s = speeds(-0.2, 0);
    expect(s.leftAngular).toBeCloseTo(-0.2 / 0.07);
    expect(s.rightAngular).toBeCloseTo(-0.2 / 0.07);
  });

  it('left turn in place: left wheel backward, right wheel forward (v_left = v − ωW/2)', () => {
    const s = speeds(0, 1);
    expect(s.leftLinear).toBeCloseTo(-0.155);
    expect(s.rightLinear).toBeCloseTo(0.155);
    expect(s.rightAngular).toBeCloseTo(0.155 / 0.07);
  });

  it('right turn in place: left wheel forward, right wheel backward', () => {
    const s = speeds(0, -1);
    expect(s.leftLinear).toBeCloseTo(0.155);
    expect(s.rightLinear).toBeCloseTo(-0.155);
  });

  it('arc: forward and turning combine', () => {
    const s = speeds(0.2, 0.5);
    expect(s.leftLinear).toBeCloseTo(0.2 - 0.5 * 0.155);
    expect(s.rightLinear).toBeCloseTo(0.2 + 0.5 * 0.155);
    const back = twistFromWheels(s.leftLinear, s.rightLinear, dims.trackWidth);
    expect(back.linear).toBeCloseTo(0.2);
    expect(back.angular).toBeCloseTo(0.5);
  });

  it('zero velocity: wheels stand still', () => {
    const s = speeds(0, 0);
    expect([s.leftLinear, s.rightLinear, s.leftAngular, s.rightAngular].every((v) => v === 0)).toBe(true);
  });

  it('speed scaling: the speed setting scales the intent', () => {
    const limits = { maxLinearSpeed: 0.5, maxAngularSpeed: 2 };
    expect(twistFromIntent({ linear: 1, angular: 0 }, 0.25, limits).linear).toBeCloseTo(0.125);
    expect(twistFromIntent({ linear: 1, angular: 0 }, 1, limits).linear).toBeCloseTo(0.5);
    expect(twistFromIntent({ linear: -1, angular: 1 }, 0.5, limits)).toEqual({ linear: -0.25, angular: 1 });
    expect(twistFromIntent({ linear: 5, angular: 0 }, 2, limits).linear).toBeCloseTo(0.5); // clamped
  });

  it('rejects an invalid wheel radius', () => {
    for (const wheelRadius of [0, -0.1, Number.NaN, Infinity]) {
      const r = computeWheelSpeeds({ linear: 1, angular: 0 }, { wheelRadius, trackWidth: 0.3 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toContain('Wheel radius must be a positive number.');
    }
  });

  it('rejects an invalid track width', () => {
    for (const trackWidth of [0, -1, Number.NaN]) {
      const r = computeWheelSpeeds({ linear: 1, angular: 0 }, { wheelRadius: 0.07, trackWidth });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toContain('Track width must be a positive number.');
    }
  });

  it('limits both wheels together to the motor maximum, keeping the path shape', () => {
    const s = speeds(0.5, 1);
    const { speeds: limited, limited: was } = limitWheelSpeeds(s, 5, 5);
    expect(was).toBe(true);
    expect(Math.max(Math.abs(limited.leftAngular), Math.abs(limited.rightAngular))).toBeCloseTo(5);
    expect(limited.rightLinear / limited.leftLinear).toBeCloseTo(s.rightLinear / s.leftLinear);
    expect(limitWheelSpeeds(speeds(0.1, 0), 5, 5).limited).toBe(false);
  });

  it('integrates the pose: straight, and a quarter circle to the left', () => {
    const straight = integratePose({ x: 0, z: 0, heading: 0 }, { linear: 1, angular: 0 }, 2);
    expect(straight.x).toBeCloseTo(2);
    expect(straight.z).toBeCloseTo(0);
    // Radius 1 m, quarter turn left: ends at (1, −1) facing −Z (left is −Z when facing +X).
    const arc = integratePose({ x: 0, z: 0, heading: 0 }, { linear: Math.PI / 2, angular: Math.PI / 2 }, 1);
    expect(arc.x).toBeCloseTo(1);
    expect(arc.z).toBeCloseTo(-1);
    expect(arc.heading).toBeCloseTo(Math.PI / 2);
  });
});
