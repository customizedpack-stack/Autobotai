import { programsForProject, useProgramStore } from '../code-studio/storage/programStore';
import { useSceneStore } from '../../stores/sceneStore';
import { createId } from '../../utils/id';
import { log } from '../../utils/logger';
import { catalogIfLoaded } from './catalog/catalog';
import type { CatalogPart } from './catalog/types';
import { useBlueprintStore, dataOf, type HistoryInput } from './blueprintStore';
import { checkCompatibility } from './engine/compatibility';
import { standardWiring } from './engine/wiring';
import { refOf, virtualComponents, type ModelView } from './engine/virtualComponents';
import type { BlueprintData, BomExtra, HardwareRole, StepStatus, TargetKind, WiringRecord } from './model/types';

/**
 * Blueprint commands used by the UI (and tests). Each command is one undo step
 * and records its Build History events. None of them changes the robot model.
 */

export function modelView(): ModelView {
  const s = useSceneStore.getState();
  return { objects: s.objects, joints: s.joints, actuators: s.actuators, controllers: s.controllers, sensors: s.sensors };
}

const data = (): BlueprintData => dataOf(useBlueprintStore.getState().blueprint);
const apply = (label: string, next: BlueprintData, events: HistoryInput[] = []) => useBlueprintStore.getState().apply(label, next, events);

function targetName(kind: TargetKind, id: string): string {
  return virtualComponents(modelView(), data()).find((v) => v.ref === refOf(kind, id))?.name ?? id;
}

export function targetExists(kind: TargetKind, id: string): boolean {
  return kind === 'component' ? useSceneStore.getState().objects.some((o) => o.id === id) : data().hardware.some((h) => h.id === id);
}

/** Map (or replace) the real part of one virtual component. The part is stored as a snapshot. */
export function mapPart(kind: TargetKind, targetId: string, part: CatalogPart): boolean {
  if (!targetExists(kind, targetId)) {
    log.warning('blueprint', 'That component no longer exists; nothing was mapped.');
    return false;
  }
  const d = data();
  const existing = d.mappings.find((m) => m.targetKind === kind && m.targetId === targetId);
  const name = targetName(kind, targetId);
  if (existing?.partId === part.id) return false;
  const snapshot = structuredClone(part);
  const mappings = existing
    ? d.mappings.map((m) => (m.id === existing.id ? { ...m, partId: part.id, snapshot, mappedAt: new Date().toISOString() } : m))
    : [...d.mappings, { id: createId('bpm'), targetKind: kind, targetId, partId: part.id, snapshot, quantity: 1, required: true, note: '', mappedAt: new Date().toISOString() }];
  apply(existing ? `Replace part of ${name}` : `Map part to ${name}`, { ...d, mappings }, [
    existing
      ? { type: 'part.replaced', component: name, previous: existing.snapshot.name, next: part.name, note: '' }
      : { type: 'part.mapped', component: name, previous: '', next: part.name, note: '' },
  ]);
  log.success('blueprint', existing ? `${name}: replaced ${existing.snapshot.name} with ${part.name}.` : `${name}: mapped to ${part.name}.`);
  return true;
}

export function unmapPart(mappingId: string): void {
  const d = data();
  const m = d.mappings.find((x) => x.id === mappingId);
  if (!m) return;
  const name = targetName(m.targetKind, m.targetId);
  apply(`Remove part from ${name}`, { ...d, mappings: d.mappings.filter((x) => x.id !== mappingId) }, [{ type: 'part.unmapped', component: name, previous: m.snapshot.name, next: '', note: '' }]);
}

export function setMappingQuantity(mappingId: string, quantity: number): void {
  const d = data();
  const m = d.mappings.find((x) => x.id === mappingId);
  const q = Math.round(quantity);
  if (!m || !Number.isFinite(q) || q < 1 || q > 10000 || q === m.quantity) return;
  apply('Change quantity', { ...d, mappings: d.mappings.map((x) => (x.id === mappingId ? { ...x, quantity: q } : x)) }, [{ type: 'bom.updated', component: targetName(m.targetKind, m.targetId), previous: `Quantity ${m.quantity}`, next: `Quantity ${q}`, note: '' }]);
}

/** Assign a motor mapping to the mapping of the motor driver it is wired to (null clears the assignment). */
export function setMotorDriver(motorMappingId: string, driverMappingId: string | null): boolean {
  const d = data();
  const motor = d.mappings.find((m) => m.id === motorMappingId && m.snapshot.role === 'dc-gearmotor');
  const driver = driverMappingId ? d.mappings.find((m) => m.id === driverMappingId && m.snapshot.role === 'dual-motor-driver') : null;
  if (!motor || (driverMappingId && !driver) || (motor.driverMappingId ?? null) === driverMappingId) return false;
  const nameOfMapping = (id: string | undefined) => {
    const m = id ? d.mappings.find((x) => x.id === id) : undefined;
    return m ? targetName(m.targetKind, m.targetId) : '';
  };
  const mappings = d.mappings.map((m) => {
    if (m.id !== motorMappingId) return m;
    const next = { ...m };
    if (driverMappingId) next.driverMappingId = driverMappingId;
    else delete next.driverMappingId;
    return next;
  });
  const motorName = targetName(motor.targetKind, motor.targetId);
  apply(`Assign driver of ${motorName}`, { ...d, mappings }, [{ type: 'motor.assigned', component: motorName, previous: nameOfMapping(motor.driverMappingId) || 'Not assigned', next: nameOfMapping(driverMappingId ?? undefined) || 'Not assigned', note: '' }]);
  return true;
}

export function setMappingRequired(mappingId: string, required: boolean): void {
  const d = data();
  const m = d.mappings.find((x) => x.id === mappingId);
  if (!m || m.required === required) return;
  apply(required ? 'Mark part required' : 'Mark part optional', { ...d, mappings: d.mappings.map((x) => (x.id === mappingId ? { ...x, required } : x)) }, [{ type: 'bom.updated', component: m.snapshot.name, previous: m.required ? 'Required' : 'Optional', next: required ? 'Required' : 'Optional', note: '' }]);
}

/** Replace the stored snapshot with the current catalog data (only when the user asks). */
export function updateSnapshotFromCatalog(mappingId: string): boolean {
  const catalog = catalogIfLoaded();
  const d = data();
  const m = d.mappings.find((x) => x.id === mappingId);
  const current = m && catalog?.byId.get(m.partId);
  if (!m || !current) return false;
  apply('Update part data', { ...d, mappings: d.mappings.map((x) => (x.id === mappingId ? { ...x, snapshot: structuredClone(current) } : x)) }, [{ type: 'part.replaced', component: targetName(m.targetKind, m.targetId), previous: `${m.snapshot.name} (checked ${m.snapshot.source.verifiedAt})`, next: `${current.name} (checked ${current.source.verifiedAt})`, note: 'Snapshot updated to catalog data.' }]);
  return true;
}

export const HARDWARE_ROLES: { id: HardwareRole; label: string }[] = [
  { id: 'driver', label: 'Motor driver' },
  { id: 'controller', label: 'Controller' },
  { id: 'battery-holder', label: 'Battery holder' },
  { id: 'battery', label: 'Battery cells' },
  { id: 'regulator', label: 'Voltage regulator' },
  { id: 'sensor', label: 'Sensor' },
  { id: 'other', label: 'Other electronics' },
];

export function addHardware(role: HardwareRole, name?: string): string {
  const d = data();
  const label = HARDWARE_ROLES.find((r) => r.id === role)?.label ?? 'Hardware';
  const base = (name ?? label).trim().slice(0, 80) || label;
  let finalName = base;
  for (let n = 2; d.hardware.some((h) => h.name === finalName); n += 1) finalName = `${base} ${n}`;
  const id = createId('bph');
  apply(`Add ${finalName}`, { ...d, hardware: [...d.hardware, { id, role, name: finalName }] }, [{ type: 'hardware.added', component: finalName, previous: '', next: label, note: 'Blueprint-only item: it is not added to the 3D model.' }]);
  return id;
}

export function removeHardware(id: string): void {
  const d = data();
  const h = d.hardware.find((x) => x.id === id);
  if (!h) return;
  // Its mapping goes with it (one undo step); wiring records that point to it are kept and flagged.
  apply(`Remove ${h.name}`, { ...d, hardware: d.hardware.filter((x) => x.id !== id), mappings: d.mappings.filter((m) => !(m.targetKind === 'hardware' && m.targetId === id)) }, [{ type: 'hardware.removed', component: h.name, previous: h.role, next: '', note: '' }]);
}

export function addExtra(input: { name: string; quantity: number; required: boolean; note?: string; part?: CatalogPart | null }): void {
  const d = data();
  const name = (input.part?.name ?? input.name).trim().slice(0, 120);
  const quantity = Math.round(input.quantity);
  if (!name || !Number.isFinite(quantity) || quantity < 1 || quantity > 10000) return;
  const extra: BomExtra = { id: createId('bpx'), name, quantity, required: input.required, note: (input.note ?? '').slice(0, 500), partId: input.part?.id ?? null, snapshot: input.part ? structuredClone(input.part) : null };
  apply(`Add ${name}`, { ...d, bomExtras: [...d.bomExtras, extra] }, [{ type: 'bom.updated', component: name, previous: '', next: `${quantity} × ${input.required ? 'required' : 'optional'}`, note: 'Extra hardware added.' }]);
}

export function updateExtra(id: string, patch: Partial<Pick<BomExtra, 'quantity' | 'required' | 'note'>>): void {
  const d = data();
  const e = d.bomExtras.find((x) => x.id === id);
  if (!e) return;
  const quantity = patch.quantity !== undefined ? Math.round(patch.quantity) : e.quantity;
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10000) return;
  const next = { ...e, ...patch, quantity };
  if (JSON.stringify(next) === JSON.stringify(e)) return;
  apply(`Change ${e.name}`, { ...d, bomExtras: d.bomExtras.map((x) => (x.id === id ? next : x)) }, [{ type: 'bom.updated', component: e.name, previous: `${e.quantity} × ${e.required ? 'required' : 'optional'}`, next: `${quantity} × ${next.required ? 'required' : 'optional'}`, note: '' }]);
}

export function removeExtra(id: string): void {
  const d = data();
  const e = d.bomExtras.find((x) => x.id === id);
  if (!e) return;
  apply(`Remove ${e.name}`, { ...d, bomExtras: d.bomExtras.filter((x) => x.id !== id) }, [{ type: 'bom.updated', component: e.name, previous: `${e.quantity}`, next: '', note: 'Extra hardware removed.' }]);
}

export function markBomGenerated(): void {
  const d = data();
  apply('Generate BOM', { ...d, bomGeneratedAt: new Date().toISOString() }, [{ type: 'bom.generated', component: 'Bill of materials', previous: '', next: `${d.mappings.length + d.bomExtras.length} entries`, note: '' }]);
}

export function addWiring(record: Omit<WiringRecord, 'id'>): string {
  const d = data();
  const id = createId('bpw');
  apply('Add wire', { ...d, wiring: [...d.wiring, { ...record, id }] }, [{ type: 'wiring.updated', component: record.componentPin || 'Wire', previous: '', next: `${record.controllerPin || '?'} → ${record.componentPin || '?'}`, note: 'Wire added.' }]);
  return id;
}

export function updateWiring(id: string, patch: Partial<Omit<WiringRecord, 'id'>>): void {
  const d = data();
  const w = d.wiring.find((x) => x.id === id);
  if (!w) return;
  const next = { ...w, ...patch };
  if (next.voltage !== null && (!Number.isFinite(next.voltage) || next.voltage < 0 || next.voltage > 100)) return;
  if (JSON.stringify(next) === JSON.stringify(w)) return;
  apply('Edit wire', { ...d, wiring: d.wiring.map((x) => (x.id === id ? next : x)) }, [{ type: 'wiring.updated', component: w.componentPin || 'Wire', previous: `${w.controllerPin || '?'} → ${w.componentPin || '?'}${w.voltage !== null ? ` @ ${w.voltage} V` : ''}`, next: `${next.controllerPin || '?'} → ${next.componentPin || '?'}${next.voltage !== null ? ` @ ${next.voltage} V` : ''}`, note: '' }]);
}

export function removeWiring(id: string): void {
  const d = data();
  const w = d.wiring.find((x) => x.id === id);
  if (!w) return;
  apply('Remove wire', { ...d, wiring: d.wiring.filter((x) => x.id !== id) }, [{ type: 'wiring.updated', component: w.componentPin || 'Wire', previous: `${w.controllerPin || '?'} → ${w.componentPin || '?'}`, next: '', note: 'Wire removed.' }]);
}

export function addStandardWiring(): number {
  const d = data();
  const added = standardWiring(modelView(), d, () => createId('bpw'));
  if (added.length === 0) return 0;
  apply('Add standard wiring', { ...d, wiring: [...d.wiring, ...added] }, [{ type: 'wiring.updated', component: 'Wiring', previous: `${d.wiring.length} wires`, next: `${d.wiring.length + added.length} wires`, note: 'Starting wires added for the mapped parts; controller pins are left for you to choose.' }]);
  return added.length;
}

export function markGuideGenerated(): void {
  const d = data();
  const first = d.guide.generatedAt === null;
  apply(first ? 'Generate Build Guide' : 'Update Build Guide', { ...d, guide: { ...d.guide, generatedAt: new Date().toISOString() } }, [{ type: first ? 'guide.generated' : 'guide.updated', component: 'Build Guide', previous: '', next: '', note: first ? '' : 'Guide regenerated; step statuses and notes were kept.' }]);
}

export function setStepStatus(stepId: string, title: string, status: StepStatus): void {
  const d = data();
  const prev = d.guide.steps[stepId];
  if (prev?.status === status || (!prev && status === 'not-started')) return;
  const state = { status, note: prev?.note ?? '', updatedAt: new Date().toISOString() };
  apply(`Step: ${title}`, { ...d, guide: { ...d.guide, steps: { ...d.guide.steps, [stepId]: state } } }, [{ type: status === 'completed' ? 'step.status' : 'guide.updated', component: title, previous: prev?.status ?? 'not-started', next: status, note: '' }]);
}

export function setStepNote(stepId: string, title: string, note: string): void {
  const d = data();
  const prev = d.guide.steps[stepId];
  const text = note.slice(0, 2000);
  if ((prev?.note ?? '') === text) return;
  const state = { status: prev?.status ?? 'not-started', note: text, updatedAt: new Date().toISOString() };
  apply(`Note: ${title}`, { ...d, guide: { ...d.guide, steps: { ...d.guide.steps, [stepId]: state } } }, [{ type: 'guide.updated', component: title, previous: '', next: '', note: 'Step note changed.' }]);
}

export function currentChecks() {
  return checkCompatibility(modelView(), data(), catalogIfLoaded()?.byId);
}

export function projectProgramNames(): string[] {
  const projectId = useSceneStore.getState().projectId;
  if (!projectId) return [];
  return programsForProject(useProgramStore.getState().programs, projectId).map((p) => p.name);
}
