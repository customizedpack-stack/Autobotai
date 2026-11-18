/**
 * Scene object model.
 *
 * This is the first slice of the platform's canonical robot data model.
 * Phase 1 keeps it to primitive placeholder objects; Phase 2 (Robot Builder)
 * extends it with parent-child attachment, joints and component properties.
 *
 * Coordinate convention (Phase 1): Y is up, units are meters, rotations are
 * stored in radians (the UI may display degrees).
 */

export type Vec3 = [number, number, number];

export interface Transform {
  position: Vec3;
  /** Euler rotation in radians, XYZ order. */
  rotation: Vec3;
  scale: Vec3;
}

export type ComponentCategory =
  | 'body'
  | 'chassis'
  | 'wheel'
  | 'motor'
  | 'sensor'
  | 'joint'
  | 'other';

export type PrimitiveGeometry =
  | { shape: 'box'; size: Vec3 }
  | { shape: 'cylinder'; radius: number; height: number }
  | { shape: 'sphere'; radius: number }
  | { shape: 'capsule'; radius: number; length: number }
  | { shape: 'cone'; radius: number; height: number };

export type PrimitiveShape = PrimitiveGeometry['shape'];

export interface SceneObjectMetadata {
  /** Catalog component this object was created from, if any. */
  componentId: string | null;
  /** Free-form description shown in the inspector. */
  description: string;
  createdAt: string;
}

export interface SceneObject {
  id: string;
  name: string;
  category: ComponentCategory;
  geometry: PrimitiveGeometry;
  color: string;
  transform: Transform;
  visible: boolean;
  /** Reserved for Phase 2 hierarchy. Always null in Phase 1. */
  parentId: string | null;
  metadata: SceneObjectMetadata;
}

/** A new object before it receives an id and timestamps. */
export type SceneObjectDraft = Omit<SceneObject, 'id' | 'metadata' | 'visible' | 'parentId'> & {
  componentId?: string | null;
  description?: string;
};
