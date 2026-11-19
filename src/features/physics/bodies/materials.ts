import type { PartPhysics, SceneObject } from '../../../types/scene';
import { DEFAULT_DENSITY, DEFAULT_FRICTION, DEFAULT_RESTITUTION, PASSIVE_CASTER_FRICTION, PHYSICS_LIMITS } from '../physicsConfig';

/**
 * Physical properties of a part: the stored overrides (`SceneObject.physics`)
 * with defaults from the category for anything missing. Legacy projects have
 * no overrides and get the defaults; nothing is written back to the project.
 */

export interface ResolvedPartPhysics {
  /** Explicit mass (kg), or null to use density × volume. */
  mass: number | null;
  density: number;
  friction: number;
  restitution: number;
  collision: boolean;
  /** Where each value came from, for the inspector. */
  source: { mass: 'set' | 'auto'; friction: 'set' | 'auto' | 'caster'; restitution: 'set' | 'auto' };
}

const inRange = (v: unknown, r: { min: number; max: number }): v is number => typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max;

export function resolvePartPhysics(object: SceneObject, options: { passiveCaster?: boolean } = {}): ResolvedPartPhysics {
  const p = object.physics ?? {};
  const friction = inRange(p.friction, PHYSICS_LIMITS.friction) ? p.friction : options.passiveCaster ? PASSIVE_CASTER_FRICTION : DEFAULT_FRICTION[object.category];
  return {
    mass: inRange(p.mass, PHYSICS_LIMITS.mass) ? p.mass : null,
    density: inRange(p.density, PHYSICS_LIMITS.density) ? p.density : DEFAULT_DENSITY[object.category],
    friction,
    restitution: inRange(p.restitution, PHYSICS_LIMITS.restitution) ? p.restitution : DEFAULT_RESTITUTION,
    collision: p.collision !== false,
    source: {
      mass: inRange(p.mass, PHYSICS_LIMITS.mass) ? 'set' : 'auto',
      friction: inRange(p.friction, PHYSICS_LIMITS.friction) ? 'set' : options.passiveCaster ? 'caster' : 'auto',
      restitution: inRange(p.restitution, PHYSICS_LIMITS.restitution) ? 'set' : 'auto',
    },
  };
}

/**
 * Clean a stored `physics` value when a project is loaded: keep valid fields,
 * drop invalid ones (with a warning). Returns undefined when nothing valid remains.
 */
export function sanitizePartPhysics(raw: unknown, name: string, warnings: string[]): PartPhysics | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`"${name}": physics settings were not readable and were ignored.`);
    return undefined;
  }
  const src = raw as Record<string, unknown>;
  const out: PartPhysics = {};
  for (const key of ['mass', 'density', 'friction', 'restitution'] as const) {
    if (src[key] === undefined) continue;
    if (inRange(src[key], PHYSICS_LIMITS[key])) out[key] = src[key];
    else warnings.push(`"${name}": physics ${key} ${String(src[key])} is out of range and was ignored.`);
  }
  if (src.collision !== undefined) {
    if (typeof src.collision === 'boolean') out.collision = src.collision;
    else warnings.push(`"${name}": physics collision must be true or false and was ignored.`);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Check one value typed in the inspector. Returns an error message or null. */
export function checkPhysicsValue(key: 'mass' | 'density' | 'friction' | 'restitution', value: number): string | null {
  const range = PHYSICS_LIMITS[key];
  if (!Number.isFinite(value)) return `${key} must be a number.`;
  if (value < range.min || value > range.max) return `${key} must be between ${range.min} and ${range.max}.`;
  return null;
}
