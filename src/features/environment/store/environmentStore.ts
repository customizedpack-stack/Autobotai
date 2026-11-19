import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { bus } from '../../../core/bus/connectorBus';
import { ENVIRONMENT_FORMAT_VERSION, type EnvironmentDefinition, type EnvironmentObject, type EnvironmentObjectKind, type ObstacleShape } from '../../../types/environment';
import type { Vec3 } from '../../../types/scene';
import { createId } from '../../../utils/id';
import { log } from '../../../utils/logger';
import { safeStorage } from '../../../utils/storage';
import { createObject, ENV_LIMITS, KIND_LABEL, sanitizeEnvironment, uniqueObjectId, uniqueObjectName, validateEnvironmentObject } from '../config/environmentConfig';
import { ENVIRONMENT_TEMPLATES, findTemplate } from '../config/templates';

/**
 * Environments (Phase 7, C5).
 *
 * - Saved environments are reusable assets in their own browser store
 *   (`arai.environments.v1`), like Code Studio programs. Robot projects only remember
 *   which environment they use (`environmentId`), so the robot schema v3 is unchanged.
 * - Templates are built in and read-only. Opening one creates an unsaved copy.
 * - The editor works on a DRAFT copy with its own undo/redo history: one entry per
 *   user action, one entry per gizmo drag (transient changes), never per physics frame.
 *   Saving writes the draft into the saved environments.
 */

interface Snapshot {
  name: string;
  objects: EnvironmentObject[];
}

const HISTORY_LIMIT = 100;

export type EnvResult<T = undefined> = { ok: true; value: T } | { ok: false; errors: string[] };

interface EnvironmentState {
  /** Saved environments (persisted). */
  environments: Record<string, EnvironmentDefinition>;
  // ── Editor (runtime only) ──
  draft: EnvironmentDefinition | null;
  dirty: boolean;
  selectedId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  lastAction: string | null;
  transientBase: Snapshot | null;
}

export const useEnvironmentStore = create<EnvironmentState>()(
  persist(
    (): EnvironmentState => ({
      environments: {},
      draft: null,
      dirty: false,
      selectedId: null,
      past: [],
      future: [],
      lastAction: null,
      transientBase: null,
    }),
    {
      name: 'arai.environments.v1',
      storage: safeStorage,
      version: 1,
      partialize: (s) => ({ environments: s.environments }),
      // Every stored environment is cleaned on load: bad values become defaults, nothing crashes the physics engine.
      merge: (persisted, current) => ({ ...current, environments: sanitizeStored((persisted as { environments?: unknown } | undefined)?.environments) }),
    },
  ),
);

function sanitizeStored(raw: unknown): Record<string, EnvironmentDefinition> {
  const out: Record<string, EnvironmentDefinition> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const warnings: string[] = [];
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const env = sanitizeEnvironment(value, warnings);
    if (env) out[env.id] = env;
  }
  for (const w of warnings) log.warning('storage', `Environment: ${w}`);
  return out;
}

const get = () => useEnvironmentStore.getState();
const set = (patch: Partial<EnvironmentState>) => useEnvironmentStore.setState(patch);
const now = () => new Date().toISOString();
const snapshot = (d: EnvironmentDefinition): Snapshot => ({ name: d.name, objects: d.objects });

function ok<T>(value: T): EnvResult<T> {
  return { ok: true, value };
}
function fail<T>(action: string, errors: string[]): EnvResult<T> {
  log.error('environment', `${action} rejected: ${errors.join(' ')}`);
  return { ok: false, errors };
}

/** Apply a change to the draft as ONE undo step. */
function commit(label: string, next: Partial<Snapshot>): void {
  const { draft, past } = get();
  if (!draft) return;
  set({
    draft: { ...draft, ...next },
    past: [...past, snapshot(draft)].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
    lastAction: label,
  });
  bus.publish('environment.edited', { environmentId: draft.id, reason: label, objectCount: (next.objects ?? draft.objects).length });
}

function requireDraft(action: string): EnvironmentDefinition | EnvResult<never> {
  const draft = get().draft;
  return draft ?? fail(action, ['Open or create an environment first.']);
}
const isResult = (v: unknown): v is EnvResult<never> => typeof v === 'object' && v !== null && 'ok' in v;

// ── Environment list ──

/** Templates first, then saved environments (newest first). */
export function environmentList(): { id: string; name: string; template: boolean }[] {
  const saved = Object.values(get().environments).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...ENVIRONMENT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, template: true })), ...saved.map((e) => ({ id: e.id, name: e.name, template: false }))];
}

/**
 * The definition the physics world builds for an id: a template or a SAVED environment
 * (never an unsaved draft). Unknown ids fall back to the empty environment.
 */
export function resolveEnvironment(id: string): EnvironmentDefinition {
  return findTemplate(id) ?? get().environments[id] ?? ENVIRONMENT_TEMPLATES[0]!;
}

export function environmentExists(id: string): boolean {
  return Boolean(findTemplate(id) ?? get().environments[id]);
}

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim().slice(0, ENV_LIMITS.name);
  return trimmed || fallback;
}

function uniqueEnvironmentName(base: string): string {
  const taken = new Set(environmentList().map((e) => e.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return `${base} ${Date.now().toString(36)}`;
}

function openDraft(draft: EnvironmentDefinition, dirty: boolean): void {
  set({ draft, dirty, selectedId: null, past: [], future: [], lastAction: null, transientBase: null });
  bus.publish('environment.opened', { environmentId: draft.id, name: draft.name });
}

// ── Environment commands ──

/** A new, unsaved environment from a template (default: empty). The template itself is never changed. */
export function createEnvironment(templateId = 'floor', name?: string): EnvironmentDefinition {
  const template = findTemplate(templateId) ?? ENVIRONMENT_TEMPLATES[0]!;
  const t = now();
  const draft: EnvironmentDefinition = {
    id: createId('envd'),
    name: uniqueEnvironmentName(cleanName(name, templateId === 'floor' ? 'New Environment' : `${template.name} (copy)`)),
    version: ENVIRONMENT_FORMAT_VERSION,
    templateId: template.id,
    objects: structuredClone(template.objects),
    createdAt: t,
    updatedAt: t,
  };
  openDraft(draft, true);
  log.info('environment', `New environment "${draft.name}" from the template "${template.name}" (not saved yet).`);
  return draft;
}

/** Open a saved environment for editing, or a template as a new unsaved copy. */
export function openEnvironment(id: string): EnvResult<EnvironmentDefinition> {
  if (findTemplate(id)) return ok(createEnvironment(id));
  const saved = get().environments[id];
  if (!saved) return fail('Open environment', ['This environment no longer exists.']);
  const draft = structuredClone(saved);
  openDraft(draft, false);
  return ok(draft);
}

export function closeEnvironment(): void {
  set({ draft: null, dirty: false, selectedId: null, past: [], future: [], lastAction: null, transientBase: null });
}

/** Save the draft (as a new environment or over its saved version). Templates are never overwritten. */
export function saveEnvironment(): EnvResult<EnvironmentDefinition> {
  const draft = requireDraft('Save environment');
  if (isResult(draft)) return draft;
  if (findTemplate(draft.id)) return fail('Save environment', ['Templates cannot be overwritten.']);
  const saved: EnvironmentDefinition = { ...structuredClone(draft), updatedAt: now() };
  const created = !get().environments[saved.id];
  set({ environments: { ...get().environments, [saved.id]: saved }, draft: saved, dirty: false });
  bus.publish('environment.changed', { environmentId: saved.id, change: created ? 'created' : 'saved' });
  log.success('environment', `Saved environment "${saved.name}" (${saved.objects.length} objects).`);
  return ok(saved);
}

export function renameEnvironment(name: string): EnvResult<string> {
  const draft = requireDraft('Rename environment');
  if (isResult(draft)) return draft;
  const clean = name.trim();
  if (!clean) return fail('Rename environment', ['Environment name must not be empty.']);
  if (clean.length > ENV_LIMITS.name) return fail('Rename environment', [`Environment name must be at most ${ENV_LIMITS.name} characters.`]);
  if (clean === draft.name) return ok(clean);
  commit(`Rename environment to ${clean}`, { name: clean });
  return ok(clean);
}

/** Save a copy of a saved environment (or of a template) under a new id. */
export function duplicateEnvironment(id: string): EnvResult<EnvironmentDefinition> {
  const source = findTemplate(id) ?? get().environments[id];
  if (!source) return fail('Duplicate environment', ['This environment no longer exists.']);
  const t = now();
  const copy: EnvironmentDefinition = {
    ...structuredClone(source),
    id: createId('envd'),
    name: uniqueEnvironmentName(`${source.name} copy`),
    templateId: findTemplate(id) ? id : source.templateId,
    createdAt: t,
    updatedAt: t,
  };
  set({ environments: { ...get().environments, [copy.id]: copy } });
  bus.publish('environment.changed', { environmentId: copy.id, change: 'created' });
  log.success('environment', `Duplicated "${source.name}" as "${copy.name}".`);
  return ok(copy);
}

/** Delete a saved environment (the UI asks for confirmation first). Templates cannot be deleted. */
export function deleteEnvironment(id: string): EnvResult<string> {
  if (findTemplate(id)) return fail('Delete environment', ['Templates cannot be deleted.']);
  const existing = get().environments[id];
  if (!existing) return fail('Delete environment', ['This environment no longer exists.']);
  const environments = { ...get().environments };
  delete environments[id];
  set({ environments });
  if (get().draft?.id === id) closeEnvironment();
  bus.publish('environment.changed', { environmentId: id, change: 'deleted' });
  log.warning('environment', `Deleted environment "${existing.name}".`);
  return ok(id);
}

/** Replace the draft's objects with its template's original objects (one undo step). */
export function resetToTemplate(): EnvResult<string> {
  const draft = requireDraft('Reset to template');
  if (isResult(draft)) return draft;
  const template = draft.templateId ? findTemplate(draft.templateId) : undefined;
  if (!template) return fail('Reset to template', ['This environment was not made from a template.']);
  commit(`Reset to template ${template.name}`, { objects: structuredClone(template.objects) });
  set({ selectedId: null });
  log.info('environment', `Restored the objects of the template "${template.name}". The template itself is unchanged.`);
  return ok(template.id);
}

// ── Object commands ──

export function selectObject(id: string | null): void {
  if (id !== null && !get().draft?.objects.some((o) => o.id === id)) return;
  set({ selectedId: id });
}

export function addObject(kind: EnvironmentObjectKind, options: { shape?: ObstacleShape; at?: [number, number] } = {}): EnvResult<EnvironmentObject> {
  const draft = requireDraft('Add object');
  if (isResult(draft)) return draft;
  if (draft.objects.length >= ENV_LIMITS.objects) return fail('Add object', [`An environment can hold at most ${ENV_LIMITS.objects} objects.`]);
  const object = createObject(kind, draft.objects, options);
  commit(`Add ${object.name}`, { objects: [...draft.objects, object] });
  set({ selectedId: object.id });
  return ok(object);
}

const LOCK_FREE_KEYS = new Set(['locked', 'visible']);

/** Change one object (validated; one undo step). Locked objects only accept lock/visibility changes. */
export function updateObject(id: string, patch: Partial<Omit<EnvironmentObject, 'id' | 'kind'>>, label?: string): EnvResult<EnvironmentObject> {
  const draft = requireDraft('Edit object');
  if (isResult(draft)) return draft;
  const current = draft.objects.find((o) => o.id === id);
  if (!current) return fail('Edit object', ['Object not found.']);
  if (current.locked && Object.keys(patch).some((k) => !LOCK_FREE_KEYS.has(k))) return fail('Edit object', [`"${current.name}" is locked. Unlock it first.`]);
  const next = { ...current, ...patch, id: current.id, kind: current.kind } as EnvironmentObject;
  if (JSON.stringify(next) === JSON.stringify(current)) return ok(current);
  const errors = validateEnvironmentObject(next, draft.objects.filter((o) => o.id !== id));
  if (errors.length) return fail('Edit object', errors);
  commit(label ?? `Edit ${current.name}`, { objects: draft.objects.map((o) => (o.id === id ? next : o)) });
  return ok(next);
}

export function renameObject(id: string, name: string): EnvResult<EnvironmentObject> {
  const draft = get().draft;
  const current = draft?.objects.find((o) => o.id === id);
  const clean = name.trim();
  if (!current || !draft) return fail('Rename object', ['Object not found.']);
  if (clean.toLowerCase() !== current.name.toLowerCase() && draft.objects.some((o) => o.id !== id && o.name.toLowerCase() === clean.toLowerCase())) {
    return fail('Rename object', [`Another object is already called "${clean}".`]);
  }
  return updateObject(id, { name: clean }, `Rename ${current.name} to ${clean}`);
}

export function removeObject(id: string): EnvResult<EnvironmentObject> {
  const draft = requireDraft('Delete object');
  if (isResult(draft)) return draft;
  const current = draft.objects.find((o) => o.id === id);
  if (!current) return fail('Delete object', ['Object not found.']);
  if (current.locked) return fail('Delete object', [`"${current.name}" is locked. Unlock it first.`]);
  commit(`Delete ${current.name}`, { objects: draft.objects.filter((o) => o.id !== id) });
  if (get().selectedId === id) set({ selectedId: null });
  return ok(current);
}

/** Copy an object next to the original (new unique id and name). */
export function duplicateObject(id: string): EnvResult<EnvironmentObject> {
  const draft = requireDraft('Duplicate object');
  if (isResult(draft)) return draft;
  const current = draft.objects.find((o) => o.id === id);
  if (!current) return fail('Duplicate object', ['Object not found.']);
  if (draft.objects.length >= ENV_LIMITS.objects) return fail('Duplicate object', [`An environment can hold at most ${ENV_LIMITS.objects} objects.`]);
  const offset = Math.max(current.size[0], 0.2) + 0.1;
  const copy: EnvironmentObject = {
    ...structuredClone(current),
    id: uniqueObjectId(draft.objects),
    name: uniqueObjectName(`${current.name} copy`, draft.objects),
    position: [current.position[0], current.position[1], current.position[2] + offset],
    locked: false,
  };
  commit(`Duplicate ${current.name}`, { objects: [...draft.objects, copy] });
  set({ selectedId: copy.id });
  return ok(copy);
}

export const objectLabel = (o: EnvironmentObject) => `${o.name} (${KIND_LABEL[o.kind]})`;

// ── Gizmo drags: live preview, ONE undo step per drag ──

export function beginTransientChange(): void {
  const draft = get().draft;
  if (draft && !get().transientBase) set({ transientBase: snapshot(draft) });
}

/** Live preview during a drag (no history entry). Invalid values are ignored. */
export function previewObject(id: string, patch: { position?: Vec3; rotation?: Vec3; size?: Vec3 }): void {
  const draft = get().draft;
  const current = draft?.objects.find((o) => o.id === id);
  if (!draft || !current || current.locked) return;
  const next = { ...current, ...patch };
  if (validateEnvironmentObject(next, draft.objects.filter((o) => o.id !== id)).length) return;
  set({ draft: { ...draft, objects: draft.objects.map((o) => (o.id === id ? next : o)) } });
}

export function endTransientChange(label: string): void {
  const { draft, transientBase, past } = get();
  if (!draft || !transientBase) return;
  set({ transientBase: null });
  if (JSON.stringify(transientBase.objects) === JSON.stringify(draft.objects)) return;
  set({ past: [...past, transientBase].slice(-HISTORY_LIMIT), future: [], dirty: true, lastAction: label });
  bus.publish('environment.edited', { environmentId: draft.id, reason: label, objectCount: draft.objects.length });
}

// ── Undo / redo (environment history only; robot history is separate) ──

export function undoEnvironment(): string | null {
  const { draft, past, future, lastAction } = get();
  if (!draft || past.length === 0) return null;
  const previous = past[past.length - 1]!;
  set({ draft: { ...draft, ...previous }, past: past.slice(0, -1), future: [snapshot(draft), ...future].slice(0, HISTORY_LIMIT), dirty: true, lastAction: null });
  pruneSelection();
  return lastAction ?? 'Environment edit';
}

export function redoEnvironment(): string | null {
  const { draft, past, future } = get();
  if (!draft || future.length === 0) return null;
  const next = future[0]!;
  set({ draft: { ...draft, ...next }, past: [...past, snapshot(draft)].slice(-HISTORY_LIMIT), future: future.slice(1), dirty: true });
  pruneSelection();
  return 'Environment edit';
}

function pruneSelection(): void {
  const { draft, selectedId } = get();
  if (selectedId && !draft?.objects.some((o) => o.id === selectedId)) set({ selectedId: null });
}
