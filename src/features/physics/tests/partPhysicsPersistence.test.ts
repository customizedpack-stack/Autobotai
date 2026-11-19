import { beforeEach, describe, expect, it } from 'vitest';
import { migrateProject } from '../../robot-model/schema';
import { byName, openExplorer } from '../../controls/testUtils';
import { useSceneStore } from '../../../stores/sceneStore';
import { useProjectStore } from '../../../stores/projectStore';
import { saveCurrentProject } from '../../projects/workspaceActions';

beforeEach(() => {
  localStorage.clear();
});

describe('part physics: persistence and undo', () => {
  it('legacy projects load unchanged: no physics field is added', () => {
    openExplorer(false);
    const { project, warnings } = migrateProject(structuredClone(useProjectStore.getState().projects[Object.keys(useProjectStore.getState().projects)[0]!]));
    expect(warnings).toEqual([]);
    expect(project.objects.every((o) => o.physics === undefined)).toBe(true);
  });

  it('setPartPhysics is one undoable step and can be cleared back to defaults', () => {
    openExplorer(false);
    const chassis = byName('Chassis');
    const store = useSceneStore.getState();
    store.setPartPhysics(chassis.id, { mass: 2.5, friction: 0.4 });
    expect(byName('Chassis').physics).toEqual({ mass: 2.5, friction: 0.4 });
    expect(useSceneStore.getState().lastAction).toBe('Edit physics of Chassis');
    // Same value again: no new history entry.
    const pastBefore = useSceneStore.getState().past.length;
    useSceneStore.getState().setPartPhysics(chassis.id, { mass: 2.5, friction: 0.4 });
    expect(useSceneStore.getState().past.length).toBe(pastBefore);
    useSceneStore.getState().undo();
    expect(byName('Chassis').physics).toBeUndefined();
    useSceneStore.getState().redo();
    expect(byName('Chassis').physics).toEqual({ mass: 2.5, friction: 0.4 });
    useSceneStore.getState().setPartPhysics(chassis.id, undefined);
    expect('physics' in byName('Chassis')).toBe(false);
  });

  it('saved physics values survive a save and reload; invalid stored values are dropped with a warning', () => {
    openExplorer(false);
    const chassis = byName('Chassis');
    useSceneStore.getState().setPartPhysics(chassis.id, { mass: 3, restitution: 0.2, collision: false });
    saveCurrentProject();
    const id = useSceneStore.getState().projectId!;
    const saved = structuredClone(useProjectStore.getState().projects[id]!);
    const reloaded = migrateProject(structuredClone(saved));
    expect(reloaded.project.objects.find((o) => o.id === chassis.id)!.physics).toEqual({ mass: 3, restitution: 0.2, collision: false });

    const broken = structuredClone(saved) as unknown as { objects: Record<string, unknown>[] };
    broken.objects.find((o) => o.id === chassis.id)!.physics = { mass: -4, friction: 0.5, collision: 'yes' };
    const fixed = migrateProject(broken);
    expect(fixed.project.objects.find((o) => o.id === chassis.id)!.physics).toEqual({ friction: 0.5 });
    expect(fixed.warnings.some((w) => w.includes('mass'))).toBe(true);
    expect(fixed.warnings.some((w) => w.includes('collision'))).toBe(true);
  });
});
