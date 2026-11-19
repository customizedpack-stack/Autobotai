import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../engine/physicsWorld';
import { loadRapier, type Rapier } from '../engine/rapierLoader';
import { FIXED_STEP } from '../physicsConfig';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const run = (w: PhysicsWorld, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += FIXED_STEP) w.step(FIXED_STEP);
};
const box = (half: number) => ({ kind: 'cuboid' as const, halfExtents: [half, half, half] as [number, number, number] });

describe('physics world (Rapier)', () => {
  it('initializes with a ground plane and disposes cleanly', () => {
    const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: 'floor' });
    expect(w.world.gravity.y).toBeCloseTo(-9.81, 6);
    expect(w.ground).toBeTruthy();
    expect(w.obstacles).toHaveLength(0);
    w.dispose();
    expect(w.isDisposed).toBe(true);
    w.dispose(); // safe twice
    w.step(FIXED_STEP); // no-op after dispose
  });

  it('gravity makes an unsupported body fall at ≈ 9.81 m/s²; disabling gravity keeps it in place', () => {
    const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: 'floor' });
    const body = w.addBody({ shape: box(0.05), position: [0, 10, 0] });
    run(w, 0.5);
    // y = 10 − ½ g t² (light linear damping is not applied to plain test bodies)
    expect(body.translation().y).toBeCloseTo(10 - 0.5 * 9.81 * 0.25, 1);
    w.setGravityEnabled(false);
    const vy = body.linvel().y;
    run(w, 0.5);
    expect(body.linvel().y).toBeCloseTo(vy, 3);
    w.dispose();
  });

  it('bodies fall onto the ground and settle at rest on it', () => {
    const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: 'floor' });
    const body = w.addBody({ shape: box(0.1), position: [0, 1, 0] });
    run(w, 3);
    expect(body.translation().y).toBeCloseTo(0.1, 2);
    expect(Math.abs(body.linvel().y)).toBeLessThan(0.01);
    w.dispose();
  });

  it('static obstacles block a moving body', () => {
    const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: 'obstacles' });
    expect(w.obstacles.length).toBeGreaterThan(0);
    // Slide toward the wall at x = 1.4 (its near face is at x = 1.35).
    const body = w.addBody({ shape: box(0.05), position: [1.0, 0.06, 0], linvel: [3, 0, 0], friction: 0 });
    run(w, 1.5);
    expect(body.translation().x).toBeLessThan(1.35);
    w.dispose();
  });

  it('friction slows a sliding body; without friction it keeps going', () => {
    const slide = (friction: number) => {
      const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: 'floor' });
      const body = w.addBody({ shape: box(0.05), position: [0, 0.05, 0], linvel: [2, 0, 0], friction });
      run(w, 1);
      const x = body.translation().x;
      w.dispose();
      return x;
    };
    const rough = slide(1.0);
    const smooth = slide(0.0);
    expect(smooth).toBeGreaterThan(1.5);
    expect(rough).toBeLessThan(0.5);
  });

  it('restitution makes a body bounce; zero restitution does not', () => {
    const bounce = (restitution: number) => {
      const w = new PhysicsWorld(rapier, { gravityEnabled: true, environment: 'floor' });
      const ball = w.addBody({ shape: { kind: 'ball', radius: 0.05 }, position: [0, 1, 0], restitution });
      let maxAfterImpact = 0;
      let hit = false;
      for (let i = 0; i < 120; i++) {
        w.step(FIXED_STEP);
        const y = ball.translation().y;
        if (y < 0.06) hit = true;
        if (hit) maxAfterImpact = Math.max(maxAfterImpact, y);
      }
      w.dispose();
      return maxAfterImpact;
    };
    expect(bounce(0.8)).toBeGreaterThan(0.3);
    expect(bounce(0.0)).toBeLessThan(0.08);
  });

  it('mass affects acceleration: the same impulse moves a light body faster than a heavy one', () => {
    const w = new PhysicsWorld(rapier, { gravityEnabled: false, environment: 'floor' });
    const light = w.addBody({ shape: box(0.05), position: [0, 2, 0], mass: 1 });
    const heavy = w.addBody({ shape: box(0.05), position: [0, 2, 1], mass: 4 });
    light.applyImpulse({ x: 2, y: 0, z: 0 }, true);
    heavy.applyImpulse({ x: 2, y: 0, z: 0 }, true);
    run(w, 0.1);
    expect(light.linvel().x).toBeCloseTo(2, 2);
    expect(heavy.linvel().x).toBeCloseTo(0.5, 2);
    w.dispose();
  });
});
