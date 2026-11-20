import { create } from 'zustand';
import { createId } from '../../utils/id';
import { log } from '../../utils/logger';
import { normalizeBlueprint } from './model/normalize';
import {
  HISTORY_LIMIT,
  SNAPSHOT_LIMIT,
  emptyBlueprint,
  hasUserContent,
  type Blueprint,
  type BlueprintData,
  type HistoryEvent,
} from './model/types';

/**
 * The open project's Robot Blueprint, with its own undo / redo history.
 *
 * The blueprint is separate from the robot model: blueprint edits never touch
 * the scene store, and robot model undo never touches the blueprint. Build
 * History is a log, not part of undo. Everything is saved with the project on
 * an explicit Save (local browser storage only).
 */

const UNDO_LIMIT = 100;

export type HistoryInput = Omit<HistoryEvent, 'id' | 'timestamp'>;

interface BlueprintState {
  projectId: string | null;
  blueprint: Blueprint;
  /** The project had a stored `blueprint` field when it was opened. */
  stored: boolean;
  past: { label: string; data: BlueprintData }[];
  future: { label: string; data: BlueprintData }[];
  dirty: boolean;
  /** Entries dropped by the load-time migration. */
  droppedOnLoad: number;

  load: (projectId: string, raw: unknown) => void;
  close: () => void;
  /** Apply one blueprint edit as one undo step and record its history events. */
  apply: (label: string, next: BlueprintData, events?: HistoryInput[]) => void;
  /** Append to Build History only (no undo step). */
  record: (events: HistoryInput[]) => void;
  undo: () => string | null;
  redo: () => string | null;
  createSnapshot: (label: string) => void;
  restoreSnapshot: (snapshotId: string) => boolean;
  markSaved: () => void;
}

export function dataOf(b: Blueprint | BlueprintData): BlueprintData {
  return { mappings: b.mappings, hardware: b.hardware, bomExtras: b.bomExtras, wiring: b.wiring, guide: b.guide, bomGeneratedAt: b.bomGeneratedAt };
}

const stamp = (events: HistoryInput[], now: string): HistoryEvent[] => events.map((e) => ({ ...e, id: createId('bhe'), timestamp: now }));

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
  projectId: null,
  blueprint: emptyBlueprint(new Date(0).toISOString()),
  stored: false,
  past: [],
  future: [],
  dirty: false,
  droppedOnLoad: 0,

  load: (projectId, raw) => {
    const now = new Date().toISOString();
    const { blueprint, dropped } = normalizeBlueprint(raw, now);
    if (dropped > 0) log.warning('blueprint', `Blueprint: ${dropped} invalid saved entr${dropped === 1 ? 'y was' : 'ies were'} skipped while loading.`);
    if (blueprint.history.length === 0) blueprint.history = stamp([{ type: 'blueprint.created', component: 'Robot Blueprint', previous: '', next: '', note: raw ? 'Blueprint loaded.' : 'Blueprint started for this project.' }], now);
    set({ projectId, blueprint, stored: raw !== undefined && raw !== null, past: [], future: [], dirty: false, droppedOnLoad: dropped });
  },

  close: () => set({ projectId: null, blueprint: emptyBlueprint(new Date(0).toISOString()), stored: false, past: [], future: [], dirty: false, droppedOnLoad: 0 }),

  apply: (label, next, events = []) => {
    const state = get();
    if (!state.projectId) return;
    const now = new Date().toISOString();
    set({
      blueprint: { ...state.blueprint, ...next, history: [...state.blueprint.history, ...stamp(events, now)].slice(-HISTORY_LIMIT) },
      past: [...state.past, { label, data: dataOf(state.blueprint) }].slice(-UNDO_LIMIT),
      future: [],
      dirty: true,
    });
  },

  record: (events) => {
    const state = get();
    if (!state.projectId || events.length === 0) return;
    set({ blueprint: { ...state.blueprint, history: [...state.blueprint.history, ...stamp(events, new Date().toISOString())].slice(-HISTORY_LIMIT) } });
  },

  undo: () => {
    const state = get();
    const last = state.past.at(-1);
    if (!last) return null;
    const now = new Date().toISOString();
    set({
      blueprint: { ...state.blueprint, ...last.data, history: [...state.blueprint.history, ...stamp([{ type: 'undo', component: 'Blueprint', previous: '', next: '', note: `Undo: ${last.label}` }], now)].slice(-HISTORY_LIMIT) },
      past: state.past.slice(0, -1),
      future: [{ label: last.label, data: dataOf(state.blueprint) }, ...state.future].slice(0, UNDO_LIMIT),
      dirty: true,
    });
    return last.label;
  },

  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!next) return null;
    const now = new Date().toISOString();
    set({
      blueprint: { ...state.blueprint, ...next.data, history: [...state.blueprint.history, ...stamp([{ type: 'redo', component: 'Blueprint', previous: '', next: '', note: `Redo: ${next.label}` }], now)].slice(-HISTORY_LIMIT) },
      past: [...state.past, { label: next.label, data: dataOf(state.blueprint) }].slice(-UNDO_LIMIT),
      future: state.future.slice(1),
      dirty: true,
    });
    return next.label;
  },

  createSnapshot: (label) => {
    const state = get();
    if (!state.projectId) return;
    const now = new Date().toISOString();
    const name = label.trim().slice(0, 80) || `Version ${state.blueprint.snapshots.length + 1}`;
    set({
      blueprint: {
        ...state.blueprint,
        snapshots: [...state.blueprint.snapshots, { id: createId('bps'), label: name, createdAt: now, data: structuredClone(dataOf(state.blueprint)) }].slice(-SNAPSHOT_LIMIT),
        history: [...state.blueprint.history, ...stamp([{ type: 'snapshot.created', component: 'Blueprint', previous: '', next: name, note: '' }], now)].slice(-HISTORY_LIMIT),
      },
      dirty: true,
    });
  },

  restoreSnapshot: (snapshotId) => {
    const state = get();
    const snap = state.blueprint.snapshots.find((s) => s.id === snapshotId);
    if (!snap) return false;
    // Restoring only replaces blueprint data (mappings, wiring, BOM extras, guide). The robot model is never changed.
    get().apply(`Restore "${snap.label}"`, structuredClone(snap.data), [{ type: 'snapshot.restored', component: 'Blueprint', previous: '', next: snap.label, note: 'Blueprint data restored; the 3D robot model was not changed.' }]);
    return true;
  },

  markSaved: () => set({ dirty: false, stored: get().stored || hasUserContent(get().blueprint) }),
}));

/** What to store on the project: undefined keeps old projects without a blueprint field. */
export function blueprintForSave(): Blueprint | undefined {
  const { blueprint, stored, projectId } = useBlueprintStore.getState();
  if (!projectId) return undefined;
  return stored || hasUserContent(blueprint) ? structuredClone(blueprint) : undefined;
}
