import { useSceneStore } from '../../../stores/sceneStore';
import type { CameraSensorConfig } from '../../../types/sensor';
import { aspectOf, imageStats, resolutionSize, toGray, verticalFov } from '../cameraMath';
import { cameraConfig, cameraConfigs, CameraError, rendererAttached, type CameraImage } from '../cameraManager';
import { useCameraStore } from '../cameraStore';

/**
 * Host-side camera API (C3, Phase 8). The only way programs reach cameras: the sandbox
 * bridge calls these functions, which return plain, serializable data. Programs never get
 * Three.js objects, WebGL contexts, render targets, DOM elements or application stores.
 */

export type CaptureFormat = 'rgba' | 'gray' | 'none';
export const CAPTURE_FORMATS: readonly CaptureFormat[] = ['rgba', 'gray', 'none'];

/** What a program may know about a camera (configuration only). */
export interface CameraInfo {
  id: string;
  name: string;
  enabled: boolean;
  partId: string;
  resolution: string;
  width: number;
  height: number;
  /** Horizontal and vertical field of view (rad). */
  hFov: number;
  vFov: number;
  near: number;
  far: number;
  rateHz: number;
}

export interface CameraState extends CameraInfo {
  status: 'idle' | 'live' | 'disabled' | 'error';
  frames: number;
  fps: number;
  /** False when the 3D view is not open, so no image can be made. */
  rendererReady: boolean;
  error?: string;
}

/** One image as a program receives it. */
export interface CameraFrame {
  cameraId: string;
  width: number;
  height: number;
  format: CaptureFormat;
  /** rgba: 4 bytes per pixel; gray: 1 byte per pixel; none: null. Rows top to bottom. */
  data: Uint8ClampedArray | null;
  /** Mean brightness, 0 … 100. */
  brightness: number;
  /** Mean color, 0 … 255 per channel. */
  meanColor: { r: number; g: number; b: number };
  frame: number;
  timestamp: number;
  source: CameraImage['source'];
}

export function cameraInfo(c: CameraSensorConfig): CameraInfo {
  const { width, height } = resolutionSize(c.resolution);
  return { id: c.id, name: c.name, enabled: c.enabled, partId: c.partId, resolution: c.resolution, width, height, hFov: c.hFov, vFov: verticalFov(c.hFov, aspectOf(c.resolution)), near: c.near, far: c.far, rateHz: c.rateHz };
}

export function listCameras(): CameraInfo[] {
  return cameraConfigs().map(cameraInfo);
}

/** The camera with this id, or a clear error naming the cameras that exist. */
export function requireCamera(cameraId: string): CameraSensorConfig {
  const config = cameraConfig(cameraId);
  if (config) return config;
  const known = cameraConfigs().map((c) => `"${c.id}"`);
  const other = useSceneStore.getState().sensors.find((s) => s.id === cameraId);
  if (other) throw new CameraError(`"${cameraId}" is a ${other.type} sensor, not a camera. Use robotSensors for it.`);
  throw new CameraError(known.length ? `No camera with the id "${cameraId}". This robot's cameras: ${known.join(', ')}.` : `No camera with the id "${cameraId}". This robot has no camera: add one in Build Mode (Inspector → Sensors → Camera).`);
}

export function cameraState(cameraId: string): CameraState {
  const config = requireCamera(cameraId);
  const ui = useCameraStore.getState().cameras[cameraId];
  return {
    ...cameraInfo(config),
    status: !config.enabled ? 'disabled' : (ui?.status ?? 'idle'),
    frames: ui?.frames ?? 0,
    fps: ui?.fps ?? 0,
    rendererReady: rendererAttached(),
    ...(ui?.error ? { error: ui.error } : {}),
  };
}

/** Bytes a capture of this camera produces in a format (for the memory limits, before rendering). */
export function frameBytes(config: CameraSensorConfig, format: CaptureFormat): number {
  const { width, height } = resolutionSize(config.resolution);
  return format === 'rgba' ? width * height * 4 : format === 'gray' ? width * height : 0;
}

/** Turn a rendered image into what the program receives (a fresh copy it owns). */
export function toFrame(image: CameraImage, format: CaptureFormat): CameraFrame {
  const stats = imageStats(image.data, 4);
  const data = format === 'rgba' ? new Uint8ClampedArray(image.data) : format === 'gray' ? toGray(image.data) : null;
  return { cameraId: image.cameraId, width: image.width, height: image.height, format, data, brightness: stats.brightness, meanColor: stats.meanColor, frame: image.frame, timestamp: image.timestamp, source: image.source };
}
