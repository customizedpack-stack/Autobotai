import { create } from 'zustand';
import { bus } from '../core/bus/connectorBus';

interface SelectionState {
  selectedId: string | null;
  hoveredId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedId: null,
  hoveredId: null,
  select: (id) => {
    if (get().selectedId === id) return;
    set({ selectedId: id });
    bus.publish('selection.changed', { objectId: id });
  },
  hover: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },
}));
