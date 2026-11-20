import { dataOf, useBlueprintStore } from '../blueprint/blueprintStore';
import { defaultHardwareProfile, type HardwareCalibration, type HardwareProfile } from '../blueprint/model/types';
import { createId } from '../../utils/id';
import { log } from '../../utils/logger';
import { useHardwareStore } from './hardwareStore';
import { applyPinMap } from './safety/validation';
import { currentValidation } from './connectionManager';
import { prepareProgram, type PreparedProgram } from './deploy/programCheck';
import { programsForProject, useProgramStore } from '../code-studio/storage/programStore';
import { useCodeStudioStore } from '../code-studio/codeStudioStore';
import { useSceneStore } from '../../stores/sceneStore';

/**
 * Project-side hardware commands: the profile, user-entered power data, limits,
 * acknowledged warnings and calibration. They are blueprint edits (one undo step
 * each, saved with the project) and never change the 3D robot model.
 */

const data = () => dataOf(useBlueprintStore.getState().blueprint);

function update(label: string, next: HardwareProfile | null, event?: { type: 'hardware.profile' | 'hardware.calibration'; component: string; previous: string; next: string; note: string }): void {
  useBlueprintStore.getState().apply(label, { ...data(), hardwareProfile: next }, event ? [event] : []);
}

export function selectReferenceProfile(): void {
  if (data().hardwareProfile) return;
  update('Select hardware profile', defaultHardwareProfile(new Date().toISOString()), { type: 'hardware.profile', component: 'Explorer Bot reference hardware', previous: '', next: 'Selected', note: 'ESP32-DevKitC V4, TB6612FNG, Pololu 1101 motors, VL53L0X.' });
}

export function removeProfile(): void {
  if (!data().hardwareProfile) return;
  update('Remove hardware profile', null, { type: 'hardware.profile', component: 'Explorer Bot reference hardware', previous: 'Selected', next: 'Removed', note: '' });
}

function patchProfile(label: string, fn: (p: HardwareProfile) => HardwareProfile, event?: Parameters<typeof update>[2]): boolean {
  const p = data().hardwareProfile;
  if (!p) return false;
  const next = fn(structuredClone(p));
  if (JSON.stringify(next) === JSON.stringify(p)) return false;
  update(label, next, event);
  return true;
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** User-entered motor power supply. Invalid numbers are rejected (stay unknown), never guessed. */
export function setPowerSupply(input: { kind: 'battery' | 'bench' | 'unknown'; voltageV: number | null; maxCurrentA: number | null; source: string }): boolean {
  return patchProfile('Set power supply', (p) => {
    p.powerSupply = { kind: input.kind, voltageV: num(input.voltageV, 0.1, 60), maxCurrentA: num(input.maxCurrentA, 0.01, 100), source: input.source.slice(0, 200) };
    return p;
  }, { type: 'hardware.profile', component: 'Motor power supply', previous: '', next: `${input.voltageV ?? '?'} V, ${input.maxCurrentA ?? '?'} A`, note: 'User-entered values.' });
}

export function setMotorPowerSwitchConfirmed(confirmed: boolean): boolean {
  return patchProfile(confirmed ? 'Confirm motor-power switch' : 'Unconfirm motor-power switch', (p) => ({ ...p, motorPowerSwitchConfirmed: confirmed }), { type: 'hardware.profile', component: 'Motor-power switch', previous: '', next: confirmed ? 'Confirmed' : 'Not confirmed', note: '' });
}

export function setLimits(input: Partial<HardwareProfile['limits']>): boolean {
  return patchProfile('Change motion limits', (p) => {
    const max = num(input.maxSpeedPermille, 50, 1000);
    const accel = num(input.accelPermillePerS, 100, 10000);
    const run = num(input.maxRunSeconds, 5, 600);
    if (max !== null) p.limits.maxSpeedPermille = Math.round(max);
    if (accel !== null) p.limits.accelPermillePerS = Math.round(accel);
    if (run !== null) p.limits.maxRunSeconds = Math.round(run);
    return p;
  }, { type: 'hardware.profile', component: 'Motion limits', previous: '', next: `${input.maxSpeedPermille ?? ''} ${input.accelPermillePerS ?? ''} ${input.maxRunSeconds ?? ''}`.trim(), note: '' });
}

export function acknowledgeWarning(ackId: string, accepted: boolean): boolean {
  return patchProfile(accepted ? 'Accept warning' : 'Withdraw acceptance', (p) => {
    const set = new Set(p.acknowledgedWarnings);
    if (accepted) set.add(ackId);
    else set.delete(ackId);
    p.acknowledgedWarnings = [...set].sort();
    return p;
  });
}

export function setCalibration(patch: Partial<HardwareCalibration>, what: string): boolean {
  return patchProfile(`Calibration: ${what}`, (p) => {
    const c = p.calibration;
    if (patch.invertLeft !== undefined) c.invertLeft = patch.invertLeft;
    if (patch.invertRight !== undefined) c.invertRight = patch.invertRight;
    if (patch.pwmMinPermille !== undefined) c.pwmMinPermille = Math.round(num(patch.pwmMinPermille, 0, 500) ?? c.pwmMinPermille);
    if (patch.wheelDiameterMm !== undefined) c.wheelDiameterMm = patch.wheelDiameterMm === null ? null : num(patch.wheelDiameterMm, 5, 1000);
    if (patch.trackWidthMm !== undefined) c.trackWidthMm = patch.trackWidthMm === null ? null : num(patch.trackWidthMm, 10, 2000);
    if (patch.encoderTicksPerRev !== undefined) c.encoderTicksPerRev = patch.encoderTicksPerRev === null ? null : num(patch.encoderTicksPerRev, 1, 100000);
    if (patch.distanceOffsetMm !== undefined) c.distanceOffsetMm = Math.round(num(patch.distanceOffsetMm, -500, 500) ?? c.distanceOffsetMm);
    if (patch.sensorPositionMm !== undefined) c.sensorPositionMm = patch.sensorPositionMm && patch.sensorPositionMm.every((v) => Number.isFinite(v) && Math.abs(v) <= 5000) ? patch.sensorPositionMm : null;
    if (patch.forward !== undefined) c.forward = patch.forward === 'x-' ? 'x-' : 'x+';
    c.updatedAt = new Date().toISOString();
    return p;
  }, { type: 'hardware.calibration', component: what, previous: '', next: JSON.stringify(patch).slice(0, 120), note: 'Physical calibration only; the 3D model was not changed.' });
}

export function applyFirmwarePinMap(): number {
  const d = data();
  const wiring = applyPinMap(d, () => createId('bpw'));
  if (JSON.stringify(wiring) === JSON.stringify(d.wiring)) return 0;
  useBlueprintStore.getState().apply('Apply firmware pin map', { ...d, wiring }, [{ type: 'wiring.updated', component: 'Wiring', previous: `${d.wiring.length} wires`, next: `${wiring.length} wires`, note: 'Driver and sensor pins set to the firmware pin map.' }]);
  return wiring.length;
}

export function addMotorPowerSwitchToBom(): void {
  const d = data();
  if (d.bomExtras.some((e) => /switch|e-?stop|emergency|disconnect|kill/i.test(e.name))) return;
  useBlueprintStore.getState().apply('Add motor-power switch', {
    ...d,
    bomExtras: [...d.bomExtras, { id: createId('bpx'), name: 'Motor-power disconnect switch (between battery + and driver VM)', quantity: 1, required: true, note: 'Rated for the motor supply voltage and the stall current of both motors. Not from the catalog: choose a part and check its rating.', partId: null, snapshot: null }],
  }, [{ type: 'bom.updated', component: 'Motor-power disconnect switch', previous: '', next: '1 × required', note: 'Hardware emergency-stop path.' }]);
}

export function validateAndRecord() {
  const v = currentValidation();
  useBlueprintStore.getState().record([{ type: 'hardware.validated', component: 'Hardware validation', previous: '', next: v.profileReady ? 'Ready' : `${v.blockers} blocker(s), ${v.openWarnings} warning(s)`, note: v.deviceReady ? 'Device connected and supported.' : 'No supported device connected.' }]);
  return v;
}

/** Program code exactly as Run would execute it (Blockly is converted to JavaScript first). */
async function programCode(programId: string): Promise<{ code: string; name: string; language: 'blockly' | 'javascript' } | { error: string }> {
  const program = useProgramStore.getState().programs[programId];
  if (!program) return { error: 'Program not found.' };
  const source = useCodeStudioStore.getState().drafts[program.id] ?? program.source;
  if (program.language === 'javascript') return { code: source, name: program.name, language: 'javascript' };
  const generator = await import('../code-studio/blockly/generator');
  const generated = generator.generateFromSource(source);
  if (!generated.ok) return { error: generated.issues.find((i) => i.severity === 'error')?.message ?? 'The blocks have errors.' };
  return { code: generated.code, name: program.name, language: 'blockly' };
}

export function projectPrograms() {
  const pid = useSceneStore.getState().projectId;
  return pid ? programsForProject(useProgramStore.getState().programs, pid) : [];
}

export async function prepareForHardware(programId: string): Promise<PreparedProgram | { error: string }> {
  const code = await programCode(programId);
  if ('error' in code) return code;
  const prepared = prepareProgram({ programId, name: code.name, language: code.language, code: code.code });
  useHardwareStore.getState().set({ prepared, deployed: null });
  useBlueprintStore.getState().record([{ type: 'program.prepared', component: code.name, previous: '', next: prepared.ok ? prepared.hash : 'Has errors', note: prepared.issues.map((i) => i.message).join(' ').slice(0, 280) }]);
  if (!prepared.ok) log.warning('system', `"${code.name}" cannot run on the physical robot: ${prepared.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ')}`);
  return prepared;
}

