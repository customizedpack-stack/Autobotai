import type { CatalogPart } from '../catalog/types';
import type { BlueprintData, PartMapping, WiringRecord } from '../model/types';
import { orphanMappings, refOf, virtualComponents, type ModelView } from './virtualComponents';

/**
 * Wiring records and their validation. This is a planning aid, not a verified
 * schematic. A connection is drawn in the overview diagram only when both pins
 * are named, the voltage is known and no problem was found on it.
 */

export type WireIssueKind =
  | 'unspecified'
  | 'unknown-voltage'
  | 'voltage-mismatch'
  | 'gpio-overvoltage'
  | 'insufficient-current'
  | 'missing-ground'
  | 'missing-protection'
  | 'unknown-endpoint';

export interface WireIssue {
  kind: WireIssueKind;
  severity: 'error' | 'warning';
  message: string;
  recordId: string | null;
}

export const ISSUE_LABELS: Record<WireIssueKind, string> = {
  unspecified: 'Unspecified connection',
  'unknown-voltage': 'Unknown voltage',
  'voltage-mismatch': 'Voltage mismatch',
  'gpio-overvoltage': 'GPIO overvoltage',
  'insufficient-current': 'Insufficient current',
  'missing-ground': 'Missing common ground',
  'missing-protection': 'Missing protection',
  'unknown-endpoint': 'Unknown endpoint',
};

export interface WiringReport {
  issues: WireIssue[];
  /** Record ids that are safe to draw. */
  drawable: Set<string>;
  controller: { mapping: PartMapping; name: string } | null;
}

export interface Endpoint {
  ref: string;
  name: string;
  part: CatalogPart | null;
}

export function endpoints(model: ModelView, data: BlueprintData): Endpoint[] {
  const orphans = new Set(orphanMappings(model, data).map((m) => m.id));
  return virtualComponents(model, data).map((v) => ({ ref: v.ref, name: v.name, part: v.mapping && !orphans.has(v.mapping.id) ? v.mapping.snapshot : null }));
}

function findController(data: BlueprintData, eps: Endpoint[]): WiringReport['controller'] {
  const m = data.mappings.find((x) => x.snapshot.role === 'microcontroller-board' || x.snapshot.role === 'single-board-computer');
  if (!m) return null;
  const ep = eps.find((e) => e.ref === refOf(m.targetKind, m.targetId));
  return ep ? { mapping: m, name: ep.name } : null;
}

/** Accepted supply range of a part on its power pin, if known. */
function supplyRange(part: CatalogPart, pin: string): [number, number] | null {
  const s = part.specs;
  if (part.role === 'dual-motor-driver') {
    if (/vm|vmot|motor/i.test(pin)) return s.motorVoltageMinV !== undefined && s.motorVoltageMaxV !== undefined ? [s.motorVoltageMinV, s.motorVoltageMaxV] : null;
    return s.logicVoltageMinV !== undefined && s.logicVoltageMaxV !== undefined ? [s.logicVoltageMinV, s.logicVoltageMaxV] : null;
  }
  if (part.role === 'step-down-regulator') return s.inputVoltageMinV !== undefined && s.inputVoltageMaxV !== undefined ? [s.inputVoltageMinV, s.inputVoltageMaxV] : null;
  if (part.role === 'dc-gearmotor') return s.ratedVoltageV !== undefined ? [0, s.ratedVoltageV * 1.5] : null;
  if (s.supplyVoltageMinV !== undefined && s.supplyVoltageMaxV !== undefined) return [s.supplyVoltageMinV, s.supplyVoltageMaxV];
  return null;
}

export function validateWiring(model: ModelView, data: BlueprintData): WiringReport {
  const eps = endpoints(model, data);
  const byRef = new Map(eps.map((e) => [e.ref, e]));
  const controller = findController(data, eps);
  const issues: WireIssue[] = [];
  const bad = new Set<string>();
  const flag = (recordId: string | null, kind: WireIssueKind, severity: WireIssue['severity'], message: string) => {
    issues.push({ kind, severity, message, recordId });
    if (recordId) bad.add(recordId);
  };

  for (const w of data.wiring) {
    const target = byRef.get(w.componentRef);
    if (!target) {
      flag(w.id, 'unknown-endpoint', 'error', `The component of this wire no longer exists (${w.componentRef}).`);
      continue;
    }
    if (w.sourceRef && !byRef.has(w.sourceRef)) flag(w.id, 'unknown-endpoint', 'error', `The source of this wire no longer exists (${w.sourceRef}).`);
    if (!w.controllerPin.trim() || !w.componentPin.trim()) flag(w.id, 'unspecified', 'warning', `${target.name}: ${!w.controllerPin.trim() ? 'source / controller pin' : 'component pin'} is not specified.`);
    if (w.voltage === null) {
      flag(w.id, 'unknown-voltage', 'warning', `${target.name} ${w.componentPin || ''}: the voltage on this wire is unknown, so it is not drawn.`.replace('  ', ' '));
      continue;
    }
    if (!target.part) {
      flag(w.id, 'unknown-voltage', 'warning', `${target.name} has no mapped part, so the voltage on this wire cannot be checked.`);
      continue;
    }
    if (w.interface === 'power' || w.interface === 'motor') {
      const range = supplyRange(target.part, w.componentPin);
      if (!range) flag(w.id, 'unknown-voltage', 'warning', `${target.name}: the accepted supply voltage is not stated, so ${w.voltage} V cannot be checked.`);
      else if (w.voltage < range[0] || w.voltage > range[1]) flag(w.id, 'voltage-mismatch', 'error', `${target.name} ${w.componentPin}: ${w.voltage} V is outside the accepted ${range[0]} – ${range[1]} V.`);
    } else if (w.interface !== 'ground') {
      // Signal into the controller: check the GPIO input limit.
      const intoController = w.direction === 'component-to-controller' || w.direction === 'bidirectional';
      const cSpecs = controller?.mapping.snapshot.specs;
      if (intoController) {
        if (cSpecs?.gpioMaxInputV === undefined) flag(w.id, 'unknown-voltage', 'warning', `The controller GPIO input limit is not known, so the ${w.voltage} V signal from ${target.name} cannot be checked.`);
        else if (w.voltage > cSpecs.gpioMaxInputV) flag(w.id, 'gpio-overvoltage', 'error', `${target.name} ${w.componentPin} sends ${w.voltage} V into ${w.controllerPin || 'a controller pin'}, above the ${cSpecs.gpioMaxInputV} V GPIO limit. Add a level shifter or divider.`);
      }
      const logic = target.part.specs.logicVoltageMaxV ?? target.part.specs.supplyVoltageMaxV;
      if (logic !== undefined && w.voltage > logic) flag(w.id, 'voltage-mismatch', 'error', `${target.name} ${w.componentPin}: ${w.voltage} V is above its ${logic} V maximum.`);
    }
  }

  // Current budget per power source (regulators): sum of typical currents of the loads they feed.
  const sources = new Map<string, WiringRecord[]>();
  for (const w of data.wiring) if (w.interface === 'power' && w.sourceRef) sources.set(w.sourceRef, [...(sources.get(w.sourceRef) ?? []), w]);
  for (const [ref, wires] of sources) {
    const src = byRef.get(ref);
    const max = src?.part?.specs.outputCurrentMaxA;
    if (!src || max === undefined) continue;
    const loads = wires.map((w) => byRef.get(w.componentRef)?.part?.specs.typicalCurrentA);
    const known = loads.reduce<number>((n, v) => n + (v ?? 0), 0);
    if (known > max) wires.forEach((w) => flag(w.id, 'insufficient-current', 'error', `${src.name} supplies at most ${max} A but its loads need about ${Math.round(known * 1000) / 1000} A.`));
  }

  // Common ground: every part that gets power or exchanges signals needs a ground wire.
  const powered = new Set(data.wiring.filter((w) => w.interface !== 'ground').map((w) => w.componentRef));
  const grounded = new Set(data.wiring.filter((w) => w.interface === 'ground').map((w) => w.componentRef));
  if (controller) grounded.add(refOf(controller.mapping.targetKind, controller.mapping.targetId));
  for (const ref of powered) {
    if (!grounded.has(ref) && byRef.get(ref)?.part?.role !== 'dc-gearmotor') flag(null, 'missing-ground', 'error', `${byRef.get(ref)?.name ?? ref} has no ground wire. All parts need a common ground with the controller.`);
  }

  // Protection: a battery should have a fuse or switch somewhere in the blueprint.
  const hasBattery = data.mappings.some((m) => m.snapshot.role === 'battery-holder' || m.snapshot.role === 'battery-cell');
  const hasProtection = [...data.bomExtras.map((e) => e.name), ...data.hardware.map((h) => h.name)].some((n) => /fuse|switch|protect/i.test(n));
  if (hasBattery && !hasProtection) flag(null, 'missing-protection', 'warning', 'No fuse or power switch is listed. Add one between the battery and the rest of the robot (BOM → Add extra item).');

  const drawable = new Set(data.wiring.filter((w) => !bad.has(w.id) && w.voltage !== null && w.controllerPin.trim() && w.componentPin.trim() && byRef.has(w.componentRef)).map((w) => w.id));
  return { issues, drawable, controller };
}

/**
 * Starting wiring records for the mapped parts. Pins on the controller side are
 * left empty (unspecified) because the right pin depends on the board; the user
 * fills them in. Voltages are only filled where they are known from the specs.
 */
export function standardWiring(model: ModelView, data: BlueprintData, newId: () => string): WiringRecord[] {
  const eps = endpoints(model, data);
  const controller = findController(data, eps);
  const out: WiringRecord[] = [];
  const has = (ref: string, pin: string) => data.wiring.some((w) => w.componentRef === ref && w.componentPin === pin);
  const push = (w: Omit<WiringRecord, 'id'>) => {
    if (!has(w.componentRef, w.componentPin)) out.push({ id: newId(), ...w });
  };
  const logicV = controller?.mapping.snapshot.specs.logicVoltageV ?? null;
  const battery = data.mappings.find((m) => m.snapshot.role === 'battery-holder');
  const batteryRef = battery ? refOf(battery.targetKind, battery.targetId) : '';
  const cell = data.mappings.find((m) => m.snapshot.role === 'battery-cell');
  const packV = battery?.snapshot.specs.cellCount !== undefined && cell?.snapshot.specs.nominalVoltageV !== undefined ? Math.round(battery.snapshot.specs.cellCount * cell.snapshot.specs.nominalVoltageV * 100) / 100 : null;

  for (const m of data.mappings) {
    const ref = refOf(m.targetKind, m.targetId);
    if (!eps.some((e) => e.ref === ref)) continue;
    if (m.snapshot.role === 'dual-motor-driver') {
      push({ controllerPin: battery ? '+' : '', sourceRef: batteryRef, componentRef: ref, componentPin: 'VM', interface: 'power', voltage: packV, direction: 'power-supply', notes: 'Motor supply.' });
      push({ controllerPin: logicV !== null ? `${logicV}V` : '', sourceRef: '', componentRef: ref, componentPin: 'VCC', interface: 'power', voltage: logicV, direction: 'power-supply', notes: 'Logic supply from the controller.' });
      push({ controllerPin: 'GND', sourceRef: '', componentRef: ref, componentPin: 'GND', interface: 'ground', voltage: 0, direction: 'power-supply', notes: 'Common ground (also connect the battery negative).' });
      for (const pin of ['AIN1', 'AIN2', 'PWMA', 'BIN1', 'BIN2', 'PWMB', 'STBY']) {
        push({ controllerPin: '', sourceRef: '', componentRef: ref, componentPin: pin, interface: pin.startsWith('PWM') ? 'pwm' : 'digital', voltage: logicV, direction: 'controller-to-component', notes: '' });
      }
    }
    if (m.snapshot.role === 'distance-sensor') {
      const s = m.snapshot.specs;
      const i2c = s.interfaces?.includes('I2C');
      const supply = logicV !== null && s.supplyVoltageMinV !== undefined && s.supplyVoltageMaxV !== undefined && logicV >= s.supplyVoltageMinV && logicV <= s.supplyVoltageMaxV ? logicV : s.supplyVoltageMinV ?? null;
      push({ controllerPin: supply !== null ? `${supply}V` : '', sourceRef: '', componentRef: ref, componentPin: 'VIN', interface: 'power', voltage: supply, direction: 'power-supply', notes: '' });
      push({ controllerPin: 'GND', sourceRef: '', componentRef: ref, componentPin: 'GND', interface: 'ground', voltage: 0, direction: 'power-supply', notes: '' });
      if (i2c) {
        push({ controllerPin: '', sourceRef: '', componentRef: ref, componentPin: 'SDA', interface: 'i2c-sda', voltage: supply, direction: 'bidirectional', notes: '' });
        push({ controllerPin: '', sourceRef: '', componentRef: ref, componentPin: 'SCL', interface: 'i2c-scl', voltage: supply, direction: 'controller-to-component', notes: '' });
      } else {
        push({ controllerPin: '', sourceRef: '', componentRef: ref, componentPin: 'TRIG', interface: 'digital', voltage: logicV, direction: 'controller-to-component', notes: '' });
        push({ controllerPin: '', sourceRef: '', componentRef: ref, componentPin: 'ECHO', interface: 'digital', voltage: s.signalOutputV ?? null, direction: 'component-to-controller', notes: '' });
      }
    }
    if (m.snapshot.role === 'step-down-regulator') {
      push({ controllerPin: battery ? '+' : '', sourceRef: batteryRef, componentRef: ref, componentPin: 'VIN', interface: 'power', voltage: packV, direction: 'power-supply', notes: '' });
      push({ controllerPin: 'GND', sourceRef: '', componentRef: ref, componentPin: 'GND', interface: 'ground', voltage: 0, direction: 'power-supply', notes: '' });
    }
  }
  return out;
}
