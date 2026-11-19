import type { RobotJoint } from '../../types/joint';
import type { SceneObject, Vec3 } from '../../types/scene';
import { suggestDifferentialDrive } from './drive';
import { decompose, invert, multiply, transformDirection } from './mat4';
import { createJoint, reparentComponent, type Model } from './operations';
import { indexObjects, worldMatrix } from './transforms';

/**
 * Differential-drive diagnosis and the safe repair of legacy robots.
 *
 * Why this exists: robots saved in Phase 1 (schema v1) had no part hierarchy and no
 * joints. The v1 → v2 migration kept them flat with `joints: []`, so the drive setup
 * (which needs two revolute wheel joints on the same part) could never succeed, even
 * though the wheels are visible. See docs/DRIVE-COMPATIBILITY-FIX.md.
 *
 * The repair only runs when the robot can be identified safely:
 * - exactly one chassis part;
 * - exactly two cylinder wheels, neither with a joint yet, each either loose (no parent)
 *   or already attached to the chassis;
 * - both wheels spin sideways and sit on opposite sides of the chassis;
 * - no differential-drive controller exists (a valid custom setup is never touched).
 * Anything else is reported with the exact missing or wrong part; nothing is changed.
 */

export interface DriveCheck {
  id: 'wheels' | 'parent' | 'joints' | 'motors';
  label: string;
  ok: boolean;
  detail: string;
}

export interface DriveDiagnosis {
  /** The setup can run as is (two revolute wheel joints on one part, motors found). */
  ready: boolean;
  /** The setup can run after the safe structural repair (attach parts, add wheel joints). */
  repairable: boolean;
  checks: DriveCheck[];
  /** Plain-language problems when neither works. */
  errors: string[];
}

export type RepairResult = { ok: true; model: Model; summary: string[]; warnings: string[] } | { ok: false; errors: string[] };

const isDriveWheel = (o: SceneObject) => o.category === 'wheel' && o.geometry.shape === 'cylinder';
const sideOf = (z: number) => (z < 0 ? 'Left' : 'Right');

/** A part's local +Y (a cylinder's axis) and position in the chassis frame. */
function inChassisFrame(objects: readonly SceneObject[], chassisId: string, id: string): { axis: Vec3; position: Vec3 } {
  const index = indexObjects(objects);
  const toChassis = invert(worldMatrix(chassisId, index));
  const m = multiply(toChassis, worldMatrix(id, index));
  const raw = transformDirection(m, [0, 1, 0]);
  const length = Math.hypot(...raw) || 1;
  const { position } = decompose(m);
  return { axis: [raw[0] / length, raw[1] / length, raw[2] / length], position };
}

/** The joint axis for a wheel: its cylinder axis, snapped to the nearest chassis axis when close. */
function wheelAxis(axis: Vec3): Vec3 {
  const i = axis.map(Math.abs).indexOf(Math.max(...axis.map(Math.abs)));
  if (Math.abs(axis[i]!) > 0.98) return [0, 1, 2].map((k) => (k === i ? Math.sign(axis[i]!) : 0)) as Vec3;
  return axis;
}

/**
 * Plan the structural repair. Pure: returns a new model, or the reasons it is not safe.
 * Idempotent: once the wheels have joints there is nothing to repair.
 */
export function planDriveRepair(model: Model): RepairResult {
  const { objects, joints } = model;
  if (model.controllers.some((c) => c.type === 'differentialDrive')) return { ok: false, errors: ['A differential-drive controller already exists; it is never replaced automatically.'] };
  const chassis = objects.filter((o) => o.category === 'chassis');
  if (chassis.length !== 1) {
    return { ok: false, errors: [chassis.length === 0 ? 'No chassis part was found. Add a chassis and attach both wheels to it with revolute joints.' : `${chassis.length} chassis parts were found, so the drive base cannot be chosen safely. Attach both wheels to one part with revolute joints.`] };
  }
  const base = chassis[0]!;
  const wheels = objects.filter(isDriveWheel);
  if (wheels.length !== 2) return { ok: false, errors: [`The robot has ${wheels.length} drive wheel${wheels.length === 1 ? '' : 's'} (cylinder wheel parts); a differential drive needs exactly two.`] };
  const jointed = wheels.filter((w) => joints.some((j) => j.childId === w.id));
  if (jointed.length > 0) return { ok: false, errors: [`${jointed.map((w) => `"${w.name}"`).join(' and ')} already ${jointed.length === 1 ? 'has a joint' : 'have joints'}; the repair only adds missing joints and never changes existing ones.`] };
  const elsewhere = wheels.filter((w) => w.parentId !== null && w.parentId !== base.id);
  if (elsewhere.length > 0) {
    const names = elsewhere.map((w) => `"${w.name}" is attached to "${objects.find((o) => o.id === w.parentId)?.name ?? 'another part'}"`);
    return { ok: false, errors: [`${names.join('; ')}. Both drive wheels must be attached to "${base.name}". Move them in Build Mode, then try again.`] };
  }
  const frames = wheels.map((w) => inChassisFrame(objects, base.id, w.id));
  if (frames.some((f) => Math.abs(f.axis[2]) < 0.9)) return { ok: false, errors: ['A drive wheel does not spin sideways (its axle must point left/right). Rotate it in Build Mode, then try again.'] };
  if (Math.sign(frames[0]!.position[2]) === Math.sign(frames[1]!.position[2])) return { ok: false, errors: ['Both drive wheels are on the same side of the chassis. Place one on each side.'] };

  let working: Model = model;
  const summary: string[] = [];
  const warnings: string[] = [];
  // Legacy flat robot (every part loose): attach the parts to the chassis, keeping where they are.
  const flat = objects.every((o) => o.parentId === null);
  if (flat) {
    const attached: string[] = [];
    for (const o of objects) {
      if (o.id === base.id) continue;
      const moved = reparentComponent(working, o.id, base.id);
      if (!moved.ok) return { ok: false, errors: moved.errors };
      working = moved.model;
      attached.push(o.name);
    }
    if (attached.length) summary.push(`Attached ${attached.length} loose part${attached.length === 1 ? '' : 's'} to "${base.name}" (positions unchanged).`);
  }
  for (const [i, wheel] of wheels.entries()) {
    const side = sideOf(frames[i]!.position[2]);
    const made = createJoint(working, {
      type: 'revolute',
      name: `${side} Wheel Joint`,
      parentId: base.id,
      childId: wheel.id,
      axis: wheelAxis(frames[i]!.axis),
      limits: { lower: -Math.PI, upper: Math.PI },
      description: 'Wheel axle added by the drive repair (the robot was saved before joints existed).',
    });
    if (!made.ok) return { ok: false, errors: made.errors };
    working = made.model;
    if (!wheel.name.toLowerCase().includes(side.toLowerCase())) {
      warnings.push(`The part "${wheel.name}" sits on the robot's ${side.toLowerCase()} side (left is −Z when the robot faces +X), so it is driven as the ${side.toLowerCase()} wheel. You can rename it in Build Mode.`);
    }
  }
  summary.push(`Added 2 revolute wheel joints (${wheels.map((w) => `"${w.name}"`).join(' and ')} on "${base.name}").`);
  return { ok: true, model: working, summary, warnings };
}

/**
 * Repair if needed, then set up the drive: the complete, all-or-nothing result for one undo
 * step. Never returns a partial robot (for example joints without a controller).
 */
export function repairAndSuggestDrive(model: Model): { ok: true; model: Model; repaired: boolean; summary: string[]; warnings: string[]; suggestion: Extract<ReturnType<typeof suggestDifferentialDrive>, { ok: true }> } | { ok: false; errors: string[] } {
  const direct = suggestDifferentialDrive(model.objects, model.joints, model.actuators);
  if (direct.ok) return { ok: true, model, repaired: false, summary: [], warnings: [], suggestion: direct };
  const repair = planDriveRepair(model);
  if (!repair.ok) return { ok: false, errors: [...direct.errors, ...repair.errors.filter((e) => !direct.errors.includes(e))] };
  const after = suggestDifferentialDrive(repair.model.objects, repair.model.joints, repair.model.actuators);
  if (!after.ok) return { ok: false, errors: after.errors };
  return { ok: true, model: repair.model, repaired: true, summary: repair.summary, warnings: repair.warnings, suggestion: after };
}

/** What the drive setup needs, checked one by one, for the guided setup panel. */
export function diagnoseDrive(model: Model): DriveDiagnosis {
  const { objects, joints } = model;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const wheels = objects.filter(isDriveWheel);
  const wheelJoints = joints.filter((j) => wheels.some((w) => w.id === j.childId));
  const parents = new Set(wheels.map((w) => w.parentId));
  const motors = objects.filter((o) => o.category === 'motor');
  const checks: DriveCheck[] = [
    { id: 'wheels', label: 'Two drive wheels', ok: wheels.length === 2, detail: wheels.length === 2 ? wheels.map((w) => w.name).join(', ') : `${wheels.length} found (cylinder wheel parts)` },
    {
      id: 'parent',
      label: 'Both wheels on the same part',
      ok: wheels.length === 2 && parents.size === 1 && !parents.has(null),
      detail: wheels.map((w) => `${w.name} → ${w.parentId ? (byId.get(w.parentId)?.name ?? 'missing part') : 'not attached'}`).join('; ') || '—',
    },
    {
      id: 'joints',
      label: 'Revolute wheel joints',
      ok: wheels.length === 2 && wheels.every((w) => wheelJoints.some((j: RobotJoint) => j.childId === w.id && j.type === 'revolute')),
      detail: wheels.map((w) => `${w.name}: ${wheelJoints.find((j) => j.childId === w.id)?.type ?? 'no joint'}`).join('; ') || '—',
    },
    { id: 'motors', label: 'Two motor parts', ok: motors.length >= 2, detail: `${motors.length} found` },
  ];
  const direct = suggestDifferentialDrive(objects, joints, model.actuators);
  const full = direct.ok ? null : repairAndSuggestDrive(model);
  return { ready: direct.ok, repairable: Boolean(full?.ok), checks, errors: direct.ok || full?.ok ? [] : full!.ok ? [] : full!.errors };
}
