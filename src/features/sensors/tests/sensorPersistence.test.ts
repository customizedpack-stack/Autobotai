import { beforeEach, describe, expect, it } from 'vitest';
import { openExplorer } from '../../controls/testUtils';
import { saveCurrentProject } from '../../projects/workspaceActions';
import { robotModel } from '../../robot-model/robotModelConnector';
import { migrateProject } from '../../robot-model/schema';
import { useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { defaultSensorsFor, sanitizeSensors, validateSensor } from '../config/sensorConfig';

beforeEach(() => localStorage.clear());

const saved = () => structuredClone(useProjectStore.getState().projects[useSceneStore.getState().projectId!]!);

describe('sensor configuration: persistence, validation, undo', () => {
  it('a new Explorer Bot is created with its sensors; other templates without a sensor field', () => {
    openExplorer(false);
    expect(saved().sensors!.map((s) => s.type)).toEqual(['distance', 'encoder', 'encoder', 'imu']);
    openExplorer(false, 'blank');
    expect('sensors' in saved()).toBe(false);
  });

  it('Phase 1–5 projects without sensors load and save unchanged (no field added)', () => {
    openExplorer(false);
    const legacy = saved();
    delete legacy.sensors;
    const { project, warnings } = migrateProject(structuredClone(legacy));
    expect(warnings).toEqual([]);
    expect('sensors' in project).toBe(false);
    useProjectStore.setState({ projects: { [project.id]: project } });
    useSceneStore.getState().loadProject(project);
    saveCurrentProject();
    expect('sensors' in saved()).toBe(false);
  });

  it('save and reload keep every sensor setting; live readings are never saved', () => {
    openExplorer(false);
    robotModel.updateSensor('front-distance', { maxRange: 2.5, rays: 3, fov: 1, rateHz: 30 });
    saveCurrentProject();
    const reloaded = migrateProject(saved()).project;
    expect(reloaded.sensors!.find((s) => s.id === 'front-distance')).toMatchObject({ maxRange: 2.5, rays: 3, fov: 1, rateHz: 30, enabled: true });
    expect(JSON.stringify(reloaded.sensors)).not.toMatch(/timestamp|sequence|distance":\d/);
  });

  it('sensor edits are one undo step each; the old values come back', () => {
    openExplorer(false);
    robotModel.updateSensor('left-encoder', { ticksPerRevolution: 1024 });
    expect(useSceneStore.getState().lastAction).toBe('Edit Left Wheel Encoder');
    useSceneStore.getState().undo();
    expect(useSceneStore.getState().sensors.find((s) => s.id === 'left-encoder')).toMatchObject({ ticksPerRevolution: 360 });
    useSceneStore.getState().redo();
    expect(useSceneStore.getState().sensors.find((s) => s.id === 'left-encoder')).toMatchObject({ ticksPerRevolution: 1024 });
  });

  it('invalid stored sensors are cleaned up with warnings; unknown fields are kept', () => {
    openExplorer(false);
    const raw = saved() as unknown as Record<string, unknown>;
    const sensors = raw.sensors as Record<string, unknown>[];
    sensors[0] = { ...sensors[0], maxRange: -3, rays: 99, custom: 'kept' };
    sensors[1] = { ...sensors[1], jointId: 'gone' };
    sensors.push({ type: 'laser', id: 'x' });
    sensors.push({ ...sensors[3], id: 'main-imu' });
    const { project, warnings } = migrateProject(raw);
    const list = project.sensors!;
    expect(list).toHaveLength(5);
    expect(list[0]).toMatchObject({ maxRange: 4, rays: 1, custom: 'kept' });
    expect(list[1]).toMatchObject({ enabled: false });
    expect(list[4]!.id).toBe('main-imu-2');
    expect(warnings.some((w) => w.includes('unknown type'))).toBe(true);
    expect(warnings.some((w) => w.includes('disabled'))).toBe(true);
    expect(sanitizeSensors('nope', project, [])).toEqual([]);
  });

  it('validation rejects bad settings with clear messages', () => {
    openExplorer(false);
    const model = robotModel.getModel();
    const d = model.sensors!.find((s) => s.id === 'front-distance')!;
    expect(validateSensor({ ...d, id: 'Front Distance' }, model)).toContainEqual(expect.stringMatching(/lowercase/));
    expect(validateSensor({ ...d, minRange: 5 } as typeof d, model)).toContainEqual(expect.stringMatching(/Minimum range/));
    expect(validateSensor({ ...d, rateHz: 25 as 20 }, model)).toContainEqual(expect.stringMatching(/10, 20, 30, 60/));
    expect(robotModel.updateSensor('front-distance', { rays: 3, fov: 0 }).ok).toBe(false);
  });

  it('"Add default sensors" fits an existing robot without sensors, once', () => {
    openExplorer(false);
    useSceneStore.getState().applyModel('clear', { sensors: [] });
    expect(defaultSensorsFor(robotModel.getModel())).toHaveLength(4);
    expect(robotModel.addDefaultSensors().ok).toBe(true);
    expect(useSceneStore.getState().sensors).toHaveLength(4);
    expect(robotModel.addDefaultSensors().ok).toBe(false);
  });
});
