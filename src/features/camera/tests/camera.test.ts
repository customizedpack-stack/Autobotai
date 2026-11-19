import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Raycaster, Vector2, type Object3D } from 'three';
import { setWorkspaceMode } from '../../controls/controlSession';
import { setScheduler, step, STEP_SECONDS } from '../../controls/movementEngine';
import { robotControl } from '../../controls/robotControlApi';
import { openExplorer } from '../../controls/testUtils';
import { configureExecution, resetRobotFromCodeStudio, runProgram, stopProgram } from '../../code-studio/runtime/executionManager';
import { IDLE_STATUS, useExecutionStore } from '../../code-studio/runtime/executionStore';
import { inProcessSandbox, until } from '../../code-studio/testUtils';
import { setupBlockly } from '../../code-studio/blockly/blocklySetup';
import { generateFromSource } from '../../code-studio/blockly/generator';
import { checkSyntax } from '../../code-studio/utils/programValidation';
import { ground, object, saveEnv } from '../../environment/tests/helpers';
import { selectEngine, setEnvironment, setSimulationScheduler, stepSimulation } from '../../physics/simulation/simulationManager';
import { legacyStoredProject, phase1Project } from '../../robot-model/fixtures/phase1ExplorerBot';
import { robotModel } from '../../robot-model/robotModelConnector';
import { migrateProject } from '../../robot-model/schema';
import { saveCurrentProject, undo, redo } from '../../projects/workspaceActions';
import { sanitizeSensors, validateSensor } from '../../sensors/config/sensorConfig';
import { migratePersistedProjects, useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { useConsoleStore } from '../../../stores/consoleStore';
import type { CameraSensorConfig } from '../../../types/sensor';
import type { RobotProject } from '../../../types/project';
import { cameraState, listCameras, requireCamera, toFrame } from '../api/cameraApi';
import { DEFAULT_CAMERA_LIMITS, SandboxCameraBridge, type CameraPush } from '../api/sandboxCameraBridge';
import { applyCamera, aspectOf, imageStats, inView, toGray, verticalFov, type CameraPose } from '../cameraMath';
import { cameraDiagnostics, cameraPose, capture, configureCameras, frame, unsubscribe, watch, type CameraImage } from '../cameraManager';
import { useCameraStore } from '../cameraStore';
import { environmentMeshes, fakeRenderer, resetCameraManager } from './helpers';
import '../../code-studio/testUtils';

/** Phase 8 camera simulation: model, pose, lifecycle, limits, API, programs, persistence. */

const scene = () => useSceneStore.getState();
const programLog = () => useConsoleStore.getState().entries.filter((e) => e.source === 'code').map((e) => e.message);
const cameras = () => scene().sensors.filter((s): s is CameraSensorConfig => s.type === 'camera');
const cam = (id = 'front-camera') => cameras().find((c) => c.id === id)!;
const part = (name: string) => scene().objects.find((o) => o.name === name)!;
const run = (seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) step(STEP_SECONDS);
};
const pose = (id = 'front-camera') => {
  const r = cameraPose(cam(id));
  if ('error' in r) throw new Error(r.error);
  return r;
};
/** Advance the manager by `n` animation frames of `dt` ms. */
let clock = 0;
const frames = (n: number, dt = 16.7) => {
  let rendered = 0;
  for (let i = 0; i < n; i++) rendered += frame((clock += dt));
  return rendered;
};
const threeCamera = (config: CameraSensorConfig, p: CameraPose) => applyCamera(new PerspectiveCamera(), config, p);
/** What the camera sees through an image point (x, y in −1 … 1), as the first object name. */
const seenAt = (config: CameraSensorConfig, p: CameraPose, meshes: Object3D[], x = 0, y = 0) => {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(x, y), threeCamera(config, p));
  ray.near = config.near;
  ray.far = config.far;
  return ray.intersectObjects(meshes, false)[0]?.object.name ?? null;
};

beforeEach(() => {
  clock = performance.now();
  resetCameraManager();
  setScheduler(null);
  useCameraStore.setState({ cameras: {}, selectedId: null, paused: false });
});
afterEach(async () => {
  stopProgram();
  configureExecution();
  await selectEngine('kinematic');
  setSimulationScheduler(null);
  resetCameraManager();
});

describe('camera component', () => {
  it('Add camera places a Camera part on the chassis front top and a camera config on it, as one undo step', () => {
    openExplorer(false);
    const before = scene().past.length;
    const r = robotModel.addCamera();
    expect(r.ok).toBe(true);
    const c = cam();
    const p = part('Front Camera');
    expect(p.metadata.componentId).toBe('sensor-camera');
    expect(p.parentId).toBe(part('Chassis').id);
    expect(c.partId).toBe(p.id);
    expect(c).toMatchObject({ type: 'camera', enabled: true, rateHz: 10, resolution: '320x240', near: 0.02, far: 20, position: [0, 0, 0], rotation: [0, 0, 0] });
    expect(c.hFov).toBeCloseTo(Math.PI / 3, 9);
    // Front top: ahead of the chassis center, above every part.
    expect(p.transform.position[0]).toBeGreaterThan(0.15);
    expect(p.transform.position[1]).toBeGreaterThan(0.07);
    expect(scene().past.length).toBe(before + 1);
    undo();
    expect(cameras()).toHaveLength(0);
    expect(scene().objects.some((o) => o.name === 'Front Camera')).toBe(false);
    redo();
    expect(cam().partId).toBe(part('Front Camera').id);
  });

  it('a Camera part from the library without a camera gets one ("Camera here"); more cameras get their own ids', () => {
    openExplorer(false);
    const lib = robotModel.addComponent({ name: 'Rear Cam', category: 'sensor', componentId: 'sensor-camera', geometry: { shape: 'box', size: [0.03, 0.03, 0.03] }, color: '#10B981', transform: { position: [-0.2, 0.1, 0], rotation: [0, Math.PI, 0], scale: [1, 1, 1] } }, { parentId: part('Chassis').id });
    expect(lib.ok).toBe(true);
    expect(robotModel.addCamera().ok).toBe(true);
    expect(cam().partId).toBe(part('Rear Cam').id); // bound to the existing Camera part, no new part
    expect(robotModel.addCamera().ok).toBe(true); // a second camera: a new part
    expect(cameras().map((c) => c.id)).toEqual(['front-camera', 'camera']);
    expect(robotModel.addCamera('obj_missing').ok).toBe(false);
  });

  it('configuration validation: field of view, resolution, clipping, frame rate, mount part', () => {
    openExplorer(false);
    robotModel.addCamera();
    const c = cam();
    const model = robotModel.getModel();
    const others = model.sensors!.filter((s) => s.id !== c.id);
    expect(validateSensor(c, model, others)).toEqual([]);
    expect(validateSensor({ ...c, hFov: 0.1 }, model, others).join(' ')).toMatch(/20° and 120°/);
    expect(validateSensor({ ...c, hFov: Math.PI }, model, others).join(' ')).toMatch(/20° and 120°/);
    expect(validateSensor({ ...c, resolution: '999x1' as never }, model, others).join(' ')).toMatch(/Resolution/);
    expect(validateSensor({ ...c, near: 0 }, model, others).join(' ')).toMatch(/Near clipping/);
    expect(validateSensor({ ...c, far: 0.1 }, model, others).join(' ')).toMatch(/Far clipping/);
    expect(validateSensor({ ...c, near: 0.5, far: 4 }, model, others).join(' ')).toMatch(/10 × the near/);
    expect(validateSensor({ ...c, rateHz: 20 as never }, model, others).join(' ')).toMatch(/5, 10, 15, 30/);
    expect(validateSensor({ ...c, partId: 'nope' }, model, others).join(' ')).toMatch(/mounted on does not exist/);
    expect(validateSensor({ ...c, hFov: Number.NaN }, model, others).join(' ')).toMatch(/20° and 120°/);
    // The connector refuses invalid settings and keeps the old ones.
    expect(robotModel.updateSensor(c.id, { hFov: 3 }).ok).toBe(false);
    expect(cam().hFov).toBeCloseTo(Math.PI / 3, 9);
    expect(robotModel.updateSensor(c.id, { hFov: Math.PI / 2, resolution: '160x120' }).ok).toBe(true);
    expect(cam().resolution).toBe('160x120');
  });

  it('optics: 4:3 aspect, vertical field of view from the horizontal one', () => {
    expect(aspectOf('640x480')).toBeCloseTo(4 / 3, 9);
    expect(verticalFov(Math.PI / 2, 4 / 3)).toBeCloseTo(2 * Math.atan(0.75), 9);
    const c = { hFov: Math.PI / 3, resolution: '320x240' as const, near: 0.02, far: 20 };
    const camera = threeCamera(c as CameraSensorConfig, { position: [0, 0, 0], rotation: { x: 0, y: 0, z: 0, w: 1 }, forward: [0, 0, -1], up: [0, 1, 0] });
    expect(camera.aspect).toBeCloseTo(4 / 3, 9);
    expect(camera.near).toBe(0.02);
    expect(camera.far).toBe(20);
  });
});

describe('camera mounting and transforms', () => {
  it('follows the world transform of its part: design pose, part moved, part rotated, mount offset', () => {
    openExplorer(false);
    robotModel.addCamera();
    let p = pose();
    expect(p.source).toBe('design');
    expect(p.pose.forward[0]).toBeCloseTo(1, 6); // looks forward (+X)
    expect(p.pose.up[1]).toBeCloseTo(1, 6);
    const camPart = part('Front Camera');
    scene().updateTransform(camPart.id, { position: [camPart.transform.position[0], camPart.transform.position[1] + 0.1, 0] });
    expect(pose().pose.position[1]).toBeCloseTo(p.pose.position[1] + 0.1, 6);
    // Turn the camera part 90° left (about +Y): it now looks along −Z.
    scene().updateTransform(camPart.id, { rotation: [0, Math.PI / 2, 0] });
    p = pose();
    expect(p.pose.forward[2]).toBeCloseTo(-1, 6);
    // A mount offset along the camera's +X moves it forward in its own frame (now −Z).
    const before = p.pose.position;
    robotModel.updateSensor('front-camera', { position: [0.05, 0, 0] });
    expect(pose().pose.position[2]).toBeCloseTo(before[2] - 0.05, 6);
    // Tilted down 30° (mount rotation about Z): the view points down.
    robotModel.updateSensor('front-camera', { position: [0, 0, 0], rotation: [0, 0, -Math.PI / 6] });
    expect(pose().pose.forward[1]).toBeCloseTo(-0.5, 6);
  });

  it('a camera whose part is removed is removed with it (no dangling camera)', () => {
    openExplorer(false);
    robotModel.addCamera();
    robotModel.removeComponent(part('Front Camera').id);
    expect(cameras()).toHaveLength(0);
  });
});

describe('camera feed lifecycle', () => {
  it('renders only while something needs it, at the camera frame rate, and releases idle render targets', () => {
    openExplorer(false);
    robotModel.addCamera();
    const fake = fakeRenderer();
    expect(frames(60)).toBe(0); // nobody watches: nothing is rendered
    expect(fake.allocated.size).toBe(0);
    const seen: CameraImage[] = [];
    const stop = watch('front-camera', (img) => seen.push(img));
    const n = frames(60); // one second at ~60 fps
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(11); // 10 Hz
    expect(seen.length).toBe(n);
    expect(seen[0]!.width).toBe(320);
    expect(seen[0]!.data.length).toBe(320 * 240 * 4);
    expect(useCameraStore.getState().cameras['front-camera']?.status).toBe('live');
    stop();
    expect(frames(30)).toBe(0);
    expect(fake.allocated.size).toBe(1);
    frames(250); // more than idleReleaseMs (3 s) unused
    expect(fake.allocated.size).toBe(0);
    expect(fake.released).toContain('front-camera');
  });

  it('a paused/disabled camera renders nothing; resolution changes recreate the target; removal and project close free everything', () => {
    openExplorer(false);
    robotModel.addCamera();
    const fake = fakeRenderer();
    const stop = watch('front-camera', () => undefined);
    frames(10);
    expect(fake.allocated.size).toBe(1);
    robotModel.updateSensor('front-camera', { resolution: '640x480' });
    expect(fake.released).toContain('front-camera');
    frames(10);
    expect(fake.rendered.length).toBeGreaterThan(0);
    robotModel.updateSensor('front-camera', { enabled: false });
    const count = fake.rendered.length;
    frames(30);
    expect(fake.rendered.length).toBe(count);
    expect(useCameraStore.getState().cameras['front-camera']?.status).toBe('disabled');
    robotModel.updateSensor('front-camera', { enabled: true });
    frames(10);
    robotModel.removeComponent(part('Front Camera').id);
    expect(fake.allocated.size).toBe(0);
    expect(cameraDiagnostics().monitors).toBe(0);
    stop();
    // Closing / switching the project frees all render targets and drops all demand.
    robotModel.addCamera();
    watch('front-camera', () => undefined);
    frames(5);
    openExplorer(false);
    expect(fake.allocated.size).toBe(0);
    expect(cameraDiagnostics()).toMatchObject({ monitors: 0, subscriptions: 0, pendingCaptures: 0 });
  });

  it('multiple cameras: each at its own rate, at most 2 renders per animation frame, none starved', () => {
    openExplorer(false);
    robotModel.addCamera();
    robotModel.addCamera();
    robotModel.addCamera();
    for (const c of cameras()) robotModel.updateSensor(c.id, { rateHz: 30 });
    const fake = fakeRenderer();
    const ids = cameras().map((c) => c.id);
    for (const id of ids) watch(id, () => undefined);
    let max = 0;
    for (let i = 0; i < 120; i++) max = Math.max(max, frames(1));
    expect(max).toBeLessThanOrEqual(2);
    const per = Object.fromEntries(ids.map((id) => [id, fake.rendered.filter((r) => r.id === id).length]));
    for (const id of ids) expect(per[id]).toBeGreaterThan(40); // all three get frames (≈ 2 × 120 / 3)
    expect(fake.allocated.size).toBe(3);
  });
});

describe('captures, subscriptions and limits (per program run)', () => {
  const bridge = (limits = {}) => {
    const pushed: CameraPush[] = [];
    const b = new SandboxCameraBridge({ sessionId: 'test', limits, push: (m) => pushed.push(m) });
    return { b, pushed };
  };

  it('capture: asynchronous, a fresh copy, formats rgba / gray / none with stats', async () => {
    openExplorer(false);
    robotModel.addCamera();
    fakeRenderer(() => [255, 0, 0]);
    const { b } = bridge();
    const p = b.handle('camera.capture', { cameraId: 'front-camera' }) as Promise<{ data: Uint8ClampedArray; format: string; brightness: number; meanColor: { r: number } }>;
    expect(b.pendingCaptures).toBe(1);
    frames(1);
    const f = await p;
    expect(f.format).toBe('rgba');
    expect(f.data.length).toBe(320 * 240 * 4);
    expect(f.meanColor.r).toBe(255);
    expect(f.brightness).toBeCloseTo(21.26, 1);
    const g = b.handle('camera.capture', { cameraId: 'front-camera', format: 'gray' }) as Promise<{ data: Uint8ClampedArray }>;
    frames(1);
    expect((await g).data.length).toBe(320 * 240);
    const none = b.handle('camera.capture', { cameraId: 'front-camera', format: 'none' }) as Promise<{ data: null; brightness: number }>;
    frames(1);
    expect((await none).data).toBeNull();
    await expect(b.handle('camera.capture', { cameraId: 'front-camera', format: 'jpeg' })).rejects.toThrow(/Unknown image format/);
  });

  it('limits: captures per second, captures waiting, bytes per second, subscriptions', async () => {
    openExplorer(false);
    robotModel.addCamera();
    fakeRenderer();
    const { b } = bridge({ maxCameraCapturesPerSecond: 3, maxCameraPendingCaptures: 2 });
    const p1 = b.handle('camera.capture', { cameraId: 'front-camera', format: 'none' });
    const p2 = b.handle('camera.capture', { cameraId: 'front-camera', format: 'none' });
    await expect(b.handle('camera.capture', { cameraId: 'front-camera', format: 'none' })).rejects.toThrow(/Too many captures waiting: the limit is 2/);
    frames(1);
    await Promise.all([p1, p2]);
    const p3 = b.handle('camera.capture', { cameraId: 'front-camera', format: 'none' });
    frames(1);
    await p3;
    await expect(b.handle('camera.capture', { cameraId: 'front-camera', format: 'none' })).rejects.toThrow(/Too many camera captures: the limit is 3 per second/);
    // Memory: 640 × 480 RGBA is 1.23 MB; a 2 MB/s budget allows one per second.
    robotModel.updateSensor('front-camera', { resolution: '640x480' });
    const { b: b2 } = bridge({ maxCameraBytesPerSecond: 2_000_000 });
    const big = b2.handle('camera.capture', { cameraId: 'front-camera' });
    frames(1);
    await big;
    await expect(b2.handle('camera.capture', { cameraId: 'front-camera' })).rejects.toThrow(/Camera image limit reached/);
    // Subscriptions per run.
    const { b: b3 } = bridge();
    await b3.handle('camera.subscribe', { cameraId: 'front-camera' });
    await b3.handle('camera.subscribe', { cameraId: 'front-camera' });
    await expect(b3.handle('camera.subscribe', { cameraId: 'front-camera' })).rejects.toThrow(/limit is 2 per program/);
    expect(DEFAULT_CAMERA_LIMITS).toEqual({ maxCameraCapturesPerSecond: 5, maxCameraPendingCaptures: 2, maxCameraSubscriptions: 2, maxCameraHz: 5, maxCameraBytesPerSecond: 8_000_000 });
  });

  it('subscriptions deliver at most maxHz frames, nothing while paused, and the byte budget skips frames', async () => {
    openExplorer(false);
    robotModel.addCamera();
    robotModel.updateSensor('front-camera', { rateHz: 30 });
    fakeRenderer();
    const { b, pushed } = bridge({ maxCameraHz: 5 });
    const sub = (await b.handle('camera.subscribe', { cameraId: 'front-camera', maxHz: 50, format: 'none' })) as { maxHz: number };
    expect(sub.maxHz).toBe(5); // clamped to the run limit
    frames(120); // 2 s
    expect(pushed.length).toBeGreaterThanOrEqual(9);
    expect(pushed.length).toBeLessThanOrEqual(11);
    b.pause();
    const n = pushed.length;
    frames(60);
    expect(pushed.length).toBe(n);
    b.resume();
    const { b: tight, pushed: few } = bridge({ maxCameraBytesPerSecond: 400_000 });
    await tight.handle('camera.subscribe', { cameraId: 'front-camera', maxHz: 5 }); // rgba 307 kB each
    frames(60);
    expect(few.length).toBe(1);
    expect(tight.droppedFrames).toBeGreaterThan(0);
  });

  it('errors: missing camera, a sensor that is not a camera, disabled camera, no renderer', async () => {
    openExplorer(false);
    robotModel.addCamera();
    const { b } = bridge();
    await expect(b.handle('camera.capture', { cameraId: 'nope' })).rejects.toThrow(/No camera with the id "nope". This robot's cameras: "front-camera"/);
    await expect(b.handle('camera.state', { cameraId: 'front-distance' })).rejects.toThrow(/is a distance sensor, not a camera/);
    expect(() => requireCamera('front-distance')).toThrow(/not a camera/);
    robotModel.updateSensor('front-camera', { enabled: false });
    await expect(b.handle('camera.capture', { cameraId: 'front-camera' })).rejects.toThrow(/is disabled/);
    await expect(b.handle('camera.subscribe', { cameraId: 'front-camera' })).rejects.toThrow(/is disabled/);
    robotModel.updateSensor('front-camera', { enabled: true });
    expect(cameraState('front-camera')).toMatchObject({ status: 'idle', rendererReady: false });
    configureCameras({ captureTimeoutMs: 100 });
    const p = capture('front-camera');
    frame(performance.now() + 500);
    await expect(p).rejects.toThrow(/renderer is not available/);
    // A robot without cameras.
    openExplorer(false);
    expect(listCameras()).toEqual([]);
    await expect(bridge().b.handle('camera.capture', { cameraId: 'front-camera' })).rejects.toThrow(/This robot has no camera/);
  });

  it('dispose (program ended) removes its subscriptions and drops its waiting captures', async () => {
    openExplorer(false);
    robotModel.addCamera();
    fakeRenderer();
    const { b } = bridge();
    await b.handle('camera.subscribe', { cameraId: 'front-camera' });
    const waiting = b.handle('camera.capture', { cameraId: 'front-camera' });
    expect(cameraDiagnostics()).toMatchObject({ subscriptions: 1, pendingCaptures: 1 });
    b.dispose();
    await expect(waiting).rejects.toThrow(/no longer running/);
    expect(cameraDiagnostics()).toMatchObject({ subscriptions: 0, pendingCaptures: 0 });
    await expect(b.handle('camera.list', {})).rejects.toThrow(/no longer running/);
    expect(unsubscribe(9999)).toBe(false);
  });

  it('image data: stats, gray conversion, and frames handed to programs are copies', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(imageStats(data, 4).meanColor).toEqual({ r: 128, g: 0, b: 128 });
    expect([...toGray(data)]).toEqual([54, 18]);
    const image: CameraImage = { cameraId: 'c', width: 2, height: 1, data, timestamp: 0, frame: 1, source: 'design' };
    const f = toFrame(image, 'rgba');
    data[0] = 0;
    expect(f.data![0]).toBe(255);
  });
});

describe('environment visibility and occlusion (the renderer\'s camera math, checked by ray casts)', () => {
  const setup = () => {
    openExplorer(false);
    robotModel.addCamera();
    return { c: cam(), p: pose().pose };
  };

  it('sees a wall ahead; a box behind the wall is hidden by it; a box beside it is seen at the side', () => {
    const { c, p } = setup();
    const y = p.position[1];
    const env = [
      object('wall', { name: 'Wall', position: [1.2, 0.2, 0], size: [0.1, 0.6, 1] }),
      object('box', { name: 'Hidden Box', position: [1.8, y, 0], size: [0.3, 0.3, 0.3] }),
      object('box', { name: 'Side Box', position: [0.9, y, -0.3], size: [0.2, 0.2, 0.2] }), // ≈ 23° to the left (the half field of view is 30°)
    ];
    const meshes = environmentMeshes(env);
    expect(seenAt(c, p, meshes)).toBe('Wall');
    // The hidden box is in the field of view but behind the wall: never seen through it.
    expect(inView(threeCamera(c, p), [1.8, y, 0])).toBe(true);
    for (const dx of [-0.05, 0, 0.05]) for (const dy of [-0.05, 0, 0.05]) expect(seenAt(c, p, meshes, dx, dy)).not.toBe('Hidden Box');
    // Without the wall it is seen.
    expect(seenAt(c, p, meshes.slice(1))).toBe('Hidden Box');
    // The side box is to the left (−Z), i.e. on the left of the image (x < 0).
    const xs = [-0.9, -0.8, -0.7, -0.6, -0.5];
    expect(xs.some((x) => seenAt(c, p, meshes, x) === 'Side Box')).toBe(true);
    expect([0.5, 0.6, 0.7, 0.8, 0.9].some((x) => seenAt(c, p, meshes, x) === 'Side Box')).toBe(false); // never on the right
  });

  it('nothing in an empty environment; a ramp and a pillar ahead are seen; things behind the camera are not', () => {
    const { c, p } = setup();
    expect(seenAt(c, p, [])).toBeNull();
    const meshes = environmentMeshes([object('obstacle', { name: 'Pillar', position: [1.0, 0.2, 0], size: [0.16, 0.6, 0.16] }, 'cylinder')]);
    expect(seenAt(c, p, meshes)).toBe('Pillar');
    expect(inView(threeCamera(c, p), [-1, p.position[1], 0])).toBe(false);
    expect(inView(threeCamera(c, p), [25, p.position[1], 0])).toBe(false); // beyond the far clipping distance (20 m)
  });
});

describe('camera tracking', () => {
  it('kinematic: the camera moves forward with the robot and turns with it', () => {
    openExplorer(false);
    robotModel.addCamera();
    setWorkspaceMode('control');
    const start = pose();
    expect(start.source).toBe('kinematic');
    robotControl.drive.forward();
    run(1);
    robotControl.stop();
    expect(pose().pose.position[0]).toBeCloseTo(start.pose.position[0] + 0.25, 2);
    robotControl.turn.left();
    run(1);
    robotControl.stop();
    expect(pose().pose.forward[2]).toBeLessThan(-0.3); // turned left: looks toward −Z
  });

  it('physics: the camera follows the simulated chassis (drive into a custom wall)', async () => {
    openExplorer(false);
    robotModel.addCamera();
    const env = saveEnv([ground(), object('wall', { position: [1.0, 0.2, 0], size: [0.1, 0.4, 2] })], 'envd_camtest');
    setWorkspaceMode('control');
    setSimulationScheduler(null);
    setEnvironment(env.id);
    expect(await selectEngine('physics')).toBe(true);
    stepSimulation(1);
    const start = pose();
    expect(start.source).toBe('physics');
    robotControl.drive.set(1, 'panel');
    stepSimulation(4);
    robotControl.drive.set(0, 'panel');
    const end = pose();
    expect(end.pose.position[0]).toBeGreaterThan(start.pose.position[0] + 0.3);
    expect(end.pose.position[0]).toBeLessThan(0.95); // stopped by the wall, like the chassis
    // The wall fills the view now.
    const meshes = environmentMeshes(useSceneStore.getState() && [object('wall', { name: 'Wall', position: [1.0, 0.2, 0], size: [0.1, 0.4, 2] })]);
    expect(seenAt(cam(), end.pose, meshes)).toBe('Wall');
  });
});

describe('Code Studio', () => {
  const ticker = () => {
    const id = setInterval(() => frames(1), 10);
    return () => clearInterval(id);
  };
  beforeEach(() => {
    useConsoleStore.getState().clear();
    useExecutionStore.getState().set({ ...IDLE_STATUS });
    configureExecution({ sandbox: inProcessSandbox() });
  });

  it('JavaScript: list, getState, capture without freezing, subscribe; Stop ends subscriptions and captures', async () => {
    openExplorer(false);
    robotModel.addCamera();
    setWorkspaceMode('code');
    fakeRenderer(() => [10, 200, 30]);
    const stopTicker = ticker();
    const lines: string[] = [];
    try {
      const code = `const list = await robotCamera.list();
console.log("LIST", list.length, list[0].id, list[0].width);
const s = await robotCamera.getState("front-camera");
console.log("STATE", s.status, s.rendererReady);
const f = await robotCamera.capture("front-camera", { format: "gray" });
console.log("CAP", f.width, f.height, f.data.length, f.meanColor.g);
await robotCamera.subscribe("front-camera", (frame) => console.log("FRAME", frame.brightness), { maxHz: 5, format: "none" });
await wait(20000);`;
      expect(runProgram({ programId: 'cam', programName: 'Camera', language: 'javascript', code }).ok).toBe(true);
      const log = () => programLog();
      await until(() => log().some((t) => t.includes('FRAME')), 4000);
      lines.push(...log());
      expect(lines.some((t) => /LIST 1 front-camera 320/.test(t))).toBe(true);
      expect(lines.some((t) => /STATE (idle|live) true/.test(t))).toBe(true);
      expect(lines.some((t) => /CAP 320 240 76800 200/.test(t))).toBe(true);
      expect(cameraDiagnostics().subscriptions).toBe(1);
      stopProgram();
      expect(cameraDiagnostics()).toMatchObject({ subscriptions: 0, pendingCaptures: 0 });
    } finally {
      stopTicker();
    }
  });

  it('Reset Robot ends a program\'s camera subscriptions and waiting captures; errors reach the program', async () => {
    openExplorer(false);
    robotModel.addCamera();
    setWorkspaceMode('code');
    fakeRenderer();
    // No ticker: the capture stays waiting.
    const code = `await robotCamera.subscribe("front-camera", () => {});
try { await robotCamera.capture("missing-camera"); } catch (e) { console.log("ERR", e.message); }
await robotCamera.capture("front-camera");`;
    expect(runProgram({ programId: 'cam2', programName: 'Camera 2', language: 'javascript', code }).ok).toBe(true);
    await until(() => cameraDiagnostics().pendingCaptures === 1, 3000);
    expect(programLog().some((t) => /ERR No camera with the id "missing-camera"/.test(t))).toBe(true);
    resetRobotFromCodeStudio();
    expect(cameraDiagnostics()).toMatchObject({ subscriptions: 0, pendingCaptures: 0 });
  });

  it('Blockly camera blocks generate valid code for the restricted API; a frame value outside its handler is an error', async () => {
    openExplorer(false);
    robotModel.addCamera();
    setupBlockly();
    const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
    const program = (...blocks: Record<string, unknown>[]) => {
      let next: Record<string, unknown> | undefined;
      for (const b of [...blocks].reverse()) next = { block: { ...b, ...(next ? { next } : {}) } };
      return JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 0, y: 0, ...(next ? { next } : {}) }] } });
    };
    const log = (value: Record<string, unknown>) => ({ type: 'robot_log_value', fields: { LABEL: 'v' }, inputs: { VALUE: { block: value } } });
    const src = program(
      log({ type: 'camera_count' }),
      log({ type: 'camera_is_ready', fields: { SENSOR: 'front-camera' } }),
      log({ type: 'camera_brightness', fields: { SENSOR: 'front-camera' } }),
      log({ type: 'camera_color', fields: { SENSOR: 'front-camera', CHANNEL: 'g' } }),
      { type: 'camera_on_frame', fields: { SENSOR: 'front-camera' }, inputs: { HZ: num(2), DO: { block: log({ type: 'camera_frame_value', fields: { FIELD: 'brightness' } }) } } },
      { type: 'robot_wait', inputs: { MS: num(300) } },
      { type: 'camera_unsubscribe_all' },
    );
    const result = generateFromSource(src);
    expect(result.issues).toEqual([]);
    expect(checkSyntax(result.code)).toEqual([]);
    for (const expected of ['robotCamera.list()', 'robotCamera.getState("front-camera")', 'robotCamera.capture("front-camera", { format: "none" })).brightness', '.meanColor.g', 'await robotCamera.subscribe("front-camera", async (cameraFrame__) =>', 'cameraFrame__.brightness', 'await robotCamera.unsubscribeAll();']) {
      expect(result.code).toContain(expected);
    }
    expect(result.code).not.toMatch(/useSceneStore|three|WebGL|document|window/);
    const bad = generateFromSource(program(log({ type: 'camera_frame_value', fields: { FIELD: 'r' } })));
    expect(bad.issues.map((i) => i.message).join(' ')).toMatch(/inside an "every frame from camera/);
    const missing = generateFromSource(program(log({ type: 'camera_brightness', fields: { SENSOR: 'gone-camera' } })));
    expect(missing.issues.map((i) => i.message).join(' ')).toMatch(/no longer exists/);
    // A camera block cannot hold a distance sensor: its dropdown only offers cameras.
    const wrongKind = generateFromSource(program(log({ type: 'camera_brightness', fields: { SENSOR: 'front-distance' } })));
    expect(wrongKind.code).not.toContain('front-distance');
    expect(wrongKind.code).toContain('robotCamera.capture("front-camera"');

    // And it runs: the frame handler receives frames, unsubscribeAll ends them.
    setWorkspaceMode('code');
    fakeRenderer(() => [200, 200, 200]);
    const stopTicker = ticker();
    try {
      expect(runProgram({ programId: 'bk', programName: 'Blockly camera', language: 'blockly', code: result.code }).ok).toBe(true);
      await until(() => useExecutionStore.getState().state === 'completed', 6000);
      const texts = programLog();
      // Log lines in order: camera count, ready, brightness, green, then frame brightness from the handler.
      expect(texts).toContain('Program: v = 1');
      expect(texts).toContain('Program: v = true');
      expect(texts.filter((t) => t === 'Program: v = 78.43').length).toBeGreaterThanOrEqual(2); // brightness of a (200, 200, 200) image, captured and per frame
      expect(texts).toContain('Program: v = 200');
      expect(cameraDiagnostics().subscriptions).toBe(0);
    } finally {
      stopTicker();
    }
  });
});

describe('persistence and compatibility', () => {
  it('cameras are saved with the project (no schema change) and come back after a reload', () => {
    openExplorer(false);
    robotModel.addCamera();
    robotModel.updateSensor('front-camera', { hFov: Math.PI / 2, resolution: '640x480', near: 0.05, far: 30, rateHz: 15 });
    expect(saveCurrentProject()).toBe(true);
    const stored = JSON.parse(localStorage.getItem('arai.projects.v1')!) as { state: { projects: Record<string, RobotProject> }; version: number };
    expect(stored.version).toBe(3);
    const saved = Object.values(stored.state.projects)[0]!;
    expect(saved.schemaVersion).toBe(3);
    const { projects } = migratePersistedProjects(stored.state, 3);
    const back = Object.values(projects)[0]!;
    const c = back.sensors!.find((s) => s.id === 'front-camera') as CameraSensorConfig;
    expect(c).toMatchObject({ type: 'camera', resolution: '640x480', near: 0.05, far: 30, rateHz: 15, enabled: true });
    expect(c.hFov).toBeCloseTo(Math.PI / 2, 9);
    expect(back.objects.some((o) => o.id === c.partId && o.metadata.componentId === 'sensor-camera')).toBe(true);
  });

  it('load-time cleanup: bad optics become defaults with a warning; unknown fields are kept; a missing part disables the camera', () => {
    openExplorer(false);
    const model = robotModel.getModel();
    const chassis = model.objects.find((o) => o.name === 'Chassis')!;
    const warnings: string[] = [];
    const out = sanitizeSensors(
      [
        { id: 'cam-a', type: 'camera', name: 'A', enabled: true, rateHz: 99, partId: chassis.id, position: [0, 0, 0], rotation: [0, 0, 0], hFov: 9, resolution: 'huge', near: -1, far: 1e9, futureField: 'kept' },
        { id: 'cam-b', type: 'camera', name: 'B', enabled: true, rateHz: 10, partId: 'gone', position: [0, 0, 0], rotation: [0, 0, 0], hFov: 1, resolution: '160x120', near: 0.02, far: 10 },
      ],
      model,
      warnings,
    )!;
    expect(out[0]).toMatchObject({ rateHz: 10, resolution: '320x240', near: 0.02, far: 20, futureField: 'kept', enabled: true });
    expect((out[0] as CameraSensorConfig).hFov).toBeCloseTo(Math.PI / 3, 9);
    expect(out[1]).toMatchObject({ enabled: false });
    expect(warnings.join(' ')).toMatch(/camera optics → defaults/);
    expect(warnings.join(' ')).toMatch(/frame rate → 10 Hz/);
    expect(warnings.join(' ')).toMatch(/"B" was disabled/);
    // Idempotent: cleaning the cleaned list changes nothing more.
    const again: string[] = [];
    expect(sanitizeSensors(out, model, again)).toEqual(out);
  });

  it('old projects without cameras open unchanged (Phase 1 and Phase 7 projects)', () => {
    const v1 = migrateProject(phase1Project()).project;
    expect(v1.sensors).toBeUndefined();
    const v3 = migrateProject(legacyStoredProject()).project;
    expect(v3.sensors).toBeUndefined();
    openExplorer(false);
    const fresh = useProjectStore.getState().projects[scene().projectId!]!;
    const { projects } = migratePersistedProjects({ projects: { [fresh.id]: fresh } }, 3);
    expect(Object.values(projects)[0]!.sensors!.some((s) => s.type === 'camera')).toBe(false);
    expect(listCameras()).toEqual([]);
  });
});
