import type { Object3D } from 'three';

/**
 * Three.js layer for robot cameras (Phase 8). Camera renders use ONLY this layer, so they
 * show real things (robot parts, environment objects, lights and the floor) and never the
 * editor helpers on the default layer: grid, gizmos, joint arrows, selection outlines,
 * sensor rays or the physics debug view. The main viewport camera keeps layer 0 and does
 * not see objects that are on the camera layer only (the camera floor).
 */
export const CAMERA_LAYER = 5;

/** Ref callback for meshes and lights that robot cameras should see (runs when the object is created). */
export const visibleToCameras = (object: Object3D | null): void => {
  object?.layers.enable(CAMERA_LAYER);
};
