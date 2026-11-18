import { create } from 'zustand';
import { bus } from '../core/bus/connectorBus';

/**
 * What is selected in the editor: one component OR one joint (never both).
 * Viewport, Objects tree and inspector all read this store.
 */
interface SelectionState {
  selectedId: string | null;
  selectedJointId: string | null;
  hoveredId: string | null;
  select: (id: string | null) => void;
  selectJoint: (id: string | null) => void;
  clear: () => void;
  hover: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedId: null,
  selectedJointId: null,
  hoveredId: null,
  select: (id) => {
    const { selectedId, selectedJointId } = get();
    if (selectedId === id && selectedJointId === null) return;
    set({ selectedId: id, selectedJointId: null });
    bus.publish('selection.changed', { objectId: id });
  },
  selectJoint: (id) => {
    if (get().selectedJointId === id && get().selectedId === null) return;
    set({ selectedJointId: id, selectedId: null });
    bus.publish('selection.changed', { objectId: null });
  },
  clear: () => {
    if (get().selectedId === null && get().selectedJointId === null) return;
    set({ selectedId: null, selectedJointId: null });
    bus.publish('selection.changed', { objectId: null });
  },
  hover: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },
}));
