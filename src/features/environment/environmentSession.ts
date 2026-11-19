import { bus } from '../../core/bus/connectorBus';
import { useProjectStore } from '../../stores/projectStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useViewportStore } from '../../stores/viewportStore';
import { log } from '../../utils/logger';
import { setWorkspaceMode } from '../controls/controlSession';
import { selectEngine, setEnvironment, stopSimulation } from '../physics/simulation/simulationManager';
import { useSimulationStore } from '../physics/simulation/simulationStore';
import { validateEnvironment } from './config/environmentConfig';
import { isTemplateId } from './config/templates';
import { environmentExists, openEnvironment, saveEnvironment, useEnvironmentStore, type EnvResult } from './store/environmentStore';

/**
 * Edit Mode ↔ Test Mode, and the link between projects and environments (Phase 7).
 *
 * Edit Mode = the Environment workspace mode: physics is off (leaving Control Mode or
 * Code Studio always stops the simulation), so editing can never touch a live world.
 * Test Mode = Control Mode with the Physics engine running the SAVED environment.
 * Every start builds a fresh world from the saved definition; Stop disposes it.
 */

/** Save the open environment, select it, and run the robot in it with the Physics engine. */
export async function testEnvironment(): Promise<EnvResult<string>> {
  const draft = useEnvironmentStore.getState().draft;
  if (!draft) return { ok: false, errors: ['Open or create an environment first.'] };
  const problems = validateEnvironment(draft);
  if (problems.length) {
    log.error('environment', `Cannot test "${draft.name}": ${problems.join(' ')}`);
    return { ok: false, errors: problems };
  }
  const saved = saveEnvironment();
  if (!saved.ok) return saved;
  setEnvironment(saved.value.id);
  setWorkspaceMode('control');
  const started = await selectEngine('physics');
  if (!started) return { ok: false, errors: [useSimulationStore.getState().error ?? 'The physics simulation could not start.'] };
  log.info('environment', `Test Mode: the robot runs in "${saved.value.name}". Stop the simulation or click Edit environment to return to editing.`);
  return { ok: true, value: saved.value.id };
}

/** Back to Edit Mode for the environment the simulation uses (stops the simulation first). */
export function editCurrentEnvironment(): void {
  stopSimulation('Back to the Environment Editor. The robot is back in its design pose.');
  const id = useSimulationStore.getState().settings.environment;
  setWorkspaceMode('environment');
  const draft = useEnvironmentStore.getState().draft;
  if (draft?.id === id) return;
  if (!isTemplateId(id) || !draft) openEnvironment(id);
}

let connected = false;

export function connectEnvironmentSession(): void {
  if (connected) return;
  connected = true;
  // A project opens with the environment it used last (unknown or deleted → the empty environment).
  bus.subscribe('project.opened', ({ projectId }) => {
    const id = useProjectStore.getState().projects[projectId]?.environmentId;
    setEnvironment(id && environmentExists(id) ? id : 'floor');
  });
  // The project remembers the chosen environment (not part of the robot undo history).
  bus.subscribe('simulation.environmentChanged', ({ environmentId }) => {
    const projectId = useSceneStore.getState().projectId;
    if (projectId) useProjectStore.getState().setProjectEnvironment(projectId, environmentId);
  });
  bus.subscribe('environment.changed', ({ environmentId, change }) => {
    if (change === 'deleted' && useSimulationStore.getState().settings.environment === environmentId) setEnvironment('floor');
  });
  // Opening an environment in the editor frames it, so its objects are in view (a template
  // like the Basic Test Arena is several meters wide; the camera was framed on the robot).
  bus.subscribe('environment.opened', () => {
    if (isEditingEnvironment()) useViewportStore.getState().requestFrame();
  });
  // Entering the Environment Editor with nothing open: open the project's saved environment, if any.
  bus.subscribe('robot.modeChanged', ({ mode }) => {
    if (mode !== 'environment' || useEnvironmentStore.getState().draft) return;
    const id = useSimulationStore.getState().settings.environment;
    if (!isTemplateId(id) && environmentExists(id)) openEnvironment(id);
  });
}

connectEnvironmentSession();

/** True while the Environment Editor (Edit Mode) is open. */
export const isEditingEnvironment = () => useRobotStateStore.getState().mode === 'environment';
