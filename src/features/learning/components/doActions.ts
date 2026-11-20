/**
 * "Do" buttons in tutorials call the SAME functions as the real controls
 * (mode buttons, Simulate, Inspector → Camera, Code Studio → New program, the environment menu).
 */
import { setWorkspaceMode } from '../../controls/controlSession';
import { createProgram } from '../../code-studio/programActions';
import { programsForProject, uniqueProgramName, useProgramStore } from '../../code-studio/storage/programStore';
import { robotModel } from '../../robot-model/robotModelConnector';
import { selectEngine, setEnvironment } from '../../physics/simulation/simulationManager';
import { resolveEnvironment } from '../../environment/store/environmentStore';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import type { DoAction, ProjectDefinition } from '../model/types';

/** Runs one Do action. Returns a short message for the learner. */
export function runDoAction(action: DoAction, def: ProjectDefinition): string {
  if (action.environmentId) {
    setEnvironment(action.environmentId);
    return `Environment: ${resolveEnvironment(action.environmentId).name}. Click Simulate to test in it.`;
  }
  if (action.addCamera) {
    if (useRobotStateStore.getState().mode !== 'build') setWorkspaceMode('build');
    const result = robotModel.addCamera();
    return result.ok ? `Added camera "${result.value.name}". Undo with Ctrl+Z if you want to place it yourself.` : `Camera not added: ${result.errors.join(' ')}`;
  }
  if (action.insertProgram) {
    const starter = def.setup.program;
    const projectId = useSceneStore.getState().projectId;
    if (!starter || !projectId) return 'This project has no starter program.';
    if (useRobotStateStore.getState().mode !== 'code') setWorkspaceMode('code');
    const name = uniqueProgramName(useProgramStore.getState().programs, projectId, starter.name);
    const program = createProgram('javascript', name, starter.source);
    if (!program) return 'The starter program could not be added (see the Console).';
    const count = programsForProject(useProgramStore.getState().programs, projectId).length;
    return `Added "${program.name}" as a new saved program (${count} in this project). Read it, then Run it.`;
  }
  if (action.physics) {
    const mode = useRobotStateStore.getState().mode;
    if (mode !== 'control' && mode !== 'code') setWorkspaceMode('control');
    void selectEngine('physics');
    return 'Physics engine selected (Simulate).';
  }
  if (action.mode) {
    setWorkspaceMode(action.mode);
    return '';
  }
  return '';
}
