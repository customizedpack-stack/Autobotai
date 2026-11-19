import { beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { openExplorer } from '../../controls/testUtils';
import { migrateProject } from '../../robot-model/schema';
import { saveCurrentProject, undo, redo } from '../../projects/workspaceActions';
import { useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { setEnvironment } from '../../physics/simulation/simulationManager';
import { createObject, sanitizeEnvironment, validateEnvironmentObject } from '../config/environmentConfig';
import { findTemplate } from '../config/templates';
import '../environmentSession';
import {
  addObject,
  beginTransientChange,
  createEnvironment,
  deleteEnvironment,
  duplicateEnvironment,
  duplicateObject,
  endTransientChange,
  environmentList,
  openEnvironment,
  previewObject,
  removeObject,
  renameEnvironment,
  renameObject,
  resetToTemplate,
  resolveEnvironment,
  saveEnvironment,
  undoEnvironment,
  redoEnvironment,
  updateObject,
  useEnvironmentStore,
} from '../store/environmentStore';

const draft = () => useEnvironmentStore.getState().draft!;
const obj = (name: string) => draft().objects.find((o) => o.name === name)!;

beforeEach(() => {
  localStorage.clear();
  useEnvironmentStore.setState({ environments: {}, draft: null, dirty: false, selectedId: null, past: [], future: [], lastAction: null, transientBase: null });
});

describe('environment objects', () => {
  it('creates objects with unique ids and names, on free spots', () => {
    createEnvironment();
    for (let i = 0; i < 5; i++) addObject('wall');
    addObject('ground');
    const ids = draft().objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(6);
    expect(draft().objects.map((o) => o.name)).toEqual(['Wall', 'Wall 2', 'Wall 3', 'Wall 4', 'Wall 5', 'Ground Plane']);
    const spots = draft().objects.filter((o) => o.kind === 'wall').map((o) => `${o.position[0]},${o.position[2]}`);
    expect(new Set(spots).size).toBe(5);
  });

  it('new objects land inside a walled arena, clear of the walls (real footprints, rotation included)', () => {
    const arena = findTemplate('arena')!;
    const walls = arena.objects.filter((o) => o.kind === 'wall');
    expect(walls.length).toBe(4);
    const objects = [...arena.objects];
    for (let i = 0; i < 6; i++) {
      const box = createObject('box', objects);
      const [x, , z] = box.position;
      // Inside the 6 m × 6 m arena …
      expect(Math.abs(x)).toBeLessThan(3);
      expect(Math.abs(z)).toBeLessThan(3);
      // … and not touching any wall (thin walls block only their own strip).
      for (const w of walls) {
        const c = Math.abs(Math.cos(w.rotation[1]));
        const s = Math.abs(Math.sin(w.rotation[1]));
        const hx = (c * w.size[0] + s * w.size[2]) / 2 + box.size[0] / 2;
        const hz = (s * w.size[0] + c * w.size[2]) / 2 + box.size[2] / 2;
        expect(Math.abs(w.position[0] - x) >= hx || Math.abs(w.position[2] - z) >= hz).toBe(true);
      }
      objects.push(box);
    }
    // A wall turned 90° blocks its turned footprint.
    const turned = { ...createObject('wall', [], { at: [2, 0] }), rotation: [0, Math.PI / 2, 0] as [number, number, number] };
    const next = createObject('box', [turned]);
    expect(Math.abs(next.position[2]) >= 1 + 0.1 || Math.abs(next.position[0] - 2) >= 0.05 + 0.1).toBe(true);
  });

  it('duplicate, delete, rename (duplicate names refused)', () => {
    createEnvironment();
    const box = (addObject('box') as { ok: true; value: { id: string } }).value;
    const copy = duplicateObject(box.id);
    expect(copy.ok && copy.value.name).toBe('Box copy');
    expect(copy.ok && copy.value.id).not.toBe(box.id);
    expect(renameObject(box.id, 'Crate').ok).toBe(true);
    expect(renameObject(copy.ok ? copy.value.id : '', 'crate').ok).toBe(false);
    expect(removeObject(box.id).ok).toBe(true);
    expect(draft().objects.map((o) => o.name)).toEqual(['Box copy']);
  });

  it('rejects invalid values with readable messages (NaN, Infinity, zero size, out-of-range physics)', () => {
    createEnvironment();
    const box = obj((addObject('box') as { ok: true; value: { name: string } }).value.name);
    expect(updateObject(box.id, { position: [Number.NaN, 0, 0] })).toMatchObject({ ok: false, errors: ['Position must be three finite numbers.'] });
    expect(updateObject(box.id, { size: [0, 1, 1] })).toMatchObject({ ok: false });
    expect(updateObject(box.id, { size: [Number.POSITIVE_INFINITY, 1, 1] })).toMatchObject({ ok: false });
    expect(updateObject(box.id, { friction: 3 })).toMatchObject({ ok: false, errors: ['Friction must be between 0 and 2.'] });
    expect(updateObject(box.id, { restitution: -1 })).toMatchObject({ ok: false });
    expect(updateObject(box.id, { mass: 0 })).toMatchObject({ ok: false });
    expect(validateEnvironmentObject({ ...box, kind: 'ground', body: 'dynamic' })).toContain('A ground plane must be static.');
  });

  it('locked objects cannot be moved, edited or deleted until unlocked', () => {
    createEnvironment();
    const wall = obj((addObject('wall') as { ok: true; value: { name: string } }).value.name);
    expect(updateObject(wall.id, { locked: true }).ok).toBe(true);
    expect(updateObject(wall.id, { position: [2, 0.2, 0] }).ok).toBe(false);
    expect(removeObject(wall.id).ok).toBe(false);
    previewObject(wall.id, { position: [3, 0.2, 0] });
    expect(obj(wall.name).position[0]).toBe(wall.position[0]);
    expect(updateObject(wall.id, { locked: false }).ok).toBe(true);
    expect(updateObject(wall.id, { position: [2, 0.2, 0] }).ok).toBe(true);
  });
});

describe('undo / redo (environment history)', () => {
  it('add, delete, move, rotate, resize and property changes are one step each', () => {
    createEnvironment();
    const box = (addObject('box') as { ok: true; value: { id: string; name: string } }).value;
    updateObject(box.id, { position: [2, 0.1, 0] }, 'Move Box');
    updateObject(box.id, { rotation: [0, 0.5, 0] }, 'Rotate Box');
    updateObject(box.id, { size: [0.4, 0.2, 0.2] }, 'Resize Box');
    updateObject(box.id, { friction: 0.2 }, 'Friction of Box');
    removeObject(box.id);
    expect(draft().objects).toHaveLength(0);
    expect(undoEnvironment()).toBe('Delete Box');
    expect(obj('Box').friction).toBe(0.2);
    undoEnvironment();
    expect(obj('Box').friction).toBe(0.8);
    undoEnvironment();
    expect(obj('Box').size).toEqual([0.2, 0.2, 0.2]);
    undoEnvironment();
    expect(obj('Box').rotation).toEqual([0, 0, 0]);
    undoEnvironment();
    expect(obj('Box').position[0]).not.toBe(2);
    undoEnvironment();
    expect(draft().objects).toHaveLength(0);
    redoEnvironment();
    expect(draft().objects).toHaveLength(1);
    // Object ids stay stable through undo / redo.
    expect(draft().objects[0]!.id).toBe(box.id);
  });

  it('a gizmo drag (many previews) is ONE undo step', () => {
    createEnvironment();
    const box = (addObject('box') as { ok: true; value: { id: string } }).value;
    const steps = useEnvironmentStore.getState().past.length;
    beginTransientChange();
    for (let i = 1; i <= 30; i++) previewObject(box.id, { position: [1 + i * 0.01, 0.1, 0] });
    endTransientChange('Move Box');
    expect(useEnvironmentStore.getState().past.length).toBe(steps + 1);
    expect(draft().objects[0]!.position[0]).toBeCloseTo(1.3, 9);
    undoEnvironment();
    expect(draft().objects[0]!.position[0]).not.toBeCloseTo(1.3, 3);
  });

  it('the workspace Undo / Redo use the environment history in the Environment Editor and the robot history elsewhere', () => {
    openExplorer(false);
    setWorkspaceMode('environment');
    createEnvironment();
    addObject('wall');
    const robotSteps = useSceneStore.getState().past.length;
    undo();
    expect(draft().objects).toHaveLength(0);
    redo();
    expect(draft().objects).toHaveLength(1);
    expect(useSceneStore.getState().past.length).toBe(robotSteps);
  });
});

describe('persistence and templates', () => {
  it('save, reload (browser storage), duplicate and delete', async () => {
    createEnvironment('floor', 'My Arena');
    addObject('ground');
    addObject('wall');
    const saved = saveEnvironment();
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.value.id : '';
    // Reload from browser storage (as after a page reload).
    const stored = localStorage.getItem('arai.environments.v1')!;
    expect(stored).toContain('My Arena');
    expect(stored).not.toContain('"draft"');
    useEnvironmentStore.setState({ environments: {} });
    localStorage.setItem('arai.environments.v1', stored);
    await useEnvironmentStore.persist.rehydrate();
    expect(useEnvironmentStore.getState().environments[id]!.objects.map((o) => o.kind)).toEqual(['ground', 'wall']);
    const copy = duplicateEnvironment(id);
    expect(copy.ok && copy.value.name).toBe('My Arena copy');
    expect(environmentList().filter((e) => !e.template)).toHaveLength(2);
    expect(deleteEnvironment(id).ok).toBe(true);
    expect(useEnvironmentStore.getState().environments[id]).toBeUndefined();
    expect(deleteEnvironment('obstacles').ok).toBe(false);
  });

  it('editing a template edits a copy; the template is never overwritten; reset restores it', () => {
    const original = JSON.stringify(findTemplate('obstacles'));
    openEnvironment('obstacles');
    expect(draft().id).not.toBe('obstacles');
    expect(draft().templateId).toBe('obstacles');
    removeObject(draft().objects[0]!.id);
    updateObject(draft().objects[0]!.id, { position: [3, 0.1, 3] });
    saveEnvironment();
    expect(JSON.stringify(findTemplate('obstacles'))).toBe(original);
    expect(resolveEnvironment('obstacles').objects).toHaveLength(4);
    resetToTemplate();
    expect(draft().objects).toEqual(findTemplate('obstacles')!.objects);
    expect(renameEnvironment('').ok).toBe(false);
  });

  it('invalid stored environments are cleaned up; unknown fields are kept', () => {
    const warnings: string[] = [];
    const env = sanitizeEnvironment(
      {
        id: 'envd_x',
        name: 'Broken',
        custom: 'kept',
        objects: [
          { id: 'env_a', kind: 'wall', name: 'W', position: [0, 0, 0], rotation: [0, 0, 0], size: [-1, 2, 2], friction: 9, note: 'kept too' },
          { id: 'env_a', kind: 'box', name: 'B', position: [Number.NaN, 0, 0] },
          { kind: 'dragon' },
          { id: 'env_g', kind: 'ground', body: 'dynamic' },
        ],
      },
      warnings,
    )!;
    expect(env.objects).toHaveLength(3);
    expect(env.objects[0]).toMatchObject({ size: [0.1, 0.4, 2], friction: 0.8, note: 'kept too' });
    expect(env.objects[1]!.id).not.toBe('env_a');
    expect(env.objects[1]!.position.every(Number.isFinite)).toBe(true);
    expect(env.objects[2]!.body).toBe('static');
    expect((env as unknown as Record<string, unknown>).custom).toBe('kept');
    expect(warnings.some((w) => w.includes('unknown kind'))).toBe(true);
    expect(sanitizeEnvironment('garbage', warnings)).toBeNull();
  });

  it('projects remember their environment without a schema change; older projects use the empty environment', () => {
    openExplorer(false);
    createEnvironment('floor', 'Linked');
    const saved = saveEnvironment();
    const id = saved.ok ? saved.value.id : '';
    setEnvironment(id);
    const projectId = useSceneStore.getState().projectId!;
    expect(useProjectStore.getState().projects[projectId]!.environmentId).toBe(id);
    saveCurrentProject();
    const stored = useProjectStore.getState().projects[projectId]!;
    expect(stored.schemaVersion).toBe(3);
    const legacy = structuredClone(stored);
    delete legacy.environmentId;
    const { project, warnings } = migrateProject(legacy);
    expect(warnings).toEqual([]);
    expect('environmentId' in project).toBe(false);
    // Reopening the linked project selects its environment again.
    setEnvironment('floor');
    useSceneStore.getState().loadProject(useProjectStore.getState().projects[projectId]!);
    expect(useSimulationStore.getState().settings.environment).toBe('floor');
    useProjectStore.getState().setProjectEnvironment(projectId, id);
    useSceneStore.getState().loadProject(useProjectStore.getState().projects[projectId]!);
    expect(useSimulationStore.getState().settings.environment).toBe(id);
  });
});
