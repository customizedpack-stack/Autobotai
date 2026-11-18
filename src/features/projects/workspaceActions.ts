import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { SceneObjectDraft } from '../../types/scene';
import { log } from '../../utils/logger';
import { restingHeight } from '../../utils/math';
import { findComponent } from '../component-library/catalog';
import { findTemplate } from '../robot-library/templates';

/**
 * Editor commands. UI components call these instead of touching several
 * stores themselves, so the same commands can later be triggered by
 * keyboard shortcuts, code (Phase 4) or the AI layer (Phase J).
 */

export function saveCurrentProject(): boolean {
  const scene = useSceneStore.getState();
  if (!scene.projectId) return false;
  const saved = useProjectStore
    .getState()
    .saveProject(scene.projectId, { name: scene.projectName, objects: scene.objects });
  if (!saved) {
    log.error('storage', 'Save failed: project not found in local drafts.');
    return false;
  }
  scene.markSaved();
  log.success('storage', `Saved "${saved.name}" as a local draft in this browser (${saved.objects.length} objects).`);
  return true;
}

export function undo(): void {
  const label = useSceneStore.getState().undo();
  if (label) log.info('scene', `Undo: ${label}.`);
  pruneSelection();
}

export function redo(): void {
  const label = useSceneStore.getState().redo();
  if (label) log.info('scene', 'Redo.');
  pruneSelection();
}

/** Clear the selection if the selected object no longer exists. */
function pruneSelection(): void {
  const { selectedId, select } = useSelectionStore.getState();
  if (selectedId && !useSceneStore.getState().objects.some((o) => o.id === selectedId)) select(null);
}

export function addComponent(componentId: string): void {
  const component = findComponent(componentId);
  if (!component) {
    log.error('library', `Unknown component "${componentId}".`);
    return;
  }
  const rotation = component.rotation ?? [0, 0, 0];
  const lying = rotation[0] !== 0;
  const height =
    lying && component.geometry.shape === 'cylinder' ? component.geometry.radius : restingHeight(component.geometry);
  const draft: SceneObjectDraft = {
    name: component.name,
    category: component.category,
    geometry: structuredClone(component.geometry),
    color: component.color,
    transform: { position: [0, height, 0], rotation: [...rotation], scale: [1, 1, 1] },
    componentId: component.id,
    description: `${component.description} Placeholder primitive; becomes functional in ${component.functionalIn}.`,
  };
  const object = useSceneStore.getState().addObject(draft);
  useSelectionStore.getState().select(object.id);
  log.info('library', `Added "${object.name}" at the scene origin.`);
}

/** Insert a starter robot's parts into the current scene, offset to the side. */
export function insertTemplate(templateId: string): void {
  const template = findTemplate(templateId);
  if (!template) return;
  const drafts = template.build().map((draft) => ({
    ...draft,
    transform: {
      ...draft.transform,
      position: [draft.transform.position[0], draft.transform.position[1], draft.transform.position[2] + 0.8] as [
        number,
        number,
        number,
      ],
    },
  }));
  useSceneStore.getState().addObjects(drafts, `Insert ${template.name}`);
  log.info('library', `Inserted ${drafts.length} parts of "${template.name}" (offset 0.8 m on Z).`);
}

export function deleteSelected(): void {
  const { selectedId, select } = useSelectionStore.getState();
  if (!selectedId) return;
  const object = useSceneStore.getState().objects.find((o) => o.id === selectedId);
  useSceneStore.getState().removeObject(selectedId);
  select(null);
  if (object) log.warning('scene', `Deleted "${object.name}".`);
}

export function duplicateSelected(): void {
  const { selectedId, select } = useSelectionStore.getState();
  if (!selectedId) return;
  const copy = useSceneStore.getState().duplicateObject(selectedId);
  if (copy) {
    select(copy.id);
    log.info('scene', `Duplicated as "${copy.name}".`);
  }
}
