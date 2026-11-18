import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { byName, events, jointByName, openExplorer } from '../controls/testUtils';
import { redo, saveCurrentProject, undo } from '../projects/workspaceActions';
import { validateActuator } from './actuators';
import { robotModel } from './robotModelConnector';

const scene = () => useSceneStore.getState();

beforeEach(() => {
  openExplorer(false);
});

describe('actuators', () => {
  it('Explorer Bot comes with two DC motors bound to its wheel joints and a drive controller', () => {
    const { actuators, controllers } = scene();
    expect(actuators.map((a) => [a.name, a.type, a.controlMode])).toEqual([
      ['Left Drive Motor', 'dcMotor', 'velocity'],
      ['Right Drive Motor', 'dcMotor', 'velocity'],
    ]);
    expect(actuators[0]!.jointId).toBe(jointByName('Left Wheel Joint').id);
    expect(actuators[0]!.componentId).toBe(byName('Left Motor').id);
    expect(actuators[1]!.componentId).toBe(byName('Right Motor').id);
    expect(controllers).toHaveLength(1);
    expect(controllers[0]).toMatchObject({ type: 'differentialDrive', rootComponentId: byName('Chassis').id, wheelRadius: null, trackWidth: null });
  });

  it('creates an actuator and binds it to a compatible joint', () => {
    openExplorer(false, 'robotic-arm');
    const elbow = jointByName('Elbow');
    const result = robotModel.createActuator({ type: 'jointActuator', jointId: elbow.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ jointId: elbow.id, controlMode: 'position', enabled: true, target: 0, commandState: 'idle' });
    expect(events('robotModel.actuatorCreated')[0]).toMatchObject({ actuatorId: result.value.id, type: 'jointActuator' });
  });

  it('rejects invalid bindings', () => {
    const ctx = scene();
    const base = { name: 'X', componentId: byName('Left Motor').id, controlMode: 'velocity' as const, maxTorque: 1, maxVelocity: 1, enabled: true, target: 0, commandState: 'idle' as const };
    // Fixed joint
    expect(validateActuator({ ...base, type: 'dcMotor', jointId: jointByName('Sensor Mount').id }, ctx).join()).toMatch(/fixed and cannot be driven/);
    // Joint already driven
    expect(validateActuator({ ...base, type: 'dcMotor', jointId: jointByName('Left Wheel Joint').id }, ctx).join()).toMatch(/already has an actuator/);
    // Missing joint
    expect(validateActuator({ ...base, type: 'dcMotor', jointId: 'jnt_nope' }, ctx)).toContain('Bound joint not found.');
    // DC motor needs a motor part
    expect(validateActuator({ ...base, type: 'dcMotor', componentId: byName('Chassis').id, jointId: 'x' }, ctx).join()).toMatch(/not a motor component/);
    // Negative limits
    expect(validateActuator({ ...base, type: 'dcMotor', maxVelocity: -1, jointId: 'x' }, ctx)).toContain('Maximum velocity must be a positive number.');
    // Through C1: a DC motor cannot drive a prismatic joint
    openExplorer(false, 'robotic-arm');
    robotModel.updateJoint(jointByName('Elbow').id, { type: 'prismatic', limits: { lower: 0, upper: 0.1 } });
    const r = robotModel.createActuator({ type: 'dcMotor', jointId: jointByName('Elbow').id, componentId: null });
    expect(r.ok).toBe(false);
    expect(events('robotModel.rejected').length).toBeGreaterThan(0);
  });

  it('updates motor limits with validation, undo and redo', () => {
    const left = scene().actuators[0]!;
    expect(robotModel.updateActuator(left.id, { maxVelocity: 12, maxTorque: 0.8 }).ok).toBe(true);
    expect(scene().actuators[0]).toMatchObject({ maxVelocity: 12, maxTorque: 0.8 });
    expect(robotModel.updateActuator(left.id, { maxVelocity: 0 }).ok).toBe(false);
    expect(robotModel.updateActuator(left.id, { enabled: false }).ok).toBe(true);
    undo();
    expect(scene().actuators[0]!.enabled).toBe(true);
    undo();
    expect(scene().actuators[0]!.maxVelocity).toBe(left.maxVelocity);
    redo();
    expect(scene().actuators[0]!.maxVelocity).toBe(12);
  });

  it('refuses to make a driven wheel joint prismatic or remove a drive joint silently', () => {
    const wheel = jointByName('Left Wheel Joint');
    const r = robotModel.updateJoint(wheel.id, { type: 'prismatic', limits: { lower: 0, upper: 0.1 } });
    expect(r.ok).toBe(false);
    // Deleting the joint removes its actuator and the controller that used it, with events.
    robotModel.deleteJoint(wheel.id);
    expect(scene().actuators.some((a) => a.jointId === wheel.id)).toBe(false);
    expect(scene().controllers).toHaveLength(0);
    expect(events('robotModel.actuatorDeleted')).toHaveLength(1);
    undo();
    expect(scene().actuators).toHaveLength(2);
    expect(scene().controllers).toHaveLength(1);
  });

  it('saves and reloads actuator and controller configuration', () => {
    const project = useProjectStore.getState().projects[scene().projectId!]!;
    robotModel.updateActuator(scene().actuators[1]!.id, { maxVelocity: 9.5, enabled: false });
    robotModel.updateController(scene().controllers[0]!.id, { maxLinearSpeed: 0.8, wheelRadius: 0.072 });
    saveCurrentProject();
    // Simulate a reload from storage.
    const stored = JSON.parse(localStorage.getItem('arai.projects.v1')!) as { state: { projects: Record<string, typeof project> } };
    const reloaded = stored.state.projects[project.id]!;
    expect(reloaded.actuators[1]).toMatchObject({ maxVelocity: 9.5, enabled: false });
    expect(reloaded.controllers[0]).toMatchObject({ maxLinearSpeed: 0.8, wheelRadius: 0.072 });
    useSceneStore.getState().closeProject();
    useSceneStore.getState().loadProject(reloaded);
    expect(scene().actuators[1]!.maxVelocity).toBe(9.5);
    expect(scene().controllers[0]!.maxLinearSpeed).toBe(0.8);
  });

  it('sets up a differential drive on a robot built by hand', () => {
    openExplorer(false, 'blank');
    expect(robotModel.setUpDifferentialDrive().ok).toBe(false); // no wheels yet
    openExplorer(false);
    const controller = scene().controllers[0]!;
    robotModel.removeController(controller.id);
    for (const a of [...scene().actuators]) robotModel.deleteActuator(a.id);
    const result = robotModel.setUpDifferentialDrive();
    expect(result.ok).toBe(true);
    expect(scene().actuators).toHaveLength(2);
    expect(robotModel.setUpDifferentialDrive().ok).toBe(false); // only one drive
  });
});
