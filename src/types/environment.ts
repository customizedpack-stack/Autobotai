import type { Vec3 } from './scene';

/**
 * Environment definitions (Phase 7, C5 Environment Connector).
 *
 * An environment is a reusable asset: a named list of simple objects (ground,
 * walls, boxes, platforms, ramps, obstacles) that the physics world builds into
 * colliders. It stores configuration only — never live body positions or
 * velocities. Templates are built in and read-only; editing one saves a copy.
 */

export type EnvironmentObjectKind = 'ground' | 'wall' | 'box' | 'platform' | 'ramp' | 'obstacle';

/** Shape of an obstacle (the other kinds are boxes, except the ramp, which is a wedge). */
export type ObstacleShape = 'box' | 'cylinder' | 'sphere';

export type EnvironmentBodyType = 'static' | 'dynamic';

export interface EnvironmentObject {
  /** Unique within the environment ("env_…"). */
  id: string;
  name: string;
  kind: EnvironmentObjectKind;
  /** Only for kind 'obstacle'. */
  shape?: ObstacleShape;
  /** Center of the object (m). */
  position: Vec3;
  /** Euler XYZ (rad), like part transforms. */
  rotation: Vec3;
  /**
   * Full size (m): width (X), height (Y), depth (Z).
   * Cylinder: diameter = X (= Z), height = Y. Sphere: diameter = X.
   * Ramp: a wedge that rises from 0 at −X to `height` at +X over the width.
   */
  size: Vec3;
  /** static: never moves (ground, walls). dynamic: pushed by the robot, falls under gravity. */
  body: EnvironmentBodyType;
  /** Mass (kg), used by dynamic bodies only. */
  mass: number;
  friction: number;
  restitution: number;
  /** false: the object is drawn but has no collider (nothing touches it, sensors do not see it). */
  collision: boolean;
  /** Display color. */
  color: string;
  /** Hidden objects are not drawn in the editor; they still take part in physics. */
  visible: boolean;
  /** Locked objects cannot be moved, edited or deleted until unlocked. */
  locked: boolean;
}

export interface EnvironmentDefinition {
  id: string;
  name: string;
  /** Format version of this definition (1). */
  version: number;
  /** The built-in template this environment was created from, or null. */
  templateId: string | null;
  objects: EnvironmentObject[];
  createdAt: string;
  updatedAt: string;
}

export const ENVIRONMENT_FORMAT_VERSION = 1;
