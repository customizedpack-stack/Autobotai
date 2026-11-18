import type { Vec3 } from '../../../types/scene';
import type { DistanceSensorConfig } from '../../../types/sensor';
import { rotateVec } from '../../physics/engine/quat';
import { sensorWorldPose } from '../core/mount';
import { xyz, type DistanceRay, type DistanceReading, type ReadingBase, type SensorSource } from '../core/sensorTypes';

/**
 * Distance sensor sampling: physics-world ray casts from the sensor's world pose.
 *
 * - The sensor looks along its local +X axis. With several rays, they are spread
 *   evenly across the field of view in the sensor's XZ plane, from left (+angle) to right.
 * - No hit within maxRange: distance = null, detected = false, status 'no-hit' (never 0).
 * - A hit closer than minRange: status 'too-close', detected = true, distance = null.
 * - The robot's own parts are never hit (collision groups); the ground is skipped
 *   when ignoreGround is set.
 */

/** Ray angles from the sensor's +X axis, left to right (rad). */
export function rayAngles(rays: number, fov: number): number[] {
  if (rays <= 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < rays; i++) out.push(fov / 2 - (i * fov) / (rays - 1));
  return out;
}

export function sampleDistance(config: DistanceSensorConfig, source: SensorSource, base: Omit<ReadingBase, 'type' | 'valid'>): DistanceReading {
  const empty = (error: string, origin: Vec3 = [0, 0, 0], direction: Vec3 = [1, 0, 0]): DistanceReading => ({
    ...base,
    type: 'distance',
    valid: false,
    error,
    distance: null,
    detected: false,
    status: 'no-hit',
    minRange: config.minRange,
    maxRange: config.maxRange,
    origin: xyz(origin),
    direction: xyz(direction),
    rays: [],
  });
  const pose = sensorWorldPose(source, config.partId, config.position, config.rotation);
  if ('error' in pose) return empty(pose.error);
  const center = rotateVec(pose.rotation, [1, 0, 0]);
  const rays: DistanceRay[] = [];
  for (const angle of rayAngles(config.rays, config.fov)) {
    const direction = rotateVec(pose.rotation, [Math.cos(angle), 0, -Math.sin(angle)]);
    const hit = source.castRay(pose.position, direction, config.maxRange, config.ignoreGround);
    if (hit === undefined) return empty('The distance sensor needs the Physics engine: Kinematic mode has no physical world to measure.', pose.position, center);
    const dir = xyz(direction);
    if (hit === null || hit.distance > config.maxRange) rays.push({ angle, direction: dir, distance: null, detected: false, status: 'no-hit' });
    else if (hit.distance < config.minRange) rays.push({ angle, direction: dir, distance: null, detected: true, status: 'too-close', hitPoint: xyz(hit.point), hitNormal: xyz(hit.normal) });
    else rays.push({ angle, direction: dir, distance: hit.distance, detected: true, status: 'hit', hitPoint: xyz(hit.point), hitNormal: xyz(hit.normal) });
  }
  let nearest: DistanceRay | null = null;
  for (const r of rays) if (r.status === 'hit' && (!nearest || r.distance! < nearest.distance!)) nearest = r;
  const tooClose = rays.some((r) => r.status === 'too-close');
  return {
    ...base,
    type: 'distance',
    valid: true,
    distance: nearest?.distance ?? null,
    detected: tooClose || nearest !== null,
    status: tooClose ? 'too-close' : nearest ? 'hit' : 'no-hit',
    minRange: config.minRange,
    maxRange: config.maxRange,
    ...(nearest?.hitPoint ? { hitPoint: nearest.hitPoint, hitNormal: nearest.hitNormal } : {}),
    origin: xyz(pose.position),
    direction: xyz(center),
    rays,
  };
}
