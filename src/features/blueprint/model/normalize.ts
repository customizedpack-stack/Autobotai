import { sanitizeUrl, validatePart } from '../catalog/catalog';
import type { CatalogPart } from '../catalog/types';
import {
  BLUEPRINT_VERSION,
  HISTORY_LIMIT,
  SNAPSHOT_LIMIT,
  emptyBlueprint,
  type BomExtra,
  type Blueprint,
  type BlueprintData,
  type BlueprintSnapshot,
  type GuideState,
  type HardwareItem,
  type HistoryEvent,
  type PartMapping,
  type StepState,
  type WiringRecord,
} from './types';

/**
 * Load-time migration of a stored blueprint. It is idempotent: running it on
 * its own output returns an equal value. Invalid entries are dropped (and
 * counted) instead of being guessed; nothing is invented.
 *
 * Projects saved before Phase 9 have no `blueprint` field and get an empty
 * blueprint in memory. The field is only written back once the user adds
 * blueprint content and saves.
 */

export interface NormalizeResult {
  blueprint: Blueprint;
  dropped: number;
}

const ROLES = new Set(['driver', 'controller', 'battery', 'battery-holder', 'regulator', 'sensor', 'other']);
const INTERFACES = new Set(['power', 'ground', 'digital', 'pwm', 'analog', 'i2c-sda', 'i2c-scl', 'spi', 'uart-tx', 'uart-rx', 'motor']);
const DIRECTIONS = new Set(['controller-to-component', 'component-to-controller', 'bidirectional', 'power-supply']);
const STATUSES = new Set(['not-started', 'in-progress', 'completed', 'blocked']);
const EVENT_TYPES = new Set([
  'blueprint.created', 'component.added', 'component.removed', 'part.mapped', 'part.replaced', 'part.unmapped', 'hardware.added', 'hardware.removed',
  'joint.changed', 'motor.changed', 'motor.assigned', 'sensor.changed', 'wiring.updated', 'program.changed', 'simulation.completed', 'bom.generated', 'bom.updated',
  'guide.generated', 'guide.updated', 'step.status', 'snapshot.created', 'snapshot.restored', 'undo', 'redo',
]);

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const dateOr = (v: unknown, fallback: string | null): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);
const qty = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10000 ? v : null);

function snapshotPart(raw: unknown): CatalogPart | null {
  if (validatePart(raw).length > 0) return null;
  const p = raw as CatalogPart;
  return {
    ...p,
    datasheetUrl: sanitizeUrl(p.datasheetUrl),
    officialUrl: sanitizeUrl(p.officialUrl),
    imageUrl: null,
    source: { ...p.source, url: sanitizeUrl(p.source.url) ?? '' },
    price: p.price ? { ...p.price, url: sanitizeUrl(p.price.url) ?? '' } : null,
  };
}

function normalizeData(raw: Record<string, unknown>, counter: { dropped: number }): BlueprintData {
  const drop = () => {
    counter.dropped += 1;
    return null;
  };
  const seen = new Set<string>();
  const unique = (id: string) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  };

  const mappings: PartMapping[] = [];
  const targets = new Set<string>();
  for (const m of Array.isArray(raw.mappings) ? raw.mappings : []) {
    if (!isObj(m)) {
      drop();
      continue;
    }
    const snapshot = snapshotPart(m.snapshot);
    const targetKind = m.targetKind === 'component' || m.targetKind === 'hardware' ? m.targetKind : null;
    const id = str(m.id, 80);
    const targetId = str(m.targetId, 80);
    // One mapping per virtual component: a later duplicate is dropped, never merged.
    const targetKey = `${targetKind}:${targetId}`;
    if (!snapshot || !targetKind || !targetId || !unique(id) || targets.has(targetKey) || str(m.partId, 80) !== snapshot.id) {
      drop();
      continue;
    }
    targets.add(targetKey);
    mappings.push({
      id,
      targetKind,
      targetId,
      partId: snapshot.id,
      snapshot,
      quantity: qty(m.quantity) ?? 1,
      required: m.required !== false,
      note: str(m.note),
      mappedAt: dateOr(m.mappedAt, new Date(0).toISOString())!,
      ...(typeof m.driverMappingId === 'string' && m.driverMappingId ? { driverMappingId: str(m.driverMappingId, 80) } : {}),
    });
  }

  const hardware: HardwareItem[] = [];
  for (const h of Array.isArray(raw.hardware) ? raw.hardware : []) {
    if (!isObj(h) || !ROLES.has(h.role as string) || !str(h.name, 80).trim() || !unique(str(h.id, 80))) {
      drop();
      continue;
    }
    hardware.push({ id: str(h.id, 80), role: h.role as HardwareItem['role'], name: str(h.name, 80) });
  }

  const bomExtras: BomExtra[] = [];
  for (const e of Array.isArray(raw.bomExtras) ? raw.bomExtras : []) {
    const quantity = isObj(e) ? qty(e.quantity) : null;
    if (!isObj(e) || !str(e.name, 120).trim() || quantity === null || !unique(str(e.id, 80))) {
      drop();
      continue;
    }
    const snapshot = e.snapshot ? snapshotPart(e.snapshot) : null;
    bomExtras.push({
      id: str(e.id, 80),
      name: str(e.name, 120),
      quantity,
      required: e.required !== false,
      note: str(e.note),
      partId: snapshot ? snapshot.id : null,
      snapshot,
    });
  }

  const wiring: WiringRecord[] = [];
  for (const w of Array.isArray(raw.wiring) ? raw.wiring : []) {
    if (!isObj(w) || !INTERFACES.has(w.interface as string) || !DIRECTIONS.has(w.direction as string) || !/^(component|hardware):/.test(str(w.componentRef)) || !unique(str(w.id, 80))) {
      drop();
      continue;
    }
    const voltage = typeof w.voltage === 'number' && Number.isFinite(w.voltage) && w.voltage >= 0 && w.voltage <= 100 ? w.voltage : null;
    wiring.push({
      id: str(w.id, 80),
      controllerPin: str(w.controllerPin, 40),
      componentRef: str(w.componentRef, 120),
      componentPin: str(w.componentPin, 40),
      interface: w.interface as WiringRecord['interface'],
      voltage,
      direction: w.direction as WiringRecord['direction'],
      sourceRef: /^(component|hardware):/.test(str(w.sourceRef)) ? str(w.sourceRef, 120) : '',
      notes: str(w.notes),
    });
  }

  const guideRaw = isObj(raw.guide) ? raw.guide : {};
  const steps: Record<string, StepState> = {};
  for (const [stepId, s] of Object.entries(isObj(guideRaw.steps) ? guideRaw.steps : {})) {
    if (!isObj(s) || !STATUSES.has(s.status as string) || stepId.length > 160) {
      drop();
      continue;
    }
    steps[stepId] = { status: s.status as StepState['status'], note: str(s.note, 2000), updatedAt: dateOr(s.updatedAt, new Date(0).toISOString())! };
  }
  const guide: GuideState = { generatedAt: dateOr(guideRaw.generatedAt, null), steps };

  return { mappings, hardware, bomExtras, wiring, guide, bomGeneratedAt: dateOr(raw.bomGeneratedAt, null) };
}

export function normalizeBlueprint(raw: unknown, now: string): NormalizeResult {
  if (raw === undefined || raw === null) return { blueprint: emptyBlueprint(now), dropped: 0 };
  if (!isObj(raw)) return { blueprint: emptyBlueprint(now), dropped: 1 };
  const counter = { dropped: 0 };
  const data = normalizeData(raw, counter);

  const history: HistoryEvent[] = [];
  for (const e of Array.isArray(raw.history) ? raw.history : []) {
    if (!isObj(e) || !EVENT_TYPES.has(e.type as string) || !dateOr(e.timestamp, null)) {
      counter.dropped += 1;
      continue;
    }
    history.push({
      id: str(e.id, 80),
      timestamp: e.timestamp as string,
      type: e.type as HistoryEvent['type'],
      component: str(e.component, 160),
      previous: str(e.previous, 300),
      next: str(e.next, 300),
      note: str(e.note, 300),
    });
  }

  const snapshots: BlueprintSnapshot[] = [];
  for (const s of Array.isArray(raw.snapshots) ? raw.snapshots : []) {
    if (!isObj(s) || !isObj(s.data) || !dateOr(s.createdAt, null)) {
      counter.dropped += 1;
      continue;
    }
    snapshots.push({ id: str(s.id, 80), label: str(s.label, 80), createdAt: s.createdAt as string, data: normalizeData(s.data, counter) });
  }

  return {
    blueprint: {
      version: BLUEPRINT_VERSION,
      createdAt: dateOr(raw.createdAt, now)!,
      ...data,
      history: history.slice(-HISTORY_LIMIT),
      snapshots: snapshots.slice(-SNAPSHOT_LIMIT),
    },
    dropped: counter.dropped,
  };
}
