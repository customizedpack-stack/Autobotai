import { setWorkspaceMode } from '../../controls/controlSession';
import { openExplorer } from '../../controls/testUtils';
import { selectEngine, setEnvironment, setSimulationScheduler, stepSimulation } from '../../physics/simulation/simulationManager';
import type { EnvironmentId } from '../../physics/engine/environments';
import { readSensor } from '../core/sensorManager';
import type { DistanceReading, EncoderReading, ImuReading } from '../core/sensorTypes';

/** A fresh Explorer Bot running on the physics engine with a manual clock. */
export async function physicsBot(environment: EnvironmentId = 'floor', configure?: () => void) {
  openExplorer(false);
  configure?.();
  setWorkspaceMode('control');
  setSimulationScheduler(null);
  await selectEngine('physics');
  setEnvironment(environment);
  stepSimulation(1);
}

export const distance = (id = 'front-distance') => readSensor(id) as DistanceReading;
export const encoder = (id: string) => readSensor(id) as EncoderReading;
export const imu = (id = 'main-imu') => readSensor(id) as ImuReading;
export { stepSimulation };
