/**
 * Records real evidence for tutorial checks: a program run that COMPLETED, for the open
 * project, and whether the Physics engine was active. Stopped or failed runs are not recorded.
 */
import { bus } from '../../../core/bus/connectorBus';
import { useSceneStore } from '../../../stores/sceneStore';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { useLearningStore } from '../store/learningStore';

let connected = false;

export function connectLearningEvidence(): () => void {
  if (connected) return () => undefined;
  connected = true;
  const off = bus.subscribe('codeStudio.execution', ({ programId, state }) => {
    if (state !== 'completed') return;
    const projectId = useSceneStore.getState().projectId;
    if (!projectId) return;
    useLearningStore.getState().recordRun(projectId, { programId, completedAt: new Date().toISOString(), physics: useSimulationStore.getState().engine === 'physics' });
  });
  // A deleted project takes its learning records with it.
  const offDeleted = bus.subscribe('project.deleted', ({ projectId }) => useLearningStore.getState().forgetProject(projectId));
  return () => {
    off();
    offDeleted();
    connected = false;
  };
}
