import { describe, expect, it } from 'vitest';
import type { EnvironmentDefinition, EnvironmentObject } from '../../../types/environment';
import { buildRobotAssembly } from '../../physics/bodies/robotAssembly';
import { PhysicsWorld } from '../../physics/engine/physicsWorld';
import { loadRapier } from '../../physics/engine/rapierLoader';
import { FIXED_STEP } from '../../physics/physicsConfig';
import { openExplorer } from '../../controls/testUtils';
import { useSceneStore } from '../../../stores/sceneStore';
import { createObject } from '../config/environmentConfig';

/**
 * Phase 7 performance: build environments of 10, 25 and 50 objects (a realistic mix of
 * static walls, platforms, ramps, pillars and dynamic boxes), create their physics bodies
 * next to the Explorer Bot, run 5 simulated seconds, and dispose. Measured, not assumed.
 */
function mixedEnvironment(count: number): { env: EnvironmentDefinition; createMs: number } {
  const t0 = performance.now();
  const objects: EnvironmentObject[] = [createObject('ground', [])];
  const kinds = ['wall', 'box', 'platform', 'ramp', 'obstacle'] as const;
  for (let i = 1; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    objects.push(createObject(kind, objects, { shape: kind === 'obstacle' ? 'cylinder' : undefined }));
  }
  const createMs = performance.now() - t0;
  return { env: { id: `perf${count}`, name: `${count}`, version: 1, templateId: null, objects, createdAt: '', updatedAt: '' }, createMs };
}

describe('environment performance', () => {
  it('10, 25 and 50 objects: creation, body creation, 5 s of simulation, cleanup', async () => {
    const rapier = await loadRapier();
    openExplorer(false);
    const { objects, joints, actuators } = useSceneStore.getState();
    const results: string[] = [];
    for (const count of [10, 25, 50]) {
      const { env, createMs } = mixedEnvironment(count);
      const t1 = performance.now();
      const world = new PhysicsWorld(rapier, { gravityEnabled: true, environment: env });
      world.addRobot(buildRobotAssembly(objects, joints, actuators));
      const buildMs = performance.now() - t1;
      expect(world.environmentBodies.filter((b) => b.status === 'active')).toHaveLength(count);
      const dynamic = world.environmentBodies.filter((b) => b.dynamic).length;
      const t2 = performance.now();
      for (let i = 0; i < Math.round(5 / FIXED_STEP); i++) world.step(FIXED_STEP);
      const simMs = performance.now() - t2;
      const perTick = simMs / Math.round(5 / FIXED_STEP);
      const colliders = world.world.colliders.len();
      world.dispose();
      expect(world.isDisposed).toBe(true);
      results.push(`${count} objects (${dynamic} dynamic, ${colliders} colliders): create ${createMs.toFixed(1)} ms, bodies ${buildMs.toFixed(1)} ms, 5 s sim ${simMs.toFixed(0)} ms (${perTick.toFixed(2)} ms/tick)`);
      // Real time is 16.7 ms per tick; stay well below it.
      expect(perTick).toBeLessThan(8);
    }
    console.info(`[perf] ${results.join(' | ')}`);
  });
});
