import type { CatalogPart } from '../catalog/types';

/**
 * Robot Blueprint data, stored on a project in the optional `blueprint` field.
 *
 * The blueprint never contains a copy of the robot model. It refers to the
 * model's components by id, and to catalog parts by id plus a snapshot of the
 * part as it was when it was selected (so a catalog update never silently
 * changes a robot).
 */

export const BLUEPRINT_VERSION = 1;
export const HISTORY_LIMIT = 1000;
export const SNAPSHOT_LIMIT = 20;

/** A virtual component: a part of the 3D model, or a blueprint-only hardware item. */
export type TargetKind = 'component' | 'hardware';

export interface PartMapping {
  id: string;
  targetKind: TargetKind;
  /** Scene object id (component) or hardware item id. */
  targetId: string;
  partId: string;
  /** The part as selected. Used for every check; the catalog is only consulted to detect updates. */
  snapshot: CatalogPart;
  /** Units of this part for this virtual component (default 1). */
  quantity: number;
  required: boolean;
  note: string;
  mappedAt: string;
}

/** Electronics that the 3D model does not contain (driver, battery, regulator…). Not part of the robot model. */
export type HardwareRole = 'driver' | 'controller' | 'battery' | 'battery-holder' | 'regulator' | 'sensor' | 'other';

export interface HardwareItem {
  id: string;
  role: HardwareRole;
  name: string;
}

/** Extra BOM line (screws, wires, switch…), optionally linked to a catalog part. */
export interface BomExtra {
  id: string;
  name: string;
  quantity: number;
  required: boolean;
  note: string;
  partId: string | null;
  snapshot: CatalogPart | null;
}

export type WireInterface = 'power' | 'ground' | 'digital' | 'pwm' | 'analog' | 'i2c-sda' | 'i2c-scl' | 'spi' | 'uart-tx' | 'uart-rx' | 'motor';
export type WireDirection = 'controller-to-component' | 'component-to-controller' | 'bidirectional' | 'power-supply';

export interface WiringRecord {
  id: string;
  /** Pin on the controller or power source side (empty = unspecified). */
  controllerPin: string;
  /** Reference of the other end: `component:<id>` or `hardware:<id>`. */
  componentRef: string;
  componentPin: string;
  interface: WireInterface;
  /** Voltage level on this wire, as entered (null = unknown). */
  voltage: number | null;
  direction: WireDirection;
  /** Source side reference for power wires (`hardware:<id>` / `component:<id>`), or empty for the controller. */
  sourceRef: string;
  notes: string;
}

export type StepStatus = 'not-started' | 'in-progress' | 'completed' | 'blocked';

export interface StepState {
  status: StepStatus;
  note: string;
  updatedAt: string;
}

export interface GuideState {
  /** When the user last generated (or regenerated) the guide; null = not generated yet. */
  generatedAt: string | null;
  /** Per-step state by stable step id. Kept for steps that later disappear, so nothing is lost. */
  steps: Record<string, StepState>;
}

export type HistoryEventType =
  | 'blueprint.created'
  | 'component.added'
  | 'component.removed'
  | 'part.mapped'
  | 'part.replaced'
  | 'part.unmapped'
  | 'hardware.added'
  | 'hardware.removed'
  | 'joint.changed'
  | 'motor.changed'
  | 'sensor.changed'
  | 'wiring.updated'
  | 'program.changed'
  | 'simulation.completed'
  | 'bom.generated'
  | 'bom.updated'
  | 'guide.generated'
  | 'guide.updated'
  | 'step.status'
  | 'snapshot.created'
  | 'snapshot.restored'
  | 'undo'
  | 'redo';

export interface HistoryEvent {
  id: string;
  timestamp: string;
  type: HistoryEventType;
  /** Name of the component, part or item concerned (no secrets, no readings). */
  component: string;
  previous: string;
  next: string;
  note: string;
}

/** The part of the blueprint that undo / redo and snapshots work on. */
export interface BlueprintData {
  mappings: PartMapping[];
  hardware: HardwareItem[];
  bomExtras: BomExtra[];
  wiring: WiringRecord[];
  guide: GuideState;
  /** When the user last generated the BOM (null = never). */
  bomGeneratedAt: string | null;
}

export interface BlueprintSnapshot {
  id: string;
  label: string;
  createdAt: string;
  data: BlueprintData;
}

export interface Blueprint extends BlueprintData {
  version: number;
  createdAt: string;
  history: HistoryEvent[];
  snapshots: BlueprintSnapshot[];
}

export function emptyBlueprintData(): BlueprintData {
  return { mappings: [], hardware: [], bomExtras: [], wiring: [], guide: { generatedAt: null, steps: {} }, bomGeneratedAt: null };
}

export function emptyBlueprint(now: string): Blueprint {
  return { version: BLUEPRINT_VERSION, createdAt: now, ...emptyBlueprintData(), history: [], snapshots: [] };
}

/** True when the blueprint holds something the user made (history alone does not count). */
export function hasUserContent(b: BlueprintData & { snapshots?: unknown[] }): boolean {
  return (
    b.mappings.length > 0 ||
    b.hardware.length > 0 ||
    b.bomExtras.length > 0 ||
    b.wiring.length > 0 ||
    Object.keys(b.guide.steps).length > 0 ||
    b.guide.generatedAt !== null ||
    b.bomGeneratedAt !== null ||
    (b.snapshots?.length ?? 0) > 0
  );
}
