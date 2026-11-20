import type { CatalogPart, PartRole } from '../catalog/types';
import type { BlueprintData, PartMapping } from '../model/types';
import { orphanMappings, refOf, virtualComponents, type ModelView } from './virtualComponents';

/**
 * Compatibility engine (pure functions).
 *
 * Rules:
 * - A check whose inputs are not all known is UNKNOWN, never compatible.
 * - Every warning and incompatibility carries a reason.
 * - Checks only use the saved part snapshots and the robot model.
 * - This is a design aid. It is not an electrical safety certification.
 */

export type CompatStatus = 'compatible' | 'warning' | 'incompatible' | 'unknown';
export type CompatArea = 'motor-driver' | 'controller-sensor' | 'power' | 'mechanical' | 'catalog';

export interface CompatCheck {
  id: string;
  area: CompatArea;
  status: CompatStatus;
  title: string;
  reason: string;
  /** Mapping ids this check is about (used to show the status per part and per BOM line). */
  mappingIds: string[];
}

export const AREA_LABELS: Record<CompatArea, string> = {
  'motor-driver': 'Motors and driver',
  'controller-sensor': 'Controller, driver logic and sensors',
  power: 'Power',
  mechanical: 'Mechanical',
  catalog: 'Catalog data',
};

const RANK: Record<CompatStatus, number> = { compatible: 0, unknown: 1, warning: 2, incompatible: 3 };

/** Worst status of a set. Empty → unknown (nothing was checked). */
export function worst(statuses: CompatStatus[]): CompatStatus {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

const fmt = (n: number, unit: string) => `${Math.round(n * 1000) / 1000} ${unit}`;

interface Mapped {
  m: PartMapping;
  p: CatalogPart;
  name: string;
}

export function checkCompatibility(model: ModelView, data: BlueprintData, catalogById?: ReadonlyMap<string, CatalogPart>): CompatCheck[] {
  const checks: CompatCheck[] = [];
  const add = (c: CompatCheck) => checks.push(c);
  const orphans = new Set(orphanMappings(model, data).map((m) => m.id));
  const names = new Map(virtualComponents(model, data).map((v) => [v.ref, v.name]));
  const live: Mapped[] = data.mappings
    .filter((m) => !orphans.has(m.id))
    .map((m) => ({ m, p: m.snapshot, name: names.get(refOf(m.targetKind, m.targetId)) ?? m.snapshot.name }));
  const extras: CatalogPart[] = data.bomExtras.flatMap((e) => (e.snapshot ? [e.snapshot] : []));
  const byRole = (...roles: PartRole[]) => live.filter((x) => roles.includes(x.p.role));

  const motors = byRole('dc-gearmotor');
  const drivers = byRole('dual-motor-driver');
  const controllers = byRole('microcontroller-board', 'single-board-computer');
  const sensors = byRole('distance-sensor');
  const wheels = byRole('wheel');
  const holders = byRole('battery-holder');
  const cells = byRole('battery-cell');
  const regulators = byRole('step-down-regulator');
  const controller = controllers[0];

  // ── Catalog data ──
  for (const id of orphans) {
    const m = data.mappings.find((x) => x.id === id)!;
    add({ id: `orphan:${id}`, area: 'catalog', status: 'warning', title: `${m.snapshot.name}: component no longer exists`, reason: 'The 3D component this part was mapped to was removed. The mapping is kept so nothing is lost; remove or remap it in Real Parts.', mappingIds: [id] });
  }
  for (const { m, p, name } of live) {
    if (p.verification === 'unverified') {
      add({ id: `unverified:${m.id}`, area: 'catalog', status: 'warning', title: `${name}: generic part with unverified specs`, reason: `${p.name} has no single manufacturer. Its values come from one datasheet and clones can differ. Check the datasheet of the exact module you buy.`, mappingIds: [m.id] });
    }
    if (catalogById) {
      const current = catalogById.get(m.partId);
      if (!current) add({ id: `missing:${m.id}`, area: 'catalog', status: 'warning', title: `${name}: part not in the current catalog`, reason: `"${p.name}" is no longer in the catalog. The saved snapshot (checked ${p.source.verifiedAt}) is still used.`, mappingIds: [m.id] });
      else if (JSON.stringify(current) !== JSON.stringify(p)) add({ id: `stale:${m.id}`, area: 'catalog', status: 'warning', title: `${name}: catalog data changed`, reason: `The catalog entry for "${p.name}" differs from the saved snapshot. Nothing was changed in your robot. Review it and use "Update to catalog data" if you want the new data.`, mappingIds: [m.id] });
    }
  }

  // ── Motors and driver ──
  if (motors.length > 0 && drivers.length === 0) {
    add({ id: 'driver:missing', area: 'motor-driver', status: 'warning', title: 'No motor driver mapped', reason: 'DC motors cannot be powered from controller pins. Add a motor driver (Real Parts → Add hardware item → Motor driver) and map a driver part.', mappingIds: motors.map((x) => x.m.id) });
  }
  if (drivers.length > 0 && motors.length > 0) {
    const motorUnits = motors.reduce((n, x) => n + x.m.quantity, 0);
    const channelValues = drivers.map((x) => (x.p.specs.channels === undefined ? undefined : x.p.specs.channels * x.m.quantity));
    if (channelValues.some((v) => v === undefined)) {
      add({ id: 'driver:channels', area: 'motor-driver', status: 'unknown', title: 'Driver channel count unknown', reason: 'At least one driver does not state its channel count.', mappingIds: drivers.map((x) => x.m.id) });
    } else {
      const channels = channelValues.reduce((a, b) => a! + b!, 0)!;
      add({
        id: 'driver:channels',
        area: 'motor-driver',
        status: motorUnits > channels ? 'incompatible' : 'compatible',
        title: `${motorUnits} motor(s) on ${channels} driver channel(s)`,
        reason: motorUnits > channels ? 'There are more motors than driver channels. Add another driver or use a driver with more channels.' : 'Each motor has its own driver channel.',
        mappingIds: [...motors, ...drivers].map((x) => x.m.id),
      });
    }
    const driver = drivers[0]!;
    const d = driver.p.specs;
    for (const motor of motors) {
      const s = motor.p.specs;
      const ids = [motor.m.id, driver.m.id];
      const vTitle = `${motor.name} voltage vs ${driver.p.name}`;
      if (s.ratedVoltageV === undefined || d.motorVoltageMinV === undefined || d.motorVoltageMaxV === undefined) {
        add({ id: `mv:${motor.m.id}`, area: 'motor-driver', status: 'unknown', title: vTitle, reason: 'The motor rated voltage or the driver motor-voltage range is not stated.', mappingIds: ids });
      } else if (s.ratedVoltageV > d.motorVoltageMaxV) {
        add({ id: `mv:${motor.m.id}`, area: 'motor-driver', status: 'incompatible', title: vTitle, reason: `The motor is rated ${fmt(s.ratedVoltageV, 'V')}, above the driver maximum of ${fmt(d.motorVoltageMaxV, 'V')}.`, mappingIds: ids });
      } else if (s.ratedVoltageV < d.motorVoltageMinV) {
        add({ id: `mv:${motor.m.id}`, area: 'motor-driver', status: 'warning', title: vTitle, reason: `The motor is rated ${fmt(s.ratedVoltageV, 'V')}, below the driver minimum of ${fmt(d.motorVoltageMinV, 'V')}. The driver may not run reliably at that supply.`, mappingIds: ids });
      } else {
        add({ id: `mv:${motor.m.id}`, area: 'motor-driver', status: 'compatible', title: vTitle, reason: `Rated ${fmt(s.ratedVoltageV, 'V')} is inside the driver range ${fmt(d.motorVoltageMinV, 'V')} – ${fmt(d.motorVoltageMaxV, 'V')}.`, mappingIds: ids });
      }
      const cTitle = `${motor.name} current vs ${driver.p.name}`;
      if (s.stallCurrentA === undefined || d.continuousCurrentPerChannelA === undefined || d.peakCurrentPerChannelA === undefined) {
        add({ id: `mc:${motor.m.id}`, area: 'motor-driver', status: 'unknown', title: cTitle, reason: 'The motor stall current or the driver continuous / peak current per channel is not stated.', mappingIds: ids });
      } else if (s.stallCurrentA > d.peakCurrentPerChannelA) {
        add({ id: `mc:${motor.m.id}`, area: 'motor-driver', status: 'incompatible', title: cTitle, reason: `Stall current ${fmt(s.stallCurrentA, 'A')} is above the driver peak of ${fmt(d.peakCurrentPerChannelA, 'A')} per channel.`, mappingIds: ids });
      } else if (s.stallCurrentA > d.continuousCurrentPerChannelA) {
        add({ id: `mc:${motor.m.id}`, area: 'motor-driver', status: 'warning', title: cTitle, reason: `Stall current ${fmt(s.stallCurrentA, 'A')} is above the driver continuous rating of ${fmt(d.continuousCurrentPerChannelA, 'A')} (peak ${fmt(d.peakCurrentPerChannelA, 'A')}). Avoid long stalls; the driver can overheat.`, mappingIds: ids });
      } else {
        add({ id: `mc:${motor.m.id}`, area: 'motor-driver', status: 'compatible', title: cTitle, reason: `Stall current ${fmt(s.stallCurrentA, 'A')} is within the driver continuous rating of ${fmt(d.continuousCurrentPerChannelA, 'A')}.`, mappingIds: ids });
      }
    }
  }

  // ── Controller, driver logic and sensors ──
  if (controllers.length === 0 && (sensors.length > 0 || drivers.length > 0)) {
    add({ id: 'controller:missing', area: 'controller-sensor', status: 'warning', title: 'No controller mapped', reason: 'Sensors and the motor driver need a controller. Map a controller part to the Controller Board (or add a controller hardware item).', mappingIds: [...sensors, ...drivers].map((x) => x.m.id) });
  }
  if (controllers.length > 1) {
    add({ id: 'controller:multiple', area: 'controller-sensor', status: 'warning', title: `${controllers.length} controllers mapped`, reason: `Checks use the first controller (${controllers[0]!.p.name}). Remove the extra mapping if only one controller is used.`, mappingIds: controllers.map((x) => x.m.id) });
  }
  if (controller) {
    const c = controller.p.specs;
    const cName = controller.p.name;
    for (const driver of drivers) {
      const d = driver.p.specs;
      const ids = [controller.m.id, driver.m.id];
      const title = `${driver.p.name} logic vs ${cName}`;
      if (c.logicVoltageV === undefined || d.logicVoltageMinV === undefined || d.logicVoltageMaxV === undefined) add({ id: `dl:${driver.m.id}`, area: 'controller-sensor', status: 'unknown', title, reason: 'The controller logic voltage or the driver logic range is not stated.', mappingIds: ids });
      else if (c.logicVoltageV < d.logicVoltageMinV || c.logicVoltageV > d.logicVoltageMaxV) add({ id: `dl:${driver.m.id}`, area: 'controller-sensor', status: 'incompatible', title, reason: `Controller logic is ${fmt(c.logicVoltageV, 'V')}; the driver logic range is ${fmt(d.logicVoltageMinV, 'V')} – ${fmt(d.logicVoltageMaxV, 'V')}.`, mappingIds: ids });
      else add({ id: `dl:${driver.m.id}`, area: 'controller-sensor', status: 'compatible', title, reason: `Controller logic ${fmt(c.logicVoltageV, 'V')} is inside the driver logic range ${fmt(d.logicVoltageMinV, 'V')} – ${fmt(d.logicVoltageMaxV, 'V')}.`, mappingIds: ids });
    }
    for (const sensor of sensors) {
      const s = sensor.p.specs;
      const ids = [controller.m.id, sensor.m.id];
      // Interface
      const iTitle = `${sensor.name} interface vs ${cName}`;
      if (!s.interfaces || !c.interfaces) add({ id: `si:${sensor.m.id}`, area: 'controller-sensor', status: 'unknown', title: iTitle, reason: 'The sensor or controller interfaces are not stated.', mappingIds: ids });
      else {
        const missing = s.interfaces.filter((i) => !(c.interfaces!.includes(i) || (i === 'Digital' && c.interfaces!.includes('GPIO'))));
        add({ id: `si:${sensor.m.id}`, area: 'controller-sensor', status: missing.length ? 'incompatible' : 'compatible', title: iTitle, reason: missing.length ? `The controller does not list ${missing.join(', ')}.` : `The controller provides ${s.interfaces.join(', ')}.`, mappingIds: ids });
      }
      // Supply and signal level
      const lTitle = `${sensor.name} voltage levels vs ${cName}`;
      if (s.supplyVoltageMinV === undefined || s.supplyVoltageMaxV === undefined || c.logicVoltageV === undefined || c.gpioMaxInputV === undefined) {
        add({ id: `sl:${sensor.m.id}`, area: 'controller-sensor', status: 'unknown', title: lTitle, reason: 'The sensor supply range, the controller logic voltage or the controller GPIO input limit is not stated.', mappingIds: ids });
      } else {
        const logicOk = c.logicVoltageV >= s.supplyVoltageMinV && c.logicVoltageV <= s.supplyVoltageMaxV;
        const signal = s.signalOutputV ?? (logicOk ? c.logicVoltageV : undefined);
        if (signal === undefined) add({ id: `sl:${sensor.m.id}`, area: 'controller-sensor', status: 'unknown', title: lTitle, reason: `The sensor needs ${fmt(s.supplyVoltageMinV, 'V')} – ${fmt(s.supplyVoltageMaxV, 'V')} and its signal level is not stated.`, mappingIds: ids });
        else if (signal > c.gpioMaxInputV) add({ id: `sl:${sensor.m.id}`, area: 'controller-sensor', status: 'incompatible', title: lTitle, reason: `GPIO overvoltage: the sensor outputs ${fmt(signal, 'V')} signals but ${cName} GPIO inputs accept at most ${fmt(c.gpioMaxInputV, 'V')}. Use a level shifter or a sensor that works at ${fmt(c.logicVoltageV, 'V')}.`, mappingIds: ids });
        else if (!logicOk) add({ id: `sl:${sensor.m.id}`, area: 'controller-sensor', status: 'warning', title: lTitle, reason: `Signal levels fit, but the sensor needs a ${fmt(s.supplyVoltageMinV, 'V')} – ${fmt(s.supplyVoltageMaxV, 'V')} supply, not the ${fmt(c.logicVoltageV, 'V')} logic rail.`, mappingIds: ids });
        else add({ id: `sl:${sensor.m.id}`, area: 'controller-sensor', status: 'compatible', title: lTitle, reason: `Powered from the ${fmt(c.logicVoltageV, 'V')} logic rail (sensor range ${fmt(s.supplyVoltageMinV, 'V')} – ${fmt(s.supplyVoltageMaxV, 'V')}), so its signals stay within the GPIO limit of ${fmt(c.gpioMaxInputV, 'V')}.`, mappingIds: ids });
      }
    }
    // Pin budget
    const driverPins = drivers.reduce((n, x) => n + (x.p.specs.channels === undefined ? NaN : x.p.specs.channels * 3 + 1) * x.m.quantity, 0);
    const pwmNeeded = drivers.reduce((n, x) => n + (x.p.specs.channels ?? NaN) * x.m.quantity, 0);
    const sensorPins = sensors.reduce((n, x) => n + (x.p.specs.interfaces?.includes('I2C') ? 0 : 2) * x.m.quantity, 0) + (sensors.some((x) => x.p.specs.interfaces?.includes('I2C')) ? 2 : 0);
    const needed = driverPins + sensorPins;
    if (drivers.length + sensors.length > 0) {
      const ids = [controller.m.id, ...drivers.map((x) => x.m.id), ...sensors.map((x) => x.m.id)];
      if (Number.isNaN(needed) || c.gpioCount === undefined) add({ id: 'pins', area: 'controller-sensor', status: 'unknown', title: `Pin budget on ${cName}`, reason: `${Number.isNaN(needed) ? 'Some parts do not state their channel count.' : `About ${needed} signal pins are needed (driver: IN1, IN2 and PWM per channel plus STBY; I²C: SDA and SCL shared).`} ${c.gpioCount === undefined ? 'The usable pin count of this board is not stated, so it was not checked.' : ''}`.trim(), mappingIds: ids });
      else if (needed > c.gpioCount || (c.pwmCount !== undefined && pwmNeeded > c.pwmCount)) add({ id: 'pins', area: 'controller-sensor', status: 'incompatible', title: `Pin budget on ${cName}`, reason: `About ${needed} signal pins (${pwmNeeded} PWM) are needed; the board has ${c.gpioCount} digital pins${c.pwmCount !== undefined ? ` (${c.pwmCount} PWM)` : ''}.`, mappingIds: ids });
      else add({ id: 'pins', area: 'controller-sensor', status: 'compatible', title: `Pin budget on ${cName}`, reason: `About ${needed} signal pins (${pwmNeeded} PWM) are needed; the board has ${c.gpioCount} digital pins${c.pwmCount !== undefined ? ` (${c.pwmCount} PWM)` : ''}.`, mappingIds: ids });
    }
  }

  // ── Power ──
  const powerIds = [...holders, ...cells, ...regulators].map((x) => x.m.id);
  if (holders.length === 0 && cells.length === 0 && (motors.length > 0 || controllers.length > 0)) {
    add({ id: 'power:missing', area: 'power', status: 'warning', title: 'No power source mapped', reason: 'Add a battery (Real Parts → Add hardware item → Battery / Battery holder) so the power checks can run.', mappingIds: [] });
  }
  let packV: number | undefined;
  if (holders.length > 0 || cells.length > 0) {
    const holder = holders[0];
    const cell = cells[0];
    if (!holder || !cell || holder.p.specs.cellCount === undefined || cell.p.specs.nominalVoltageV === undefined) {
      add({ id: 'power:pack', area: 'power', status: 'unknown', title: 'Battery pack voltage', reason: 'Map both a battery holder (cell count) and the cell type (nominal voltage) to compute the pack voltage.', mappingIds: powerIds });
    } else {
      packV = holder.p.specs.cellCount * cell.p.specs.nominalVoltageV;
      const cellUnits = cells.reduce((n, x) => n + x.m.quantity, 0);
      const need = holder.p.specs.cellCount * holder.m.quantity;
      add({
        id: 'power:pack',
        area: 'power',
        status: cellUnits === need ? 'compatible' : 'warning',
        title: `Battery pack: ${holder.p.specs.cellCount} × ${fmt(cell.p.specs.nominalVoltageV, 'V')} = ${fmt(packV, 'V')} nominal`,
        reason: cellUnits === need ? 'Cell count matches the holder.' : `The holder takes ${need} cells but the cell mapping quantity is ${cellUnits}. Set the cell quantity to ${need}.`,
        mappingIds: [holder.m.id, cell.m.id],
      });
    }
  }
  if (packV !== undefined) {
    for (const motor of motors.slice(0, 1)) {
      const r = motor.p.specs.ratedVoltageV;
      if (r === undefined) add({ id: 'power:motor', area: 'power', status: 'unknown', title: 'Battery vs motor voltage', reason: 'The motor rated voltage is not stated.', mappingIds: [motor.m.id, ...powerIds] });
      else if (packV < r * 0.9) add({ id: 'power:motor', area: 'power', status: 'warning', title: 'Battery vs motor voltage', reason: `The pack gives ${fmt(packV, 'V')} nominal; the motors are rated ${fmt(r, 'V')}. They will run slower and weaker than their rated speed and torque.`, mappingIds: [motor.m.id, ...powerIds] });
      else if (packV > r * 1.5) add({ id: 'power:motor', area: 'power', status: 'warning', title: 'Battery vs motor voltage', reason: `The pack gives ${fmt(packV, 'V')} nominal; the motors are rated ${fmt(r, 'V')}. Limit the PWM duty cycle or the motors can overheat.`, mappingIds: [motor.m.id, ...powerIds] });
      else add({ id: 'power:motor', area: 'power', status: 'compatible', title: 'Battery vs motor voltage', reason: `The pack gives ${fmt(packV, 'V')} nominal for motors rated ${fmt(r, 'V')}.`, mappingIds: [motor.m.id, ...powerIds] });
    }
    for (const driver of drivers.slice(0, 1)) {
      const d = driver.p.specs;
      if (d.motorVoltageMinV === undefined || d.motorVoltageMaxV === undefined) add({ id: 'power:driver', area: 'power', status: 'unknown', title: 'Battery vs driver motor supply', reason: 'The driver motor-voltage range is not stated.', mappingIds: [driver.m.id, ...powerIds] });
      else if (packV < d.motorVoltageMinV || packV > d.motorVoltageMaxV) add({ id: 'power:driver', area: 'power', status: 'incompatible', title: 'Battery vs driver motor supply', reason: `The pack gives ${fmt(packV, 'V')}; the driver motor supply must be ${fmt(d.motorVoltageMinV, 'V')} – ${fmt(d.motorVoltageMaxV, 'V')}.`, mappingIds: [driver.m.id, ...powerIds] });
      else add({ id: 'power:driver', area: 'power', status: 'compatible', title: 'Battery vs driver motor supply', reason: `${fmt(packV, 'V')} is inside the driver motor supply range ${fmt(d.motorVoltageMinV, 'V')} – ${fmt(d.motorVoltageMaxV, 'V')}.`, mappingIds: [driver.m.id, ...powerIds] });
    }
    for (const reg of regulators) {
      const r = reg.p.specs;
      if (r.inputVoltageMinV === undefined || r.inputVoltageMaxV === undefined) add({ id: `power:reg:${reg.m.id}`, area: 'power', status: 'unknown', title: `${reg.p.name} input`, reason: 'The regulator input range is not stated.', mappingIds: [reg.m.id, ...powerIds] });
      else if (packV < r.inputVoltageMinV || packV > r.inputVoltageMaxV) add({ id: `power:reg:${reg.m.id}`, area: 'power', status: 'incompatible', title: `${reg.p.name} input`, reason: `The pack gives ${fmt(packV, 'V')} nominal; the regulator needs ${fmt(r.inputVoltageMinV, 'V')} – ${fmt(r.inputVoltageMaxV, 'V')} to produce ${r.outputVoltageV !== undefined ? fmt(r.outputVoltageV, 'V') : 'its output'}. Use more cells or a different regulator.`, mappingIds: [reg.m.id, ...powerIds] });
      else add({ id: `power:reg:${reg.m.id}`, area: 'power', status: 'compatible', title: `${reg.p.name} input`, reason: `${fmt(packV, 'V')} is inside the regulator input range ${fmt(r.inputVoltageMinV, 'V')} – ${fmt(r.inputVoltageMaxV, 'V')}. Check the dropout at your load current.`, mappingIds: [reg.m.id, ...powerIds] });
    }
  }
  for (const reg of regulators) {
    const max = reg.p.specs.outputCurrentMaxA;
    const loads = [...controllers, ...sensors];
    const unknownLoads = loads.filter((x) => x.p.specs.typicalCurrentA === undefined).map((x) => x.p.name);
    const known = loads.reduce((n, x) => n + (x.p.specs.typicalCurrentA ?? 0) * x.m.quantity, 0);
    const ids = [reg.m.id, ...loads.map((x) => x.m.id)];
    if (max === undefined) add({ id: `power:budget:${reg.m.id}`, area: 'power', status: 'unknown', title: `${reg.p.name} current budget`, reason: 'The regulator output current is not stated.', mappingIds: ids });
    else if (known > max) add({ id: `power:budget:${reg.m.id}`, area: 'power', status: 'incompatible', title: `${reg.p.name} current budget`, reason: `Known loads need about ${fmt(known, 'A')}; the regulator gives at most ${fmt(max, 'A')}.`, mappingIds: ids });
    else if (unknownLoads.length > 0) add({ id: `power:budget:${reg.m.id}`, area: 'power', status: 'unknown', title: `${reg.p.name} current budget`, reason: `Known loads need about ${fmt(known, 'A')} of ${fmt(max, 'A')}, but the current draw of ${unknownLoads.join(', ')} is not stated.`, mappingIds: ids });
    else add({ id: `power:budget:${reg.m.id}`, area: 'power', status: 'compatible', title: `${reg.p.name} current budget`, reason: `Loads need about ${fmt(known, 'A')} of ${fmt(max, 'A')}.`, mappingIds: ids });
  }
  if (motors.length > 0 && (holders.length > 0 || cells.length > 0)) {
    const stall = motors.reduce((n, x) => n + (x.p.specs.stallCurrentA ?? NaN) * x.m.quantity, 0);
    const cellMax = cells[0]?.p.specs.maxCurrentA;
    const ids = [...motors.map((x) => x.m.id), ...powerIds];
    if (Number.isNaN(stall) || cellMax === undefined) add({ id: 'power:stall', area: 'power', status: 'unknown', title: 'Total stall current vs battery', reason: `${Number.isNaN(stall) ? 'A motor stall current is not stated.' : `All motors stalled together draw about ${fmt(stall, 'A')}.`} ${cellMax === undefined ? 'The battery maximum discharge current is not stated, so this was not checked.' : ''}`.trim(), mappingIds: ids });
    else add({ id: 'power:stall', area: 'power', status: stall > cellMax ? 'warning' : 'compatible', title: 'Total stall current vs battery', reason: `All motors stalled together draw about ${fmt(stall, 'A')}; the battery is rated for ${fmt(cellMax, 'A')}.`, mappingIds: ids });
  }

  // ── Mechanical ──
  const objectMapping = new Map(live.filter((x) => x.m.targetKind === 'component').map((x) => [x.m.targetId, x]));
  const vcs = new Map(virtualComponents(model, data).map((v) => [v.id, v]));
  for (const act of model.actuators) {
    const joint = model.joints.find((j) => j.id === act.jointId);
    if (!joint || !act.componentId) continue;
    const motor = objectMapping.get(act.componentId);
    const wheel = objectMapping.get(joint.childId);
    if (!motor || !wheel || motor.p.role !== 'dc-gearmotor' || wheel.p.role !== 'wheel') continue;
    const s = motor.p.specs;
    const w = wheel.p.specs;
    const ids = [motor.m.id, wheel.m.id];
    const title = `${wheel.name} bore vs ${motor.name} shaft`;
    if (s.shaftDiameterMm === undefined || w.boreDiameterMm === undefined) add({ id: `shaft:${wheel.m.id}`, area: 'mechanical', status: 'unknown', title, reason: 'The motor shaft diameter or the wheel bore is not stated.', mappingIds: ids });
    else if (s.shaftDiameterMm !== w.boreDiameterMm) add({ id: `shaft:${wheel.m.id}`, area: 'mechanical', status: 'incompatible', title, reason: `The wheel bore is ${fmt(w.boreDiameterMm, 'mm')} but the motor shaft is ${fmt(s.shaftDiameterMm, 'mm')}. Use a matching wheel or a hub adapter.`, mappingIds: ids });
    else if (s.shaftType === undefined || w.boreType === undefined) add({ id: `shaft:${wheel.m.id}`, area: 'mechanical', status: 'warning', title, reason: `Both are ${fmt(s.shaftDiameterMm, 'mm')}, but the shaft or bore shape (D or round) is not stated.`, mappingIds: ids });
    else if (s.shaftType !== w.boreType) add({ id: `shaft:${wheel.m.id}`, area: 'mechanical', status: 'incompatible', title, reason: `The shaft is ${s.shaftType === 'D' ? 'D-shaped' : 'round'} but the bore is ${w.boreType === 'D' ? 'D-shaped' : 'round'}.`, mappingIds: ids });
    else add({ id: `shaft:${wheel.m.id}`, area: 'mechanical', status: 'compatible', title, reason: `${fmt(s.shaftDiameterMm, 'mm')} ${s.shaftType}-shaft into a ${fmt(w.boreDiameterMm, 'mm')} ${w.boreType} bore.`, mappingIds: ids });
  }
  for (const wheel of wheels) {
    const vc = vcs.get(wheel.m.targetId);
    const d = wheel.p.specs.wheelDiameterMm;
    if (!vc || vc.virtualWheelDiameterMm === null) continue;
    const title = `${wheel.name} diameter (3D model vs real)`;
    if (d === undefined) add({ id: `wheeld:${wheel.m.id}`, area: 'mechanical', status: 'unknown', title, reason: 'The real wheel diameter is not stated.', mappingIds: [wheel.m.id] });
    else if (Math.abs(vc.virtualWheelDiameterMm - d) / d > 0.1) add({ id: `wheeld:${wheel.m.id}`, area: 'mechanical', status: 'warning', title, reason: `The 3D model uses ${fmt(vc.virtualWheelDiameterMm, 'mm')}; the real wheel is ${fmt(d, 'mm')}. Simulated speed, distance and ground clearance will differ. To match, change the wheel radius in Build Mode (not changed automatically).`, mappingIds: [wheel.m.id] });
    else add({ id: `wheeld:${wheel.m.id}`, area: 'mechanical', status: 'compatible', title, reason: `The 3D model (${fmt(vc.virtualWheelDiameterMm, 'mm')}) matches the real wheel (${fmt(d, 'mm')}) within 10%.`, mappingIds: [wheel.m.id] });
  }
  if (motors.length > 0) {
    const brackets = byRole('bracket').length + extras.filter((p) => p.role === 'bracket').length;
    add({
      id: 'mount:motors',
      area: 'mechanical',
      status: brackets > 0 ? 'compatible' : 'warning',
      title: 'Motor mounting hardware',
      reason: brackets > 0 ? 'A motor bracket is in the blueprint.' : 'No motor bracket is mapped or listed as extra hardware. Add a bracket that fits the motor (for example in the BOM extras).',
      mappingIds: motors.map((x) => x.m.id),
    });
  }
  for (const x of live) {
    const vc = vcs.get(x.m.targetId);
    if (!vc || !vc.virtualSizeMm || vc.virtualWheelDiameterMm !== null) continue;
    const dims = [x.p.specs.lengthMm, x.p.specs.widthMm, x.p.specs.heightMm].filter((v): v is number => v !== undefined).sort((a, b) => b - a);
    if (dims.length < 3) continue;
    if (dims[0]! > vc.virtualSizeMm[0]! * 1.25) {
      add({ id: `space:${x.m.id}`, area: 'mechanical', status: 'warning', title: `${x.name}: real part is larger than the 3D component`, reason: `Real ${dims.join(' × ')} mm vs 3D ${vc.virtualSizeMm.join(' × ')} mm. Check that it fits the space and clears nearby parts.`, mappingIds: [x.m.id] });
    }
  }
  const casters = byRole('caster');
  if (casters.length > 0 && wheels.length > 0) {
    add({ id: 'clearance', area: 'mechanical', status: 'unknown', title: 'Ground clearance and level stance', reason: 'Mounting heights of the wheels, motors and caster on the real chassis are not modeled, so the stance and clearance were not checked. Measure them before final assembly.', mappingIds: [...casters, ...wheels].map((x) => x.m.id) });
  }
  return checks;
}

/** Worst status per mapping id. Mappings without any check are unknown. */
export function statusByMapping(checks: readonly CompatCheck[], data: BlueprintData): Map<string, CompatStatus> {
  const map = new Map<string, CompatStatus[]>();
  for (const c of checks) for (const id of c.mappingIds) map.set(id, [...(map.get(id) ?? []), c.status]);
  return new Map(data.mappings.map((m) => [m.id, worst(map.get(m.id) ?? [])]));
}

export function summarize(checks: readonly CompatCheck[]): Record<CompatStatus, number> {
  const out: Record<CompatStatus, number> = { compatible: 0, warning: 0, incompatible: 0, unknown: 0 };
  for (const c of checks) out[c.status] += 1;
  return out;
}
