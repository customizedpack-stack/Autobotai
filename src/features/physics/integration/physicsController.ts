import type { UnitImpulseJoint } from '@dimforge/rapier3d-compat';
import { useRobotStateStore, type ActuatorRuntime } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotActuator } from '../../../types/actuator';
import type { Transform, Vec3 } from '../../../types/scene';
import { log } from '../../../utils/logger';
import type { RobotCommand } from '../../controls/commands';
import { computeWheelSpeeds, limitWheelSpeeds, twistFromIntent } from '../../controls/differentialDrive';
import { publishCommandStatus, type ExternalMovementController } from '../../controls/movementEngine';
import { measureDriveGeometry, type DriveGeometry } from '../../robot-model/drive';
import { matrixToTransform } from '../../robot-model/transforms';
import { wrapAngle } from '../../robot-model/kinematics';
import { MOTOR_OFF, positionMotor, targetDeadline, targetReached, velocityMotor, type MotorCommand } from '../actuators/motorControl';
import { buildRobotAssembly, type RobotAssembly } from '../bodies/robotAssembly';
import { PhysicsWorld, type JointBody, type WorldSettings } from '../engine/physicsWorld';
import { matrixFromPose, rotateVec } from '../engine/quat';
import type { Rapier } from '../engine/rapierLoader';

/**
 * Physics Integration Adapter (Phase 5).
 *
 *   C2 (validated command) → movementEngine.execute → PhysicsController.execute
 *     → motor targets → Rapier joint motors (torque-limited) → wheel–ground contact
 *     → the engine decides where the robot goes → robotStateStore (rendering, telemetry)
 *
 * The robot is never placed by code: drive commands only set wheel motor targets,
 * computed with the same differential-drive math as Phase 3 (wheel radius and track
 * width measured from the robot). Mass, friction, torque limits and collisions decide
 * the actual motion. Command progress is reported on C2 exactly like the kinematic engine.
 */

interface Pending {
  commandId: string;
  /** Simulated time at which a timed command ends (null = until changed). */
  until: number | null;
}

interface JointMove {
  commandId: string;
  target: number;
  deadline: number;
}

interface DriveSetup {
  geometry: DriveGeometry;
  rootLink: number;
  left: JointBody;
  right: JointBody;
  leftActuator: RobotActuator | null;
  rightActuator: RobotActuator | null;
  maxLinearSpeed: number;
  maxAngularSpeed: number;
}

export interface DebugSnapshot {
  lines: Float32Array;
  colors: Float32Array;
  bodies: { position: Vec3; velocity: Vec3 }[];
  anchors: { position: Vec3; axis: Vec3 }[];
  contacts: Vec3[];
}

type MotorJoint = UnitImpulseJoint;

export class PhysicsController implements ExternalMovementController {
  readonly name = 'physics' as const;
  private readonly rapier: Rapier;
  private readonly settings: () => WorldSettings;
  private world: PhysicsWorld | null = null;
  private assembly: RobotAssembly | null = null;
  private drive: DriveSetup | null = null;
  private simTime = 0;
  private intent = { linear: 0, angular: 0 };
  private driveCmd: Pending | null = null;
  private turnCmd: Pending | null = null;
  private readonly jointMoves = new Map<string, JointMove>();
  /** Position targets held by servos / joint actuators (joint id → target). */
  private readonly holds = new Map<string, number>();
  private readonly motorTargets = new Map<string, MotorCommand>();
  private stopped = false;
  private limited = false;
  private distance = 0;
  private lastCommand: { id: string; type: string } | null = null;

  constructor(rapier: Rapier, settings: () => WorldSettings) {
    this.rapier = rapier;
    this.settings = settings;
  }

  get physicsWorld(): PhysicsWorld | null {
    return this.world;
  }

  get robotAssembly(): RobotAssembly | null {
    return this.assembly;
  }

  get time(): number {
    return this.simTime;
  }

  /** (Re)build the world from the saved design. The design itself is never changed. */
  build(): RobotAssembly {
    this.world?.dispose();
    const { objects, joints, actuators, controllers } = useSceneStore.getState();
    const assembly = buildRobotAssembly(objects, joints, actuators);
    const world = new PhysicsWorld(this.rapier, this.settings());
    world.addRobot(assembly);
    for (const j of world.joints) (j.joint as MotorJoint).configureMotorModel(this.rapier.MotorModel.ForceBased);
    this.world = world;
    this.assembly = assembly;
    this.simTime = 0;
    this.intent = { linear: 0, angular: 0 };
    this.driveCmd = null;
    this.turnCmd = null;
    this.jointMoves.clear();
    this.holds.clear();
    this.motorTargets.clear();
    this.stopped = false;
    this.limited = false;
    this.distance = 0;
    this.lastCommand = null;

    this.drive = null;
    const controller = controllers.find((c) => c.type === 'differentialDrive');
    if (controller) {
      const measured = measureDriveGeometry(controller, objects, joints);
      const rootLink = assembly.linkOf.get(controller.rootComponentId);
      const left = world.joints.find((j) => j.spec.jointId === controller.leftJointId);
      const right = world.joints.find((j) => j.spec.jointId === controller.rightJointId);
      if (!measured.ok) assembly.issues.push(`Drive: ${measured.errors.join(' ')}`);
      else if (rootLink === undefined || !left || !right) assembly.issues.push('Drive: the wheel joints could not be mapped to physics joints.');
      else {
        this.drive = {
          geometry: measured.geometry,
          rootLink,
          left,
          right,
          leftActuator: actuators.find((a) => a.jointId === controller.leftJointId) ?? null,
          rightActuator: actuators.find((a) => a.jointId === controller.rightJointId) ?? null,
          maxLinearSpeed: controller.maxLinearSpeed,
          maxAngularSpeed: controller.maxAngularSpeed,
        };
      }
    }
    return assembly;
  }

  /** Accepted C2 command (already validated). */
  execute(command: RobotCommand): void {
    const payload = command.payload as Record<string, unknown>;
    const robot = useRobotStateStore.getState();
    this.lastCommand = { id: command.id, type: command.type };
    switch (command.type) {
      case 'drive':
      case 'turn': {
        const key = command.type === 'drive' ? 'driveCmd' : 'turnCmd';
        const value = (command.type === 'drive' ? payload.speed : payload.rate) as number;
        const previous = this[key];
        if (previous) publishCommandStatus(previous.commandId, command.type, 'superseded');
        if (command.type === 'drive') this.intent.linear = value;
        else this.intent.angular = value;
        const until = typeof payload.durationMs === 'number' ? this.simTime + payload.durationMs / 1000 : null;
        this[key] = value === 0 ? null : { commandId: command.id, until };
        this.stopped = false;
        publishCommandStatus(command.id, command.type, value === 0 ? 'completed' : 'executing');
        robot.patch({ movement: { intent: { ...this.intent }, lastCommand: this.lastCommand, lastError: null } });
        return;
      }
      case 'setJointTarget': {
        const jointId = payload.jointId as string;
        const target = payload.target as number;
        const jb = this.world?.joints.find((j) => j.spec.jointId === jointId);
        if (!jb || !this.world) {
          publishCommandStatus(command.id, 'setJointTarget', 'failed', 'This joint is not part of the physics model.');
          return;
        }
        const previous = this.jointMoves.get(jointId);
        if (previous) publishCommandStatus(previous.commandId, 'setJointTarget', 'superseded');
        const q = this.world.jointPosition(jb);
        const maxVelocity = jb.spec.actuator?.maxVelocity ?? 1;
        this.jointMoves.set(jointId, { commandId: command.id, target, deadline: this.simTime + targetDeadline(target - q, maxVelocity) });
        this.holds.set(jointId, target);
        publishCommandStatus(command.id, 'setJointTarget', 'executing');
        robot.patch({ movement: { lastCommand: this.lastCommand, lastError: null } });
        return;
      }
      case 'stop': {
        this.stopAll('stopped');
        // Servos hold where they are now; DC motors brake (target 0).
        if (this.world) for (const jb of this.world.joints) if (jb.spec.actuator?.controlMode === 'position') this.holds.set(jb.spec.jointId, this.world.jointPosition(jb));
        this.stopped = true;
        publishCommandStatus(command.id, 'stop', 'completed');
        robot.patch({ movement: { intent: { linear: 0, angular: 0 }, lastCommand: this.lastCommand, status: 'stopped' } });
        return;
      }
      case 'reset': {
        this.stopAll('stopped');
        this.build();
        robot.resetRuntime();
        publishCommandStatus(command.id, 'reset', 'completed');
        log.info('simulation', 'Physics simulation reset: the robot is back in its design pose.');
        return;
      }
    }
  }

  /** End every pending command with `status` (Stop, Reset, simulation stop). */
  stopAll(status: 'stopped' | 'superseded'): void {
    if (this.driveCmd) publishCommandStatus(this.driveCmd.commandId, 'drive', status);
    if (this.turnCmd) publishCommandStatus(this.turnCmd.commandId, 'turn', status);
    for (const move of this.jointMoves.values()) publishCommandStatus(move.commandId, 'setJointTarget', status);
    this.driveCmd = null;
    this.turnCmd = null;
    this.jointMoves.clear();
    this.intent = { linear: 0, angular: 0 };
  }

  /** Motor command for every joint this tick. */
  private computeMotors(): void {
    const world = this.world!;
    this.motorTargets.clear();
    this.limited = false;
    const drive = this.drive;
    if (drive) {
      const speedFraction = useRobotStateStore.getState().speedPercent / 100;
      const twist = twistFromIntent(this.intent, speedFraction, drive);
      const raw = computeWheelSpeeds(twist, drive.geometry);
      if (raw.ok) {
        const { speeds, limited } = limitWheelSpeeds(raw.speeds, drive.leftActuator?.maxVelocity ?? Infinity, drive.rightActuator?.maxVelocity ?? Infinity);
        this.limited = limited;
        this.motorTargets.set(drive.left.spec.jointId, velocityMotor(drive.leftActuator, drive.geometry.left.spinSign * speeds.leftAngular));
        this.motorTargets.set(drive.right.spec.jointId, velocityMotor(drive.rightActuator, drive.geometry.right.spinSign * speeds.rightAngular));
      }
    }
    for (const jb of world.joints) {
      const id = jb.spec.jointId;
      if (this.motorTargets.has(id)) continue;
      const actuator = jb.spec.actuator;
      if (!actuator) this.motorTargets.set(id, MOTOR_OFF);
      else if (actuator.controlMode === 'velocity') this.motorTargets.set(id, velocityMotor(actuator, 0));
      else this.motorTargets.set(id, positionMotor(actuator, this.holds.get(id) ?? 0, world.jointPosition(jb)));
    }
  }

  /** Advance the simulation by one fixed tick. */
  tick(dt: number): void {
    const world = this.world;
    if (!world || world.isDisposed) return;
    this.simTime += dt;
    if (this.driveCmd?.until !== null && this.driveCmd && this.simTime >= this.driveCmd.until!) {
      publishCommandStatus(this.driveCmd.commandId, 'drive', 'completed');
      this.driveCmd = null;
      this.intent.linear = 0;
    }
    if (this.turnCmd?.until !== null && this.turnCmd && this.simTime >= this.turnCmd.until!) {
      publishCommandStatus(this.turnCmd.commandId, 'turn', 'completed');
      this.turnCmd = null;
      this.intent.angular = 0;
    }
    this.computeMotors();
    for (const jb of world.joints) {
      const cmd = this.motorTargets.get(jb.spec.jointId) ?? MOTOR_OFF;
      const joint = jb.joint as MotorJoint;
      joint.setMotorMaxForce(cmd.maxForce);
      joint.configureMotorVelocity(cmd.velocity, cmd.factor);
      if (cmd.maxForce > 0 && Math.abs(cmd.velocity) > 1e-4) {
        jb.parent.wakeUp();
        jb.child.wakeUp();
      }
    }
    world.step(dt);

    for (const [jointId, move] of this.jointMoves) {
      const jb = world.joints.find((j) => j.spec.jointId === jointId)!;
      const q = world.jointPosition(jb);
      if (targetReached(jb.spec.type, move.target, q, world.jointRate(jb))) {
        publishCommandStatus(move.commandId, 'setJointTarget', 'completed');
        this.jointMoves.delete(jointId);
      } else if (this.simTime > move.deadline) {
        publishCommandStatus(move.commandId, 'setJointTarget', 'stopped', 'Target not reached (blocked, or the actuator is too weak).');
        log.warning('simulation', `Joint "${jb.spec.name}" did not reach its target (blocked, or the actuator torque is too low).`);
        this.jointMoves.delete(jointId);
      }
    }
    if (this.drive) {
      const v = world.links[this.drive.rootLink]!.body.linvel();
      this.distance += Math.hypot(v.x, v.z) * dt;
    }
  }

  /** Write the physics result into the runtime store once per frame (rendering and telemetry). */
  publish(): void {
    const world = this.world;
    if (!world || world.isDisposed) return;
    const rootPoses: Record<string, Transform> = {};
    for (const link of world.links) {
      if (!link.spec.isRoot) continue;
      const t = link.body.translation();
      rootPoses[link.spec.id] = matrixToTransform(matrixFromPose([t.x, t.y, t.z], link.body.rotation(), link.spec.designTransform.scale));
    }
    const jointPositions: Record<string, number> = {};
    const actuators: Record<string, ActuatorRuntime> = {};
    for (const jb of world.joints) {
      const q = world.jointPosition(jb);
      jointPositions[jb.spec.jointId] = jb.spec.limits ? q : wrapAngle(q);
      const actuator = jb.spec.actuator;
      if (!actuator) continue;
      const cmd = this.motorTargets.get(jb.spec.jointId) ?? MOTOR_OFF;
      const rate = world.jointRate(jb);
      const position = actuator.controlMode === 'position';
      actuators[actuator.id] = {
        target: position ? (this.holds.get(jb.spec.jointId) ?? 0) : cmd.velocity,
        velocity: rate,
        state: !actuator.enabled ? 'disabled' : position ? (this.jointMoves.has(jb.spec.jointId) ? 'active' : 'holding') : Math.abs(cmd.velocity) > 1e-3 ? (this.limited ? 'limited' : 'active') : 'idle',
      };
    }
    let twist = { linear: 0, angular: 0 };
    let wheels: { left: number; right: number } | null = null;
    if (this.drive) {
      const body = world.links[this.drive.rootLink]!.body;
      const v = body.linvel();
      const forward = rotateVec(body.rotation(), [1, 0, 0]);
      twist = { linear: v.x * forward[0] + v.y * forward[1] + v.z * forward[2], angular: body.angvel().y };
      wheels = {
        left: world.jointRate(this.drive.left) * this.drive.geometry.left.spinSign,
        right: world.jointRate(this.drive.right) * this.drive.geometry.right.spinSign,
      };
    }
    const moving = this.intent.linear !== 0 || this.intent.angular !== 0;
    useRobotStateStore.getState().patch({
      rootPoses,
      jointPositions,
      actuators,
      movement: {
        status: this.stopped ? 'stopped' : moving ? (this.limited ? 'limited' : 'moving') : 'idle',
        intent: { ...this.intent },
        twist,
        wheels,
        distance: this.distance,
      },
    });
  }

  /** Lines, bodies, joint anchors and contact points for the debug view. */
  debugSnapshot(): DebugSnapshot | null {
    const world = this.world;
    if (!world || world.isDisposed) return null;
    const buffers = world.world.debugRender();
    return {
      lines: new Float32Array(buffers.vertices),
      colors: new Float32Array(buffers.colors),
      bodies: world.links.map((l) => {
        const t = l.body.translation();
        const v = l.body.linvel();
        return { position: [t.x, t.y, t.z] as Vec3, velocity: [v.x, v.y, v.z] as Vec3 };
      }),
      anchors: world.joints.map((j) => ({ position: world.anchorWorld(j.parent, j.spec.anchor1), axis: world.jointAxisWorld(j) })),
      contacts: world.contactPoints(),
    };
  }

  dispose(): void {
    this.world?.dispose();
    this.world = null;
    this.drive = null;
  }
}
