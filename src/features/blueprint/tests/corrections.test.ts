import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '../../../core/bus/connectorBus';
import { migratePersistedProjects, useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotProject } from '../../../types/project';
import { endControlSession, setWorkspaceMode } from '../../controls/controlSession';
import { hasUnsavedProjectChanges, saveCurrentProject, undo } from '../../projects/workspaceActions';
import { legacyStoredProject } from '../../robot-model/fixtures/phase1ExplorerBot';
import { robotModel } from '../../robot-model/robotModelConnector';
import { addHardware, mapPart, modelView, setMotorDriver, unmapPart } from '../blueprintActions';
import { connectBlueprintHistory } from '../blueprintHistory';
import { blueprintForSave, dataOf, useBlueprintStore } from '../blueprintStore';
import { PARTS } from '../catalog/parts';
import type { CatalogPart } from '../catalog/types';
import { checkCompatibility, motorDriverAssignments } from '../engine/compatibility';
import { normalizeBlueprint } from '../model/normalize';

/**
 * Phase 9 final corrections:
 * Fix 1: every motor is checked against its own assigned driver (no "first driver" assumption).
 * Fix 2: Build History events make the project unsaved, are saved with it and are never dropped silently.
 */

connectBlueprintHistory();

const part = (id: string): CatalogPart => structuredClone(PARTS.find((p) => p.id === id)!);
/** A second, different driver model with lower ratings (test-only part, not in the catalog). */
const SMALL_DRIVER: CatalogPart = {
  ...part('pololu-713'),
  id: 'test-small-driver',
  mpn: 'SMALL-1',
  name: 'Test Small Dual Driver',
  specs: { channels: 2, motorVoltageMinV: 2, motorVoltageMaxV: 5, continuousCurrentPerChannelA: 0.5, peakCurrentPerChannelA: 1.2, logicVoltageMinV: 1.8, logicVoltageMaxV: 5.5 },
  price: null,
};
const objectId = (name: string) => useSceneStore.getState().objects.find((o) => o.name === name)!.id;
const data = () => dataOf(useBlueprintStore.getState().blueprint);
const checks = () => checkCompatibility(modelView(), data());
const mappingOf = (name: string) => data().mappings.find((m) => m.targetKind === 'component' && m.targetId === objectId(name))!;
const byId = (id: string) => checks().find((c) => c.id === id);

function open(project?: RobotProject): RobotProject {
  localStorage.clear();
  endControlSession();
  useSceneStore.getState().closeProject();
  useBlueprintStore.getState().close();
  useProjectStore.setState({ projects: {} });
  const p = project ?? useProjectStore.getState().createProject({ name: 'Corrections Bot', category: 'mobile', templateId: 'explorer-bot' });
  if (project) useProjectStore.setState({ projects: { [p.id]: p } });
  useSceneStore.getState().loadProject(p);
  useBlueprintStore.getState().load(p.id, p.blueprint);
  return p;
}

function reloadFromStorage(id: string): RobotProject {
  const raw = JSON.parse(localStorage.getItem('arai.projects.v1')!) as { state: unknown; version: number };
  return migratePersistedProjects(raw.state, raw.version).projects[id]!;
}

/** Four motors (three HP micro motors and one 25D motor) and two different drivers. */
function fourMotorsTwoDrivers() {
  mapPart('component', objectId('Left Motor'), part('pololu-1101'));
  mapPart('component', objectId('Right Motor'), part('pololu-1101'));
  mapPart('component', objectId('Caster Ball'), part('pololu-1101'));
  mapPart('component', objectId('Top Plate'), part('pololu-1581'));
  const a = addHardware('driver', 'Driver A');
  mapPart('hardware', a, part('pololu-713'));
  const b = addHardware('driver', 'Driver B');
  mapPart('hardware', b, SMALL_DRIVER);
  const driverA = data().mappings.find((m) => m.targetId === a)!.id;
  const driverB = data().mappings.find((m) => m.targetId === b)!.id;
  return { a, b, driverA, driverB };
}

beforeEach(() => setWorkspaceMode('build'));

describe('Fix 1: multiple motor drivers', () => {
  it('with two drivers and no assignment, every motor is Unknown and no motor check is Compatible', () => {
    open();
    fourMotorsTwoDrivers();
    const motors = ['Left Motor', 'Right Motor', 'Caster Ball', 'Top Plate'].map(mappingOf);
    for (const m of motors) {
      const c = byId(`assign:${m.id}`)!;
      expect(c.status).toBe('unknown');
      expect(c.reason).toContain('not assigned');
      expect(byId(`mv:${m.id}`)).toBeUndefined();
      expect(byId(`mc:${m.id}`)).toBeUndefined();
    }
    const motorChecks = checks().filter((c) => c.area === 'motor-driver' && c.id !== 'driver:channels');
    expect(motorChecks.some((c) => c.status === 'compatible')).toBe(false);
    // The total channel capacity check is preserved: 4 motors on 2 + 2 channels.
    expect(byId('driver:channels')!.status).toBe('compatible');
  });

  it('checks each motor against its own driver model and ratings', () => {
    open();
    const { driverA, driverB } = fourMotorsTwoDrivers();
    setMotorDriver(mappingOf('Left Motor').id, driverA);
    setMotorDriver(mappingOf('Right Motor').id, driverA);
    setMotorDriver(mappingOf('Caster Ball').id, driverB);
    setMotorDriver(mappingOf('Top Plate').id, driverB);
    // HP 6 V motor on TB6612 (4.5–13.5 V, 1 A / 3 A): voltage OK, stall 1.6 A warns.
    expect(byId(`mv:${mappingOf('Left Motor').id}`)!.status).toBe('compatible');
    expect(byId(`mc:${mappingOf('Left Motor').id}`)!.status).toBe('warning');
    expect(byId(`mv:${mappingOf('Left Motor').id}`)!.title).toContain('Driver A');
    // HP 6 V motor on the small driver (2–5 V, 0.5 A / 1.2 A): over voltage and over peak current.
    const casterV = byId(`mv:${mappingOf('Caster Ball').id}`)!;
    expect(casterV.status).toBe('incompatible');
    expect(casterV.reason).toContain('above the driver maximum of 5 V');
    expect(casterV.title).toContain('Driver B');
    expect(byId(`mc:${mappingOf('Caster Ball').id}`)!.reason).toContain('peak of 1.2 A');
    // The 25D motor (2.0 A stall) on the small driver is also over its peak.
    expect(byId(`mc:${mappingOf('Top Plate').id}`)!.status).toBe('incompatible');
    // Per-driver channel capacity.
    expect(byId(`driverload:${driverA}`)!.status).toBe('compatible');
    expect(byId(`driverload:${driverB}`)!.status).toBe('compatible');
    // Every warning and incompatibility has a reason.
    expect(checks().filter((c) => c.status === 'warning' || c.status === 'incompatible').every((c) => c.reason.length > 20)).toBe(true);
    // Power checks run for every driver, not just the first.
    const holder = addHardware('battery-holder');
    mapPart('hardware', holder, part('pololu-1153'));
    const cells = addHardware('battery');
    mapPart('hardware', cells, part('panasonic-bk-3mcce'));
    expect(checks().filter((c) => c.id.startsWith('power:driver:'))).toHaveLength(2);
    expect(byId(`power:driver:${driverA}`)!.status).toBe('compatible'); // 4.8 V in 4.5–13.5 V
    expect(byId(`power:driver:${driverB}`)!.status).toBe('compatible'); // 4.8 V in 2–5 V
  });

  it('flags a driver that has more motors assigned than channels, even when the total capacity is enough', () => {
    open();
    const { driverA, driverB } = fourMotorsTwoDrivers();
    for (const name of ['Left Motor', 'Right Motor', 'Caster Ball']) setMotorDriver(mappingOf(name).id, driverA);
    setMotorDriver(mappingOf('Top Plate').id, driverB);
    expect(byId('driver:channels')!.status).toBe('compatible');
    const load = byId(`driverload:${driverA}`)!;
    expect(load.status).toBe('incompatible');
    expect(load.reason).toContain('3 motors are assigned but this driver has only 2 channel(s)');
  });

  it('a removed driver turns its motors back to Unknown, never Compatible', () => {
    open();
    const { driverA, driverB } = fourMotorsTwoDrivers();
    setMotorDriver(mappingOf('Left Motor').id, driverB);
    setMotorDriver(mappingOf('Right Motor').id, driverA);
    unmapPart(driverB);
    const left = mappingOf('Left Motor');
    expect(motorDriverAssignments(data()).get(left.id)!.kind).toBe('missing-driver');
    expect(byId(`assign:${left.id}`)!.status).toBe('unknown');
    expect(byId(`assign:${left.id}`)!.reason).toContain('no longer mapped');
    expect(byId(`mv:${left.id}`)).toBeUndefined();
    // The only remaining driver is used for unassigned motors; the explicit one stays explicit.
    expect(motorDriverAssignments(data()).get(mappingOf('Right Motor').id)!.kind).toBe('explicit');
    expect(motorDriverAssignments(data()).get(mappingOf('Caster Ball').id)!.kind).toBe('only-driver');
  });

  it('assignment is one undo step with history, survives the migration and save / reload, and keeps model ids', () => {
    const p = open();
    const objects = structuredClone(useSceneStore.getState().objects);
    const { driverA, driverB } = fourMotorsTwoDrivers();
    const left = mappingOf('Left Motor').id;
    expect(setMotorDriver(left, driverB)).toBe(true);
    expect(setMotorDriver(left, 'not-a-driver')).toBe(false);
    expect(setMotorDriver(driverA, driverB)).toBe(false); // a driver is not a motor
    expect(useBlueprintStore.getState().blueprint.history.at(-1)!.type).toBe('motor.assigned');
    setWorkspaceMode('blueprint');
    undo();
    expect(mappingOf('Left Motor').driverMappingId).toBeUndefined();
    setMotorDriver(left, driverB);
    const once = normalizeBlueprint(structuredClone(useBlueprintStore.getState().blueprint), 'now').blueprint;
    expect(once.mappings.find((m) => m.id === left)!.driverMappingId).toBe(driverB);
    expect(normalizeBlueprint(once, 'now').blueprint).toEqual(once);
    saveCurrentProject();
    const reloaded = reloadFromStorage(p.id);
    expect(reloaded.blueprint!.mappings.find((m) => m.id === left)!.driverMappingId).toBe(driverB);
    expect(reloaded.objects).toEqual(objects);
  });

  it('a single driver is used for unassigned motors and says so in the check', () => {
    open();
    mapPart('component', objectId('Left Motor'), part('pololu-1101'));
    const d = addHardware('driver');
    mapPart('hardware', d, part('pololu-713'));
    const left = mappingOf('Left Motor').id;
    expect(motorDriverAssignments(data()).get(left)!.kind).toBe('only-driver');
    expect(byId(`mv:${left}`)!.title).toContain('the only mapped driver');
  });
});

describe('Fix 2: unsaved Build History', () => {
  it('opening a project does not mark it unsaved (no loop), and saving does not record new history', () => {
    open();
    expect(useBlueprintStore.getState().dirty).toBe(false);
    expect(hasUnsavedProjectChanges()).toBe(false);
    mapPart('component', objectId('Left Motor'), part('pololu-1101'));
    saveCurrentProject();
    const n = useBlueprintStore.getState().blueprint.history.length;
    expect(hasUnsavedProjectChanges()).toBe(false);
    saveCurrentProject();
    expect(useBlueprintStore.getState().blueprint.history.length).toBe(n);
    expect(hasUnsavedProjectChanges()).toBe(false);
  });

  it('a history-only event (program saved) marks the project unsaved; Save keeps it and clears the flag', () => {
    const p = open();
    const projectId = useSceneStore.getState().projectId!;
    bus.publish('codeStudio.programChanged', { programId: 'prg_x', projectId, change: 'saved' });
    expect(useSceneStore.getState().dirty).toBe(false);
    expect(useBlueprintStore.getState().dirty).toBe(true);
    expect(useBlueprintStore.getState().unsavedEvents).toBe(1);
    expect(hasUnsavedProjectChanges()).toBe(true);
    expect(blueprintForSave()).toBeDefined(); // history alone is now saved, not dropped
    saveCurrentProject();
    expect(useBlueprintStore.getState().unsavedEvents).toBe(0);
    expect(hasUnsavedProjectChanges()).toBe(false);
    const reloaded = reloadFromStorage(p.id);
    expect(reloaded.blueprint!.history.some((e) => e.type === 'program.changed')).toBe(true);
  });

  it('model edits record history that is saved with the model; an old project stays untouched until it changes', () => {
    const legacy = Object.values(migratePersistedProjects({ projects: { a: legacyStoredProject() } }, 1).projects)[0]!;
    open(legacy);
    saveCurrentProject();
    expect('blueprint' in useProjectStore.getState().projects[legacy.id]!).toBe(false);
    robotModel.removeComponent(objectId('Caster Ball'));
    expect(useBlueprintStore.getState().unsavedEvents).toBeGreaterThan(0);
    expect(hasUnsavedProjectChanges()).toBe(true);
    saveCurrentProject();
    const reloaded = reloadFromStorage(legacy.id);
    expect(reloaded.blueprint!.history.some((e) => e.type === 'component.removed' && e.component === 'Caster Ball')).toBe(true);
    expect(reloaded.blueprint!.mappings).toEqual([]);
  });

  it('leaving without saving (cancel or discard) never writes history; only Save does', () => {
    const p = open();
    mapPart('component', objectId('Left Motor'), part('pololu-1101'));
    saveCurrentProject();
    const savedHistory = reloadFromStorage(p.id).blueprint!.history.length;
    bus.publish('robotModel.jointUpdated', { jointId: useSceneStore.getState().joints[0]!.id, changed: ['limits'] });
    expect(hasUnsavedProjectChanges()).toBe(true);
    // "Cancel" keeps everything in memory and still unsaved.
    expect(useBlueprintStore.getState().unsavedEvents).toBe(1);
    // "Discard changes and leave" closes without writing.
    useBlueprintStore.getState().close();
    useSceneStore.getState().closeProject();
    expect(reloadFromStorage(p.id).blueprint!.history.length).toBe(savedHistory);
  });
});
