import type { EnvironmentDefinition, EnvironmentObject, EnvironmentObjectKind, ObstacleShape } from '../../../types/environment';
import type { Vec3 } from '../../../types/scene';
import { setWorkspaceMode } from '../../controls/controlSession';
import { openExplorer } from '../../controls/testUtils';
import { selectEngine, setEnvironment, setSimulationScheduler, stepSimulation } from '../../physics/simulation/simulationManager';
import { defaultObject } from '../config/environmentConfig';
import { useEnvironmentStore } from '../store/environmentStore';

let n = 0;
/** An environment object with defaults, overridden by `patch`. */
export function object(kind: EnvironmentObjectKind, patch: Partial<EnvironmentObject> & { position: Vec3 }, shape?: ObstacleShape): EnvironmentObject {
  n += 1;
  return { ...defaultObject(kind, shape), id: `env_t${n}`, name: `${kind} ${n}`, ...patch } as EnvironmentObject;
}

/** Save an environment directly into the store (as if the user had saved it). */
export function saveEnv(objects: EnvironmentObject[], id = 'envd_test'): EnvironmentDefinition {
  const env: EnvironmentDefinition = { id, name: 'Test Env', version: 1, templateId: null, objects, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  useEnvironmentStore.setState({ environments: { ...useEnvironmentStore.getState().environments, [id]: env } });
  return env;
}

/** Explorer Bot on the physics engine inside a saved custom environment. */
export async function botIn(objects: EnvironmentObject[], settle = 1) {
  openExplorer(false);
  const env = saveEnv(objects);
  setWorkspaceMode('control');
  setSimulationScheduler(null);
  setEnvironment(env.id);
  await selectEngine('physics');
  stepSimulation(settle);
  return env;
}

export const ground = (patch: Partial<EnvironmentObject> = {}) => object('ground', { position: [0, -0.05, 0], size: [8, 0.1, 8], ...patch });
