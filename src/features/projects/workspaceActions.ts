import { redoEnvironment, undoEnvironment } from '../environment/store/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { log } from '../../utils/logger';
import { componentDraft, componentRestOffset, computeDropPlacement, type PickHit } from '../builder/placement';
import { findComponent } from '../component-library/catalog';
import { robotModel } from '../robot-model/robotModelConnector';
import { findTemplate } from '../robot-library/templates';
import { materializeTemplate } from './materialize';

/**
 * Editor commands. UI components call these instead of touching several
 * stores themselves, so the same commands can be triggered by buttons,
 * keyboard shortcuts, code (Phase 4) or the AI layer (Phase J).
 * Structural changes go through the C1 Robot Model Connector.
 */

export function saveCurrentProject(): boolean {
  const scene = useSceneStore.getState();
  if (!scene.projectId) return false;
  const saved = useProjectStore
    .getState()
    .saveProject(scene.projectId, {
      name: scene.projectName,
      objects: scene.objects,
      joints: scene.joints,
      actuators: scene.actuators,
      controllers: scene.controllers,
      sensors: scene.sensors,
    });
  if (!saved) {
    log.error('storage', 'Save failed: project not found in local drafts.');
    return false;
  }
  scene.markSaved();
  log.success(
    'storage',
    `Saved "${saved.name}" as a local draft in this browser (${saved.objects.length} components, ${saved.joints.length} joints, ${saved.actuators.length} actuators).`,
  );
  return true;
}

export function undo(): void {
  if (useRobotStateStore.getState().mode === 'environment') {
    const envLabel = undoEnvironment();
    if (envLabel) log.info('environment', `Undo: ${envLabel}.`);
    return;
  }
  const label = useSceneStore.getState().undo();
  if (label) log.info('scene', `Undo: ${label}.`);
  pruneSelection();
}

export function redo(): void {
  if (useRobotStateStore.getState().mode === 'environment') {
    if (redoEnvironment()) log.info('environment', 'Redo.');
    return;
  }
  const label = useSceneStore.getState().redo();
  if (label) log.info('scene', 'Redo.');
  pruneSelection();
}

/** Clear the selection if the selected component or joint no longer exists. */
function pruneSelection(): void {
  const { selectedId, selectedJointId, clear } = useSelectionStore.getState();
  const { objects, joints } = useSceneStore.getState();
  if (selectedId && !objects.some((o) => o.id === selectedId)) clear();
  if (selectedJointId && !joints.some((j) => j.id === selectedJointId)) clear();
}

function editingLocked(): boolean {
  const { mode } = useRobotStateStore.getState();
  if (mode === 'build') return false;
  log.warning('scene', `Editing is locked in ${mode === 'code' ? 'Code Studio' : 'Control Mode'}. Switch to Build Mode to change the robot.`);
  return true;
}

/** Add a catalog component at the scene origin, resting on the ground. */
export function addComponent(componentId: string): void {
  if (editingLocked()) return;
  const component = findComponent(componentId);
  if (!component) {
    log.error('library', `Unknown component "${componentId}".`);
    return;
  }
  const result = robotModel.addComponent(componentDraft(component, [0, componentRestOffset(component), 0]));
  if (!result.ok) return;
  useSelectionStore.getState().select(result.value.id);
  log.info('library', `Added "${result.value.name}" at the scene origin.`);
}

/** Place a dragged catalog component where it was dropped; attach it to the component it was dropped on. */
export function placeComponent(componentId: string, hit: PickHit): void {
  if (editingLocked()) return;
  const component = findComponent(componentId);
  if (!component) {
    log.error('library', `Unknown component "${componentId}".`);
    return;
  }
  const { objects } = useSceneStore.getState();
  const { parentId, world } = computeDropPlacement(component, hit, objects);
  const draft = { ...componentDraft(component, world.position), transform: world };
  const result = robotModel.addComponent(draft, { parentId, worldTransform: true });
  if (!result.ok) return;
  useSelectionStore.getState().select(result.value.id);
  const parentName = parentId ? objects.find((o) => o.id === parentId)?.name : null;
  log.info('library', parentName ? `Placed "${result.value.name}" on "${parentName}" and attached it.` : `Placed "${result.value.name}" on the ground.`);
}

/** Insert a starter robot's parts (with hierarchy and joints) into the current scene, offset to the side. */
export function insertTemplate(templateId: string): void {
  const template = findTemplate(templateId);
  if (!template) return;
  const drafts = template.build().map((draft) => ({
    ...draft,
    transform: {
      ...draft.transform,
      position: [draft.transform.position[0], draft.transform.position[1], draft.transform.position[2] + 0.8] as [number, number, number],
    },
  }));
  const jointDrafts = (template.joints?.() ?? []).map((j) =>
    j.originWorld ? { ...j, originWorld: [j.originWorld[0], j.originWorld[1], j.originWorld[2] + 0.8] as [number, number, number] } : j,
  );
  const { objects, joints } = materializeTemplate(drafts, jointDrafts);
  const result = robotModel.insertAssembly(objects, joints, `Insert ${template.name}`);
  if (result.ok) log.info('library', `Inserted ${objects.length} parts and ${joints.length} joints of "${template.name}" (offset 0.8 m on Z).`);
}

/** Delete the selected joint, or the selected component (its children move up to its parent). */
export function deleteSelected(): void {
  if (editingLocked()) return;
  const { selectedId, selectedJointId, clear } = useSelectionStore.getState();
  if (selectedJointId) {
    if (robotModel.deleteJoint(selectedJointId).ok) clear();
    return;
  }
  if (!selectedId) return;
  const name = useSceneStore.getState().objects.find((o) => o.id === selectedId)?.name ?? 'component';
  const result = robotModel.removeComponent(selectedId);
  if (!result.ok) return;
  clear();
  const { reparented, removedJoints } = result.value;
  const extra = [
    reparented.length ? `${reparented.length} attached part(s) moved up one level` : '',
    removedJoints.length ? `${removedJoints.length} joint(s) removed` : '',
  ]
    .filter(Boolean)
    .join(', ');
  log.warning('scene', `Deleted "${name}"${extra ? ` (${extra})` : ''}.`);
}

export function duplicateSelected(): void {
  if (editingLocked()) return;
  const { selectedId, select } = useSelectionStore.getState();
  if (!selectedId) return;
  const copy = useSceneStore.getState().duplicateObject(selectedId);
  if (copy) {
    select(copy.id);
    log.info('scene', `Duplicated as "${copy.name}".`);
  }
}
