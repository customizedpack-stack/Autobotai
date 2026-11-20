import { checkCompatibility, motorDriverAssignments, type CompatCheck } from '../../blueprint/engine/compatibility';
import { refOf, type ModelView } from '../../blueprint/engine/virtualComponents';
import { validateWiring } from '../../blueprint/engine/wiring';
import type { BlueprintData, HardwareProfile, PartMapping, WiringRecord } from '../../blueprint/model/types';
import type { CatalogPart } from '../../blueprint/catalog/types';

/**
 * Hardware validation and arming interlocks for the Explorer Bot reference
 * configuration (docs/hardware/EXPLORER-BOT-REFERENCE-HARDWARE.md).
 *
 * Rules:
 *  - Only the reference parts are supported (no "similar" part is assumed to be interchangeable).
 *  - A critical compatibility check that is Incompatible or Unknown blocks arming.
 *  - Warnings must be reviewed and accepted one by one (acknowledgedWarnings).
 *  - Values the catalog does not know (battery current, the motor-power switch) must be
 *    entered or confirmed by the user; until then they block arming.
 */

export const REFERENCE_PARTS = {
  controller: 'espressif-esp32-devkitc-v4',
  driver: 'pololu-713',
  motor: 'pololu-1101',
  wheel: 'pololu-1429',
  distance: 'pololu-2490',
} as const;

export const SUPPORTED_DEVICE = { device: 'explorer-bot-esp32', board: 'esp32-devkitc-v4', protocol: 1 } as const;

/** The firmware's fixed pin map (firmware/esp32-explorer-bot/src/main.cpp). Motor A = left, motor B = right. */
export const FIRMWARE_PIN_MAP: Record<'driver' | 'distance', Record<string, string>> = {
  driver: { PWMA: 'GPIO26', AIN1: 'GPIO27', AIN2: 'GPIO4', PWMB: 'GPIO32', BIN1: 'GPIO33', BIN2: 'GPIO25', STBY: 'GPIO23', VCC: '3.3V', GND: 'GND' },
  distance: { VIN: '3.3V', GND: 'GND', SDA: 'GPIO21', SCL: 'GPIO22' },
};

/** Compatibility checks whose failure or unknown result makes motion unsafe. */
const CRITICAL_PREFIXES = ['mv:', 'mc:', 'dl:', 'sl:', 'si:', 'assign:', 'driverload:', 'driver:channels', 'shaft:', 'power:driver:', 'power:reg:', 'power:pack', 'driver:missing', 'controller:missing', 'controller:multiple', 'orphan:'];
/** Results the reference configuration resolves in another way (explained in the item). */
const RESOLVED_ELSEWHERE: Record<string, string> = {
  pins: 'The firmware uses a fixed pin map of 9 signal pins (7 for the driver, 2 for I²C); the wiring check below verifies it.',
  clearance: 'Ground clearance is not modeled. Measure it on the assembled robot before the first floor test.',
  'power:stall': 'Checked below against the power supply you entered.',
  'power:missing': 'Checked below against the power supply you entered.',
};

export type ItemLevel = 'ok' | 'info' | 'warning' | 'blocker';

export interface ValidationItem {
  id: string;
  level: ItemLevel;
  title: string;
  reason: string;
  /** Warnings that the user must accept (stored in profile.acknowledgedWarnings). */
  ackId?: string;
  acknowledged?: boolean;
  /** Suggested fix the UI can apply (never applied automatically). */
  fix?: 'apply-pin-map' | 'add-switch';
}

export interface DeviceSummary {
  connected: boolean;
  handshake: boolean;
  device: string | null;
  board: string | null;
  protocol: number | null;
  caps: string[];
  deviceState: 'idle' | 'connected' | 'armed' | 'fault' | 'estop' | null;
  fault: string | null;
}

export interface ValidationResult {
  items: ValidationItem[];
  /** The design and profile are ready (no blockers, all warnings accepted). */
  profileReady: boolean;
  /** A connected, supported device that is not in fault or emergency stop. */
  deviceReady: boolean;
  /** Everything needed to ARM (the user must still confirm the robot is safely positioned). */
  canArm: boolean;
  blockers: number;
  openWarnings: number;
}

const byPart = (data: BlueprintData, partId: string) => data.mappings.filter((m) => m.partId === partId);
const isCritical = (id: string) => CRITICAL_PREFIXES.some((p) => id.startsWith(p));

/** Wiring records the firmware pin map needs that are missing or differ. */
export function pinMapMismatches(data: BlueprintData): { ref: string; pin: string; expected: string; actual: string | null }[] {
  const out: { ref: string; pin: string; expected: string; actual: string | null }[] = [];
  const check = (mapping: PartMapping | undefined, map: Record<string, string>) => {
    if (!mapping) return;
    const ref = refOf(mapping.targetKind, mapping.targetId);
    for (const [pin, expected] of Object.entries(map)) {
      const w = data.wiring.find((x) => x.componentRef === ref && x.componentPin === pin);
      if (!w || w.controllerPin !== expected) out.push({ ref, pin, expected, actual: w ? w.controllerPin : null });
    }
  };
  check(byPart(data, REFERENCE_PARTS.driver)[0], FIRMWARE_PIN_MAP.driver);
  check(byPart(data, REFERENCE_PARTS.distance)[0], FIRMWARE_PIN_MAP.distance);
  return out;
}

/** Wiring with the firmware pin map applied to the driver and sensor records (other records unchanged). */
export function applyPinMap(data: BlueprintData, newId: () => string): WiringRecord[] {
  const wiring = data.wiring.map((w) => ({ ...w }));
  const apply = (mapping: PartMapping | undefined, map: Record<string, string>, voltage: Record<string, number>) => {
    if (!mapping) return;
    const ref = refOf(mapping.targetKind, mapping.targetId);
    for (const [pin, expected] of Object.entries(map)) {
      const w = wiring.find((x) => x.componentRef === ref && x.componentPin === pin);
      if (w) w.controllerPin = expected;
      else {
        const iface = pin === 'GND' ? 'ground' : pin === 'VCC' || pin === 'VIN' ? 'power' : pin === 'SDA' ? 'i2c-sda' : pin === 'SCL' ? 'i2c-scl' : pin.startsWith('PWM') ? 'pwm' : 'digital';
        wiring.push({
          id: newId(),
          controllerPin: expected,
          sourceRef: '',
          componentRef: ref,
          componentPin: pin,
          interface: iface,
          voltage: voltage[pin] ?? 3.3,
          direction: iface === 'ground' || iface === 'power' ? 'power-supply' : pin === 'SDA' ? 'bidirectional' : 'controller-to-component',
          notes: 'Firmware pin map.',
        });
      }
    }
  };
  apply(byPart(data, REFERENCE_PARTS.driver)[0], FIRMWARE_PIN_MAP.driver, { GND: 0 });
  apply(byPart(data, REFERENCE_PARTS.distance)[0], FIRMWARE_PIN_MAP.distance, { GND: 0 });
  return wiring;
}

export function validateHardware(input: { model: ModelView; data: BlueprintData; profile: HardwareProfile | null; device: DeviceSummary | null; catalogById?: ReadonlyMap<string, CatalogPart> }): ValidationResult {
  const { model, data, profile, device } = input;
  const items: ValidationItem[] = [];
  const add = (item: ValidationItem) => items.push(item);
  const acked = new Set(profile?.acknowledgedWarnings ?? []);
  const warn = (id: string, title: string, reason: string) => add({ id, level: 'warning', title, reason, ackId: id, acknowledged: acked.has(id) });

  if (!profile) {
    add({ id: 'profile', level: 'blocker', title: 'No hardware profile selected', reason: 'Select the Explorer Bot reference profile first.' });
    return finish(items, device);
  }
  add({ id: 'profile', level: 'ok', title: 'Explorer Bot reference profile selected', reason: 'ESP32-DevKitC V4, TB6612FNG, two Pololu 100:1 HP 6V motors, 70 mm wheels, VL53L0X.' });

  // ── The robot model ──
  const drive = model.controllers[0];
  const actuators = drive ? model.actuators.filter((a) => a.jointId === drive.leftJointId || a.jointId === drive.rightJointId) : [];
  if (!drive || actuators.length !== 2) add({ id: 'model:drive', level: 'blocker', title: 'No differential drive', reason: 'The robot needs a working differential drive (Build Mode → Set up differential drive).' });
  else add({ id: 'model:drive', level: 'ok', title: 'Differential drive configured', reason: `${actuators.length} drive motors.` });

  // ── Reference parts ──
  const mappingOf = (componentId: string | null | undefined) => (componentId ? data.mappings.find((m) => m.targetKind === 'component' && m.targetId === componentId) : undefined);
  const controllers = data.mappings.filter((m) => m.snapshot.role === 'microcontroller-board' || m.snapshot.role === 'single-board-computer');
  if (controllers.length !== 1 || controllers[0]!.partId !== REFERENCE_PARTS.controller)
    add({ id: 'part:controller', level: 'blocker', title: 'Controller is not the supported board', reason: `Map exactly one controller to the ESP32-DevKitC V4 (found: ${controllers.map((m) => m.snapshot.name).join(', ') || 'none'}). Other boards are not supported by this firmware.` });
  else add({ id: 'part:controller', level: 'ok', title: 'Controller: ESP32-DevKitC V4', reason: 'Supported by the firmware.' });
  const drivers = data.mappings.filter((m) => m.snapshot.role === 'dual-motor-driver');
  if (drivers.length !== 1 || drivers[0]!.partId !== REFERENCE_PARTS.driver)
    add({ id: 'part:driver', level: 'blocker', title: 'Motor driver is not the supported driver', reason: `Map exactly one TB6612FNG carrier (Pololu 713) (found: ${drivers.map((m) => m.snapshot.name).join(', ') || 'none'}).` });
  else add({ id: 'part:driver', level: 'ok', title: 'Motor driver: TB6612FNG carrier', reason: 'Supported by the firmware (motor A = left, motor B = right).' });
  const assignments = motorDriverAssignments(data);
  for (const act of actuators) {
    const m = mappingOf(act.componentId);
    const joint = model.joints.find((j) => j.id === act.jointId);
    const wheel = mappingOf(joint?.childId);
    const side = act.jointId === drive?.leftJointId ? 'Left' : 'Right';
    if (!m || m.partId !== REFERENCE_PARTS.motor) add({ id: `part:motor:${side}`, level: 'blocker', title: `${side} drive motor is not the supported motor`, reason: `Map it to the Pololu 100:1 Micro Metal Gearmotor HP 6V (found: ${m?.snapshot.name ?? 'not mapped'}). Other motors are not assumed to be interchangeable.` });
    else if (assignments.get(m.id)?.kind === 'unassigned' || assignments.get(m.id)?.kind === 'missing-driver') add({ id: `part:motor:${side}`, level: 'blocker', title: `${side} drive motor has no driver`, reason: 'Assign it to the motor driver in Real Parts.' });
    else add({ id: `part:motor:${side}`, level: 'ok', title: `${side} drive motor: Pololu 1101`, reason: 'Matches the reference configuration.' });
    if (!wheel || wheel.partId !== REFERENCE_PARTS.wheel) add({ id: `part:wheel:${side}`, level: 'blocker', title: `${side} wheel is not the supported wheel`, reason: `Map it to the Pololu Wheel 70×8mm (found: ${wheel?.snapshot.name ?? 'not mapped'}).` });
  }
  const sensors = data.mappings.filter((m) => m.snapshot.role === 'distance-sensor');
  if (sensors.length !== 1 || sensors[0]!.partId !== REFERENCE_PARTS.distance)
    add({ id: 'part:distance', level: 'blocker', title: 'Distance sensor is not the supported sensor', reason: `Map exactly one VL53L0X carrier (Pololu 2490) (found: ${sensors.map((m) => m.snapshot.name).join(', ') || 'none'}).` });
  else add({ id: 'part:distance', level: 'ok', title: 'Distance sensor: VL53L0X carrier', reason: 'Read over I²C by the firmware.' });

  // ── Compatibility (Phase 9 engine) ──
  const checks: CompatCheck[] = checkCompatibility(model, data, input.catalogById);
  for (const c of checks) {
    if (RESOLVED_ELSEWHERE[c.id] || Object.keys(RESOLVED_ELSEWHERE).some((k) => c.id.startsWith(`${k}:`))) {
      add({ id: `compat:${c.id}`, level: 'info', title: c.title, reason: RESOLVED_ELSEWHERE[c.id] ?? RESOLVED_ELSEWHERE[c.id.split(':')[0]!] ?? c.reason });
      continue;
    }
    if (c.status === 'compatible') continue;
    if (c.status === 'incompatible') add({ id: `compat:${c.id}`, level: 'blocker', title: c.title, reason: c.reason });
    else if (c.status === 'unknown' && isCritical(c.id)) add({ id: `compat:${c.id}`, level: 'blocker', title: `${c.title} (unknown)`, reason: `${c.reason} Unknown safety data is not treated as safe.` });
    else if (c.status === 'unknown') add({ id: `compat:${c.id}`, level: 'info', title: `${c.title} (unknown)`, reason: c.reason });
    else warn(`compat:${c.id}`, c.title, c.reason);
  }

  // ── Power supply (user-entered; the catalog cannot know your battery) ──
  const ps = profile.powerSupply;
  const motor = data.mappings.find((m) => m.partId === REFERENCE_PARTS.motor)?.snapshot;
  const driver = drivers[0]?.snapshot;
  if (ps.kind === 'unknown' || ps.voltageV === null || ps.maxCurrentA === null) {
    add({ id: 'power:supply', level: 'blocker', title: 'Motor power supply unknown', reason: 'Enter the motor supply (battery or current-limited bench supply): its voltage and the maximum current it can deliver, from its own datasheet or settings. The catalog has no verified maximum current for the reference battery.' });
  } else {
    const vm = [driver?.specs.motorVoltageMinV, driver?.specs.motorVoltageMaxV];
    if (vm[0] === undefined || vm[1] === undefined) add({ id: 'power:supply:vm', level: 'blocker', title: 'Driver motor-voltage range unknown', reason: 'Map the TB6612FNG carrier so its motor-voltage range is known.' });
    else if (ps.voltageV < vm[0] || ps.voltageV > vm[1]) add({ id: 'power:supply:vm', level: 'blocker', title: `Supply ${ps.voltageV} V is outside the driver motor range`, reason: `The TB6612FNG carrier's motor supply (VM) must be ${vm[0]} – ${vm[1]} V.` });
    else add({ id: 'power:supply:vm', level: 'ok', title: `Supply ${ps.voltageV} V is inside the driver motor range`, reason: `${vm[0]} – ${vm[1]} V. Source you entered: ${ps.source || 'not given'} (user-entered, not verified).` });
    const rated = motor?.specs.ratedVoltageV;
    if (rated === undefined) add({ id: 'power:supply:motor', level: 'blocker', title: 'Motor rated voltage unknown', reason: 'Map the reference motor.' });
    else if (ps.voltageV > rated * 2) add({ id: 'power:supply:motor', level: 'blocker', title: `Supply ${ps.voltageV} V is far above the motors' ${rated} V rating`, reason: 'Use a supply closer to the motor rating.' });
    else if (ps.voltageV > rated) warn('power:supply:motor', `Supply ${ps.voltageV} V is above the motors' ${rated} V rating`, `Keep the speed limit low (it is ${profile.limits.maxSpeedPermille / 10} %) so the average motor voltage stays near ${rated} V.`);
    else if (ps.voltageV < rated * 0.75) warn('power:supply:motor', `Supply ${ps.voltageV} V is well below the motors' ${rated} V rating`, 'The robot will be slower and weaker than its 6 V specification.');
    const stall = motor?.specs.stallCurrentA;
    if (stall === undefined) add({ id: 'power:supply:current', level: 'blocker', title: 'Motor stall current unknown', reason: 'Map the reference motor.' });
    else if (ps.maxCurrentA < stall * 2) warn('power:supply:current', `Supply ${ps.maxCurrentA} A is below the two motors' stall current (${stall * 2} A)`, 'At stall the motor voltage will sag. The ESP32 is powered from USB in the reference wiring, so it is not affected.');
    else add({ id: 'power:supply:current', level: 'ok', title: `Supply ${ps.maxCurrentA} A covers the stall current of both motors (${stall * 2} A)`, reason: 'User-entered value.' });
  }

  // ── Motor-power disconnect (hardware emergency stop path) ──
  const switchListed = [...data.bomExtras.map((e) => e.name), ...data.hardware.map((h) => h.name)].some((n) => /switch|e-?stop|emergency|disconnect|kill/i.test(n));
  if (!switchListed) add({ id: 'safety:switch', level: 'blocker', title: 'No motor-power disconnect switch', reason: 'Add a switch (or emergency-stop button) that cuts the battery from the driver\'s VM pin, as a BOM extra. A browser button alone is not a safety device.', fix: 'add-switch' });
  else if (!profile.motorPowerSwitchConfirmed) add({ id: 'safety:switch', level: 'blocker', title: 'Motor-power switch not confirmed', reason: 'Confirm that the switch is wired between the battery and VM and that you can reach it while testing.' });
  else add({ id: 'safety:switch', level: 'ok', title: 'Motor-power disconnect switch confirmed', reason: 'Wired between the battery and the driver VM pin (user-confirmed).' });

  // ── Wiring against the firmware pin map ──
  const mismatches = pinMapMismatches(data);
  if (mismatches.length) add({ id: 'wiring:pins', level: 'blocker', title: `${mismatches.length} wire(s) differ from the firmware pin map`, reason: mismatches.slice(0, 6).map((m) => `${m.pin}: ${m.actual === null ? 'missing' : `"${m.actual || 'empty'}"`} → ${m.expected}`).join('; '), fix: 'apply-pin-map' });
  else add({ id: 'wiring:pins', level: 'ok', title: 'Wiring matches the firmware pin map', reason: 'Driver and sensor pins are as the firmware expects.' });
  const wiring = validateWiring(model, data);
  for (const issue of wiring.issues.filter((i) => i.severity === 'error')) add({ id: `wiring:${issue.kind}:${issue.recordId ?? 'all'}`, level: 'blocker', title: `Wiring: ${issue.kind.replace(/-/g, ' ')}`, reason: issue.message });

  return finish(items, device);
}

function finish(items: ValidationItem[], device: DeviceSummary | null): ValidationResult {
  // ── The connected device (needed to arm, not to validate the design) ──
  let deviceReady = false;
  if (!device || !device.connected) items.push({ id: 'device', level: 'info', title: 'No device connected', reason: 'Connect the robot to arm it.' });
  else if (!device.handshake) items.push({ id: 'device', level: 'blocker', title: 'Firmware handshake not completed', reason: 'The device did not identify itself. Check the firmware and the port.' });
  else if (device.device !== SUPPORTED_DEVICE.device || device.board !== SUPPORTED_DEVICE.board || device.protocol !== SUPPORTED_DEVICE.protocol || !device.caps.includes('drive'))
    items.push({ id: 'device', level: 'blocker', title: 'Unsupported device or firmware', reason: `Found ${device.device ?? '?'} on ${device.board ?? '?'} (protocol ${device.protocol ?? '?'}). Flash the AutoBotAI Explorer Bot firmware.` });
  else if (device.deviceState === 'estop') items.push({ id: 'device', level: 'blocker', title: 'Emergency stop is active', reason: 'Reset the emergency stop first (after checking the robot).' });
  else if (device.deviceState === 'fault') items.push({ id: 'device', level: 'blocker', title: `Device fault: ${device.fault ?? 'unknown'}`, reason: 'Clear the fault after finding its cause.' });
  else {
    items.push({ id: 'device', level: 'ok', title: 'Supported device connected', reason: `${device.device} on ${device.board}, protocol ${device.protocol}.` });
    deviceReady = true;
  }
  const blockers = items.filter((i) => i.level === 'blocker').length;
  const openWarnings = items.filter((i) => i.level === 'warning' && !i.acknowledged).length;
  const designBlockers = items.filter((i) => i.level === 'blocker' && i.id !== 'device').length;
  const profileReady = designBlockers === 0 && openWarnings === 0;
  return { items, profileReady, deviceReady, canArm: profileReady && deviceReady && blockers === 0, blockers, openWarnings };
}
