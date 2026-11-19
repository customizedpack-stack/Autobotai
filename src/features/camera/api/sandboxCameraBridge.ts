import { useSceneStore } from '../../../stores/sceneStore';
import { log } from '../../../utils/logger';
import { cancelCaptures, capture, CameraError, subscribe, unsubscribe } from '../cameraManager';
import { CAPTURE_FORMATS, cameraState, frameBytes, listCameras, requireCamera, toFrame, type CameraFrame, type CaptureFormat } from './cameraApi';

/**
 * Sandbox side of the camera API, one per program run (owned by the HostBridge), Phase 8.
 *
 * Limits, all per run:
 * - captures per second (`maxCameraCapturesPerSecond`) and captures waiting at once
 *   (`maxCameraPendingCaptures`);
 * - camera subscriptions (`maxCameraSubscriptions`), each delivering at most
 *   `maxCameraHz` frames per second (newest frame wins, nothing while paused);
 * - image bytes per second (`maxCameraBytesPerSecond`, captures and subscription frames
 *   together). A capture above it is rejected; a subscription frame above it is skipped.
 * Image size is bounded by the resolution presets (at most 640 × 480 × 4 bytes).
 * Everything ends when the run ends (Stop, finish, error, Reset Robot, worker terminated):
 * subscriptions are removed and waiting captures are dropped, so nothing keeps rendering.
 */

export type CameraOp = 'camera.list' | 'camera.state' | 'camera.capture' | 'camera.subscribe' | 'camera.unsubscribe';

export interface CameraPush {
  v: 1;
  kind: 'camera';
  subscriptionId: number;
  frame: CameraFrame;
}

export interface SandboxCameraLimits {
  maxCameraCapturesPerSecond: number;
  maxCameraPendingCaptures: number;
  maxCameraSubscriptions: number;
  maxCameraHz: number;
  maxCameraBytesPerSecond: number;
}

export const DEFAULT_CAMERA_LIMITS: SandboxCameraLimits = {
  maxCameraCapturesPerSecond: 5,
  maxCameraPendingCaptures: 2,
  maxCameraSubscriptions: 2,
  maxCameraHz: 5,
  maxCameraBytesPerSecond: 8_000_000,
};

export class SandboxCameraBridge {
  private readonly sessionId: string;
  private readonly projectId: string | null;
  private readonly limits: SandboxCameraLimits;
  private readonly push: (message: CameraPush) => void;
  private readonly now: () => number;
  /** Bridge subscription id → manager subscription id. */
  private readonly subscriptions = new Map<number, { managerId: number; cameraId: string; format: CaptureFormat }>();
  private readonly captureTimes: number[] = [];
  private readonly bytes: { t: number; n: number }[] = [];
  private pending = 0;
  private nextId = 1;
  private paused = false;
  private disposed = false;
  private dropped = 0;

  constructor(options: { sessionId: string; limits?: Partial<SandboxCameraLimits>; push: (message: CameraPush) => void; now?: () => number }) {
    this.sessionId = options.sessionId;
    this.limits = { ...DEFAULT_CAMERA_LIMITS, ...(options.limits ?? {}) };
    this.push = options.push;
    this.now = options.now ?? (() => performance.now());
    this.projectId = useSceneStore.getState().projectId;
  }

  get activeSubscriptions(): number {
    return this.subscriptions.size;
  }

  get pendingCaptures(): number {
    return this.pending;
  }

  /** Subscription frames skipped because of the byte limit (diagnostics). */
  get droppedFrames(): number {
    return this.dropped;
  }

  handle(op: CameraOp, args: Record<string, unknown>): Promise<unknown> {
    try {
      if (this.disposed) throw new CameraError('The program is no longer running.');
      if (useSceneStore.getState().projectId !== this.projectId) throw new CameraError('The robot project changed. Run the program again.');
      switch (op) {
        case 'camera.list':
          return Promise.resolve(listCameras());
        case 'camera.state':
          return Promise.resolve(cameraState(args.cameraId as string));
        case 'camera.capture':
          return this.capture(args.cameraId as string, this.format(args.format));
        case 'camera.subscribe':
          return Promise.resolve(this.subscribe(args.cameraId as string, args.maxHz as number | undefined, this.format(args.format)));
        case 'camera.unsubscribe':
          return Promise.resolve(this.unsubscribe(args.subscriptionId as number));
      }
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new CameraError(String(error)));
    }
  }

  private format(value: unknown): CaptureFormat {
    if (value === undefined) return 'rgba';
    if (!CAPTURE_FORMATS.includes(value as CaptureFormat)) throw new CameraError(`Unknown image format "${String(value).slice(0, 20)}". Use "rgba", "gray" or "none".`);
    return value as CaptureFormat;
  }

  private bytesInLastSecond(): number {
    const now = this.now();
    while (this.bytes.length > 0 && now - this.bytes[0]!.t >= 1000) this.bytes.shift();
    return this.bytes.reduce((sum, b) => sum + b.n, 0);
  }

  private async capture(cameraId: string, format: CaptureFormat): Promise<CameraFrame> {
    const config = requireCamera(cameraId);
    if (!config.enabled) throw new CameraError(`Camera "${cameraId}" is disabled. Enable it in Build Mode (Inspector → Sensors).`);
    const now = this.now();
    while (this.captureTimes.length > 0 && now - this.captureTimes[0]! >= 1000) this.captureTimes.shift();
    if (this.captureTimes.length >= this.limits.maxCameraCapturesPerSecond) {
      throw new CameraError(`Too many camera captures: the limit is ${this.limits.maxCameraCapturesPerSecond} per second. Add a wait, or use subscribe().`);
    }
    if (this.pending >= this.limits.maxCameraPendingCaptures) {
      throw new CameraError(`Too many captures waiting: the limit is ${this.limits.maxCameraPendingCaptures}. Await each capture before the next one.`);
    }
    const size = frameBytes(config, format);
    if (this.bytesInLastSecond() + size > this.limits.maxCameraBytesPerSecond) {
      throw new CameraError(`Camera image limit reached: at most ${(this.limits.maxCameraBytesPerSecond / 1e6).toFixed(1)} MB of images per second. Use a lower resolution, format "gray" or "none", or wait.`);
    }
    this.captureTimes.push(now);
    this.pending += 1;
    try {
      const image = await capture(cameraId, this);
      if (this.disposed) throw new CameraError('The program is no longer running.');
      const frame = toFrame(image, format);
      this.bytes.push({ t: this.now(), n: frame.data?.length ?? 0 });
      return frame;
    } finally {
      this.pending -= 1;
    }
  }

  private subscribe(cameraId: string, maxHz: number | undefined, format: CaptureFormat): { subscriptionId: number; cameraId: string; maxHz: number } {
    const config = requireCamera(cameraId);
    if (!config.enabled) throw new CameraError(`Camera "${cameraId}" is disabled. Enable it in Build Mode (Inspector → Sensors).`);
    if (this.subscriptions.size >= this.limits.maxCameraSubscriptions) {
      throw new CameraError(`Too many camera subscriptions: the limit is ${this.limits.maxCameraSubscriptions} per program. Unsubscribe one first.`);
    }
    if (maxHz !== undefined && !(maxHz > 0)) throw new CameraError('maxHz must be above 0.');
    const hz = Math.min(maxHz ?? 2, this.limits.maxCameraHz, config.rateHz);
    const id = this.nextId++;
    const managerId = subscribe(cameraId, hz, (image) => {
      if (this.disposed || this.paused) return;
      if (useSceneStore.getState().projectId !== this.projectId) {
        this.unsubscribe(id);
        return;
      }
      const size = image.width * image.height * (format === 'rgba' ? 4 : format === 'gray' ? 1 : 0);
      if (this.bytesInLastSecond() + size > this.limits.maxCameraBytesPerSecond) {
        this.dropped += 1;
        return;
      }
      const frame = toFrame(image, format);
      this.bytes.push({ t: this.now(), n: frame.data?.length ?? 0 });
      this.push({ v: 1, kind: 'camera', subscriptionId: id, frame });
    });
    this.subscriptions.set(id, { managerId, cameraId, format });
    log.info('code', `Program subscribed to camera "${cameraId}" (up to ${Number(hz.toFixed(1))} frames per second, ${format}).`, { sessionId: this.sessionId });
    return { subscriptionId: id, cameraId, maxHz: hz };
  }

  private unsubscribe(id: number): { ok: boolean } {
    const sub = this.subscriptions.get(id);
    if (!sub) return { ok: false };
    unsubscribe(sub.managerId);
    this.subscriptions.delete(id);
    return { ok: true };
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** End every subscription and drop waiting captures (Stop, finish, error, worker terminated). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.subscriptions.keys()]) this.unsubscribe(id);
    cancelCaptures(this, 'The program is no longer running.');
  }
}
