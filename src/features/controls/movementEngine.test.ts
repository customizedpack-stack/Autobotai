import { beforeEach, describe, expect, it } from 'vitest';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { applyPoseToDesign, setWorkspaceMode } from './controlSession';
import { robotControl } from './robotControlApi';
import { indexObjects, worldPosition } from '../robot-model/transforms';
import { isLoopRunning, setScheduler, step, STEP_SECONDS } from './movementEngine';
import { byName, events, jointByName, openExplorer } from './testUtils';
import { undo } from '../projects/workspaceActions';
import { robotModel } from '../robot-model/robotModelConnector';

const run = (seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) step(STEP_SECONDS);
};
const pose = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id];
const q = (name: string) => useRobotStateStore.getState().jointPositions[jointByName(name).id] ?? 0;
/** World position of a component with the live poses applied. */
const liveWorld = (name: string) => {
  const { rootPoses } = useRobotStateStore.getState();
  const objects = useSceneStore.getState().objects.map((o) => (rootPoses[o.id] ? { ...o, transform: rootPoses[o.id]! } : o));
  return worldPosition(byName(name).id, indexObjects(objects));
};

beforeEach(() => {
  openExplorer();
});

describe('movement engine (kinematic)', () => {
  it('moves the robot root forward at the commanded speed (50 % of 0.5 m/s)', () => {
    robotControl.drive.forward();
    run(1);
    expect(pose()!.position[0]).toBeCloseTo(0.25, 3);
    expect(pose()!.position[2]).toBeCloseTo(0, 6);
    expect(useRobotStateStore.getState().movement.status).toBe('moving');
    expect(useRobotStateStore.getState().movement.distance).toBeCloseTo(0.25, 3);
  });

  it('turns the wheel joints by the rolled distance / radius', () => {
    robotControl.drive.forward();
    run(0.5);
    // 0.125 m rolled / 0.07 m radius, sign chosen so the wheel rolls forward.
    expect(Math.abs(q('Left Wheel Joint'))).toBeCloseTo(0.125 / 0.07, 2);
    expect(q('Left Wheel Joint')).toBeCloseTo(q('Right Wheel Joint'), 6);
  });

  it('keeps the design untouched while driving (live pose only)', () => {
    const design = byName('Chassis').transform;
    robotControl.drive.forward();
    run(1);
    expect(byName('Chassis').transform).toEqual(design);
    expect(useSceneStore.getState().past).toHaveLength(0);
    expect(useSceneStore.getState().dirty).toBe(false);
  });

  it('children follow the moving root and keep their local transforms', () => {
    const wheelBefore = liveWorld('Left Wheel');
    const local = byName('Left Wheel').transform;
    robotControl.drive.forward();
    run(1);
    const wheelAfter = liveWorld('Left Wheel');
    expect(wheelAfter[0] - wheelBefore[0]).toBeCloseTo(0.25, 3);
    expect(wheelAfter[1]).toBeCloseTo(wheelBefore[1], 9);
    expect(byName('Left Wheel').transform).toEqual(local);
  });

  it('turns left (heading grows, robot curves toward −Z) with a turn command', () => {
    robotControl.drive.forward();
    robotControl.turn.left();
    run(1);
    const m = pose()!;
    expect(m.rotation[1]).toBeGreaterThan(0.5);
    expect(m.position[2]).toBeLessThan(0);
    expect(useRobotStateStore.getState().movement.twist.angular).toBeCloseTo(1, 3);
  });

  it('stop halts movement immediately', () => {
    robotControl.drive.forward();
    run(0.5);
    robotControl.stop();
    const stoppedAt = pose()!.position[0];
    run(0.5);
    expect(pose()!.position[0]).toBe(stoppedAt);
    expect(useRobotStateStore.getState().movement.status).toBe('stopped');
  });

  it('reset returns to the design pose and clears movement state without changing the structure', () => {
    const objects = useSceneStore.getState().objects;
    robotControl.drive.forward();
    robotControl.turn.right();
    run(0.7);
    robotControl.reset();
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
    expect(useRobotStateStore.getState().jointPositions).toEqual({});
    expect(useRobotStateStore.getState().movement.status).toBe('idle');
    expect(useSceneStore.getState().objects).toBe(objects);
  });

  it('handles several commands: timed drive completes on its own', () => {
    const cmd = robotControl.drive.forward({ durationMs: 500 });
    run(1);
    expect(pose()!.position[0]).toBeCloseTo(0.125, 2);
    expect(events('command.status')).toContainEqual(expect.objectContaining({ commandId: cmd.command.id, status: 'completed' }));
    expect(useRobotStateStore.getState().movement.status).toBe('idle');
  });

  it('respects the speed setting', () => {
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.forward();
    run(1);
    expect(pose()!.position[0]).toBeCloseTo(0.5, 3);
  });

  it('limits wheel speed to the motor maximum velocity', () => {
    const [left, right] = useSceneStore.getState().actuators;
    useRobotStateStore.getState().setMode('build');
    useSceneStore.getState().applyModel('limit', {
      actuators: useSceneStore.getState().actuators.map((a) => ({ ...a, maxVelocity: 1 })),
    });
    useRobotStateStore.getState().setMode('control');
    robotControl.drive.forward();
    run(1);
    // 1 rad/s × 0.07 m = 0.07 m/s instead of 0.25 m/s.
    expect(pose()!.position[0]).toBeCloseTo(0.07, 3);
    expect(useRobotStateStore.getState().movement.status).toBe('limited');
    expect(useRobotStateStore.getState().actuators[left!.id]!.state).toBe('limited');
    void right;
  });

  it('runs only one loop at a time', () => {
    let requested = 0;
    const callbacks: ((now: number) => void)[] = [];
    setScheduler({
      request: (cb) => {
        requested += 1;
        callbacks.push(cb);
        return requested;
      },
      cancel: () => {},
    });
    robotControl.drive.forward();
    robotControl.turn.left();
    robotControl.drive.forward({ speed: 0.5 });
    expect(requested).toBe(1);
    expect(isLoopRunning()).toBe(true);
    setScheduler(null);
  });

  it('leaving Control Mode stops motion and returns to the design pose', () => {
    robotControl.drive.forward();
    run(0.5);
    setWorkspaceMode('build');
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
    expect(useRobotStateStore.getState().mode).toBe('build');
  });

  it('"Apply current pose to design" saves the live pose as one undo step', () => {
    robotControl.drive.forward();
    run(1);
    const live = pose()!;
    expect(applyPoseToDesign()).toBe(true);
    expect(byName('Chassis').transform).toEqual(live);
    expect(useSceneStore.getState().past).toHaveLength(1);
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
    undo();
    expect(byName('Chassis').transform.position[0]).toBe(0);
  });

  it('position actuators move a joint toward its target at their maximum velocity', () => {
    openExplorer(false, 'robotic-arm');
    const elbow = jointByName('Elbow');
    const created = robotModel.createActuator({ type: 'jointActuator', jointId: elbow.id, maxVelocity: 2 });
    expect(created.ok).toBe(true);
    setWorkspaceMode('control');
    const cmd = robotControl.joint(elbow.id).setTarget(1);
    expect(cmd.ok).toBe(true);
    run(0.25);
    expect(q('Elbow')).toBeCloseTo(0.5, 2);
    run(0.5);
    expect(q('Elbow')).toBeCloseTo(1, 6);
    expect(events('command.status')).toContainEqual(expect.objectContaining({ commandId: cmd.command.id, status: 'completed' }));
    // The parent (Upper Arm) does not move; the child (Forearm) is posed around the elbow.
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
  });
});
