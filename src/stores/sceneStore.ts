import { create } from 'zustand';
import { bus } from '../core/bus/connectorBus';
import { materializeObject } from '../features/projects/materialize';
import type { RobotProject } from '../types/project';
import type { SceneObject, SceneObjectDraft, Transform } from '../types/scene';
import { createId } from '../utils/id';

/**
 * The open project's editable scene, with undo/redo history.
 *
 * Phase 1 keeps scene objects as a flat list. The Robot Builder (Phase 2)
 * adds hierarchy and joints on top of this store, not inside UI components.
 */

const HISTORY_LIMIT = 100;

interface Snapshot {
  name: string;
  objects: SceneObject[];
}

interface SceneState {
  projectId: string | null;
  projectName: string;
  objects: SceneObject[];
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  lastAction: string | null;

  loadProject: (project: RobotProject) => void;
  closeProject: () => void;
  setProjectName: (name: string) => void;
  addObject: (draft: SceneObjectDraft) => SceneObject;
  addObjects: (drafts: SceneObjectDraft[], label: string) => SceneObject[];
  updateTransform: (id: string, transform: Partial<Transform>) => void;
  renameObject: (id: string, name: string) => void;
  setVisible: (id: string, visible: boolean) => void;
  duplicateObject: (id: string) => SceneObject | null;
  removeObject: (id: string) => void;
  undo: () => string | null;
  redo: () => string | null;
  markSaved: () => void;
}

function snapshot(state: Pick<SceneState, 'projectName' | 'objects'>): Snapshot {
  return { name: state.projectName, objects: state.objects };
}

export const useSceneStore = create<SceneState>((set, get) => {
  /** Apply a change and record the previous state for undo. */
  const commit = (label: string, next: Partial<Pick<SceneState, 'projectName' | 'objects'>>) => {
    const state = get();
    set({
      ...next,
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
      lastAction: label,
    });
    bus.publish('scene.changed', { reason: label, objectCount: get().objects.length });
  };

  const mapObject = (id: string, fn: (o: SceneObject) => SceneObject) =>
    get().objects.map((o) => (o.id === id ? fn(o) : o));

  return {
    projectId: null,
    projectName: '',
    objects: [],
    past: [],
    future: [],
    dirty: false,
    lastAction: null,

    loadProject: (project) => {
      set({
        projectId: project.id,
        projectName: project.name,
        objects: structuredClone(project.objects),
        past: [],
        future: [],
        dirty: false,
        lastAction: null,
      });
      bus.publish('project.opened', { projectId: project.id, name: project.name });
    },

    closeProject: () =>
      set({ projectId: null, projectName: '', objects: [], past: [], future: [], dirty: false, lastAction: null }),

    setProjectName: (name) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === get().projectName) return;
      commit('Rename project', { projectName: trimmed });
    },

    addObject: (draft) => {
      const object = materializeObject(draft);
      commit(`Add ${object.name}`, { objects: [...get().objects, object] });
      return object;
    },

    addObjects: (drafts, label) => {
      const now = new Date().toISOString();
      const created = drafts.map((d) => materializeObject(d, now));
      commit(label, { objects: [...get().objects, ...created] });
      return created;
    },

    updateTransform: (id, transform) => {
      const target = get().objects.find((o) => o.id === id);
      if (!target) return;
      const merged: Transform = { ...target.transform, ...transform };
      const unchanged = (['position', 'rotation', 'scale'] as const).every((key) =>
        merged[key].every((v, i) => v === target.transform[key][i]),
      );
      if (unchanged) return;
      commit(`Transform ${target.name}`, {
        objects: mapObject(id, (o) => ({ ...o, transform: merged })),
      });
    },

    renameObject: (id, name) => {
      const target = get().objects.find((o) => o.id === id);
      const trimmed = name.trim();
      if (!target || !trimmed || trimmed === target.name) return;
      commit(`Rename ${target.name}`, { objects: mapObject(id, (o) => ({ ...o, name: trimmed })) });
    },

    setVisible: (id, visible) => {
      const target = get().objects.find((o) => o.id === id);
      if (!target || target.visible === visible) return;
      commit(`${visible ? 'Show' : 'Hide'} ${target.name}`, {
        objects: mapObject(id, (o) => ({ ...o, visible })),
      });
    },

    duplicateObject: (id) => {
      const target = get().objects.find((o) => o.id === id);
      if (!target) return null;
      const [x, y, z] = target.transform.position;
      const copy: SceneObject = {
        ...structuredClone(target),
        id: createId('obj'),
        name: `${target.name} Copy`,
        transform: { ...structuredClone(target.transform), position: [x + 0.1, y, z + 0.1] },
        metadata: { ...target.metadata, createdAt: new Date().toISOString() },
      };
      commit(`Duplicate ${target.name}`, { objects: [...get().objects, copy] });
      return copy;
    },

    removeObject: (id) => {
      const target = get().objects.find((o) => o.id === id);
      if (!target) return;
      commit(`Delete ${target.name}`, { objects: get().objects.filter((o) => o.id !== id) });
    },

    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return null;
      const label = state.lastAction;
      set({
        projectName: previous.name,
        objects: previous.objects,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
        lastAction: null,
      });
      bus.publish('scene.changed', { reason: 'Undo', objectCount: previous.objects.length });
      return label ?? 'last change';
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return null;
      set({
        projectName: next.name,
        objects: next.objects,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: true,
        lastAction: null,
      });
      bus.publish('scene.changed', { reason: 'Redo', objectCount: next.objects.length });
      return 'change';
    },

    markSaved: () => set({ dirty: false }),
  };
});
