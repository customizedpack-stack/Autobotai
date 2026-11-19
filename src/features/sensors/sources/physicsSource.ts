import type { Vec3 } from '../../../types/scene';
import { multiplyQuat, rotateVec } from '../../physics/engine/quat';
import type { PhysicsController } from '../../physics/integration/physicsController';
import { EARTH_GRAVITY, SENSOR_RAY_GROUPS } from '../../physics/physicsConfig';
import type { SensorSource } from '../core/sensorTypes';

/**
 * Sensor source for the Physics engine: reads the Rapier bodies of the running
 * simulation (read-only). Always reads the controller's CURRENT world, so a
 * rebuild (Reset, environment change) is picked up; `generation` tells the
 * sensor manager to restart its histories.
 */
export function createPhysicsSensorSource(controller: PhysicsController, gravityEnabled: () => boolean): SensorSource {
  const v3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];
  const linkFor = (partId: string) => {
    const world = controller.physicsWorld;
    const assembly = controller.robotAssembly;
    if (!world || world.isDisposed || !assembly) return null;
    const index = assembly.linkOf.get(partId);
    const frame = assembly.partFrames.get(partId);
    const link = index === undefined ? undefined : world.links[index];
    return link && frame ? { body: link.body, frame } : null;
  };
  const jointFor = (jointId: string) => {
    const world = controller.physicsWorld;
    if (!world || world.isDisposed) return null;
    const joint = world.joints.find((j) => j.spec.jointId === jointId);
    return joint ? { world, joint } : null;
  };
  return {
    kind: 'physics',
    generation: () => controller.generation,
    partPose(partId) {
      const found = linkFor(partId);
      if (!found) return null;
      const t = v3(found.body.translation());
      const r = found.body.rotation();
      const offset = rotateVec(r, found.frame.position);
      return { position: [t[0] + offset[0], t[1] + offset[1], t[2] + offset[2]], rotation: multiplyQuat(r, found.frame.rotation) };
    },
    pointVelocity(partId, point) {
      const found = linkFor(partId);
      if (!found) return null;
      return { linear: v3(found.body.velocityAtPoint({ x: point[0], y: point[1], z: point[2] })), angular: v3(found.body.angvel()) };
    },
    jointAngle(jointId) {
      const found = jointFor(jointId);
      return found ? found.world.jointPosition(found.joint) : null;
    },
    jointRate(jointId) {
      const found = jointFor(jointId);
      return found ? found.world.jointRate(found.joint) : null;
    },
    castRay(origin, direction, maxDistance, ignoreGround) {
      const world = controller.physicsWorld;
      if (!world || world.isDisposed) return null;
      const ray = new world.rapier.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: direction[0], y: direction[1], z: direction[2] });
      const hit = world.world.castRayAndGetNormal(ray, maxDistance, true, undefined, SENSOR_RAY_GROUPS, ignoreGround ? world.ground : undefined);
      if (!hit) return null;
      const d = hit.timeOfImpact;
      return { distance: d, point: [origin[0] + direction[0] * d, origin[1] + direction[1] * d, origin[2] + direction[2] * d], normal: v3(hit.normal) };
    },
    gravity: () => (gravityEnabled() ? [0, -EARTH_GRAVITY, 0] : [0, 0, 0]),
  };
}
