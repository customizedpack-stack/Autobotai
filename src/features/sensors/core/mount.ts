import type { Vec3 } from '../../../types/scene';
import { compose } from '../../robot-model/mat4';
import { multiplyQuat, quatFromMatrix, rotateVec, type Quat } from '../../physics/engine/quat';
import type { SensorSource } from './sensorTypes';

/** Rotation of a mount given as Euler XYZ angles (same convention as part transforms). */
export function mountQuat(rotation: Vec3): Quat {
  return quatFromMatrix(compose([0, 0, 0], rotation, [1, 1, 1]));
}

const finiteVec = (v: Vec3) => v.every(Number.isFinite);
const finiteQuat = (q: Quat) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);

/**
 * World pose of a sensor mounted on a part: the part pose, then the mount offset
 * (meters, in the part frame without scale) and the mount rotation.
 */
export function sensorWorldPose(source: SensorSource, partId: string, position: Vec3, rotation: Vec3): { position: Vec3; rotation: Quat } | { error: string } {
  const part = source.partPose(partId);
  if (!part) return { error: 'The part this sensor is mounted on is not in the simulation.' };
  const offset = rotateVec(part.rotation, position);
  const pose = { position: [part.position[0] + offset[0], part.position[1] + offset[1], part.position[2] + offset[2]] as Vec3, rotation: multiplyQuat(part.rotation, mountQuat(rotation)) };
  if (!finiteVec(pose.position) || !finiteQuat(pose.rotation)) return { error: 'The sensor pose is not a valid number (check the mount position and rotation).' };
  return pose;
}
