import { describe, expect, it } from 'vitest';
import { materializeTemplate } from '../projects/materialize';
import { findTemplate } from '../robot-library/templates';
import { migrateProject } from './schema';

/** A Phase 2 (schema v2) Explorer Bot project, as Phase 2 saved it. */
function v2Explorer() {
  const t = findTemplate('explorer-bot')!;
  const { objects, joints } = materializeTemplate(t.build(), t.joints!());
  return {
    id: 'prj_v2',
    name: 'Phase 2 Explorer',
    category: 'mobile',
    templateId: 'explorer-bot',
    schemaVersion: 2,
    objects,
    joints,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    savedAt: '2026-11-18T10:00:00.000Z',
    notes: 'custom field',
  };
}

describe('schema v2 -> v3 migration', () => {
  it('upgrades a v2 project and keeps components, transforms, hierarchy and joints unchanged', () => {
    const raw = v2Explorer();
    const { project, fromVersion, toVersion, warnings } = migrateProject(structuredClone(raw));
    expect(fromVersion).toBe(2);
    expect(toVersion).toBe(3);
    expect(project.objects).toEqual(raw.objects);
    expect(project.joints).toEqual(raw.joints);
    expect(warnings).toEqual([]);
    expect((project as unknown as Record<string, unknown>).notes).toBe('custom field');
  });

  it('adds default drive actuators and a controller to Explorer Bot projects', () => {
    const { project } = migrateProject(v2Explorer());
    expect(project.actuators).toHaveLength(2);
    expect(project.actuators.every((a) => a.type === 'dcMotor' && a.enabled && a.target === 0 && a.commandState === 'idle')).toBe(true);
    expect(project.controllers).toEqual([expect.objectContaining({ type: 'differentialDrive', maxLinearSpeed: 0.5 })]);
  });

  it('gives other robots empty actuator and controller lists', () => {
    const raw = { ...v2Explorer(), templateId: 'robotic-arm' };
    const { project } = migrateProject(raw);
    expect(project.actuators).toEqual([]);
    expect(project.controllers).toEqual([]);
  });

  it('keeps invalid actuator configuration but disables it and reports warnings', () => {
    const v3 = migrateProject(v2Explorer()).project;
    const broken = structuredClone(v3);
    broken.actuators[0]!.jointId = 'jnt_deleted';
    const { project, warnings } = migrateProject(broken);
    expect(project.actuators).toHaveLength(2);
    expect(project.actuators[0]!.enabled).toBe(false);
    expect(warnings.some((w) => w.includes('Bound joint not found'))).toBe(true);
  });

  it('migrates v1 straight to v3', () => {
    const { project, fromVersion } = migrateProject({ id: 'p', name: 'Old', schemaVersion: 1, objects: [] });
    expect(fromVersion).toBe(1);
    expect(project.schemaVersion).toBe(3);
    expect(project.joints).toEqual([]);
    expect(project.actuators).toEqual([]);
  });
});
