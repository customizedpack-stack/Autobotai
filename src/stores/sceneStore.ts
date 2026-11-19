import { create } from 'zustand';
import { bus } from '../core/bus/connectorBus';
import { materializeObject } from '../features/projects/materialize';
import type { RobotActuator, RobotController } from '../types/actuator';
import type { RobotJoint } from '../types/joint';
import type { RobotProject } from '../types/project';
import type { RobotSensor } from '../types/sensor';
import type { PartPhysics, SceneObject, SceneObjectDraft, Transform } from '../types/scene';
import { createId } from '../utils/id';

/**
 * The open project's editable robot model (components + joints) with
 * undo/redo history. This is the ONE history for the editor: transforms,
 * hierarchy changes and joint edits all go through `commit`.
 *
 * Structural changes (add, remove, reparent, joints) are made through the
 * C1 Robot Model Connector (features/robot-model/robotModelConnector.ts),
 * which validates them and then calls `applyModel` here.
 */

const HISTORY_LIMIT = 100;

interface Snapshot {
  name: string;
  objects: SceneObject[];
  joints: RobotJoint[];
  actuators: RobotActuator[];
  controllers: RobotController[];
  sensors: RobotSensor[];
}

type ModelFields = Pick<SceneState, 'projectName' | 'objects' | 'joints' | 'actuators' | 'controllers' | 'sensors'>;

interface SceneState {
  projectId: string | null;
  projectName: string;
  objects: SceneObject[];
  joints: RobotJoint[];
  actuators: RobotActuator[];
  controllers: RobotController[];
  /** Phase 6: sensor configurations (saved with the project). */
  sensors: RobotSensor[];
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  lastAction: string | null;
  /** Snapshot taken when a continuous change (gizmo drag) began. */
  transientBase: Snapshot | null;

  loadProject: (project: RobotProject) => void;
  closeProject: () => void;
  setProjectName: (name: string) => void;
  /** Apply a validated model change as one undo step. Used by the C1 connector. */
  applyModel: (
    label: string,
    next: { objects?: SceneObject[]; joints?: RobotJoint[]; actuators?: RobotActuator[]; controllers?: RobotController[]; sensors?: RobotSensor[] },
  ) => void;
  addObject: (draft: SceneObjectDraft) => SceneObject;
  addObjects: (drafts: SceneObjectDraft[], label: string) => SceneObject[];
  updateTransform: (id: string, transform: Partial<Transform>) => void;
  /** Continuous transform edits (gizmo drags) collapse into ONE undo step. */
  beginTransientChange: () => void;
  previewTransform: (id: string, transform: Transform) => void;
  endTransientChange: (label: string) => void;
  renameObject: (id: string, name: string) => void;
  setVisible: (id: string, visible: boolean) => void;
  /** Phase 5: set or clear physical property overrides of a part (undoable). Pass undefined to use defaults. */
  setPartPhysics: (id: string, physics: PartPhysics | undefined) => void;
  duplicateObject: (id: string) => SceneObject | null;
  undo: () => string | null;
  redo: () => string | null;
  markSaved: () => void;
}

function snapshot(state: ModelFields): Snapshot {
  return { name: state.projectName, objects: state.objects, joints: state.joints, actuators: state.actuators, controllers: state.controllers, sensors: state.sensors };
}

function restore(s: Snapshot): Omit<ModelFields, never> {
  return { projectName: s.name, objects: s.objects, joints: s.joints, actuators: s.actuators, controllers: s.controllers, sensors: s.sensors };
}

const sameTransform = (a: Transform, b: Transform) =>
  (['position', 'rotation', 'scale'] as const).every((key) => a[key].every((v, i) => v === b[key][i]));

export const useSceneStore = create<SceneState>((set, get) => {
  /** Apply a change and record the previous state for undo. */
  const commit = (label: string, next: Partial<ModelFields>) => {
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
    joints: [],
    actuators: [],
    controllers: [],
    sensors: [],
    past: [],
    future: [],
    dirty: false,
    lastAction: null,
    transientBase: null,

    loadProject: (project) => {
      set({
        projectId: project.id,
        projectName: project.name,
        objects: structuredClone(project.objects),
        joints: structuredClone(project.joints ?? []),
        actuators: structuredClone(project.actuators ?? []),
        controllers: structuredClone(project.controllers ?? []),
        sensors: structuredClone(project.sensors ?? []),
        past: [],
        future: [],
        dirty: false,
        lastAction: null,
        transientBase: null,
      });
      bus.publish('project.opened', { projectId: project.id, name: project.name });
    },

    closeProject: () =>
      set({
        projectId: null,
        projectName: '',
        objects: [],
        joints: [],
        actuators: [],
        controllers: [],
        sensors: [],
        past: [],
        future: [],
        dirty: false,
        lastAction: null,
        transientBase: null,
      }),

    setProjectName: (name) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === get().projectName) return;
      commit('Rename project', { projectName: trimmed });
    },

    applyModel: (label, next) => commit(label, next),

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
      if (sameTransform(merged, target.transform)) return;
      commit(`Transform ${target.name}`, { objects: mapObject(id, (o) => ({ ...o, transform: merged })) });
    },

    beginTransientChange: () => {
      if (!get().transientBase) set({ transientBase: snapshot(get()) });
    },

    previewTransform: (id, transform) => {
      if (!get().transientBase) set({ transientBase: snapshot(get()) });
      set({ objects: mapObject(id, (o) => ({ ...o, transform })) });
    },

    endTransientChange: (label) => {
      const base = get().transientBase;
      if (!base) return;
      set({ transientBase: null });
      if (base.objects === get().objects) return; // nothing moved
      set({
        past: [...get().past, base].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
        lastAction: label,
      });
      bus.publish('scene.changed', { reason: label, objectCount: get().objects.length });
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
      commit(`${visible ? 'Show' : 'Hide'} ${target.name}`, { objects: mapObject(id, (o) => ({ ...o, visible })) });
    },

    setPartPhysics: (id, physics) => {
      const target = get().objects.find((o) => o.id === id);
      if (!target) return;
      const clean = physics && Object.keys(physics).length > 0 ? physics : undefined;
      if (JSON.stringify(clean ?? null) === JSON.stringify(target.physics ?? null)) return;
      commit(`Edit physics of ${target.name}`, {
        objects: mapObject(id, (o) => {
          const { physics: _old, ...rest } = o;
          void _old;
          return clean ? { ...rest, physics: clean } : rest;
        }),
      });
    },

    /** Copies the component itself (not its children or joints), next to the original. */
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

    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return null;
      const label = state.lastAction;
      set({
        ...restore(previous),
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
        ...restore(next),
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
