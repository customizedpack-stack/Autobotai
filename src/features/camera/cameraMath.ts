import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CAMERA_RESOLUTIONS, type CameraResolution, type CameraSensorConfig } from '../../types/sensor';
import type { Vec3 } from '../../types/scene';
import { multiplyQuat, rotateVec, type Quat } from '../physics/engine/quat';
import { mountQuat } from '../sensors/core/mount';

/**
 * Camera optics and pose (Phase 8). Pure functions shared by the renderer, the API and
 * the tests, so what the tests check is exactly what the renderer uses.
 *
 * Convention: like the distance sensor, a camera looks along its mount's local +X axis,
 * with +Y up. A Three.js camera looks along its local −Z, so the camera's world rotation
 * is part ∘ mount ∘ LOOK_X, where LOOK_X turns −Z onto +X (−90° about Y).
 */

export const LOOK_X: Quat = { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };

export function resolutionSize(resolution: CameraResolution): { width: number; height: number } {
  const [width, height] = CAMERA_RESOLUTIONS[resolution];
  return { width, height };
}

export function aspectOf(resolution: CameraResolution): number {
  const { width, height } = resolutionSize(resolution);
  return width / height;
}

/** Vertical field of view (rad) from the horizontal one and the aspect ratio. */
export function verticalFov(hFov: number, aspect: number): number {
  return 2 * Math.atan(Math.tan(hFov / 2) / aspect);
}

export interface CameraPose {
  /** World position of the camera (m). */
  position: Vec3;
  /** World rotation of the Three.js camera (looks along its −Z). */
  rotation: Quat;
  /** World direction the camera looks at (unit vector). */
  forward: Vec3;
  /** World up direction of the image (unit vector). */
  up: Vec3;
}

/** World pose of a camera from the pose of the part it is mounted on. */
export function cameraPoseFromPart(part: { position: Vec3; rotation: Quat }, config: Pick<CameraSensorConfig, 'position' | 'rotation'>): CameraPose | { error: string } {
  const offset = rotateVec(part.rotation, config.position);
  const position: Vec3 = [part.position[0] + offset[0], part.position[1] + offset[1], part.position[2] + offset[2]];
  const mount = multiplyQuat(part.rotation, mountQuat(config.rotation));
  const rotation = multiplyQuat(mount, LOOK_X);
  const forward = rotateVec(mount, [1, 0, 0]);
  const up = rotateVec(mount, [0, 1, 0]);
  const values = [...position, rotation.x, rotation.y, rotation.z, rotation.w];
  if (!values.every(Number.isFinite)) return { error: 'The camera pose is not a valid number (check the mount position and rotation).' };
  return { position, rotation, forward, up };
}

/** Set a Three.js camera from a camera configuration and pose (the renderer and the tests use this). */
export function applyCamera(camera: PerspectiveCamera, config: Pick<CameraSensorConfig, 'hFov' | 'resolution' | 'near' | 'far'>, pose: CameraPose): PerspectiveCamera {
  const aspect = aspectOf(config.resolution);
  camera.fov = (verticalFov(config.hFov, aspect) * 180) / Math.PI;
  camera.aspect = aspect;
  camera.near = config.near;
  camera.far = config.far;
  camera.position.set(...pose.position);
  camera.quaternion.copy(new Quaternion(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** Is a world point inside the camera's view (frustum and clipping range)? */
export function inView(camera: PerspectiveCamera, point: Vec3): boolean {
  const p = new Vector3(...point).project(camera);
  return p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
}

/** Image statistics computed on the host (no recognition, just numbers). */
export function imageStats(data: Uint8ClampedArray | Uint8Array, channels: 1 | 4): { brightness: number; meanColor: { r: number; g: number; b: number } } {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / channels;
  if (pixels === 0) return { brightness: 0, meanColor: { r: 0, g: 0, b: 0 } };
  if (channels === 1) {
    for (let i = 0; i < data.length; i++) r += data[i]!;
    const v = r / pixels;
    return { brightness: Number(((v / 255) * 100).toFixed(2)), meanColor: { r: Math.round(v), g: Math.round(v), b: Math.round(v) } };
  }
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  const mean = { r: r / pixels, g: g / pixels, b: b / pixels };
  const luma = 0.2126 * mean.r + 0.7152 * mean.g + 0.0722 * mean.b;
  return { brightness: Number(((luma / 255) * 100).toFixed(2)), meanColor: { r: Math.round(mean.r), g: Math.round(mean.g), b: Math.round(mean.b) } };
}

/** RGBA → one gray byte per pixel (ITU-R BT.709 luma). */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = Math.round(0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!);
  return out;
}
