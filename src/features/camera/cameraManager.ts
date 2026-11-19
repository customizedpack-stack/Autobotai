import { bus } from '../../core/bus/connectorBus';
import { useSceneStore } from '../../stores/sceneStore';
import type { CameraSensorConfig } from '../../types/sensor';
import { log } from '../../utils/logger';
import { quatFromMatrix } from '../physics/engine/quat';
import { indexObjects, worldMatrix } from '../robot-model/transforms';
import { currentSensorSource } from '../sensors/core/sensorManager';
import { cameraPoseFromPart, resolutionSize, type CameraPose } from './cameraMath';
import { useCameraStore, type CameraStatus } from './cameraStore';

/**
 * Camera manager (Phase 8): the single owner of camera frames.
 *
 * - No loop and no physics of its own. The viewport's renderer (inside the existing
 *   React Three Fiber canvas) calls frame() once per animation frame. The manager decides
 *   which cameras are due and asks the renderer for those images only.
 * - A camera is rendered only while something needs it: an open, unpaused Camera Monitor,
 *   a program subscription, or a pending capture. Otherwise nothing is rendered at all.
 * - Each camera renders at most `rateHz` frames per second, and at most
 *   `maxRendersPerFrame` cameras are rendered in one animation frame (captures go first).
 * - Poses come from the attached sensor source (kinematic or physics, the same live poses
 *   as the other sensors), or from the design pose in Build Mode and the Environment Editor.
 * - Render resources (render targets) belong to the renderer. The manager tells it to
 *   release them when a camera is removed, stops being used, or the project closes.
 */

export interface CameraImage {
  cameraId: string;
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, rows from top to bottom. */
  data: Uint8ClampedArray<ArrayBuffer>;
  /** performance.now() when rendered. */
  timestamp: number;
  /** Frame counter of this camera (since the project opened). */
  frame: number;
  /** Where the pose came from. */
  source: 'physics' | 'kinematic' | 'design';
}

/** Implemented by the viewport (see render/CameraRenderer.tsx). */
export interface CameraRendererBackend {
  /** Render one camera now and read back its pixels. Synchronous, called from frame(). */
  render(config: CameraSensorConfig, pose: CameraPose): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } | { error: string };
  /** Free the render resources of one camera, or of every camera. */
  release(cameraId?: string): void;
  /** Number of render targets currently allocated (for tests and diagnostics). */
  allocated(): number;
}

type FrameListener = (image: CameraImage) => void;

interface Subscription {
  id: number;
  cameraId: string;
  intervalMs: number;
  lastSent: number;
  listener: FrameListener;
}

interface Capture {
  cameraId: string;
  /** Who asked (a program run); its captures are dropped when it ends. */
  owner?: object;
  queuedAt: number;
  resolve: (image: CameraImage) => void;
  reject: (error: Error) => void;
}

interface CameraRuntime {
  lastRender: number;
  frames: number;
  fps: number;
  lastUsed: number;
  status: CameraStatus;
  error?: string;
}

export class CameraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CameraError';
  }
}

export const CAMERA_DEFAULTS = {
  /** Cameras rendered in one animation frame at most. */
  maxRendersPerFrame: 2,
  /** A capture that cannot be served within this time fails (for example: the 3D view is hidden). */
  captureTimeoutMs: 3000,
  /** Render targets of a camera nobody used for this long are released. */
  idleReleaseMs: 3000,
  /** Pending captures in total (all programs and the UI). */
  maxPendingCaptures: 8,
};

let backend: CameraRendererBackend | null = null;
const monitors = new Map<string, Set<FrameListener>>();
const subscriptions = new Map<number, Subscription>();
const captures: Capture[] = [];
const runtimes = new Map<string, CameraRuntime>();
let nextSubscriptionId = 1;
let lastUiFlush = 0;
let settings = { ...CAMERA_DEFAULTS };

const now = () => performance.now();

export function cameraConfigs(): CameraSensorConfig[] {
  return useSceneStore.getState().sensors.filter((s): s is CameraSensorConfig => s.type === 'camera');
}

export function cameraConfig(id: string): CameraSensorConfig | undefined {
  return cameraConfigs().find((c) => c.id === id);
}

function runtime(id: string): CameraRuntime {
  let r = runtimes.get(id);
  if (!r) {
    r = { lastRender: -Infinity, frames: 0, fps: 0, lastUsed: now(), status: 'idle' };
    runtimes.set(id, r);
  }
  return r;
}

/** The camera's world pose right now: live engine pose when a session runs, else the design pose. */
export function cameraPose(config: CameraSensorConfig): { pose: CameraPose; source: CameraImage['source'] } | { error: string } {
  const source = currentSensorSource();
  let part: { position: [number, number, number]; rotation: ReturnType<typeof quatFromMatrix> } | null = null;
  let from: CameraImage['source'] = 'design';
  if (source) {
    part = source.partPose(config.partId);
    from = source.kind;
  }
  if (!part) {
    const { objects } = useSceneStore.getState();
    const index = indexObjects(objects);
    if (!index.has(config.partId)) return { error: 'The part this camera is mounted on does not exist.' };
    const m = worldMatrix(config.partId, index);
    // Rotation without scale: normalize the basis columns.
    const sx = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
    const sy = Math.hypot(m[4]!, m[5]!, m[6]!) || 1;
    const sz = Math.hypot(m[8]!, m[9]!, m[10]!) || 1;
    const unscaled = [m[0]! / sx, m[1]! / sx, m[2]! / sx, 0, m[4]! / sy, m[5]! / sy, m[6]! / sy, 0, m[8]! / sz, m[9]! / sz, m[10]! / sz, 0, 0, 0, 0, 1];
    part = { position: [m[12]!, m[13]!, m[14]!], rotation: quatFromMatrix(unscaled) };
    from = 'design';
  }
  const pose = cameraPoseFromPart(part, config);
  return 'error' in pose ? pose : { pose, source: from };
}

function demanded(id: string): { monitor: boolean; subscribed: boolean; capture: boolean } {
  return {
    monitor: (monitors.get(id)?.size ?? 0) > 0,
    subscribed: [...subscriptions.values()].some((s) => s.cameraId === id),
    capture: captures.some((c) => c.cameraId === id),
  };
}

function fail(config: CameraSensorConfig | undefined, cameraId: string, message: string): void {
  const r = runtime(cameraId);
  if (r.error !== message) {
    r.error = message;
    r.status = config && !config.enabled ? 'disabled' : 'error';
    bus.publish('camera.event', { cameraId, event: 'error', detail: message });
  }
  for (const c of captures.filter((x) => x.cameraId === cameraId)) {
    captures.splice(captures.indexOf(c), 1);
    c.reject(new CameraError(message));
  }
}

/**
 * One animation frame. Called by the viewport renderer; renders the cameras that are due.
 * Returns how many cameras were rendered (for tests and diagnostics).
 */
export function frame(t = now()): number {
  // Captures that waited too long fail (also when no renderer is attached).
  for (const c of [...captures]) {
    if (t - c.queuedAt > settings.captureTimeoutMs) {
      captures.splice(captures.indexOf(c), 1);
      c.reject(new CameraError(backend ? 'Camera capture timed out: the 3D view did not draw a frame. Keep the workspace visible.' : 'The camera renderer is not available: open the 3D view.'));
    }
  }
  if (!backend) return 0;
  const configs = cameraConfigs();
  const due: { config: CameraSensorConfig; priority: number }[] = [];
  for (const config of configs) {
    const need = demanded(config.id);
    if (!need.monitor && !need.subscribed && !need.capture) continue;
    const r = runtime(config.id);
    r.lastUsed = t;
    if (!config.enabled) {
      fail(config, config.id, `Camera "${config.id}" is disabled. Enable it in Build Mode (Inspector → Sensors).`);
      continue;
    }
    const interval = 1000 / config.rateHz;
    if (need.capture) due.push({ config, priority: 0 });
    else if (t - r.lastRender >= interval - 1) due.push({ config, priority: 1 + r.lastRender / 1e9 });
  }
  due.sort((a, b) => a.priority - b.priority);
  let rendered = 0;
  for (const { config } of due.slice(0, settings.maxRendersPerFrame)) {
    const r = runtime(config.id);
    const posed = cameraPose(config);
    if ('error' in posed) {
      fail(config, config.id, posed.error);
      continue;
    }
    const out = backend.render(config, posed.pose);
    if ('error' in out) {
      fail(config, config.id, out.error);
      continue;
    }
    rendered += 1;
    const dt = t - r.lastRender;
    r.fps = Number.isFinite(dt) && dt > 0 ? (r.fps ? r.fps * 0.7 + (1000 / dt) * 0.3 : 1000 / dt) : 0;
    r.lastRender = t;
    r.frames += 1;
    if (r.error) bus.publish('camera.event', { cameraId: config.id, event: 'recovered' });
    r.error = undefined;
    r.status = 'live';
    const image: CameraImage = { cameraId: config.id, width: out.width, height: out.height, data: out.data, timestamp: t, frame: r.frames, source: posed.source };
    for (const listener of monitors.get(config.id) ?? []) listener(image);
    for (const sub of subscriptions.values()) {
      if (sub.cameraId !== config.id || t - sub.lastSent < sub.intervalMs - 1) continue;
      sub.lastSent = t;
      sub.listener(image);
    }
    for (const c of captures.filter((x) => x.cameraId === config.id)) {
      captures.splice(captures.indexOf(c), 1);
      c.resolve(image);
    }
  }
  // Release render targets of cameras nobody uses any more.
  for (const [id, r] of runtimes) {
    const need = demanded(id);
    if (need.monitor || need.subscribed || need.capture) continue;
    if (r.status === 'live') r.status = 'idle';
    if (t - r.lastUsed > settings.idleReleaseMs) backend.release(id);
  }
  flushUi(t);
  return rendered;
}

function flushUi(t: number, force = false): void {
  if (!force && t - lastUiFlush < 200) return;
  lastUiFlush = t;
  const state: Record<string, { status: CameraStatus; frames: number; fps: number; error?: string; source?: CameraImage['source'] }> = {};
  for (const config of cameraConfigs()) {
    const r = runtimes.get(config.id);
    const status: CameraStatus = !config.enabled ? 'disabled' : r?.status ?? 'idle';
    state[config.id] = { status, frames: r?.frames ?? 0, fps: status === 'live' ? Number((r?.fps ?? 0).toFixed(1)) : 0, ...(r?.error ? { error: r.error } : {}) };
  }
  useCameraStore.getState().setCameras(state);
}

// ── Demand: the Camera Monitor, program subscriptions, captures ──

/** The Camera Monitor shows this camera. Returns the function that stops it. */
export function watch(cameraId: string, listener: FrameListener): () => void {
  let set = monitors.get(cameraId);
  if (!set) monitors.set(cameraId, (set = new Set()));
  set.add(listener);
  runtime(cameraId).lastUsed = now();
  return () => {
    set!.delete(listener);
    if (set!.size === 0) monitors.delete(cameraId);
  };
}

/** Frames of a camera at most `maxHz` per second. Returns the subscription id. */
export function subscribe(cameraId: string, maxHz: number, listener: FrameListener): number {
  const id = nextSubscriptionId++;
  subscriptions.set(id, { id, cameraId, intervalMs: 1000 / maxHz, lastSent: -Infinity, listener });
  runtime(cameraId).lastUsed = now();
  return id;
}

export function unsubscribe(id: number): boolean {
  return subscriptions.delete(id);
}

/** The next frame of a camera, rendered for this request (asynchronous; never blocks the simulation). */
export function capture(cameraId: string, owner?: object): Promise<CameraImage> {
  const config = cameraConfig(cameraId);
  if (!config) return Promise.reject(new CameraError(`No camera with the id "${cameraId}".`));
  if (!config.enabled) return Promise.reject(new CameraError(`Camera "${cameraId}" is disabled. Enable it in Build Mode (Inspector → Sensors).`));
  if (captures.length >= settings.maxPendingCaptures) return Promise.reject(new CameraError('Too many camera captures are waiting. Wait for the previous ones.'));
  return new Promise((resolve, reject) => captures.push({ cameraId, owner, queuedAt: now(), resolve, reject }));
}

/** Drop the captures of one owner (a program run that ended). They fail with `reason`. */
export function cancelCaptures(owner: object, reason: string): number {
  const mine = captures.filter((c) => c.owner === owner);
  for (const c of mine) {
    captures.splice(captures.indexOf(c), 1);
    c.reject(new CameraError(reason));
  }
  return mine.length;
}

/** End everything a program or the monitor asked for (Stop, project close). */
export function cancelAll(reason: string): void {
  subscriptions.clear();
  for (const c of captures.splice(0)) c.reject(new CameraError(reason));
}

// ── Renderer attachment and cleanup ──

export function attachRenderer(next: CameraRendererBackend | null): void {
  if (backend && backend !== next) backend.release();
  backend = next;
}

export function rendererAttached(): boolean {
  return backend !== null;
}

/** Diagnostics for tests and the performance check. */
export function cameraDiagnostics(): { monitors: number; subscriptions: number; pendingCaptures: number; renderTargets: number; renderer: boolean } {
  return {
    monitors: [...monitors.values()].reduce((n, s) => n + s.size, 0),
    subscriptions: subscriptions.size,
    pendingCaptures: captures.length,
    renderTargets: backend?.allocated() ?? 0,
    renderer: backend !== null,
  };
}

export function configureCameras(next: Partial<typeof CAMERA_DEFAULTS> = {}): void {
  settings = { ...CAMERA_DEFAULTS, ...next };
}

/** Image size of a camera's current resolution. */
export function imageSize(config: CameraSensorConfig): { width: number; height: number } {
  return resolutionSize(config.resolution);
}

let connected = false;

/** Keep the manager in step with the project: removed cameras free their resources; closing frees everything. */
export function connectCameraManager(): void {
  if (connected) return;
  connected = true;
  useSceneStore.subscribe((state, prev) => {
    if (state.sensors === prev.sensors && state.projectId === prev.projectId) return;
    const ids = new Set(state.sensors.filter((s) => s.type === 'camera').map((s) => s.id));
    if (state.projectId !== prev.projectId) {
      cancelAll('The robot project changed.');
      monitors.clear();
      runtimes.clear();
      backend?.release();
      flushUi(now(), true);
      return;
    }
    for (const id of [...runtimes.keys()]) {
      if (ids.has(id)) continue;
      fail(undefined, id, `Camera "${id}" was removed.`);
      for (const [subId, sub] of subscriptions) if (sub.cameraId === id) subscriptions.delete(subId);
      monitors.delete(id);
      runtimes.delete(id);
      backend?.release(id);
    }
    // A new resolution needs a new render target.
    for (const s of state.sensors) {
      const before = prev.sensors.find((p) => p.id === s.id);
      if (s.type === 'camera' && before?.type === 'camera' && before.resolution !== s.resolution) backend?.release(s.id);
    }
    flushUi(now(), true);
  });
  // The simulation stopping ends nothing the monitor needs, but frees what is unused at once.
  bus.subscribe('simulation.changed', ({ state }) => {
    if (state !== 'stopped' || !backend) return;
    for (const [id] of runtimes) {
      const need = demanded(id);
      if (!need.monitor && !need.subscribed && !need.capture) backend.release(id);
    }
  });
}

connectCameraManager();

// End-to-end test hook, only when a test sets window.__ARAI_E2E__ before the app loads.
if (typeof window !== 'undefined' && (window as unknown as { __ARAI_E2E__?: boolean }).__ARAI_E2E__) {
  (window as unknown as { __araiCameras: typeof cameraDiagnostics }).__araiCameras = cameraDiagnostics;
}

/** Log a problem once per message (used by the UI when a feed cannot start). */
export function reportCameraProblem(cameraId: string, message: string): void {
  log.warning('sensor', `Camera "${cameraId}": ${message}`);
}
