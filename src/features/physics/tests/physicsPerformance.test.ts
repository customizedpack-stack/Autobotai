import { afterEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { robotControl } from '../../controls/robotControlApi';
import { openExplorer } from '../../controls/testUtils';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { activePhysicsController, selectEngine, setSimulationScheduler, stepSimulation } from '../simulation/simulationManager';
import { useSimulationStore } from '../simulation/simulationStore';

/** Performance guards: budgets are generous so the test is stable on slow CI machines. */
afterEach(async () => {
  await selectEngine('kinematic');
});

describe('physics performance', () => {
  it('ten simulated seconds of driving the Explorer Bot stay within budget', async () => {
    openExplorer(false);
    setWorkspaceMode('control');
    setSimulationScheduler(null);
    expect(await selectEngine('physics')).toBe(true);
    robotControl.drive.set(1, 'panel');
    const t0 = performance.now();
    stepSimulation(10);
    const elapsed = performance.now() - t0;
    console.info(`[perf] 10 s simulated in ${elapsed.toFixed(0)} ms`);
    robotControl.drive.set(0, 'panel');
    // 600 ticks × 4 substeps. Real-time would be 10 000 ms; require far better than that.
    expect(elapsed).toBeLessThan(3000);
    expect(activePhysicsController()!.time).toBeCloseTo(10, 1);
  });

  it('runtime state is published once per frame, not once per physics step', async () => {
    openExplorer(false);
    setWorkspaceMode('control');
    let now = 0;
    const queue: ((t: number) => void)[] = [];
    setSimulationScheduler({ request: (cb) => queue.push(cb), cancel: () => {} });
    expect(await selectEngine('physics')).toBe(true);
    let writes = 0;
    const unsubscribe = useRobotStateStore.subscribe(() => {
      writes += 1;
    });
    // 20 frames of 100 ms: each frame owes 6 ticks but runs at most 5, then publishes once.
    for (let f = 0; f < 20 && queue.length > 0; f++) {
      now += 100;
      queue.shift()!(now);
    }
    unsubscribe();
    expect(useSimulationStore.getState().state).toBe('running');
    expect(writes).toBeLessThanOrEqual(20);
    expect(activePhysicsController()!.time).toBeLessThanOrEqual(20 * 5 * (1 / 60) + 1e-6);
    setSimulationScheduler(null);
  });
});
