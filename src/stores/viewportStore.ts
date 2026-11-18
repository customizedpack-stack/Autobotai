import { create } from 'zustand';
import { bus } from '../core/bus/connectorBus';
import type { Vec3 } from '../types/scene';
import type { ActiveView, CameraView, ViewRequest } from '../types/viewport';

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'local' | 'world';

/** Live preview while a library component is dragged over the viewport. */
export interface DropPreview {
  componentId: string;
  /** World position where the component would be placed. */
  position: Vec3;
  rotation: Vec3;
  /** Component it would attach to, or null for the ground. */
  parentId: string | null;
}

interface ViewportState {
  activeView: ActiveView;
  viewRequest: ViewRequest | null;
  /** Increments when the camera should frame all objects. */
  frameRequest: number;
  showGrid: boolean;
  showAxes: boolean;
  showShadows: boolean;
  showJoints: boolean;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  snap: boolean;
  /** Catalog component currently being dragged from the library, if any. */
  draggingComponentId: string | null;
  dropPreview: DropPreview | null;
  requestView: (view: CameraView) => void;
  requestFrame: () => void;
  /** Record which view the camera settled in (no camera move is requested). */
  setActiveView: (view: ActiveView) => void;
  toggleGrid: () => void;
  toggleAxes: () => void;
  toggleShadows: () => void;
  toggleJoints: () => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleTransformSpace: () => void;
  toggleSnap: () => void;
  setDraggingComponent: (id: string | null) => void;
  setDropPreview: (preview: DropPreview | null) => void;
}

let requestCounter = 0;

export const useViewportStore = create<ViewportState>((set, get) => ({
  activeView: 'perspective',
  viewRequest: null,
  frameRequest: 0,
  showGrid: true,
  showAxes: true,
  showShadows: true,
  showJoints: true,
  transformMode: 'translate',
  transformSpace: 'world',
  snap: false,
  draggingComponentId: null,
  dropPreview: null,
  requestView: (view) => {
    requestCounter += 1;
    set({ activeView: view, viewRequest: { view, id: requestCounter } });
    bus.publish('viewport.viewChanged', { view });
  },
  requestFrame: () => set({ frameRequest: get().frameRequest + 1 }),
  setActiveView: (view) => {
    if (get().activeView !== view) set({ activeView: view });
  },
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleAxes: () => set({ showAxes: !get().showAxes }),
  toggleShadows: () => set({ showShadows: !get().showShadows }),
  toggleJoints: () => set({ showJoints: !get().showJoints }),
  setTransformMode: (transformMode) => set({ transformMode }),
  toggleTransformSpace: () => set({ transformSpace: get().transformSpace === 'world' ? 'local' : 'world' }),
  toggleSnap: () => set({ snap: !get().snap }),
  setDraggingComponent: (draggingComponentId) => set({ draggingComponentId, dropPreview: draggingComponentId ? get().dropPreview : null }),
  setDropPreview: (dropPreview) => set({ dropPreview }),
}));
