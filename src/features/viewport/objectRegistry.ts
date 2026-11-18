import type { Object3D } from 'three';

/**
 * Maps component ids to their rendered Three.js groups, so viewport tools
 * (transform gizmo, picking) can find the live object without searching the
 * scene graph. Only the viewport writes to it.
 */
const registry = new Map<string, Object3D>();
const listeners = new Set<() => void>();

export const objectRegistry = {
  set(id: string, object: Object3D | null): void {
    if (object) registry.set(id, object);
    else registry.delete(id);
    for (const listener of listeners) listener();
  },
  get(id: string | null): Object3D | undefined {
    return id ? registry.get(id) : undefined;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Set by the viewport's picking bridge; used by the drop handler outside the Canvas. */
export interface ViewportPicker {
  pick: (clientX: number, clientY: number) => import('../builder/placement').PickHit | null;
}

let picker: ViewportPicker | null = null;
export const viewportPicker = {
  register(p: ViewportPicker | null): void {
    picker = p;
  },
  pick(clientX: number, clientY: number) {
    return picker?.pick(clientX, clientY) ?? null;
  },
};

/** True while, or just after, the transform gizmo is used; the viewport then ignores that click for deselection. */
export const gizmoInteraction = { active: false, until: 0 };
