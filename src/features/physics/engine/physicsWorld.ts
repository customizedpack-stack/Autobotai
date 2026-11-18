import type { Collider, ImpulseJoint, RigidBody, World } from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../../../types/scene';
import type { AssemblyJoint, AssemblyLink, RobotAssembly } from '../bodies/robotAssembly';
import type { ShapeSpec } from '../bodies/shapes';
import {
  EARTH_GRAVITY,
  ENVIRONMENT_COLLISION_GROUPS,
  GROUND_FRICTION,
  GROUND_HALF_EXTENT,
  GROUND_RESTITUTION,
  ROBOT_COLLISION_GROUPS,
  SOLVER_ITERATIONS,
  SUBSTEPS,
} from '../physicsConfig';
import { findEnvironment, type EnvironmentId } from './environments';
import { conjugateQuat, IDENTITY_QUAT, multiplyQuat, rotateVec, twistAngle, type Quat } from './quat';
import type { Rapier } from './rapierLoader';

/**
 * A Rapier world for one simulation: ground, static obstacles and the robot.
 * Owns every Rapier object it creates and frees them all in dispose().
 * Not React-aware: the simulation manager drives it at a fixed timestep.
 */

export interface WorldSettings {
  gravityEnabled: boolean;
  environment: EnvironmentId;
}

export interface LinkBody {
  spec: AssemblyLink;
  body: RigidBody;
}

export interface JointBody {
  spec: AssemblyJoint;
  joint: ImpulseJoint;
  parent: RigidBody;
  child: RigidBody;
  /** Child orientation relative to the parent at rest (q = 0). */
  restRelative: Quat;
}

export interface BodySpec {
  shape: ShapeSpec;
  position: Vec3;
  rotation?: Quat;
  /** Mass (kg); when absent the collider density is used. */
  mass?: number;
  density?: number;
  friction?: number;
  restitution?: number;
  fixed?: boolean;
  linvel?: Vec3;
}

const v3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];
const vec = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class PhysicsWorld {
  readonly rapier: Rapier;
  readonly world: World;
  readonly ground: Collider;
  readonly obstacles: Collider[] = [];
  links: LinkBody[] = [];
  joints: JointBody[] = [];
  private disposed = false;

  constructor(rapier: Rapier, settings: WorldSettings) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: settings.gravityEnabled ? -EARTH_GRAVITY : 0, z: 0 });
    this.world.numSolverIterations = SOLVER_ITERATIONS;
    // Ground: a static slab whose top surface is y = 0 (the grid).
    this.ground = this.world.createCollider(
      rapier.ColliderDesc.cuboid(GROUND_HALF_EXTENT, 0.5, GROUND_HALF_EXTENT)
        .setTranslation(0, -0.5, 0)
        .setFriction(GROUND_FRICTION)
        .setRestitution(GROUND_RESTITUTION)
        // Contact friction = part × ground (a frictionless part slides freely; a wheel at 1.0 grips at 0.9).
        .setFrictionCombineRule(rapier.CoefficientCombineRule.Multiply)
        // Contact bounce = the larger restitution (the part's setting decides; the ground does not bounce).
        .setRestitutionCombineRule(rapier.CoefficientCombineRule.Max)
        .setCollisionGroups(ENVIRONMENT_COLLISION_GROUPS),
    );
    for (const o of findEnvironment(settings.environment).obstacles) {
      const half = Math.sin(o.yaw / 2);
      this.obstacles.push(
        this.world.createCollider(
          rapier.ColliderDesc.cuboid(o.size[0] / 2, o.size[1] / 2, o.size[2] / 2)
            .setTranslation(o.position[0], o.position[1], o.position[2])
            .setRotation({ x: 0, y: half, z: 0, w: Math.cos(o.yaw / 2) })
            .setFriction(GROUND_FRICTION)
            .setFrictionCombineRule(rapier.CoefficientCombineRule.Multiply)
            .setRestitutionCombineRule(rapier.CoefficientCombineRule.Max)
            .setCollisionGroups(ENVIRONMENT_COLLISION_GROUPS),
        ),
      );
    }
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  setGravityEnabled(enabled: boolean): void {
    this.world.gravity = { x: 0, y: enabled ? -EARTH_GRAVITY : 0, z: 0 };
    this.world.forEachRigidBody((b) => b.wakeUp());
  }

  private colliderDesc(shape: ShapeSpec) {
    const C = this.rapier.ColliderDesc;
    switch (shape.kind) {
      case 'cuboid':
        return C.cuboid(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]);
      case 'ball':
        return C.ball(shape.radius);
      case 'cylinder':
        return C.cylinder(shape.halfHeight, shape.radius);
      case 'capsule':
        return C.capsule(shape.halfHeight, shape.radius);
      case 'cone':
        return C.cone(shape.halfHeight, shape.radius);
    }
  }

  /** A single body (environment tests, debug objects). */
  addBody(spec: BodySpec): RigidBody {
    const R = this.rapier;
    const desc = (spec.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic())
      .setTranslation(spec.position[0], spec.position[1], spec.position[2])
      .setRotation(spec.rotation ?? IDENTITY_QUAT);
    if (spec.linvel) desc.setLinvel(spec.linvel[0], spec.linvel[1], spec.linvel[2]);
    const body = this.world.createRigidBody(desc);
    const collider = this.colliderDesc(spec.shape)
      .setFriction(spec.friction ?? 0.5)
      .setRestitution(spec.restitution ?? 0)
      .setCollisionGroups(ROBOT_COLLISION_GROUPS);
    if (spec.mass !== undefined) collider.setMass(spec.mass);
    else collider.setDensity(spec.density ?? 1000);
    this.world.createCollider(collider, body);
    return body;
  }

  /** Create the robot's bodies, colliders and joint constraints. */
  addRobot(assembly: RobotAssembly): void {
    const R = this.rapier;
    this.links = assembly.links.map((spec) => {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(spec.position[0], spec.position[1], spec.position[2])
          .setRotation(spec.rotation)
          .setCanSleep(true)
          // Light damping, as from air and bearings: keeps resting robots calm.
          .setLinearDamping(0.05)
          .setAngularDamping(0.05),
      );
      for (const c of spec.colliders) {
        const desc = this.colliderDesc(c.shape)
          .setTranslation(c.position[0], c.position[1], c.position[2])
          .setRotation(c.rotation)
          .setFriction(c.physics.friction)
          .setRestitution(c.physics.restitution)
          .setMass(c.mass)
          // collision: false → the part keeps its mass but touches nothing.
          .setCollisionGroups(c.physics.collision ? ROBOT_COLLISION_GROUPS : 0);
        this.world.createCollider(desc, body);
      }
      if (spec.colliders.length === 0) body.setAdditionalMass(0.01, true);
      return { spec, body };
    });
    this.joints = assembly.joints.map((spec) => {
      const parent = this.links[spec.parentLink]!.body;
      const child = this.links[spec.childLink]!.body;
      const data =
        spec.type === 'revolute'
          ? R.JointData.revoluteWithAxes(vec(spec.anchor1), vec(spec.anchor2), vec(spec.axis1), vec(spec.axis2))
          : R.JointData.prismatic(vec(spec.anchor1), vec(spec.anchor2), vec(spec.axis1));
      const joint = this.world.createImpulseJoint(data, parent, child, true);
      joint.setContactsEnabled(false);
      if (spec.limits) (joint as ImpulseJoint & { setLimits: (a: number, b: number) => void }).setLimits(spec.limits[0], spec.limits[1]);
      const restRelative = multiplyQuat(conjugateQuat(parent.rotation()), child.rotation());
      return { spec, joint, parent, child, restRelative };
    });
  }

  /** Advance by dt seconds in SUBSTEPS equal substeps. */
  step(dt: number, before?: (substepDt: number) => void): void {
    if (this.disposed) return;
    const h = dt / SUBSTEPS;
    this.world.timestep = h;
    for (let i = 0; i < SUBSTEPS; i++) {
      before?.(h);
      this.world.step();
    }
  }

  /** World direction of a joint axis (parent frame axis rotated into the world). */
  jointAxisWorld(j: JointBody): Vec3 {
    return rotateVec(j.parent.rotation(), j.spec.axis1);
  }

  /** Current joint position: radians (revolute, −π … π) or meters (prismatic). */
  jointPosition(j: JointBody): number {
    if (j.spec.type === 'revolute') {
      const relative = multiplyQuat(conjugateQuat(j.parent.rotation()), j.child.rotation());
      return twistAngle(multiplyQuat(relative, conjugateQuat(j.restRelative)), j.spec.axis1);
    }
    const a1 = this.anchorWorld(j.parent, j.spec.anchor1);
    const a2 = this.anchorWorld(j.child, j.spec.anchor2);
    return dot([a2[0] - a1[0], a2[1] - a1[1], a2[2] - a1[2]], this.jointAxisWorld(j));
  }

  /** Current joint rate: rad/s or m/s, relative to the parent. */
  jointRate(j: JointBody): number {
    const axis = this.jointAxisWorld(j);
    if (j.spec.type === 'revolute') {
      const w1 = v3(j.parent.angvel());
      const w2 = v3(j.child.angvel());
      return dot([w2[0] - w1[0], w2[1] - w1[1], w2[2] - w1[2]], axis);
    }
    const v1 = v3(j.parent.linvel());
    const v2 = v3(j.child.linvel());
    return dot([v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]], axis);
  }

  anchorWorld(body: RigidBody, local: Vec3): Vec3 {
    const p = v3(body.translation());
    const r = rotateVec(body.rotation(), local);
    return [p[0] + r[0], p[1] + r[1], p[2] + r[2]];
  }

  /** Contact points between the robot and the environment (debug view). */
  contactPoints(max = 64): Vec3[] {
    const points: Vec3[] = [];
    const environment = [this.ground, ...this.obstacles];
    for (const link of this.links) {
      for (let i = 0; i < link.body.numColliders(); i++) {
        const collider = link.body.collider(i);
        for (const other of environment) {
          this.world.contactPair(collider, other, (manifold) => {
            for (let k = 0; k < manifold.numSolverContacts() && points.length < max; k++) {
              const p = manifold.solverContactPoint(k);
              if (p) points.push(v3(p));
            }
          });
        }
      }
    }
    return points;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.links = [];
    this.joints = [];
    // Frees every body, collider and joint owned by the world.
    this.world.free();
  }
}
