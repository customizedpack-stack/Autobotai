import { beforeEach, describe, expect, it } from 'vitest';
import { bus, type BusEnvelope } from '../../core/bus/connectorBus';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { findComponent } from '../component-library/catalog';
import { computeDropPlacement } from '../builder/placement';
import { addComponent, deleteSelected, placeComponent, redo, saveCurrentProject, undo } from '../projects/workspaceActions';
import { connectRobotModelConnector, robotModel } from './robotModelConnector';
import { indexObjects, worldPosition } from './transforms';

connectRobotModelConnector();

let events: BusEnvelope[] = [];
bus.tap((e) => events.push(e));
const channels = () => events.map((e) => e.channel);

function open(templateId = 'explorer-bot') {
  const project = useProjectStore.getState().createProject({ name: 'C1 Bot', category: 'mobile', templateId });
  useSceneStore.getState().loadProject(project);
  events = [];
  return project;
}
const byName = (name: string) => useSceneStore.getState().objects.find((o) => o.name === name)!;

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: {} });
  useSceneStore.getState().closeProject();
  useSelectionStore.setState({ selectedId: null, selectedJointId: null, hoveredId: null });
});

describe('C1 Robot Model Connector', () => {
  it('loads templates with their hierarchy and joints', () => {
    open();
    expect(useSceneStore.getState().joints).toHaveLength(3);
    expect(byName('Left Wheel').parentId).toBe(byName('Chassis').id);
  });

  it('publishes events for component add, reparent and removal', () => {
    open();
    addComponent('sensor-lidar');
    const lidar = byName('Lidar');
    expect(channels()).toContain('robotModel.componentAdded');
    robotModel.reparent(lidar.id, byName('Chassis').id);
    expect(events.find((e) => e.channel === 'robotModel.componentReparented')?.payload).toMatchObject({ componentId: lidar.id, from: null, to: byName('Chassis').id });
    useSelectionStore.getState().select(lidar.id);
    deleteSelected();
    expect(channels()).toContain('robotModel.componentRemoved');
    expect(channels()).toContain('robotModel.changed');
  });

  it('publishes a rejection and changes nothing for an invalid request', () => {
    open();
    const before = useSceneStore.getState().objects;
    const result = robotModel.reparent(byName('Chassis').id, byName('Left Wheel').id);
    expect(result.ok).toBe(false);
    expect(channels()).toContain('robotModel.rejected');
    expect(useSceneStore.getState().objects).toBe(before);
    expect(useSceneStore.getState().past).toHaveLength(0);
  });

  it('handles joint create / edit / delete with events and undo / redo', () => {
    open();
    addComponent('sensor-camera');
    const camera = byName('Camera');
    const created = robotModel.createJoint({ type: 'fixed', parentId: byName('Chassis').id, childId: camera.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(byName('Camera').parentId).toBe(byName('Chassis').id);
    expect(channels()).toContain('robotModel.jointCreated');

    robotModel.updateJoint(created.value.id, { type: 'revolute', limits: { lower: -1, upper: 1 } });
    expect(events.find((e) => e.channel === 'robotModel.jointUpdated')?.payload).toMatchObject({ changed: ['type', 'limits'] });
    robotModel.deleteJoint(created.value.id);
    expect(channels()).toContain('robotModel.jointDeleted');
    expect(useSceneStore.getState().joints).toHaveLength(3);

    undo(); // delete
    expect(useSceneStore.getState().joints.find((j) => j.id === created.value.id)?.type).toBe('revolute');
    undo(); // edit
    expect(useSceneStore.getState().joints.find((j) => j.id === created.value.id)?.type).toBe('fixed');
    undo(); // create (and its reparent)
    expect(useSceneStore.getState().joints).toHaveLength(3);
    expect(byName('Camera').parentId).toBeNull();
    redo();
    expect(useSceneStore.getState().joints).toHaveLength(4);
  });

  it('accepts change requests over the bus', () => {
    open();
    addComponent('sensor-imu');
    const imu = byName('IMU');
    bus.publish('robotModel.request.reparent', { componentId: imu.id, parentId: byName('Top Plate').id });
    expect(byName('IMU').parentId).toBe(byName('Top Plate').id);
    bus.publish('robotModel.request.createJoint', { type: 'fixed', parentId: byName('Top Plate').id, childId: imu.id });
    expect(useSceneStore.getState().joints.some((j) => j.childId === imu.id)).toBe(true);
  });

  it('undoes and redoes a reparent, restoring the local transform', () => {
    open();
    const sensor = byName('Distance Sensor');
    // Sensor has a fixed joint; remove it first, then reparent.
    const joint = useSceneStore.getState().joints.find((j) => j.childId === sensor.id)!;
    robotModel.deleteJoint(joint.id);
    robotModel.reparent(sensor.id, null);
    expect(byName('Distance Sensor').parentId).toBeNull();
    undo();
    expect(byName('Distance Sensor').parentId).toBe(byName('Chassis').id);
    expect(byName('Distance Sensor').transform).toEqual(sensor.transform);
  });

  it('saves joints and hierarchy with the project', () => {
    const project = open();
    addComponent('sensor-lidar');
    robotModel.reparent(byName('Lidar').id, byName('Chassis').id);
    saveCurrentProject();
    const saved = useProjectStore.getState().projects[project.id]!;
    expect(saved.schemaVersion).toBe(2);
    expect(saved.joints).toHaveLength(3);
    expect(saved.objects.find((o) => o.name === 'Lidar')!.parentId).toBe(byName('Chassis').id);
  });
});

describe('gizmo transforms', () => {
  it('collapses a whole drag into one undo step and keeps the inspector value live', () => {
    open();
    const chassis = byName('Chassis');
    const scene = useSceneStore.getState();
    scene.beginTransientChange();
    for (let i = 1; i <= 5; i += 1) {
      scene.previewTransform(chassis.id, { ...chassis.transform, position: [i * 0.1, 0.11, 0] });
      expect(byName('Chassis').transform.position[0]).toBeCloseTo(i * 0.1);
    }
    useSceneStore.getState().endTransientChange('Move Chassis');
    expect(useSceneStore.getState().past).toHaveLength(1);
    // Children follow in world space.
    const index = indexObjects(useSceneStore.getState().objects);
    expect(worldPosition(byName('Left Wheel').id, index)[0]).toBeCloseTo(0.5 + 0.06);
    undo();
    expect(byName('Chassis').transform.position).toEqual(chassis.transform.position);
  });

  it('records nothing for a click on the gizmo without movement', () => {
    open();
    useSceneStore.getState().beginTransientChange();
    useSceneStore.getState().endTransientChange('Move Chassis');
    expect(useSceneStore.getState().past).toHaveLength(0);
  });
});

describe('drag-and-drop placement', () => {
  it('drops on the ground resting on the floor as a top-level part', () => {
    open();
    const wheel = findComponent('wheel-standard')!;
    const { parentId, world } = computeDropPlacement(wheel, { point: [1, 0, 2], normal: [0, 1, 0], objectId: null }, []);
    expect(parentId).toBeNull();
    expect(world.position[0]).toBeCloseTo(1);
    expect(world.position[1]).toBeCloseTo(0.07);
    expect(world.position[2]).toBeCloseTo(2);
  });

  it('drops onto a part and attaches it there at the drop point', () => {
    open();
    const plate = byName('Top Plate');
    const top = 0.17 + 0.0075;
    placeComponent('sensor-camera', { point: [0, top, 0], normal: [0, 1, 0], objectId: plate.id });
    const camera = byName('Camera');
    expect(camera.parentId).toBe(plate.id);
    const world = worldPosition(camera.id, indexObjects(useSceneStore.getState().objects));
    expect(world[0]).toBeCloseTo(0);
    expect(world[1]).toBeCloseTo(top + 0.015);
    expect(useSelectionStore.getState().selectedId).toBe(camera.id);
  });
});
