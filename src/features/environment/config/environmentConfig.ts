import type { Vec3 } from '../../../types/scene';
import {
  ENVIRONMENT_FORMAT_VERSION,
  type EnvironmentDefinition,
  type EnvironmentObject,
  type EnvironmentObjectKind,
  type ObstacleShape,
} from '../../../types/environment';
import { createId } from '../../../utils/id';

/**
 * Environment objects: library, defaults, validation and load-time cleanup (Phase 7).
 * Pure functions; the environment store applies validated changes with undo history.
 */

export const ENV_LIMITS = {
  /** Smallest and largest size of any object side (m). */
  size: { min: 0.01, max: 50 },
  /** Positions must stay inside this cube (m). */
  position: 100,
  mass: { min: 0.01, max: 1000 },
  friction: { min: 0, max: 2 },
  restitution: { min: 0, max: 1 },
  objects: 200,
  name: 60,
} as const;

export const ENV_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export interface LibraryItem {
  kind: EnvironmentObjectKind;
  shape?: ObstacleShape;
  label: string;
  description: string;
}

/** The object library shown in the Environment Editor. */
export const ENVIRONMENT_LIBRARY: readonly LibraryItem[] = [
  { kind: 'ground', label: 'Ground Plane', description: 'Flat floor slab. With at least one, it replaces the default floor.' },
  { kind: 'wall', label: 'Wall', description: 'Thin static wall.' },
  { kind: 'box', label: 'Box', description: 'Box that the robot can push (dynamic) or a fixed block.' },
  { kind: 'platform', label: 'Platform', description: 'Raised static slab to drive onto.' },
  { kind: 'ramp', label: 'Ramp', description: 'Wedge that rises along its +X side.' },
  { kind: 'obstacle', shape: 'box', label: 'Block Obstacle', description: 'Static block.' },
  { kind: 'obstacle', shape: 'cylinder', label: 'Pillar Obstacle', description: 'Static round pillar.' },
  { kind: 'obstacle', shape: 'sphere', label: 'Ball Obstacle', description: 'Ball (dynamic by default).' },
];

export const KIND_LABEL: Record<EnvironmentObjectKind, string> = { ground: 'Ground', wall: 'Wall', box: 'Box', platform: 'Platform', ramp: 'Ramp', obstacle: 'Obstacle' };

const COLORS: Record<EnvironmentObjectKind, string> = { ground: '#3F4A5A', wall: '#64748B', box: '#B45309', platform: '#475569', ramp: '#0E7490', obstacle: '#7C3AED' };

/** A new object of a kind with sensible defaults, resting on the ground at `at` (x, z). */
export function defaultObject(kind: EnvironmentObjectKind, shape?: ObstacleShape, at: [number, number] = [1, 0]): Omit<EnvironmentObject, 'id' | 'name'> {
  const base = { rotation: [0, 0, 0] as Vec3, mass: 1, friction: 0.8, restitution: 0.05, collision: true, color: COLORS[kind], visible: true, locked: false };
  const rest = (h: number): Vec3 => [at[0], h / 2, at[1]];
  switch (kind) {
    case 'ground':
      return { ...base, kind, position: [0, -0.05, 0], size: [10, 0.1, 10], body: 'static', friction: 0.9 };
    case 'wall':
      return { ...base, kind, position: rest(0.4), size: [0.1, 0.4, 2], body: 'static' };
    case 'box':
      return { ...base, kind, position: rest(0.2), size: [0.2, 0.2, 0.2], body: 'dynamic', mass: 1.5 };
    case 'platform':
      return { ...base, kind, position: rest(0.06), size: [0.8, 0.06, 0.8], body: 'static' };
    case 'ramp':
      return { ...base, kind, position: rest(0.12), size: [0.8, 0.12, 0.8], body: 'static', friction: 0.9 };
    case 'obstacle': {
      const s = shape ?? 'box';
      if (s === 'cylinder') return { ...base, kind, shape: s, position: rest(0.4), size: [0.16, 0.4, 0.16], body: 'static' };
      if (s === 'sphere') return { ...base, kind, shape: s, position: rest(0.16), size: [0.16, 0.16, 0.16], body: 'dynamic', mass: 0.5, restitution: 0.3 };
      return { ...base, kind, shape: s, position: rest(0.25), size: [0.25, 0.25, 0.25], body: 'static' };
    }
  }
}

/** A name not yet used in the environment ("Wall", "Wall 2", …). */
export function uniqueObjectName(base: string, objects: readonly EnvironmentObject[]): string {
  const taken = new Set(objects.map((o) => o.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 10_000; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return `${base} ${Date.now().toString(36)}`;
}

/** An id not used in `objects`. */
export function uniqueObjectId(objects: readonly EnvironmentObject[]): string {
  const taken = new Set(objects.map((o) => o.id));
  for (;;) {
    const id = createId('env');
    if (!taken.has(id)) return id;
  }
}

/**
 * A free spot on the ground for a new object (x, z): the first place, going outward from
 * 1 m in front of the robot's start, whose footprint does not overlap another object
 * (ground planes ignored) or the robot's start area.
 */
export function freeSpot(objects: readonly EnvironmentObject[], footprint: [number, number]): [number, number] {
  const solids = objects.filter((o) => o.kind !== 'ground');
  const overlaps = (x: number, z: number) => {
    if (Math.abs(x) < 0.45 + footprint[0] / 2 && Math.abs(z) < 0.35 + footprint[1] / 2) return true; // robot start area
    return solids.some((o) => {
      const r = Math.max(o.size[0], o.size[2]) / 2 + Math.max(footprint[0], footprint[1]) / 2 + 0.05;
      return Math.abs(o.position[0] - x) < r && Math.abs(o.position[2] - z) < r;
    });
  };
  for (let ring = 0; ring < 12; ring++) {
    const step = 0.5;
    const candidates: [number, number][] = ring === 0 ? [[1, 0]] : [];
    for (let i = -ring; i <= ring; i++) candidates.push([1 + ring * step, i * step], [1 + i * step, ring * step], [1 + i * step, -ring * step], [1 - ring * step, i * step]);
    for (const [x, z] of candidates) if (!overlaps(x, z)) return [Number(x.toFixed(3)), Number(z.toFixed(3))];
  }
  return [1, 0];
}

export function createObject(kind: EnvironmentObjectKind, objects: readonly EnvironmentObject[], options: { shape?: ObstacleShape; at?: [number, number]; name?: string } = {}): EnvironmentObject {
  if (!options.at && kind !== 'ground') {
    const probe = defaultObject(kind, options.shape);
    options = { ...options, at: freeSpot(objects, [probe.size[0], probe.size[2]]) };
  }
  const item = ENVIRONMENT_LIBRARY.find((i) => i.kind === kind && (kind !== 'obstacle' || i.shape === (options.shape ?? 'box')));
  return {
    id: uniqueObjectId(objects),
    name: uniqueObjectName(options.name ?? item?.label ?? KIND_LABEL[kind], objects),
    ...defaultObject(kind, options.shape, options.at),
  };
}

/**
 * Keep a size consistent with the shape: cylinders have equal X and Z (the diameter),
 * spheres equal X, Y and Z. Sizes are clamped to the allowed range.
 */
export function normalizeSize(object: Pick<EnvironmentObject, 'kind' | 'shape'>, size: Vec3): Vec3 {
  const clamp = (v: number) => Math.min(ENV_LIMITS.size.max, Math.max(ENV_LIMITS.size.min, Number.isFinite(v) ? v : ENV_LIMITS.size.min));
  const [x, y, z] = size.map(clamp) as Vec3;
  if (object.kind === 'obstacle' && object.shape === 'sphere') return [x, x, x];
  if (object.kind === 'obstacle' && object.shape === 'cylinder') return [x, y, x];
  return [x, y, z];
}

/** Ramp inclination (rad): rise over run. */
export function rampInclination(size: Vec3): number {
  return Math.atan2(size[1], size[0]);
}

/** Ramp height for an inclination (rad), keeping its width. */
export function rampHeightFor(size: Vec3, inclination: number): number {
  return Math.tan(inclination) * size[0];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);

/** Readable problems with one object. Empty = valid. */
export function validateEnvironmentObject(o: EnvironmentObject, others: readonly EnvironmentObject[] = []): string[] {
  const errors: string[] = [];
  if (typeof o.id !== 'string' || !ENV_ID_PATTERN.test(o.id)) errors.push('Object id is not valid.');
  if (others.some((x) => x.id === o.id)) errors.push(`Another object already uses the id "${o.id}".`);
  if (typeof o.name !== 'string' || !o.name.trim()) errors.push('Name must not be empty.');
  else if (o.name.length > ENV_LIMITS.name) errors.push(`Name must be at most ${ENV_LIMITS.name} characters.`);
  if (!['ground', 'wall', 'box', 'platform', 'ramp', 'obstacle'].includes(o.kind)) errors.push(`Unknown object kind "${String(o.kind)}".`);
  if (o.kind === 'obstacle' && !['box', 'cylinder', 'sphere'].includes(o.shape ?? '')) errors.push('Obstacle shape must be box, cylinder or sphere.');
  if (!isVec3(o.position)) errors.push('Position must be three finite numbers.');
  else if (o.position.some((v) => Math.abs(v) > ENV_LIMITS.position)) errors.push(`Position must stay within ±${ENV_LIMITS.position} m.`);
  if (!isVec3(o.rotation)) errors.push('Rotation must be three finite numbers.');
  if (!isVec3(o.size)) errors.push('Size must be three finite numbers.');
  else if (o.size.some((v) => v < ENV_LIMITS.size.min || v > ENV_LIMITS.size.max)) errors.push(`Each size must be between ${ENV_LIMITS.size.min} and ${ENV_LIMITS.size.max} m.`);
  if (o.body !== 'static' && o.body !== 'dynamic') errors.push('Body type must be static or dynamic.');
  if (!finite(o.mass) || o.mass < ENV_LIMITS.mass.min || o.mass > ENV_LIMITS.mass.max) errors.push(`Mass must be between ${ENV_LIMITS.mass.min} and ${ENV_LIMITS.mass.max} kg.`);
  if (!finite(o.friction) || o.friction < 0 || o.friction > ENV_LIMITS.friction.max) errors.push(`Friction must be between 0 and ${ENV_LIMITS.friction.max}.`);
  if (!finite(o.restitution) || o.restitution < 0 || o.restitution > 1) errors.push('Bounciness (restitution) must be between 0 and 1.');
  if (typeof o.collision !== 'boolean') errors.push('Collision must be on or off.');
  if (o.kind === 'ground' && o.body === 'dynamic') errors.push('A ground plane must be static.');
  return errors;
}

/** Problems with a whole environment (empty = valid). */
export function validateEnvironment(env: EnvironmentDefinition): string[] {
  const errors: string[] = [];
  if (!env.name.trim()) errors.push('Environment name must not be empty.');
  if (env.objects.length > ENV_LIMITS.objects) errors.push(`An environment can hold at most ${ENV_LIMITS.objects} objects.`);
  env.objects.forEach((o, i) => {
    for (const e of validateEnvironmentObject(o, env.objects.slice(0, i))) errors.push(`${o.name || `Object ${i + 1}`}: ${e}`);
  });
  return errors;
}

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Clean a stored environment. Unreadable objects are skipped, bad values replaced by
 * defaults, duplicate ids renewed, unknown fields kept, every change reported.
 * Returns null when the data is not an environment at all.
 */
export function sanitizeEnvironment(raw: unknown, warnings: string[]): EnvironmentDefinition | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) {
    warnings.push('An unreadable environment was skipped.');
    return null;
  }
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, ENV_LIMITS.name) : 'Untitled Environment';
  const objects: EnvironmentObject[] = [];
  const list = Array.isArray(raw.objects) ? raw.objects : [];
  if (!Array.isArray(raw.objects)) warnings.push(`"${name}": the object list was not readable.`);
  list.forEach((entry, index) => {
    if (!isObject(entry) || !['ground', 'wall', 'box', 'platform', 'ramp', 'obstacle'].includes(entry.kind as string)) {
      warnings.push(`"${name}": object #${index + 1} has an unknown kind and was skipped.`);
      return;
    }
    const kind = entry.kind as EnvironmentObjectKind;
    const shape = kind === 'obstacle' ? ((['box', 'cylinder', 'sphere'].includes(entry.shape as string) ? entry.shape : 'box') as ObstacleShape) : undefined;
    const d = defaultObject(kind, shape);
    const fixed: string[] = [];
    const pick = <K extends keyof EnvironmentObject>(key: K, ok: (v: unknown) => boolean): EnvironmentObject[K] => {
      if (ok(entry[key])) return entry[key] as EnvironmentObject[K];
      if (entry[key] !== undefined) fixed.push(String(key));
      return (d as Record<string, unknown>)[key] as EnvironmentObject[K];
    };
    const inRange = (min: number, max: number) => (v: unknown) => finite(v) && v >= min && v <= max;
    let id = typeof entry.id === 'string' && ENV_ID_PATTERN.test(entry.id) ? entry.id : '';
    if (!id || objects.some((o) => o.id === id)) {
      id = uniqueObjectId(objects);
      fixed.push('id');
    }
    const objectName = typeof entry.name === 'string' && entry.name.trim() ? entry.name.slice(0, ENV_LIMITS.name) : uniqueObjectName(KIND_LABEL[kind], objects);
    const object: EnvironmentObject = {
      ...(entry as object),
      id,
      name: objectName,
      kind,
      ...(shape ? { shape } : {}),
      position: pick('position', (v) => isVec3(v) && v.every((n) => Math.abs(n) <= ENV_LIMITS.position)),
      rotation: pick('rotation', isVec3),
      size: pick('size', (v) => isVec3(v) && v.every((n) => n >= ENV_LIMITS.size.min && n <= ENV_LIMITS.size.max)),
      body: pick('body', (v) => v === 'static' || v === 'dynamic'),
      mass: pick('mass', inRange(ENV_LIMITS.mass.min, ENV_LIMITS.mass.max)),
      friction: pick('friction', inRange(0, ENV_LIMITS.friction.max)),
      restitution: pick('restitution', inRange(0, 1)),
      collision: pick('collision', (v) => typeof v === 'boolean'),
      color: pick('color', (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)),
      visible: entry.visible !== false,
      locked: entry.locked === true,
    } as EnvironmentObject;
    if (kind === 'ground' && object.body === 'dynamic') {
      object.body = 'static';
      fixed.push('body');
    }
    if (fixed.length) warnings.push(`"${name}" → "${objectName}": ${fixed.join(', ')} replaced by defaults.`);
    objects.push(object);
  });
  const now = new Date().toISOString();
  return {
    ...(raw as object),
    id: raw.id,
    name,
    version: ENVIRONMENT_FORMAT_VERSION,
    templateId: typeof raw.templateId === 'string' ? raw.templateId : null,
    objects,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  } as EnvironmentDefinition;
}
