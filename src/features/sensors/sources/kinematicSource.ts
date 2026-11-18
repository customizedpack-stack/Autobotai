import type { RobotJoint } from '../../../types/joint';
import type { SceneObject, Vec3 } from '../../../types/scene';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { EARTH_GRAVITY } from '../../physics/physicsConfig';
import { quatFromMatrix } from '../../physics/engine/quat';
import { posedChildTransform } from '../../robot-model/kinematics';
import { multiply, type Mat4 } from '../../robot-model/mat4';
import { transformToMatrix } from '../../robot-model/transforms';
import type { SensorSource } from '../core/sensorTypes';

/**
 * Sensor source for the Kinematic engine: part poses from the kinematic runtime
 * state (driven root pose + joint positions), the same poses the viewport draws.
 * There is no physical world, so ray casts are not available (castRay → undefined),
 * velocities are computed by the sensors from successive poses, and gravity is the
 * standard 9.81 m/s² (the kinematic robot always rests on the ground).
 */
export type KinematicSensorSource = SensorSource & { bump: () => void };

export function createKinematicSensorSource(): KinematicSensorSource {
  let cache: { objects: readonly SceneObject[]; joints: readonly RobotJoint[]; byId: Map<string, SceneObject>; jointByChild: Map<string, RobotJoint> } | null = null;
  let generation = 0;
  const model = () => {
    const { objects, joints } = useSceneStore.getState();
    if (!cache || cache.objects !== objects || cache.joints !== joints) {
      cache = { objects, joints, byId: new Map(objects.map((o) => [o.id, o])), jointByChild: new Map(joints.map((j) => [j.childId, j])) };
    }
    return cache;
  };
  const worldOf = (id: string, guard = 0): Mat4 | null => {
    const { byId, jointByChild } = model();
    const object = byId.get(id);
    if (!object || guard > 200) return null;
    const { rootPoses, jointPositions } = useRobotStateStore.getState();
    const base = rootPoses[id] ? { ...object, transform: rootPoses[id]! } : object;
    const joint = jointByChild.get(id);
    const q = joint ? jointPositions[joint.id] ?? 0 : 0;
    const local = transformToMatrix(joint && q !== 0 ? posedChildTransform(base, joint, q) : base.transform);
    if (!object.parentId) return local;
    const parent = worldOf(object.parentId, guard + 1);
    return parent ? multiply(parent, local) : local;
  };
  return {
    kind: 'kinematic',
    generation: () => generation,
    partPose(partId) {
      const m = worldOf(partId);
      return m ? { position: [m[12]!, m[13]!, m[14]!] as Vec3, rotation: quatFromMatrix(m) } : null;
    },
    pointVelocity: () => null,
    jointAngle(jointId) {
      if (!model().joints.some((j) => j.id === jointId)) return null;
      return useRobotStateStore.getState().jointPositions[jointId] ?? 0;
    },
    jointRate: () => null,
    castRay: () => undefined,
    gravity: () => [0, -EARTH_GRAVITY, 0],
    /** A kinematic reset makes the robot jump to its design pose: histories must restart. */
    bump: () => {
      generation += 1;
    },
  };
}
