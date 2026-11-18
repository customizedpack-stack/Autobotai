import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { activeMovementController, isLoopRunning } from '../../controls/movementEngine';
import { robotControl } from '../../controls/robotControlApi';
import { byName, events, jointByName, openExplorer } from '../../controls/testUtils';
import { robotModel } from '../../robot-model/robotModelConnector';
import { transformToMatrix } from '../../robot-model/transforms';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import {
  activePhysicsController,
  isSimulationLoopRunning,
  pauseSimulation,
  resumeSimulation,
  selectEngine,
  setGravityEnabled,
  setSimulationScheduler,
  stepSimulation,
  stopSimulation,
} from '../simulation/simulationManager';
import { useSimulationStore } from '../simulation/simulationStore';
import '../../code-studio/testUtils';
import { rotateVec } from '../engine/quat';

const pose = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id]!;
const heading = () => {
  const m = transformToMatrix(pose());
  return Math.atan2(-m[2]!, m[0]!);
};
const q = (name: string) => useRobotStateStore.getState().jointPositions[jointByName(name).id] ?? 0;
const speed = () => useRobotStateStore.getState().movement.twist.linear;

async function physics(template = 'explorer-bot', configure?: () => void) {
  openExplorer(false, template);
  configure?.();
  setWorkspaceMode('control');
  setSimulationScheduler(null);
  expect(await selectEngine('physics')).toBe(true);
  expect(useSimulationStore.getState().state).toBe('running');
}

beforeEach(() => {
  setSimulationScheduler(null);
});
afterEach(async () => {
  await selectEngine('kinematic');
});

describe('physics simulation: lifecycle and controller', () => {
  it('starts, registers the physics controller (kinematic loop never runs), and the robot settles on its wheels', async () => {
    await physics();
    expect(activeMovementController()).toBe('physics');
    const info = useSimulationStore.getState().info;
    expect(info).toMatchObject({ bodies: 3, joints: 2 });
    stepSimulation(1.5);
    const p = pose().position;
    expect(p[1]).toBeGreaterThan(0.09);
    expect(p[1]).toBeLessThan(0.13);
    expect(Math.abs(p[0])).toBeLessThan(0.02);
    expect(Math.abs(speed())).toBeLessThan(0.01);
    robotControl.drive.forward();
    expect(isLoopRunning()).toBe(false);
  });

  it('pause freezes simulated time; resume continues; stop disposes and returns to the design pose', async () => {
    await physics();
    robotControl.drive.forward();
    stepSimulation(1);
    pauseSimulation();
    const x = pose().position[0];
    stepSimulation(1); // ignored while paused
    expect(pose().position[0]).toBe(x);
    expect(robotControl.drive.forward().errors).toEqual(['The physics simulation is paused. Resume it to move the robot.']);
    resumeSimulation();
    stepSimulation(0.5);
    expect(pose().position[0]).toBeGreaterThan(x);
    stopSimulation();
    expect(useSimulationStore.getState().state).toBe('stopped');
    expect(activePhysicsController()).toBeNull();
    expect(activeMovementController()).toBe('kinematic');
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
    expect(robotControl.drive.forward().errors).toEqual(['Start the physics simulation to move the robot, or switch the engine to Kinematic.']);
  });

  it('switching engines and modes never leaves two controllers or duplicate loops', async () => {
    await physics();
    setSimulationScheduler({ request: () => 1, cancel: () => undefined });
    await selectEngine('kinematic');
    expect(activeMovementController()).toBe('kinematic');
    expect(isSimulationLoopRunning()).toBe(false);
    await selectEngine('physics');
    expect(activeMovementController()).toBe('physics');
    expect(isSimulationLoopRunning()).toBe(true);
    // Leaving Control Mode stops the simulation (engine choice is kept).
    setWorkspaceMode('build');
    expect(useSimulationStore.getState()).toMatchObject({ engine: 'physics', state: 'stopped' });
    expect(activeMovementController()).toBe('kinematic');
    expect(isSimulationLoopRunning()).toBe(false);
    setSimulationScheduler(null);
  });

  it('gravity can be switched off (the robot then floats where it is)', async () => {
    await physics(undefined, () => {
      const chassis = byName('Chassis');
      useSceneStore.getState().updateTransform(chassis.id, { position: [0, 1, 0] });
    });
    setGravityEnabled(false);
    stepSimulation(0.5);
    expect(pose().position[1]).toBeCloseTo(1, 2);
    setGravityEnabled(true);
    stepSimulation(1.5);
    expect(pose().position[1]).toBeLessThan(0.2);
  });

  it('C2 rules in physics: joint preview is refused; Stop and Reset are always accepted', async () => {
    await physics('robotic-arm');
    const r = robotControl.joint(jointByName('Elbow').id).preview(0.3);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Joint preview is a kinematic tool/);
    pauseSimulation();
    expect(robotControl.stop().ok).toBe(true);
    expect(robotControl.reset().ok).toBe(true);
  });
});

describe('physics simulation: differential drive (wheels and ground move the robot)', () => {
  it('forward and reverse movement come from wheel–ground contact', async () => {
    await physics();
    stepSimulation(0.5);
    robotControl.drive.forward();
    stepSimulation(2);
    const x = pose().position[0];
    // Commanded 0.25 m/s (50 % of 0.5 m/s): real motion includes acceleration.
    expect(x).toBeGreaterThan(0.3);
    expect(x).toBeLessThan(0.55);
    expect(speed()).toBeGreaterThan(0.2);
    expect(Math.abs(pose().position[2])).toBeLessThan(0.03);
    expect(useRobotStateStore.getState().movement.wheels!.left).toBeGreaterThan(2);
    robotControl.drive.backward();
    stepSimulation(3);
    expect(pose().position[0]).toBeLessThan(x - 0.4);
  });

  it('left and right turns come from different wheel velocities', async () => {
    await physics();
    stepSimulation(0.5);
    robotControl.turn.left();
    stepSimulation(1);
    expect(heading()).toBeGreaterThan(0.5);
    const wheels = useRobotStateStore.getState().movement.wheels!;
    expect(Math.sign(wheels.left)).toBe(-Math.sign(wheels.right));
    robotControl.turn.set(0);
    robotControl.turn.right();
    stepSimulation(2);
    expect(heading()).toBeLessThan(0);
  });

  it('drive + turn makes an arc to the left (−Z)', async () => {
    await physics();
    stepSimulation(0.5);
    robotControl.drive.set(1);
    robotControl.turn.set(0.5);
    stepSimulation(2);
    expect(pose().position[0]).toBeGreaterThan(0.1);
    expect(pose().position[2]).toBeLessThan(-0.05);
    expect(heading()).toBeGreaterThan(0.3);
  });

  it('timed commands complete on simulated time; Stop brakes the wheels', async () => {
    await physics();
    stepSimulation(0.5);
    const cmd = robotControl.drive.forward({ durationMs: 500 });
    stepSimulation(0.6);
    expect(events('command.status').some((e) => e.commandId === cmd.command.id && e.status === 'completed')).toBe(true);
    robotControl.drive.set(1);
    stepSimulation(1);
    robotControl.stop();
    expect(useRobotStateStore.getState().movement.status).toBe('stopped');
    stepSimulation(0.6);
    expect(Math.abs(speed())).toBeLessThan(0.02);
  });

  it('Reset (C2) rebuilds the world: the robot returns to its design pose', async () => {
    await physics();
    robotControl.drive.set(1);
    stepSimulation(1.5);
    expect(pose().position[0]).toBeGreaterThan(0.1);
    robotControl.reset();
    stepSimulation(0.05);
    expect(pose().position[0]).toBeCloseTo(0, 2);
    expect(useSimulationStore.getState().state).toBe('running');
  });

  it('mass, friction and torque limits change the motion', async () => {
    const distance = async (configure?: () => void) => {
      await physics(undefined, configure);
      stepSimulation(0.5);
      robotControl.drive.set(1);
      stepSimulation(1);
      const d = pose().position[0];
      await selectEngine('kinematic');
      return d;
    };
    const base = await distance();
    const heavy = await distance(() => {
      const objects = useSceneStore.getState().objects.map((o) => (o.name === 'Chassis' ? { ...o, physics: { mass: 40 } } : o));
      useSceneStore.getState().applyModel('heavy', { objects });
    });
    const slippery = await distance(() => {
      const objects = useSceneStore.getState().objects.map((o) => (o.category === 'wheel' && o.name !== 'Caster Ball' ? { ...o, physics: { friction: 0.01 } } : o));
      useSceneStore.getState().applyModel('slippery', { objects });
    });
    const weak = await distance(() => {
      for (const a of robotModel.getModel().actuators) robotModel.updateActuator(a.id, { maxTorque: 0.02 });
    });
    expect(base).toBeGreaterThan(0.15);
    expect(heavy).toBeLessThan(base * 0.8);
    expect(slippery).toBeLessThan(base * 0.3);
    expect(weak).toBeLessThan(base * 0.5);
  });

  it('static obstacles stop the robot (collision)', async () => {
    await physics();
    useSimulationStore.getState().set({ settings: { ...useSimulationStore.getState().settings, environment: 'obstacles' } });
    robotControl.reset(); // rebuild with the obstacle course
    useRobotStateStore.getState().setSpeedPercent(100);
    robotControl.drive.set(1);
    stepSimulation(6);
    // The wall's near face is at x = 1.35; the chassis front is 0.2 m ahead of its center.
    expect(pose().position[0]).toBeLessThan(1.2);
    expect(pose().position[0]).toBeGreaterThan(0.9);
    useSimulationStore.getState().set({ settings: { ...useSimulationStore.getState().settings, environment: 'floor' } });
  });
});

describe('physics simulation: joints and actuators', () => {
  const withServo = (joint: string, patch: Record<string, unknown> = {}) => () => {
    const created = robotModel.createActuator({ type: 'jointActuator', jointId: jointByName(joint).id, maxVelocity: 2, maxTorque: 20, ...patch });
    expect(created.ok).toBe(true);
  };

  it('revolute constraint: the anchors stay together and the joint obeys its limits under gravity', async () => {
    await physics('robotic-arm');
    stepSimulation(3);
    const world = activePhysicsController()!.physicsWorld!;
    for (const j of world.joints) {
      const a = world.anchorWorld(j.parent, j.spec.anchor1);
      const b = world.anchorWorld(j.child, j.spec.anchor2);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.005);
      // The joint axis seen from the child matches the axis seen from the parent (rotation only about the axis).
      const axis1 = world.jointAxisWorld(j);
      const axis2 = rotateVec(j.child.rotation(), j.spec.axis2);
      expect(axis1[0] * axis2[0] + axis1[1] * axis2[1] + axis1[2] * axis2[2]).toBeGreaterThan(0.999);
    }
    // Without actuators the arm is free: it falls, but never beyond its limits.
    expect(Math.abs(q('Shoulder'))).toBeLessThanOrEqual(Math.PI / 2 + 0.03);
    expect(Math.abs(q('Elbow'))).toBeLessThanOrEqual((135 * Math.PI) / 180 + 0.03);
    const anyMoved = Math.abs(q('Shoulder')) + Math.abs(q('Elbow')) + Math.abs(q('Wrist'));
    expect(anyMoved).toBeGreaterThan(0.2);
    // Numerically stable: no NaN anywhere.
    for (const l of world.links) expect(Number.isFinite(l.body.translation().y)).toBe(true);
  });

  it('servo moves toward its target at no more than its speed limit, then holds', async () => {
    await physics('robotic-arm', () => {
      withServo('Shoulder')();
      withServo('Elbow', { maxVelocity: 0.5 })();
      withServo('Wrist')();
    });
    stepSimulation(0.5);
    const cmd = robotControl.joint(jointByName('Elbow').id).setTarget(0.6);
    expect(cmd.ok).toBe(true);
    stepSimulation(0.5);
    expect(q('Elbow')).toBeLessThan(0.3); // 0.5 rad/s × 0.5 s
    expect(q('Elbow')).toBeGreaterThan(0.1);
    stepSimulation(2.5);
    expect(q('Elbow')).toBeCloseTo(0.6, 1);
    expect(events('command.status').some((e) => e.commandId === cmd.command.id && e.status === 'completed')).toBe(true);
    stepSimulation(1);
    expect(q('Elbow')).toBeCloseTo(0.6, 1); // holds against gravity
  });

  it('torque limits are respected: a weak servo cannot lift the arm and the move ends as "stopped"', async () => {
    await physics('robotic-arm', () => {
      withServo('Shoulder', { maxTorque: 0.001 })();
    });
    const cmd = robotControl.joint(jointByName('Shoulder').id).setTarget(1.2);
    stepSimulation(12);
    const status = events('command.status').filter((e) => e.commandId === cmd.command.id).at(-1);
    expect(status).toMatchObject({ status: 'stopped' });
    expect(q('Shoulder')).not.toBeCloseTo(1.2, 1);
  });

  it('disabled actuators apply no motion: the joint moves freely', async () => {
    const elbowAfter = async (enabled: boolean) => {
      await physics('robotic-arm', () => {
        withServo('Shoulder')();
        withServo('Elbow', { enabled })();
        withServo('Wrist')();
      });
      stepSimulation(3);
      const value = q('Elbow');
      await selectEngine('kinematic');
      return value;
    };
    expect(Math.abs(await elbowAfter(true))).toBeLessThan(0.05);
    expect(Math.abs(await elbowAfter(false))).toBeGreaterThan(0.2);
  });

  it('DC motor drive torque: the wheel joint spins at its target when lifted', async () => {
    await physics(undefined, () => {
      useSceneStore.getState().updateTransform(byName('Chassis').id, { position: [0, 1, 0] });
    });
    setGravityEnabled(false);
    robotControl.drive.set(1);
    stepSimulation(1);
    const { wheels } = useRobotStateStore.getState().movement;
    // Free wheels reach the commanded 3.57 rad/s (0.25 m/s / 0.07 m).
    expect(wheels!.left).toBeCloseTo(3.57, 0);
    expect(wheels!.right).toBeCloseTo(3.57, 0);
  });
});
