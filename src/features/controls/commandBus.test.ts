import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '../../core/bus/connectorBus';
import { useConsoleStore, connectConsoleToBus } from '../../stores/consoleStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { robotModel } from '../robot-model/robotModelConnector';
import { connectCommandBus, submitCommand } from './commandBus';
import { robotControl } from './robotControlApi';
import { events, jointByName, openExplorer } from './testUtils';

connectConsoleToBus();
connectCommandBus();

beforeEach(() => {
  openExplorer();
  useConsoleStore.setState({ entries: [] });
});

describe('C2 Command Bus', () => {
  it('accepts a valid command with id, robot id, type, payload and timestamp', () => {
    const result = robotControl.drive.forward({ speed: 0.5 });
    expect(result.ok).toBe(true);
    const accepted = events('command.accepted')[0]!.command as Record<string, unknown>;
    expect(accepted).toMatchObject({ type: 'drive', payload: { speed: 0.5 }, robotId: useSceneStore.getState().projectId });
    expect(typeof accepted.id).toBe('string');
    expect(typeof accepted.timestamp).toBe('number');
    expect(events('command.status')[0]).toMatchObject({ commandId: accepted.id, status: 'executing' });
  });

  it('rejects invalid payloads safely and logs the error in the console', () => {
    const before = useRobotStateStore.getState().movement.intent;
    const result = submitCommand('drive', { speed: 3 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('speed must be between −1 and 1.');
    expect(useRobotStateStore.getState().movement.intent).toEqual(before);
    expect(events('command.rejected')).toHaveLength(1);
    expect(useConsoleStore.getState().entries.some((e) => e.level === 'error' && e.message.includes('rejected'))).toBe(true);
    expect(submitCommand('drive', { speed: Number.NaN }).ok).toBe(false);
    expect(submitCommand('turn', { rate: 0.5, durationMs: -5 }).ok).toBe(false);
    expect(submitCommand('teleport' as never, {} as never).errors[0]).toMatch(/Unknown command type/);
  });

  it('rejects drive commands when a wheel has no actuator', () => {
    const left = useSceneStore.getState().actuators.find((a) => a.jointId === jointByName('Left Wheel Joint').id)!;
    useRobotStateStore.getState().setMode('build');
    robotModel.deleteActuator(left.id);
    useRobotStateStore.getState().setMode('control');
    const result = robotControl.drive.forward();
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/has no motor \(missing actuator\)/);
  });

  it('rejects drive commands when a motor is disabled', () => {
    const left = useSceneStore.getState().actuators[0]!;
    robotModel.updateActuator(left.id, { enabled: false });
    expect(robotControl.drive.forward().errors.join()).toMatch(/is disabled/);
  });

  it('rejects commands targeting a missing joint, and joint values outside the limits', () => {
    expect(robotControl.joint('jnt_missing').preview(0.1).errors[0]).toMatch(/not found/);
    const wheel = jointByName('Left Wheel Joint');
    expect(robotControl.joint(wheel.id).preview(10).errors.join()).toMatch(/upper limit/);
    expect(robotControl.joint(jointByName('Sensor Mount').id).preview(0).errors.join()).toMatch(/fixed/);
    // DC motors are speed-controlled; position targets are refused.
    expect(robotControl.joint(wheel.id).setTarget(0.5).errors.join()).toMatch(/speed-controlled/);
  });

  it('rejects commands for another robot and movement in Build Mode', () => {
    expect(submitCommand('drive', { speed: 1 }, 'api', 'prj_other').errors).toContain('Target robot is not open in the workspace.');
    useRobotStateStore.getState().setMode('build');
    expect(robotControl.drive.forward().errors).toContain('Switch to Control Mode to move the robot.');
    // Stop is always allowed.
    expect(robotControl.stop().ok).toBe(true);
  });

  it('stop cancels active commands and publishes their status', () => {
    const drive = robotControl.drive.forward();
    robotControl.turn.left();
    const stop = robotControl.stop();
    expect(stop.ok).toBe(true);
    expect(useRobotStateStore.getState().movement.intent).toEqual({ linear: 0, angular: 0 });
    expect(useRobotStateStore.getState().movement.status).toBe('stopped');
    expect(events('command.status')).toContainEqual(expect.objectContaining({ commandId: drive.command.id, status: 'stopped' }));
    expect(events('command.status')).toContainEqual(expect.objectContaining({ commandId: stop.command.id, status: 'completed' }));
  });

  it('reset is accepted and completes', () => {
    const result = robotControl.reset();
    expect(result.ok).toBe(true);
    expect(events('command.status')).toContainEqual(expect.objectContaining({ type: 'reset', status: 'completed' }));
  });

  it('a new drive command supersedes the previous one', () => {
    const first = robotControl.drive.forward();
    robotControl.drive.backward();
    expect(events('command.status')).toContainEqual(expect.objectContaining({ commandId: first.command.id, status: 'superseded' }));
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(-1);
  });

  it('accepts requests from other modules over the bus', () => {
    bus.publish('command.request', { type: 'turn', payload: { rate: -0.5 } });
    expect(events('command.accepted')[0]!.command).toMatchObject({ type: 'turn', source: 'bus' });
    expect(useRobotStateStore.getState().movement.intent.angular).toBe(-0.5);
    bus.publish('command.request', { type: 'drive', payload: { speed: 9 } });
    expect(events('command.rejected')).toHaveLength(1);
  });
});
