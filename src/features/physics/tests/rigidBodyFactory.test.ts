import { describe, expect, it } from 'vitest';
import { jointByName, openExplorer, byName } from '../../controls/testUtils';
import { migrateProject } from '../../robot-model/schema';
import { robotModel } from '../../robot-model/robotModelConnector';
import { useSceneStore } from '../../../stores/sceneStore';
import { resolvePartPhysics, sanitizePartPhysics, checkPhysicsValue } from '../bodies/materials';
import { buildRobotAssembly } from '../bodies/robotAssembly';
import { shapeFor, shapeVolume } from '../bodies/shapes';
import { PASSIVE_CASTER_FRICTION } from '../physicsConfig';

const assembly = () => {
  const { objects, joints, actuators } = useSceneStore.getState();
  return buildRobotAssembly(objects, joints, actuators);
};

describe('robot → rigid bodies and colliders', () => {
  it('Explorer Bot: chassis body with merged parts, two jointed wheel bodies, fixed sensor merged', () => {
    openExplorer(false);
    const a = assembly();
    expect(a.links.map((l) => l.name)).toEqual(['Chassis', 'Left Wheel', 'Right Wheel']);
    const chassis = a.links[0]!;
    expect(chassis.colliders.map((c) => c.name).sort()).toEqual(['Caster Ball', 'Chassis', 'Controller Board', 'Distance Sensor', 'Left Motor', 'Right Motor', 'Top Plate'].sort());
    expect(a.mergedFixedJoints).toHaveLength(1);
    expect(a.joints.map((j) => j.name)).toEqual(['Left Wheel Joint', 'Right Wheel Joint']);
    // DC-motor wheels rotate continuously (no limits), as in Phase 3.
    expect(a.joints.every((j) => j.limits === null && j.actuator?.type === 'dcMotor')).toBe(true);
    expect(a.issues).toEqual([]);
    expect(a.totalMass).toBeGreaterThan(1);
    expect(a.totalMass).toBeLessThan(10);
  });

  it('caster ball (a wheel part without a joint) gets low friction; drive wheels grip', () => {
    openExplorer(false);
    const a = assembly();
    const caster = a.links[0]!.colliders.find((c) => c.name === 'Caster Ball')!;
    expect(caster.physics.friction).toBe(PASSIVE_CASTER_FRICTION);
    expect(caster.physics.source.friction).toBe('caster');
    expect(a.links[1]!.colliders[0]!.physics.friction).toBe(1);
  });

  it('collider shapes follow the geometry and the world scale (Y-axis primitives, like rendering)', () => {
    expect(shapeFor({ shape: 'box', size: [0.4, 0.1, 0.26] }, [1, 2, 1])).toEqual({ kind: 'cuboid', halfExtents: [0.2, 0.1, 0.13] });
    expect(shapeFor({ shape: 'cylinder', radius: 0.07, height: 0.035 }, [1, 1, 1])).toEqual({ kind: 'cylinder', halfHeight: 0.0175, radius: 0.07 });
    expect(shapeFor({ shape: 'sphere', radius: 0.1 }, [1, 3, 2])).toEqual({ kind: 'ball', radius: 0.30000000000000004 });
    expect(shapeFor({ shape: 'capsule', radius: 0.05, length: 0.4 }, [1, 1, 1])).toEqual({ kind: 'capsule', halfHeight: 0.2, radius: 0.05 });
    expect(shapeVolume({ kind: 'cuboid', halfExtents: [0.5, 0.5, 0.5] })).toBeCloseTo(1, 9);
    expect(shapeVolume({ kind: 'ball', radius: 1 })).toBeCloseTo((4 / 3) * Math.PI, 9);
  });

  it('wheel collider pose: the cylinder axis lies along the joint axis (world Z)', () => {
    openExplorer(false);
    const wheel = assembly().links[1]!;
    const q = wheel.rotation;
    // Local +Y (cylinder axis) rotated into the world should be ±Z.
    const y: [number, number, number] = [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)];
    expect(Math.abs(y[2])).toBeCloseTo(1, 6);
  });

  it('uses mass, friction, restitution and collision overrides; defaults otherwise', () => {
    openExplorer(false);
    const chassis = byName('Chassis');
    expect(resolvePartPhysics(chassis)).toMatchObject({ mass: null, density: 250, friction: 0.5, collision: true, source: { mass: 'auto' } });
    const objects = useSceneStore.getState().objects.map((o) => (o.id === chassis.id ? { ...o, physics: { mass: 2, friction: 0.3, restitution: 0.4, collision: false } } : o));
    const { joints, actuators } = useSceneStore.getState();
    const a = buildRobotAssembly(objects, joints, actuators);
    const c = a.links[0]!.colliders.find((x) => x.name === 'Chassis')!;
    expect(c.mass).toBe(2);
    expect(c.physics).toMatchObject({ friction: 0.3, restitution: 0.4, collision: false, source: { mass: 'set', friction: 'set' } });
  });

  it('Robotic Arm: revolute joints keep their limits; joint markers are not physical', () => {
    openExplorer(false, 'robotic-arm');
    const a = assembly();
    expect(a.links.map((l) => l.name)).toEqual(['Base', 'Upper Arm', 'Forearm', 'Gripper']);
    const elbow = a.joints.find((j) => j.name === 'Elbow')!;
    expect(elbow.limits![0]).toBeCloseTo((-135 * Math.PI) / 180, 9);
    expect(elbow.limits![1]).toBeCloseTo((135 * Math.PI) / 180, 9);
    const names = a.links.flatMap((l) => l.colliders.map((c) => c.name));
    expect(names.some((n) => n.endsWith('Joint'))).toBe(false);
    // Anchor of the elbow: at the world origin (0, 0.51, 0), expressed in each link frame.
    const fore = a.links[elbow.childLink]!;
    expect(elbow.anchor2[0] + fore.position[0]).toBeCloseTo(0, 6);
    expect(elbow.anchor2[1] + fore.position[1]).toBeCloseTo(0.51, 6);
  });

  it('prismatic joints map to prismatic constraints with limits', () => {
    openExplorer(false, 'robotic-arm');
    const wrist = jointByName('Wrist');
    expect(robotModel.updateJoint(wrist.id, { type: 'prismatic', limits: { lower: -0.05, upper: 0.05 } }).ok).toBe(true);
    const j = assembly().joints.find((x) => x.name === 'Wrist')!;
    expect(j.type).toBe('prismatic');
    expect(j.limits).toEqual([-0.05, 0.05]);
  });

  it('saved physics values: valid kept, invalid dropped with a warning on load; old projects have none', () => {
    const warnings: string[] = [];
    expect(sanitizePartPhysics({ mass: 1.5, friction: 5, restitution: 0.2, collision: 'yes', extra: 1 }, 'Part', warnings)).toEqual({ mass: 1.5, restitution: 0.2 });
    expect(warnings).toHaveLength(2);
    expect(sanitizePartPhysics(undefined, 'Part', [])).toBeUndefined();
    expect(checkPhysicsValue('friction', 3)).toBe('friction must be between 0 and 2.');
    expect(checkPhysicsValue('mass', 1)).toBeNull();
    const project = openExplorer(false);
    const raw = JSON.parse(JSON.stringify(project));
    raw.objects[0].physics = { mass: 3, friction: -1 };
    const migrated = migrateProject(raw);
    expect(migrated.project.schemaVersion).toBe(3);
    expect(migrated.project.objects[0]!.physics).toEqual({ mass: 3 });
    expect(migrated.warnings.some((w) => w.includes('friction'))).toBe(true);
    expect(migrated.project.objects[1]!.physics).toBeUndefined();
    expect(migrated.project.objects[1]!.transform).toEqual(project.objects[1]!.transform);
  });
});
