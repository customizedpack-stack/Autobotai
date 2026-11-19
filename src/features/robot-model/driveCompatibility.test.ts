import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../controls/controlSession';
import { setScheduler, step, STEP_SECONDS } from '../controls/movementEngine';
import { robotControl } from '../controls/robotControlApi';
import { openExplorer } from '../controls/testUtils';
import { generateFromSource } from '../code-studio/blockly/generator';
import { setupBlockly } from '../code-studio/blockly/blocklySetup';
import { configureExecution, runProgram, stopProgram } from '../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../code-studio/testUtils';
import { ground, object, saveEnv } from '../environment/tests/helpers';
import { selectEngine, setEnvironment, setSimulationScheduler, stepSimulation } from '../physics/simulation/simulationManager';
import { redo, saveCurrentProject, undo } from '../projects/workspaceActions';
import { measureDriveGeometry } from './drive';
import { diagnoseDrive, planDriveRepair } from './driveRepair';
import { legacyStoredProject, phase1Objects, phase1Project } from './fixtures/phase1ExplorerBot';
import { robotModel } from './robotModelConnector';
import { migrateProject } from './schema';
import { indexObjects, worldMatrix } from './transforms';
import { migratePersistedProjects, useProjectStore } from '../../stores/projectStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import type { RobotProject } from '../../types/project';
import type { SceneObject } from '../../types/scene';

/**
 * Drive compatibility (Part A): robots saved in Phase 1 had no joints, so "Set up differential
 * drive" failed. Each test names the case from the brief (1–14).
 */

const scene = () => useSceneStore.getState();
const obj = (name: string) => scene().objects.find((o) => o.name === name)!;
const drive = () => scene().controllers.find((c) => c.type === 'differentialDrive');
const counts = () => ({ objects: scene().objects.length, joints: scene().joints.length, actuators: scene().actuators.length, controllers: scene().controllers.length });
const chassisPose = () => useRobotStateStore.getState().rootPoses[obj('Chassis').id];
const run = (seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) step(STEP_SECONDS);
};
/** World matrices of every part, by id (to prove nothing moved). */
const worlds = (objects: readonly SceneObject[]) => {
  const index = indexObjects(objects);
  return Object.fromEntries(objects.map((o) => [o.id, worldMatrix(o.id, index).map((v) => Number(v.toFixed(9)))]));
};

/** Open a stored project the way the app does: through the persisted-store migration. */
function openStored(project: RobotProject | Record<string, unknown>, control = true) {
  openExplorer(false); // resets the stores and the engine clock
  const { projects } = migratePersistedProjects({ projects: { [(project as RobotProject).id]: project } }, 3);
  const loaded = Object.values(projects)[0]!;
  useProjectStore.setState({ projects: { [loaded.id]: loaded } });
  scene().loadProject(loaded);
  if (control) setWorkspaceMode('control');
  return loaded;
}

/** The drive's physical assignment: left joint at −Z, right at +Z, motors bound to them. */
function expectCorrectDrive() {
  const c = drive()!;
  expect(c).toBeDefined();
  const left = scene().joints.find((j) => j.id === c.leftJointId)!;
  const right = scene().joints.find((j) => j.id === c.rightJointId)!;
  expect(left.type).toBe('revolute');
  expect(right.type).toBe('revolute');
  expect(left.parentId).toBe(obj('Chassis').id);
  expect(right.parentId).toBe(obj('Chassis').id);
  const m = measureDriveGeometry(c, scene().objects, scene().joints);
  expect(m.ok).toBe(true);
  if (!m.ok) return;
  expect(m.geometry.left.origin[2]).toBeLessThan(0);
  expect(m.geometry.right.origin[2]).toBeGreaterThan(0);
  expect(m.geometry.wheelRadius).toBeCloseTo(0.07, 6);
  expect(m.geometry.trackWidth).toBeCloseTo(0.31, 6);
  const motors = scene().actuators.filter((a) => a.type === 'dcMotor');
  expect(motors).toHaveLength(2);
  expect(new Set(motors.map((a) => a.jointId))).toEqual(new Set([left.id, right.id]));
  // Each wheel is driven by the motor part on its own side.
  const index = indexObjects(scene().objects);
  for (const a of motors) {
    const joint = scene().joints.find((j) => j.id === a.jointId)!;
    const wheelZ = worldMatrix(joint.childId, index)[14]!;
    const motorZ = worldMatrix(a.componentId!, index)[14]!;
    expect(Math.sign(motorZ)).toBe(Math.sign(wheelZ));
  }
}

beforeEach(() => {
  setScheduler(null);
});
afterEach(async () => {
  stopProgram();
  configureExecution();
  await selectEngine('kinematic');
  setSimulationScheduler(null);
});

describe('drive compatibility: diagnosis of the reported issue', () => {
  it('reproduces the report: a Phase 1 project stored by the old migration has wheels but no joints, so plain detection fails', () => {
    openStored(legacyStoredProject());
    expect(scene().objects.filter((o) => o.category === 'wheel')).toHaveLength(3);
    expect(scene().objects.every((o) => o.parentId === null)).toBe(true);
    expect(scene().joints).toHaveLength(0);
    const d = diagnoseDrive(scene());
    expect(d.ready).toBe(false);
    expect(d.repairable).toBe(true);
    expect(d.checks.find((c) => c.id === 'parent')!.ok).toBe(false);
    expect(d.checks.find((c) => c.id === 'joints')!.ok).toBe(false);
  });
});

describe('drive setup', () => {
  it('1. a fresh Explorer Bot already has a correct drive; Set up is refused without changes', () => {
    openExplorer();
    expectCorrectDrive();
    const before = counts();
    const r = robotModel.setUpDifferentialDrive();
    expect(r.ok).toBe(false);
    expect(counts()).toEqual(before);
  });

  it('2a. legacy (schema v1) Explorer Bot: migration attaches the parts, adds the joints and sets up the drive', () => {
    const result = migrateProject(phase1Project());
    expect(result.fromVersion).toBe(1);
    const p = result.project;
    expect(p.joints.filter((j) => j.type === 'revolute')).toHaveLength(2);
    expect(p.actuators).toHaveLength(2);
    expect(p.controllers).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('saved before joints existed'))).toBe(true);
    // Same ids, and every part is exactly where it was.
    expect(p.objects.map((o) => o.id).sort()).toEqual(phase1Objects().map((o) => o.id).sort());
    const before = worlds(phase1Objects());
    const after = worlds(p.objects);
    for (const id of Object.keys(before)) after[id]!.forEach((v, i) => expect(v).toBeCloseTo(before[id]![i]!, 6));
  });

  it('2b. legacy Explorer Bot as stored today (v3, flat): Set up repairs and configures it in one step', () => {
    const stored = openStored(legacyStoredProject({ environmentId: 'arena', sensors: undefined } as Partial<RobotProject>));
    const before = worlds(scene().objects);
    const ids = scene().objects.map((o) => o.id);
    const r = robotModel.setUpDifferentialDrive();
    expect(r.ok).toBe(true);
    expect(counts()).toEqual({ objects: 9, joints: 2, actuators: 2, controllers: 1 });
    expect(scene().objects.map((o) => o.id)).toEqual(ids);
    const after = worlds(scene().objects);
    for (const id of ids) after[id]!.forEach((v, i) => expect(v).toBeCloseTo(before[id]![i]!, 6));
    expectCorrectDrive();
    expect(useProjectStore.getState().projects[stored.id]!.environmentId).toBe('arena');
    expect(scene().past).toHaveLength(1); // one undo step
  });

  it('3. two valid revolute wheel joints without a controller: set up directly, no structural change', () => {
    openExplorer();
    robotModel.removeController(drive()!.id);
    const objectsBefore = structuredClone(scene().objects);
    const jointsBefore = structuredClone(scene().joints);
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    expect(scene().objects).toEqual(objectsBefore);
    expect(scene().joints).toEqual(jointsBefore);
    expectCorrectDrive();
  });

  it('4. only one wheel: a clear error and nothing changes', () => {
    openStored(legacyStoredProject({ objects: phase1Objects().filter((o) => o.name !== 'Right Wheel') }));
    const before = structuredClone(scene().objects);
    const r = robotModel.setUpDifferentialDrive();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/1 drive wheel/);
    expect(scene().objects).toEqual(before);
    expect(counts()).toMatchObject({ joints: 0, actuators: 0, controllers: 0 });
    expect(diagnoseDrive(scene()).checks.find((c) => c.id === 'wheels')!.ok).toBe(false);
  });

  it('5. two wheels with the wrong joint type (fixed): explained, never changed automatically', () => {
    openExplorer();
    robotModel.removeController(drive()!.id);
    for (const a of [...scene().actuators]) robotModel.deleteActuator(a.id);
    for (const j of scene().joints.filter((j) => j.name.includes('Wheel'))) expect(robotModel.updateJoint(j.id, { type: 'fixed' }).ok).toBe(true);
    const before = structuredClone(scene().joints);
    const r = robotModel.setUpDifferentialDrive();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/revolute/);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/already have joints/);
    expect(scene().joints).toEqual(before);
    expect(diagnoseDrive(scene()).checks.find((c) => c.id === 'joints')!.detail).toMatch(/fixed/);
  });

  it('6. wheels attached to different parents: named in the error, nothing changes', () => {
    openStored(legacyStoredProject());
    expect(robotModel.reparent(obj('Right Wheel').id, obj('Top Plate').id).ok).toBe(true);
    const before = structuredClone(scene().objects);
    const r = robotModel.setUpDifferentialDrive();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/"Right Wheel" is attached to "Top Plate"/);
    expect(scene().objects).toEqual(before);
    expect(scene().joints).toHaveLength(0);
  });

  it('7. missing motor parts: an exact message, and no partial repair (no joints without a drive)', () => {
    openStored(legacyStoredProject({ objects: phase1Objects().filter((o) => o.category !== 'motor') }));
    const before = structuredClone(scene().objects);
    const r = robotModel.setUpDifferentialDrive();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/No free motor component/);
    expect(scene().objects).toEqual(before);
    expect(counts()).toMatchObject({ joints: 0, actuators: 0, controllers: 0 });
    expect(diagnoseDrive(scene()).checks.find((c) => c.id === 'motors')!.ok).toBe(false);
  });

  it('8. an existing valid custom drive is never overwritten (setup, repair and migration)', () => {
    openExplorer();
    const c = drive()!;
    expect(robotModel.updateController(c.id, { maxLinearSpeed: 0.8, wheelRadius: 0.072 }).ok).toBe(true);
    const custom = structuredClone(drive());
    expect(robotModel.setUpDifferentialDrive().ok).toBe(false);
    expect(planDriveRepair(scene()).ok).toBe(false);
    expect(drive()).toEqual(custom);
    const project = { ...useProjectStore.getState().projects[scene().projectId!]!, objects: scene().objects, joints: scene().joints, actuators: scene().actuators, controllers: scene().controllers };
    const migrated = migrateProject(project).project;
    expect(migrated.controllers).toEqual(project.controllers);
    expect(migrated.joints).toEqual(project.joints);
  });

  it('9. repeated setup clicks and repeated migration never duplicate joints, motors or controllers', () => {
    openStored(legacyStoredProject());
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    const after = counts();
    for (let i = 0; i < 3; i++) expect(robotModel.setUpDifferentialDrive().ok).toBe(false);
    expect(counts()).toEqual(after);
    const once = migrateProject(phase1Project()).project;
    const twice = migrateProject(migrateProject(once).project).project;
    expect(twice.joints).toEqual(once.joints);
    expect(twice.actuators).toEqual(once.actuators);
    expect(twice.controllers).toEqual(once.controllers);
    expect(twice.objects).toEqual(once.objects);
  });

  it('10. save, reload and drive again', () => {
    openStored(legacyStoredProject());
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    expect(saveCurrentProject()).toBe(true);
    const stored = JSON.parse(localStorage.getItem('arai.projects.v1')!) as { state: { projects: Record<string, RobotProject> } };
    const reopened = openStored(Object.values(stored.state.projects)[0]!);
    expect(reopened.controllers).toHaveLength(1);
    expectCorrectDrive();
    robotControl.drive.forward();
    run(1);
    expect(chassisPose()!.position[0]).toBeGreaterThan(0.2);
  });

  it('11. undo and redo of the repair-and-setup step', () => {
    openStored(legacyStoredProject());
    const original = structuredClone(scene().objects);
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    const repaired = structuredClone({ objects: scene().objects, joints: scene().joints, actuators: scene().actuators, controllers: scene().controllers });
    setWorkspaceMode('build');
    undo();
    expect(scene().objects).toEqual(original);
    expect(counts()).toMatchObject({ joints: 0, actuators: 0, controllers: 0 });
    redo();
    expect({ objects: scene().objects, joints: scene().joints, actuators: scene().actuators, controllers: scene().controllers }).toEqual(repaired);
  });

  it('12. kinematic movement after the repair: forward, and a left turn goes toward −Z', () => {
    openStored(legacyStoredProject());
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    robotControl.drive.forward();
    run(1);
    robotControl.stop();
    expect(chassisPose()!.position[0]).toBeCloseTo(0.25, 2);
    robotControl.drive.set(0.5);
    robotControl.turn.set(0.5);
    run(1);
    robotControl.stop();
    expect(chassisPose()!.position[2]).toBeLessThan(-0.01);
  });

  it('13. physics movement and a collision with a custom wall after the repair', async () => {
    openStored(legacyStoredProject(), false);
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    const env = saveEnv([ground(), object('wall', { position: [1.0, 0.2, 0], size: [0.1, 0.4, 2] })], 'envd_drivefix');
    setWorkspaceMode('control');
    setSimulationScheduler(null);
    setEnvironment(env.id);
    expect(await selectEngine('physics')).toBe(true);
    stepSimulation(1);
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1, 'panel');
    stepSimulation(5);
    robotControl.drive.set(0, 'panel');
    const x = chassisPose()!.position[0];
    expect(x).toBeGreaterThan(0.5); // it drove
    expect(x).toBeLessThan(0.95); // and the wall stopped it
  });

  it('14. JavaScript and Blockly drive commands work after the repair', async () => {
    openStored(legacyStoredProject(), false);
    expect(robotModel.setUpDifferentialDrive().ok).toBe(true);
    setWorkspaceMode('code');
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    configureExecution({ sandbox: inProcessSandbox() });
    setScheduler({ request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number, cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) });
    const x = () => chassisPose()?.position[0] ?? 0;
    expect(runProgram({ programId: 'js', programName: 'JS drive', language: 'javascript', code: 'await robotControl.drive.forward({ speed: 1, durationMs: 400 });' }).ok).toBe(true);
    await until(() => useExecutionStore.getState().state === 'completed', 5000);
    const afterJs = x();
    expect(afterJs).toBeGreaterThan(0.05);

    setupBlockly();
    const blocks = JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 0, y: 0, next: { block: { type: 'robot_move_forward', inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, DURATION: { shadow: { type: 'math_number', fields: { NUM: 400 } } } } } } }] } });
    const generated = generateFromSource(blocks);
    expect(generated.issues).toEqual([]);
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    expect(runProgram({ programId: 'bk', programName: 'Blockly drive', language: 'blockly', code: generated.code }).ok).toBe(true);
    await until(() => useExecutionStore.getState().state === 'completed', 5000);
    expect(x()).toBeGreaterThan(afterJs + 0.05);
  });
});
