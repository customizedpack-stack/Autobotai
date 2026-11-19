import { afterEach, describe, expect, it } from 'vitest';
import { robotControl } from '../../controls/robotControlApi';
import { selectEngine } from '../../physics/simulation/simulationManager';
import { robotModel } from '../../robot-model/robotModelConnector';
import { physicsBot, stepSimulation } from './helpers';

afterEach(async () => {
  await selectEngine('kinematic');
});

describe('sensor performance', () => {
  it('a 15-ray scanner at 60 Hz plus encoders and IMU add little to the physics step', async () => {
    await physicsBot('obstacles');
    robotControl.drive.set(0.3, 'panel');
    let t0 = performance.now();
    robotModel.updateSensor('front-distance', { enabled: false });
    robotModel.updateSensor('left-encoder', { enabled: false });
    robotModel.updateSensor('right-encoder', { enabled: false });
    robotModel.updateSensor('main-imu', { enabled: false });
    t0 = performance.now();
    stepSimulation(5);
    const without = performance.now() - t0;
    for (const id of ['left-encoder', 'right-encoder', 'main-imu']) robotModel.updateSensor(id, { enabled: true });
    robotModel.updateSensor('front-distance', { enabled: true, rays: 15, fov: Math.PI / 2, rateHz: 60 });
    t0 = performance.now();
    stepSimulation(5);
    const withSensors = performance.now() - t0;
    console.info(`[perf] 5 s physics: ${without.toFixed(0)} ms without sensors, ${withSensors.toFixed(0)} ms with 15 rays @60 Hz + 2 encoders + IMU`);
    // 300 ticks: sensors (4500 ray casts) must stay far below real time (5000 ms).
    expect(withSensors).toBeLessThan(2500);
    expect(withSensors - without).toBeLessThan(1000);
  });
});
