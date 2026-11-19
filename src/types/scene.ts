/**
 * Scene object (robot component) model, schema v2.
 *
 * Components form a tree through `parentId`. A component's `transform` is
 * LOCAL: relative to its parent's frame, or to the world when it is a root.
 * World transforms are always derived (see features/robot-model/transforms).
 *
 * Coordinate convention: Y is up, units are meters, rotations are stored in
 * radians as XYZ Euler angles (the UI may display degrees).
 */

export type Vec3 = [number, number, number];

/** Local transform relative to the parent component (or the world for a root). */
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

/**
 * Optional physical properties of a component (Phase 5). Every field is optional:
 * missing values use defaults derived from the component's category and size
 * (see features/physics/materials.ts). Stored with the project; schema v3 is unchanged
 * because older projects simply have no `physics` field.
 */
export interface PartPhysics {
  /** Mass in kilograms. When absent, mass = density × volume. */
  mass?: number;
  /** Density in kg/m³ (used when `mass` is absent). */
  density?: number;
  /** Coulomb friction coefficient (0 … 2). */
  friction?: number;
  /** Restitution (bounciness, 0 … 1). */
  restitution?: number;
  /** false = the part has mass but no collision shape. */
  collision?: boolean;
}

export interface SceneObject {
  id: string;
  name: string;
  category: ComponentCategory;
  geometry: PrimitiveGeometry;
  color: string;
  transform: Transform;
  visible: boolean;
  /** Parent component id, or null for a root component. Children are derived. */
  parentId: string | null;
  metadata: SceneObjectMetadata;
  /** Physical properties (Phase 5, optional). */
  physics?: PartPhysics;
}

/**
 * A new object before it receives an id and timestamps.
 * Templates may give drafts a `key` and a `parentKey` to describe a hierarchy;
 * template draft transforms are WORLD transforms and are converted to local
 * transforms when the template is materialized.
 */
export type SceneObjectDraft = Omit<SceneObject, 'id' | 'metadata' | 'visible' | 'parentId'> & {
  componentId?: string | null;
  description?: string;
  key?: string;
  parentKey?: string;
};
