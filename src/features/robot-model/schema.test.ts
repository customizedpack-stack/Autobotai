import { beforeEach, describe, expect, it } from 'vitest';
import { migratePersistedProjects } from '../../stores/projectStore';
import { PROJECT_SCHEMA_VERSION } from '../../types/project';
import { migrateProject } from './schema';

/** A project exactly as Phase 1 (schema v1) stored it. */
const V1_PROJECT = {
  id: 'prj_phase1demo',
  name: 'Phase 1 Explorer',
  category: 'mobile',
  templateId: 'explorer-bot',
  schemaVersion: 1,
  objects: [
    {
      id: 'obj_chassis',
      name: 'Chassis',
      category: 'chassis',
      geometry: { shape: 'box', size: [0.4, 0.1, 0.26] },
      color: '#3B82F6',
      transform: { position: [0.5, 0.11, 0], rotation: [0, 0.3, 0], scale: [1, 1, 1] },
      visible: true,
      parentId: null,
      metadata: { componentId: 'chassis-rect', description: 'Main frame.', createdAt: '2026-11-18T10:00:00.000Z' },
    },
    {
      id: 'obj_wheel',
      name: 'Main Left Wheel',
      category: 'wheel',
      geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 },
      color: '#2F3A4C',
      transform: { position: [0.06, 0.07, 0.155], rotation: [1.5708, 0, 0], scale: [2, 1, 1] },
      visible: false,
      parentId: null,
      metadata: { componentId: 'wheel-standard', description: '', createdAt: '2026-11-18T10:00:00.000Z' },
    },
  ],
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:05:00.000Z',
  savedAt: '2026-11-18T10:05:00.000Z',
};

describe('schema v1 -> v2 migration', () => {
  it('upgrades a Phase 1 project without changing any object data', () => {
    const { project, fromVersion, toVersion, warnings } = migrateProject(structuredClone(V1_PROJECT));
    expect(fromVersion).toBe(1);
    expect(toVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.joints).toEqual([]);
    // The Phase 1 Explorer Bot has no joints yet, so its drive cannot be set up automatically.
    expect(warnings).toEqual(['Explorer Bot drive could not be configured automatically; use "Set up differential drive".']);
    expect(project.actuators).toEqual([]);
    expect(project.controllers).toEqual([]);
    expect(project.objects).toEqual(V1_PROJECT.objects);
    expect(project.name).toBe('Phase 1 Explorer');
    expect(project.savedAt).toBe(V1_PROJECT.savedAt);
  });

  it('treats a project without a version as v1 and fills missing fields with defaults and warnings', () => {
    const raw = { id: 'p', name: 'Old', objects: [{ name: 'No transform', geometry: { shape: 'sphere', radius: 0.1 } }] };
    const { project, warnings } = migrateProject(raw);
    expect(project.objects).toHaveLength(1);
    expect(project.objects[0]!.transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    expect(project.objects[0]!.parentId).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('keeps unknown extra fields instead of discarding them', () => {
    const { project } = migrateProject({ ...structuredClone(V1_PROJECT), customNotes: 'keep me' });
    expect((project as unknown as Record<string, unknown>).customNotes).toBe('keep me');
  });

  it('reports a missing parent as a warning but keeps the object', () => {
    const raw = structuredClone(V1_PROJECT);
    raw.objects[1]!.parentId = 'obj_missing' as unknown as null;
    const { project, warnings } = migrateProject(raw);
    expect(project.objects).toHaveLength(2);
    expect(warnings.some((w) => w.includes('missing parent'))).toBe(true);
  });

  it('leaves projects already on the current schema unchanged', () => {
    const current = migrateProject(structuredClone(V1_PROJECT)).project;
    const again = migrateProject(structuredClone(current));
    expect(again.fromVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(again.project).toEqual(current);
  });

  it('throws only for data that is not an object', () => {
    expect(() => migrateProject('nonsense')).toThrow();
  });
});

describe('persisted store migration', () => {
  beforeEach(() => localStorage.clear());

  it('upgrades every stored v1 project and backs up unreadable entries', () => {
    const result = migratePersistedProjects({ projects: { [V1_PROJECT.id]: structuredClone(V1_PROJECT), broken: 42 } }, 1);
    expect(Object.keys(result.projects)).toEqual([V1_PROJECT.id]);
    expect(result.projects[V1_PROJECT.id]!.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(JSON.parse(localStorage.getItem('arai.projects.unreadable') ?? '{}')).toEqual({ broken: 42 });
  });
});
