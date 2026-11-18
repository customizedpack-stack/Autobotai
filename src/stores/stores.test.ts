import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '../core/bus/connectorBus';
import { addComponent, deleteSelected, redo, saveCurrentProject, undo } from '../features/projects/workspaceActions';
import { connectConsoleToBus, useConsoleStore } from './consoleStore';
import { useProjectStore } from './projectStore';
import { useSceneStore } from './sceneStore';
import { useSelectionStore } from './selectionStore';

connectConsoleToBus();

function openNewProject(templateId = 'explorer-bot') {
  const project = useProjectStore.getState().createProject({ name: 'Test Bot', category: 'mobile', templateId });
  useSceneStore.getState().loadProject(project);
  return project;
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: {} });
  useSceneStore.getState().closeProject();
  useSelectionStore.setState({ selectedId: null, hoveredId: null });
  useConsoleStore.setState({ entries: [], events: [] });
});

describe('projectStore', () => {
  it('creates a project from a template with placeholder objects', () => {
    const project = openNewProject();
    expect(project.name).toBe('Test Bot');
    expect(project.objects.length).toBe(9);
    expect(project.objects.every((o) => o.id.startsWith('obj_'))).toBe(true);
    expect(useProjectStore.getState().projects[project.id]).toBeDefined();
  });

  it('falls back to the blank template for an unknown template id', () => {
    const project = useProjectStore.getState().createProject({ name: 'X', category: 'quadruped', templateId: 'nope' });
    expect(project.templateId).toBe('blank');
    expect(project.objects).toHaveLength(1);
  });

  it('persists drafts to localStorage', () => {
    openNewProject();
    expect(localStorage.getItem('arai.projects.v1')).toContain('Test Bot');
  });
});

describe('sceneStore undo / redo', () => {
  it('records transforms and restores them', () => {
    openNewProject();
    const chassis = useSceneStore.getState().objects[0]!;
    useSceneStore.getState().updateTransform(chassis.id, { position: [1, 2, 3] });
    expect(useSceneStore.getState().objects[0]!.transform.position).toEqual([1, 2, 3]);
    expect(useSceneStore.getState().dirty).toBe(true);

    undo();
    expect(useSceneStore.getState().objects[0]!.transform.position).toEqual(chassis.transform.position);
    redo();
    expect(useSceneStore.getState().objects[0]!.transform.position).toEqual([1, 2, 3]);
  });

  it('ignores no-op transforms so history stays clean', () => {
    openNewProject();
    const obj = useSceneStore.getState().objects[0]!;
    useSceneStore.getState().updateTransform(obj.id, { position: [...obj.transform.position] });
    expect(useSceneStore.getState().past).toHaveLength(0);
  });

  it('undoes add and delete, and clears a stale selection', () => {
    openNewProject();
    const before = useSceneStore.getState().objects.length;
    addComponent('sensor-lidar');
    expect(useSceneStore.getState().objects).toHaveLength(before + 1);
    const added = useSelectionStore.getState().selectedId;
    expect(added).not.toBeNull();

    undo();
    expect(useSceneStore.getState().objects).toHaveLength(before);
    expect(useSelectionStore.getState().selectedId).toBeNull();

    redo();
    useSelectionStore.getState().select(added);
    deleteSelected();
    expect(useSceneStore.getState().objects).toHaveLength(before);
    undo();
    expect(useSceneStore.getState().objects).toHaveLength(before + 1);
  });

  it('undoes a project rename', () => {
    openNewProject();
    useSceneStore.getState().setProjectName('Renamed');
    expect(useSceneStore.getState().projectName).toBe('Renamed');
    undo();
    expect(useSceneStore.getState().projectName).toBe('Test Bot');
  });

  it('places added components resting on the ground', () => {
    openNewProject('blank');
    addComponent('wheel-standard');
    const wheel = useSceneStore.getState().objects.at(-1)!;
    expect(wheel.transform.position[1]).toBeCloseTo(0.07);
  });
});

describe('saving', () => {
  it('saves the scene back to the project and clears the dirty flag', () => {
    const project = openNewProject();
    useSceneStore.getState().renameObject(project.objects[0]!.id, 'Main Frame');
    expect(saveCurrentProject()).toBe(true);
    expect(useSceneStore.getState().dirty).toBe(false);
    expect(useProjectStore.getState().projects[project.id]!.objects[0]!.name).toBe('Main Frame');
  });
});

describe('connector bus and console', () => {
  it('routes log messages to the console and other channels to the events log', () => {
    openNewProject();
    const messages = useConsoleStore.getState().entries.map((e) => e.message);
    expect(messages.some((m) => m.includes('Created project'))).toBe(true);
    const channels = useConsoleStore.getState().events.map((e) => e.channel);
    expect(channels).toContain('project.created');
    expect(channels).toContain('project.opened');
  });

  it('isolates a failing subscriber', () => {
    let reached = false;
    const offBad = bus.subscribe('selection.changed', () => {
      throw new Error('boom');
    });
    const offGood = bus.subscribe('selection.changed', () => {
      reached = true;
    });
    const originalError = console.error;
    console.error = () => {};
    bus.publish('selection.changed', { objectId: null });
    console.error = originalError;
    offBad();
    offGood();
    expect(reached).toBe(true);
  });
});
