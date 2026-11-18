import { create } from 'zustand';
import { bus } from '../core/bus/connectorBus';
import type { ActiveView, CameraView, ViewRequest } from '../types/viewport';

interface ViewportState {
  activeView: ActiveView;
  viewRequest: ViewRequest | null;
  /** Increments when the camera should frame all objects. */
  frameRequest: number;
  showGrid: boolean;
  showAxes: boolean;
  showShadows: boolean;
  requestView: (view: CameraView) => void;
  requestFrame: () => void;
  markCustomView: () => void;
  toggleGrid: () => void;
  toggleAxes: () => void;
  toggleShadows: () => void;
}

let requestCounter = 0;

export const useViewportStore = create<ViewportState>((set, get) => ({
  activeView: 'perspective',
  viewRequest: null,
  frameRequest: 0,
  showGrid: true,
  showAxes: true,
  showShadows: true,
  requestView: (view) => {
    requestCounter += 1;
    set({ activeView: view, viewRequest: { view, id: requestCounter } });
    bus.publish('viewport.viewChanged', { view });
  },
  requestFrame: () => set({ frameRequest: get().frameRequest + 1 }),
  markCustomView: () => {
    if (get().activeView !== 'custom') set({ activeView: 'custom' });
  },
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleAxes: () => set({ showAxes: !get().showAxes }),
  toggleShadows: () => set({ showShadows: !get().showShadows }),
}));
