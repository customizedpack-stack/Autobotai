import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '../../../core/bus/connectorBus';
import { useProjectStore, migratePersistedProjects } from '../../../stores/projectStore';
import { canDrive, isDesignLocked, useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotProject } from '../../../types/project';
import { endControlSession, setWorkspaceMode } from '../../controls/controlSession';
import { redo, saveCurrentProject, undo } from '../../projects/workspaceActions';
import { legacyStoredProject } from '../../robot-model/fixtures/phase1ExplorerBot';
import { robotModel } from '../../robot-model/robotModelConnector';
import {
  addExtra,
  addHardware,
  addStandardWiring,
  mapPart,
  markGuideGenerated,
  modelView,
  setMappingQuantity,
  setStepStatus,
  unmapPart,
  updateSnapshotFromCatalog,
  updateWiring,
} from '../blueprintActions';
import { connectBlueprintHistory } from '../blueprintHistory';
import { blueprintForSave, dataOf, useBlueprintStore } from '../blueprintStore';
import { buildCatalog, loadCatalog, missingSpecs, resetCatalogForTests, sanitizeUrl, searchParts, validatePart } from '../catalog/catalog';
import { CATALOG_VERSION, PARTS } from '../catalog/parts';
import type { CatalogPart } from '../catalog/types';
import { bomToCsv, buildBom, csvCell } from '../engine/bom';
import { checkCompatibility, statusByMapping, type CompatCheck } from '../engine/compatibility';
import { GUIDE_SECTIONS, generateGuide } from '../engine/guide';
import { compareData, isEmptyDiff } from '../engine/history';
import { virtualComponents } from '../engine/virtualComponents';
import { validateWiring } from '../engine/wiring';
import { normalizeBlueprint } from '../model/normalize';
import { HISTORY_LIMIT } from '../model/types';

connectBlueprintHistory();

const part = (id: string): CatalogPart => structuredClone(PARTS.find((p) => p.id === id)!);
const objectId = (name: string) => useSceneStore.getState().objects.find((o) => o.name === name)!.id;
const data = () => dataOf(useBlueprintStore.getState().blueprint);
const checks = (): CompatCheck[] => checkCompatibility(modelView(), data());
const check = (prefix: string) => checks().find((c) => c.id.startsWith(prefix));

function open(project?: RobotProject): RobotProject {
  localStorage.clear();
  endControlSession();
  useSceneStore.getState().closeProject();
  useBlueprintStore.getState().close();
  useProjectStore.setState({ projects: {} });
  const p = project ?? useProjectStore.getState().createProject({ name: 'Blueprint Bot', category: 'mobile', templateId: 'explorer-bot' });
  if (project) useProjectStore.setState({ projects: { [p.id]: p } });
  useSceneStore.getState().loadProject(p);
  useBlueprintStore.getState().load(p.id, p.blueprint);
  return p;
}

/** Explorer Bot mapped like the browser workflow: motors, wheels, driver, ESP32, ToF sensor. */
function mapExplorer() {
  mapPart('component', objectId('Left Motor'), part('pololu-1101'));
  mapPart('component', objectId('Right Motor'), part('pololu-1101'));
  mapPart('component', objectId('Left Wheel'), part('pololu-1429'));
  mapPart('component', objectId('Right Wheel'), part('pololu-1429'));
  const driver = addHardware('driver');
  mapPart('hardware', driver, part('pololu-713'));
  mapPart('component', objectId('Controller Board'), part('espressif-esp32-devkitc-v4'));
  mapPart('component', objectId('Distance Sensor'), part('pololu-2490'));
  return { driver };
}

/** Reload the saved project from persisted storage, as after a browser reload. */
function reloadFromStorage(id: string): RobotProject {
  const raw = JSON.parse(localStorage.getItem('arai.projects.v1')!) as { state: unknown; version: number };
  const { projects } = migratePersistedProjects(raw.state, raw.version);
  return projects[id]!;
}

beforeEach(() => {
  setWorkspaceMode('build');
  resetCatalogForTests();
});

describe('Parts catalog', () => {
  it('validates every bundled part: source, date and price provenance, no duplicates', () => {
    const catalog = buildCatalog(PARTS, CATALOG_VERSION);
    expect(catalog.rejected).toEqual([]);
    expect(catalog.parts.length).toBe(PARTS.length);
    for (const p of catalog.parts) {
      expect(p.source.url.startsWith('https://')).toBe(true);
      expect(p.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.price) expect(p.price.url.startsWith('https://') && /^\d{4}-\d{2}-\d{2}$/.test(p.price.checkedAt)).toBe(true);
      else expect(p.priceNote).toBeTruthy();
      expect(p.imageUrl).toBeNull();
    }
  });

  it('rejects duplicates, missing sources, invented prices and unsafe links', () => {
    const good = part('pololu-713');
    const dupId = { ...good };
    const dupMpn = { ...good, id: 'copy-713' };
    const noSource = { ...good, id: 'x-1', mpn: 'X1', source: { ...good.source, url: 'javascript:alert(1)' } };
    const badPrice = { ...good, id: 'x-2', mpn: 'X2', price: { amount: 5, currency: 'USD', forQuantity: 1, url: '', checkedAt: '' } };
    const catalog = buildCatalog([good, dupId, dupMpn, noSource, badPrice, null], 'test');
    expect(catalog.parts.map((p) => p.id)).toEqual(['pololu-713']);
    expect(catalog.rejected).toHaveLength(5);
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('http://example.com')).toBeNull();
    expect(sanitizeUrl('https://user:pw@example.com')).toBeNull();
    expect(sanitizeUrl('https://www.pololu.com/product/713')).toBe('https://www.pololu.com/product/713');
    expect(validatePart({ ...good, specs: { channels: -2 } })).toContain('Invalid spec "channels".');
  });

  it('searches by text and filters by category, and lists unknown specs as missing', async () => {
    const catalog = await loadCatalog();
    expect(await loadCatalog()).toBe(catalog);
    expect(searchParts(catalog.parts, 'tb6612').map((p) => p.id)).toEqual(['pololu-713']);
    expect(searchParts(catalog.parts, '', 'motor').every((p) => p.category === 'motor')).toBe(true);
    expect(searchParts(catalog.parts, '', 'camera')).toEqual([]);
    expect(missingSpecs(part('espressif-esp32-devkitc-v4'))).toEqual(expect.arrayContaining(['gpioCount', 'weightG']));
    expect(missingSpecs(part('pololu-1101'))).toEqual([]);
  });
});

describe('Mapping', () => {
  it('starts empty (no automatic mapping) and maps parts as snapshots without touching the robot model', () => {
    open();
    expect(data().mappings).toEqual([]);
    const before = structuredClone(useSceneStore.getState().objects);
    const scenePast = useSceneStore.getState().past.length;
    mapExplorer();
    expect(data().mappings).toHaveLength(7);
    expect(useSceneStore.getState().objects).toEqual(before);
    expect(useSceneStore.getState().past.length).toBe(scenePast);
    const motor = data().mappings.find((m) => m.targetId === objectId('Left Motor'))!;
    expect(motor.snapshot).toEqual(part('pololu-1101'));
    expect(useBlueprintStore.getState().dirty).toBe(true);
  });

  it('replaces, removes and changes quantity with history and one undo step each', () => {
    open();
    const id = objectId('Left Motor');
    mapPart('component', id, part('pololu-1101'));
    mapPart('component', id, part('pololu-1581'));
    expect(data().mappings).toHaveLength(1);
    expect(data().mappings[0]!.partId).toBe('pololu-1581');
    const types = useBlueprintStore.getState().blueprint.history.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['part.mapped', 'part.replaced']));
    setMappingQuantity(data().mappings[0]!.id, 3);
    expect(data().mappings[0]!.quantity).toBe(3);
    setWorkspaceMode('blueprint');
    undo();
    expect(data().mappings[0]!.quantity).toBe(1);
    undo();
    expect(data().mappings[0]!.partId).toBe('pololu-1101');
    redo();
    expect(data().mappings[0]!.partId).toBe('pololu-1581');
    unmapPart(data().mappings[0]!.id);
    expect(data().mappings).toEqual([]);
  });

  it('keeps the snapshot when the catalog changes and only updates on request', () => {
    open();
    const id = objectId('Left Motor');
    mapPart('component', id, part('pololu-1101'));
    const changed = { ...part('pololu-1101'), source: { ...part('pololu-1101').source, verifiedAt: '2027-01-01' } };
    const catalog = buildCatalog([changed], 'next');
    const stale = checkCompatibility(modelView(), data(), catalog.byId).find((c) => c.id.startsWith('stale:'));
    expect(stale?.status).toBe('warning');
    expect(data().mappings[0]!.snapshot.source.verifiedAt).toBe('2026-11-20');
    const missing = checkCompatibility(modelView(), data(), buildCatalog([], 'empty').byId).find((c) => c.id.startsWith('missing:'));
    expect(missing?.status).toBe('warning');
    expect(updateSnapshotFromCatalog(data().mappings[0]!.id)).toBe(false); // the catalog is not loaded yet: nothing changes
  });

  it('keeps and flags the mapping of a removed component (never silently deleted)', () => {
    open();
    mapExplorer();
    const sensorId = objectId('Distance Sensor');
    robotModel.removeComponent(sensorId);
    expect(data().mappings.some((m) => m.targetId === sensorId)).toBe(true);
    expect(checks().find((c) => c.id.startsWith('orphan:'))?.status).toBe('warning');
    expect(buildBom(modelView(), data(), checks()).excludedOrphans).toBe(1);
    const removed = useBlueprintStore.getState().blueprint.history.find((e) => e.type === 'component.removed');
    expect(removed?.component).toBe('Distance Sensor');
  });
});

describe('Compatibility engine', () => {
  it('checks motor voltage and current against the driver', () => {
    open();
    mapExplorer();
    expect(check('mv:')!.status).toBe('compatible');
    const current = check('mc:')!;
    expect(current.status).toBe('warning');
    expect(current.reason).toContain('1.6 A');
    expect(check('driver:channels')!.status).toBe('compatible');
  });

  it('marks a stall current above the driver peak incompatible and missing data unknown (never compatible)', () => {
    open();
    mapExplorer();
    const big = { ...part('pololu-1101'), id: 'test-big-motor', mpn: 'BIG', specs: { ...part('pololu-1101').specs, stallCurrentA: 5 } };
    mapPart('component', objectId('Left Motor'), big);
    expect(checks().find((c) => c.id.startsWith('mc:') && c.status === 'incompatible')?.reason).toContain('peak');
    const blank = { ...part('pololu-1101'), id: 'test-blank-motor', mpn: 'BLANK', specs: { shaftDiameterMm: 3, shaftType: 'D' as const } };
    mapPart('component', objectId('Left Motor'), blank);
    const unknown = checks().filter((c) => c.mappingIds.includes(data().mappings.find((m) => m.targetId === objectId('Left Motor'))!.id) && c.area === 'motor-driver');
    expect(unknown.every((c) => c.status === 'unknown' || c.id === 'driver:channels')).toBe(true);
    expect(unknown.some((c) => c.status === 'compatible' && c.id !== 'driver:channels')).toBe(false);
  });

  it('flags GPIO overvoltage for a 5 V HC-SR04 on a 3.3 V ESP32 and accepts the ToF sensor', () => {
    open();
    mapExplorer();
    expect(check('sl:')!.status).toBe('compatible');
    expect(check('si:')!.status).toBe('compatible');
    mapPart('component', objectId('Distance Sensor'), part('generic-hc-sr04'));
    const level = check('sl:')!;
    expect(level.status).toBe('incompatible');
    expect(level.reason).toContain('GPIO overvoltage');
    expect(checks().find((c) => c.id.startsWith('unverified:'))?.status).toBe('warning');
    mapPart('component', objectId('Controller Board'), part('arduino-uno-r3'));
    expect(check('sl:')!.status).toBe('compatible');
    expect(check('dl:')!.status).toBe('compatible');
  });

  it('checks shaft diameter, wheel size against the 3D model and motor mounting', () => {
    open();
    mapExplorer();
    expect(checks().filter((c) => c.id.startsWith('shaft:')).every((c) => c.status === 'compatible')).toBe(true);
    const wheel = check('wheeld:')!;
    expect(wheel.status).toBe('warning');
    expect(wheel.reason).toContain('140 mm');
    expect(check('mount:motors')!.status).toBe('warning');
    mapPart('component', objectId('Left Motor'), part('pololu-1581'));
    const shaft = checks().find((c) => c.id.startsWith('shaft:') && c.status === 'incompatible')!;
    expect(shaft.reason).toContain('4 mm');
    addExtra({ name: 'Bracket', quantity: 1, required: true, part: part('pololu-989') });
    expect(check('mount:motors')!.status).toBe('compatible');
  });

  it('checks the power system: pack voltage, regulator input and unknown battery current', () => {
    open();
    mapExplorer();
    expect(check('power:missing')!.status).toBe('warning');
    const holder = addHardware('battery-holder');
    mapPart('hardware', holder, part('pololu-1153'));
    const cells = addHardware('battery');
    mapPart('hardware', cells, part('panasonic-bk-3mcce'));
    expect(check('power:pack')!.status).toBe('warning'); // 4 cells needed, quantity 1
    setMappingQuantity(data().mappings.find((m) => m.targetId === cells)!.id, 4);
    expect(check('power:pack')!.status).toBe('compatible');
    expect(check('power:pack')!.title).toContain('4.8 V');
    expect(check('power:driver')!.status).toBe('compatible');
    expect(check('power:motor')!.status).toBe('warning');
    expect(check('power:stall')!.status).toBe('unknown');
    const reg = addHardware('regulator');
    mapPart('hardware', reg, part('pololu-2831'));
    expect(check('power:reg:')!.status).toBe('incompatible');
    expect(check('power:budget:')!.status).toBe('unknown'); // ESP32 current draw is not stated
    const byMapping = statusByMapping(checks(), data());
    expect([...byMapping.values()]).toContain('incompatible');
  });
});

describe('BOM', () => {
  it('counts packs, uses only verified prices and hides the total while a price is missing', () => {
    open();
    mapExplorer();
    const bom = buildBom(modelView(), data(), checks());
    const wheels = bom.lines.find((l) => l.name.includes('Wheel'))!;
    expect(wheels.units).toBe(2);
    expect(wheels.quantity).toBe(1);
    expect(wheels.total).toBe(7.45);
    const motors = bom.lines.find((l) => l.model === '1101')!;
    expect(motors.quantity).toBe(2);
    expect(motors.total).toBe(47.9);
    expect(bom.lines.find((l) => l.model === 'ESP32-DevKitC V4')!.unitPrice).toBeNull();
    expect(bom.requiredTotal).toBeNull();
    expect(bom.unpricedRequired).toBe(2);
  });

  it('shows a total when every required line is priced, separates optional lines and updates live', () => {
    open();
    mapPart('component', objectId('Left Motor'), part('pololu-1101'));
    mapPart('component', objectId('Left Wheel'), part('pololu-1429'));
    expect(buildBom(modelView(), data(), checks()).requiredTotal).toBe(31.4);
    addExtra({ name: 'Rocker switch', quantity: 1, required: false });
    const bom = buildBom(modelView(), data(), checks());
    expect(bom.requiredTotal).toBe(31.4);
    expect(bom.optionalTotal).toBeNull();
    expect(bom.lines.find((l) => l.name === 'Rocker switch')!.notes).toContain('no verified specs or price');
  });

  it('exports CSV with escaping, a price notice and formula injection guarded', () => {
    open();
    mapPart('component', objectId('Left Motor'), part('pololu-1101'));
    addExtra({ name: '=HYPERLINK("x")', quantity: 2, required: true });
    const csv = bomToCsv(buildBom(modelView(), data(), checks()), 'Bot, "One"', '2026-11-20T00:00:00Z');
    expect(csv).toContain('"Bill of materials: Bot, ""One"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('Prices are the manufacturer');
    expect(csv).toContain('Required total not shown');
    expect(csvCell(-1)).toBe('"-1"');
  });
});

describe('Wiring', () => {
  it('adds standard wires with unspecified controller pins and flags them', () => {
    open();
    mapExplorer();
    expect(addStandardWiring()).toBeGreaterThan(5);
    expect(addStandardWiring()).toBe(0); // nothing is duplicated
    const report = validateWiring(modelView(), data());
    expect(report.issues.some((i) => i.kind === 'unspecified')).toBe(true);
    expect(report.drawable.size).toBeGreaterThan(0); // fully specified ground and logic supply wires
    const driverVm = data().wiring.find((w) => w.componentPin === 'VM')!;
    expect(report.drawable.has(driverVm.id)).toBe(false); // battery unknown → voltage unknown
  });

  it('flags GPIO overvoltage, voltage mismatch, missing ground, missing protection and insufficient current', () => {
    open();
    mapExplorer();
    mapPart('component', objectId('Distance Sensor'), part('generic-hc-sr04'));
    addStandardWiring();
    const echo = data().wiring.find((w) => w.componentPin === 'ECHO')!;
    updateWiring(echo.id, { controllerPin: 'GPIO18' });
    let report = validateWiring(modelView(), data());
    expect(report.issues.find((i) => i.recordId === echo.id && i.kind === 'gpio-overvoltage')).toBeTruthy();
    expect(report.drawable.has(echo.id)).toBe(false);
    const vcc = data().wiring.find((w) => w.componentPin === 'VCC')!;
    updateWiring(vcc.id, { voltage: 12 });
    report = validateWiring(modelView(), data());
    expect(report.issues.find((i) => i.recordId === vcc.id)?.kind).toBe('voltage-mismatch');
    const gnd = data().wiring.find((w) => w.interface === 'ground' && w.componentPin === 'GND')!;
    updateWiring(gnd.id, { interface: 'digital', voltage: 3.3 });
    expect(validateWiring(modelView(), data()).issues.some((i) => i.kind === 'missing-ground')).toBe(true);
    const holder = addHardware('battery-holder');
    mapPart('hardware', holder, part('pololu-1153'));
    expect(validateWiring(modelView(), data()).issues.some((i) => i.kind === 'missing-protection')).toBe(true);
    addExtra({ name: 'Inline fuse', quantity: 1, required: true });
    expect(validateWiring(modelView(), data()).issues.some((i) => i.kind === 'missing-protection')).toBe(false);
    // Insufficient current: a Raspberry Pi (3 A supply rating) on a 1 A regulator.
    const reg = addHardware('regulator');
    mapPart('hardware', reg, part('pololu-2831'));
    mapPart('component', objectId('Controller Board'), part('raspberrypi-4-model-b'));
    const before = data().wiring.length;
    useBlueprintStore.getState().apply('test', { ...data(), wiring: [...data().wiring, { id: 'w-pi', controllerPin: 'VOUT', sourceRef: `hardware:${reg}`, componentRef: `component:${objectId('Controller Board')}`, componentPin: '5V', interface: 'power', voltage: 5, direction: 'power-supply', notes: '' }] });
    expect(data().wiring.length).toBe(before + 1);
    expect(validateWiring(modelView(), data()).issues.some((i) => i.kind === 'insufficient-current' && i.recordId === 'w-pi')).toBe(true);
  });
});

describe('Build Guide', () => {
  it('has the 14 sections, stable step ids, keeps statuses on regenerate and never completes steps itself', () => {
    open();
    mapExplorer();
    markGuideGenerated();
    const input = () => ({ model: modelView(), data: data(), checks: checks(), wiring: validateWiring(modelView(), data()), programNames: [] });
    const steps = generateGuide(input());
    expect(GUIDE_SECTIONS).toHaveLength(14);
    expect(new Set(steps.map((s) => s.section)).size).toBe(14);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(Object.keys(data().guide.steps)).toEqual([]); // nothing is completed or started automatically
    const motorStep = steps.find((s) => s.section === 'motors')!;
    setStepStatus(motorStep.id, motorStep.title, 'in-progress');
    mapPart('component', objectId('Right Wheel'), part('pololu-1429')); // no-op re-map keeps the same structure
    markGuideGenerated();
    const again = generateGuide(input());
    expect(again.map((s) => s.id)).toEqual(steps.map((s) => s.id));
    expect(data().guide.steps[motorStep.id]!.status).toBe('in-progress');
    expect(Object.values(data().guide.steps).some((s) => s.status === 'completed')).toBe(false);
  });
});

describe('Build History and versions', () => {
  it('records design events from the bus but not sensor or simulation streams, and stays bounded', () => {
    open();
    const n = useBlueprintStore.getState().blueprint.history.length;
    bus.publish('sensor.stream', { state: 'running', source: 'kinematic', session: 1, sensors: 3 });
    bus.publish('robotModel.jointUpdated', { jointId: useSceneStore.getState().joints[0]!.id, changed: ['limits'] });
    bus.publish('codeStudio.programChanged', { programId: 'p1', projectId: useSceneStore.getState().projectId!, change: 'saved' });
    bus.publish('codeStudio.programChanged', { programId: 'p2', projectId: 'another-project', change: 'saved' });
    const added = useBlueprintStore.getState().blueprint.history.slice(n).map((e) => e.type);
    expect(added).toEqual(['joint.changed', 'program.changed']);
    useBlueprintStore.getState().record(Array.from({ length: HISTORY_LIMIT + 50 }, () => ({ type: 'bom.updated' as const, component: 'x', previous: '', next: '', note: '' })));
    expect(useBlueprintStore.getState().blueprint.history).toHaveLength(HISTORY_LIMIT);
  });

  it('compares and restores versions without changing the 3D model', () => {
    open();
    mapExplorer();
    useBlueprintStore.getState().createSnapshot('First');
    const snap = useBlueprintStore.getState().blueprint.snapshots[0]!;
    mapPart('component', objectId('Distance Sensor'), part('generic-hc-sr04'));
    const diff = compareData(snap.data, data());
    expect(diff.mappings).toHaveLength(1);
    expect(isEmptyDiff(compareData(data(), data()))).toBe(true);
    const objects = structuredClone(useSceneStore.getState().objects);
    expect(useBlueprintStore.getState().restoreSnapshot(snap.id)).toBe(true);
    expect(data().mappings.find((m) => m.targetId === objectId('Distance Sensor'))!.partId).toBe('pololu-2490');
    expect(useSceneStore.getState().objects).toEqual(objects);
    expect(useBlueprintStore.getState().blueprint.history.at(-1)!.type).toBe('snapshot.restored');
  });

  it('migration is idempotent, drops invalid entries and sanitizes stored links', () => {
    open();
    mapExplorer();
    addStandardWiring();
    const stored = structuredClone(useBlueprintStore.getState().blueprint);
    const once = normalizeBlueprint(stored, 'now').blueprint;
    expect(normalizeBlueprint(once, 'now').blueprint).toEqual(once);
    expect(once).toEqual(stored);
    const broken = structuredClone(stored) as unknown as Record<string, unknown[]>;
    (broken.mappings as Record<string, unknown>[])[0]!.snapshot = { ...(broken.mappings[0] as { snapshot: object }).snapshot, officialUrl: 'javascript:alert(1)' };
    broken.mappings.push({ ...(broken.mappings[1] as object) }); // duplicate target
    broken.wiring.push({ id: 'bad', interface: 'laser' });
    const result = normalizeBlueprint(broken, 'now');
    expect(result.dropped).toBe(2);
    expect(result.blueprint.mappings[0]!.snapshot.officialUrl).toBeNull();
    expect(normalizeBlueprint('garbage', 'now').dropped).toBe(1);
  });
});

describe('Backward compatibility and persistence', () => {
  it('Phase 1 project: opens with an empty blueprint and saves without a blueprint field', () => {
    const legacy = migratePersistedProjects({ projects: { a: legacyStoredProject() } }, 1).projects;
    const project = Object.values(legacy)[0]!;
    open(project);
    expect(virtualComponents(modelView(), data()).length).toBe(project.objects.length);
    expect(blueprintForSave()).toBeUndefined();
    saveCurrentProject();
    const saved = useProjectStore.getState().projects[project.id]!;
    expect('blueprint' in saved).toBe(false);
    expect(saved.objects.map((o) => o.id)).toEqual(project.objects.map((o) => o.id));
  });

  it('Phase 3 project (no sensors): blueprint saves and reloads; the model is unchanged', () => {
    const base = open();
    const phase3 = { ...structuredClone(base) };
    delete phase3.sensors;
    open(phase3);
    mapExplorer();
    saveCurrentProject();
    const reloaded = reloadFromStorage(phase3.id);
    expect('sensors' in reloaded).toBe(false);
    expect(reloaded.actuators).toEqual(phase3.actuators);
    expect(reloaded.controllers).toEqual(phase3.controllers);
    open(reloaded);
    expect(data().mappings).toHaveLength(7);
    expect(useBlueprintStore.getState().dirty).toBe(false);
  });

  it('Phase 5 (physics overrides), Phase 7 (environment) and Phase 8 (camera) projects keep everything', () => {
    const base = open();
    const project: RobotProject = structuredClone(base);
    project.objects = project.objects.map((o) => (o.name === 'Chassis' ? { ...o, physics: { mass: 1.2, friction: 0.8 } } : o));
    project.environmentId = 'env_template_obstacles';
    open(project);
    setWorkspaceMode('build');
    expect(robotModel.addCamera(objectId('Chassis')).ok).toBe(true);
    const camera = useSceneStore.getState().sensors.find((s) => s.type === 'camera')!;
    mapExplorer();
    setWorkspaceMode('blueprint');
    expect(useRobotStateStore.getState().mode).toBe('blueprint');
    saveCurrentProject();
    const reloaded = reloadFromStorage(project.id);
    expect(reloaded.environmentId).toBe('env_template_obstacles');
    expect(reloaded.objects.find((o) => o.name === 'Chassis')!.physics).toEqual({ mass: 1.2, friction: 0.8 });
    expect(reloaded.sensors!.find((s) => s.id === camera.id)).toEqual(camera);
    expect(reloaded.joints).toEqual(useSceneStore.getState().joints);
    expect(reloaded.blueprint!.mappings).toHaveLength(7);
    expect(reloaded.blueprint!.mappings.every((m) => reloaded.objects.some((o) => o.id === m.targetId) || reloaded.blueprint!.hardware.some((h) => h.id === m.targetId))).toBe(true);
    // Saving again does not change anything (idempotent).
    open(reloaded);
    saveCurrentProject();
    expect(reloadFromStorage(project.id).blueprint).toEqual({ ...reloaded.blueprint });
  });

  it('the Blueprint mode cannot drive the robot, locks the design and routes undo to the blueprint', () => {
    open();
    mapExplorer();
    setWorkspaceMode('blueprint');
    expect(canDrive('blueprint')).toBe(false);
    expect(isDesignLocked('blueprint')).toBe(true);
    const scenePast = useSceneStore.getState().past.length;
    const mappings = data().mappings.length;
    undo();
    expect(data().mappings.length).toBe(mappings - 1);
    expect(useSceneStore.getState().past.length).toBe(scenePast);
  });
});
