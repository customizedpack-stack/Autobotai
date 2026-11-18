import { bus, type BusEnvelope } from '../../core/bus/connectorBus';
import { useProjectStore } from '../../stores/projectStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { endControlSession, setWorkspaceMode } from './controlSession';
import { setScheduler } from './movementEngine';

/** Test helpers: a fresh Explorer Bot in Control Mode with a manual (stepped) engine clock. */
export const recorded: BusEnvelope[] = [];
bus.tap((e) => recorded.push(e));

export function openExplorer(control = true, templateId = 'explorer-bot') {
  localStorage.clear();
  useProjectStore.setState({ projects: {} });
  endControlSession();
  useSceneStore.getState().closeProject();
  useSelectionStore.setState({ selectedId: null, selectedJointId: null, hoveredId: null });
  setScheduler(null);
  useRobotStateStore.getState().setSpeedPercent(50);
  const project = useProjectStore.getState().createProject({ name: 'Drive Bot', category: 'mobile', templateId });
  useSceneStore.getState().loadProject(project);
  if (control) setWorkspaceMode('control');
  recorded.length = 0;
  return project;
}

export const byName = (name: string) => useSceneStore.getState().objects.find((o) => o.name === name)!;
export const jointByName = (name: string) => useSceneStore.getState().joints.find((j) => j.name === name)!;
export const events = (channel: string) => recorded.filter((e) => e.channel === channel).map((e) => e.payload as Record<string, unknown>);
