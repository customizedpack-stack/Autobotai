import type { RobotActuator, RobotController } from '../../../types/actuator';
import type { RobotJoint } from '../../../types/joint';
import type { SceneObject } from '../../../types/scene';
import type { RobotSensor } from '../../../types/sensor';
import type { CatalogPart, PartCategory } from '../catalog/types';
import type { BlueprintData, HardwareItem, PartMapping, TargetKind } from '../model/types';

/** Read-only view of the robot model that the blueprint engines use. */
export interface ModelView {
  objects: readonly SceneObject[];
  joints: readonly RobotJoint[];
  actuators: readonly RobotActuator[];
  controllers: readonly RobotController[];
  sensors: readonly RobotSensor[];
}

export interface VirtualComponent {
  /** `component:<id>` or `hardware:<id>`. */
  ref: string;
  kind: TargetKind;
  id: string;
  name: string;
  /** Scene category or hardware role, for display and picker filters. */
  category: string;
  /** Catalog categories that usually fit (only used to pre-select the picker filter). */
  suggestedCategories: PartCategory[];
  /** Virtual size in mm (sorted largest first), or null for hardware items. */
  virtualSizeMm: number[] | null;
  /** Virtual wheel diameter in mm for cylinder wheels. */
  virtualWheelDiameterMm: number | null;
  /** Mass override set in Build Mode (kg → g), if any. */
  virtualMassG: number | null;
  mapping: PartMapping | null;
  /** Sensors configured on this part (Phase 6 / 8), for context. */
  sensorNames: string[];
}

export const refOf = (kind: TargetKind, id: string) => `${kind}:${id}`;

const round = (n: number) => Math.round(n * 10) / 10;

function virtualSize(o: SceneObject): number[] {
  const [sx, sy, sz] = o.transform.scale;
  const g = o.geometry;
  let dims: number[];
  switch (g.shape) {
    case 'box':
      dims = [g.size[0] * sx, g.size[1] * sy, g.size[2] * sz];
      break;
    case 'cylinder':
      dims = [g.radius * 2 * Math.max(sx, sz), g.height * sy, g.radius * 2 * Math.max(sx, sz)];
      break;
    case 'sphere':
      dims = [g.radius * 2 * sx, g.radius * 2 * sy, g.radius * 2 * sz];
      break;
    case 'capsule':
      dims = [g.radius * 2 * sx, (g.length + g.radius * 2) * sy, g.radius * 2 * sz];
      break;
    case 'cone':
      dims = [g.radius * 2 * sx, g.height * sy, g.radius * 2 * sz];
      break;
  }
  return dims.map((d) => round(d * 1000)).sort((a, b) => b - a);
}

const SUGGEST: Record<string, PartCategory[]> = {
  chassis: ['mechanical'],
  body: ['mechanical'],
  wheel: ['mechanical'],
  motor: ['motor'],
  sensor: ['sensor', 'camera'],
  joint: ['mechanical'],
  other: ['controller', 'mechanical'],
  driver: ['driver'],
  controller: ['controller'],
  battery: ['power'],
  'battery-holder': ['power'],
  regulator: ['power'],
};

export function virtualComponents(model: ModelView, data: BlueprintData): VirtualComponent[] {
  const byTarget = new Map(data.mappings.map((m) => [refOf(m.targetKind, m.targetId), m]));
  const sensorNames = new Map<string, string[]>();
  for (const s of model.sensors) {
    const partId = (s as { partId?: string }).partId;
    if (!partId) continue;
    sensorNames.set(partId, [...(sensorNames.get(partId) ?? []), s.name]);
  }
  const fromModel: VirtualComponent[] = model.objects.map((o) => {
    const size = virtualSize(o);
    const isWheel = o.category === 'wheel' && o.geometry.shape === 'cylinder';
    return {
      ref: refOf('component', o.id),
      kind: 'component',
      id: o.id,
      name: o.name,
      category: o.category,
      suggestedCategories: SUGGEST[o.category] ?? ['mechanical'],
      virtualSizeMm: size,
      virtualWheelDiameterMm: isWheel && o.geometry.shape === 'cylinder' ? round(o.geometry.radius * 2 * 1000 * Math.max(o.transform.scale[0], o.transform.scale[2])) : null,
      virtualMassG: o.physics?.mass !== undefined ? round(o.physics.mass * 1000) : null,
      mapping: byTarget.get(refOf('component', o.id)) ?? null,
      sensorNames: sensorNames.get(o.id) ?? [],
    };
  });
  const fromHardware: VirtualComponent[] = data.hardware.map((h: HardwareItem) => ({
    ref: refOf('hardware', h.id),
    kind: 'hardware',
    id: h.id,
    name: h.name,
    category: h.role,
    suggestedCategories: SUGGEST[h.role] ?? ['power'],
    virtualSizeMm: null,
    virtualWheelDiameterMm: null,
    virtualMassG: null,
    mapping: byTarget.get(refOf('hardware', h.id)) ?? null,
    sensorNames: [],
  }));
  return [...fromModel, ...fromHardware];
}

/** Mappings whose component or hardware item no longer exists. They are kept and flagged, never removed silently. */
export function orphanMappings(model: ModelView, data: BlueprintData): PartMapping[] {
  const objects = new Set(model.objects.map((o) => o.id));
  const hardware = new Set(data.hardware.map((h) => h.id));
  return data.mappings.filter((m) => (m.targetKind === 'component' ? !objects.has(m.targetId) : !hardware.has(m.targetId)));
}

export interface Difference {
  label: string;
  virtual: string;
  physical: string;
}

/** Differences between the virtual component and the mapped physical part (only where both values are known). */
export function differences(vc: VirtualComponent, part: CatalogPart): Difference[] {
  const out: Difference[] = [];
  const s = part.specs;
  if (vc.virtualWheelDiameterMm !== null && s.wheelDiameterMm !== undefined) {
    const ratio = Math.abs(vc.virtualWheelDiameterMm - s.wheelDiameterMm) / s.wheelDiameterMm;
    if (ratio > 0.1) out.push({ label: 'Wheel diameter', virtual: `${vc.virtualWheelDiameterMm} mm`, physical: `${s.wheelDiameterMm} mm` });
  }
  const physical = [s.lengthMm, s.widthMm, s.heightMm].filter((v): v is number => v !== undefined).sort((a, b) => b - a);
  if (vc.virtualSizeMm && physical.length === 3 && vc.virtualWheelDiameterMm === null) {
    const largestRatio = Math.abs(vc.virtualSizeMm[0]! - physical[0]!) / physical[0]!;
    if (largestRatio > 0.25) out.push({ label: 'Size (largest first)', virtual: `${vc.virtualSizeMm.join(' × ')} mm`, physical: `${physical.join(' × ')} mm` });
  }
  if (vc.virtualMassG !== null && s.weightG !== undefined && Math.abs(vc.virtualMassG - s.weightG) / s.weightG > 0.25) {
    out.push({ label: 'Mass', virtual: `${vc.virtualMassG} g`, physical: `${s.weightG} g` });
  }
  return out;
}
