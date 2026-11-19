# Phase 8 — Camera Simulation

A robot camera is a sensor mounted on a robot part. It renders the existing 3D scene from that part's real pose: the same robot, the same environment, the same engine. It does this with the existing Three.js renderer inside the existing React Three Fiber canvas. There is no second scene, renderer, physics world or simulation loop.

Phase 8 is camera **simulation**. Programs receive images and simple numbers computed from them (brightness, mean color). **There is no object recognition or other computer-vision AI.**

## 1. Data model (no schema change)

A camera is a fourth sensor type in the existing optional `sensors` list of the project (schema v3, unchanged):

```ts
interface CameraSensorConfig {
  id: string;            // e.g. "front-camera", used by programs
  type: 'camera';
  name: string;
  enabled: boolean;
  rateHz: 5 | 10 | 15 | 30;          // frame rate while the feed is in use
  partId: string;        // the robot part it is mounted on (normally a Camera part)
  position: Vec3;        // mount offset in the part frame (m)
  rotation: Vec3;        // mount rotation (Euler XYZ, rad)
  hFov: number;          // horizontal field of view, 20°…120° (rad)
  resolution: '160x120' | '320x240' | '640x480';   // 4:3; vertical FOV follows
  near: number;          // 0.005…1 m
  far: number;           // 0.5…100 m, more than 10 × near
}
```

Defaults: 60° horizontal (47° vertical), 320 × 240, 0.02 … 20 m, 10 Hz, enabled. The camera looks along its mount's +X axis with +Y up, the same convention as the distance sensor.

Because cameras live in `sensors`:
- they are saved with the project;
- every change goes through the C1 Robot Model Connector and is one undo step;
- load-time cleanup works as for the other sensors: bad optics become defaults with a warning, unknown fields are kept, and a camera whose part is missing is kept but disabled.

Projects without cameras are untouched.

## 2. Hardware component and Build Mode

- **Inspector → Sensors → Camera** (`robotModel.addCamera()`) adds a **Camera** part (catalog `sensor-camera`) at the front top of the robot's root part, looking forward, and mounts a camera on it. This is one undo step.
- A Camera part already added from the library gets a camera with **Camera here** in "Sensors on this part".
- The camera is **moved and rotated by moving and rotating its part** with the existing gizmo or the numeric fields. The mount offset and rotation in the camera settings allow fine adjustment.
- Removing the part removes its camera, in the same undo step (the existing sensor pruning).
- Camera settings (inspector): name, id, frame rate, mounted on, position, rotation, field of view, resolution, near and far clipping. The derived vertical field of view is shown.

## 3. Rendering pipeline

```
React Three Fiber canvas (existing)
 └─ <CameraRenderer/>  useFrame (default priority, before the main view is drawn)
      └─ cameraManager.frame(now)
           ├─ which cameras are needed?  monitor / program subscription / capture
           ├─ which are due?             rateHz; captures first; at most 2 per animation frame
           ├─ pose                        live engine pose (sensor source) or design pose
           └─ backend.render(config, pose)
                 per camera: WebGLRenderTarget(w × h, sRGB) + PerspectiveCamera(layers = CAMERA_LAYER)
                 render existing scene → readRenderTargetPixels → flip rows → RGBA copy
```

- **What a camera sees.** Camera renders use only `CAMERA_LAYER` (layer 5). Robot part meshes, environment object meshes and the scene lights are put on that layer, and a camera-only floor is added when the environment has no ground object (it matches the physics engine's default floor). Editor helpers stay on layer 0 only, so cameras never see them: the grid, gizmos, joint arrows, selection outlines, sensor rays, the physics debug view and the orientation gizmo. The main viewport is never rendered into a camera image, so there is no recursion.
- **Occlusion** comes from the depth buffer of a normal render. A camera cannot see through solid objects.
- **Visible objects only.** Hidden environment objects and hidden parts are not drawn, so cameras do not see them. In the Kinematic engine there is no environment (as in the main viewport); cameras see the floor and the robot.
- **Shadows.** Shadow maps do not depend on the camera, so camera renders reuse the main view's shadow maps (`shadowMap.autoUpdate` is off during the camera render).
- **Floor texture.** The camera floor has 0.5 m checker tiles, so movement is visible in the image even on an empty floor.

## 4. Lifecycle and cleanup

| Event | What happens |
| --- | --- |
| Nobody needs a camera | It is not rendered at all. |
| Camera Monitor open, not paused | The shown camera renders at its `rateHz`. |
| Monitor paused or tab closed | Nothing is rendered for the monitor. |
| Camera unused for 3 s | Its render target is released. |
| Simulation stops | Render targets nobody uses are released at once. |
| Resolution changes | The render target is recreated. |
| Camera removed (or its part) | Subscriptions and monitor end, waiting captures fail, the render target is released. |
| Project changes or closes | All demand is dropped and all render targets are released. |
| Viewport unmounts (leaving the workspace) | The renderer detaches and disposes every render target. |
| Program Stop, finish, error, Reset Robot | The run's camera subscriptions are removed and its waiting captures fail with "The program is no longer running." |

## 5. Poses (Kinematic and Physics)

`cameraPose(config)` uses the attached sensor source when a session runs: the kinematic runtime pose or the Rapier rigid body, which are the same live poses the other sensors use. In Build Mode and in the Environment Editor it uses the design pose. Then: part pose ∘ mount offset ∘ mount rotation ∘ `LOOK_X` (−90° about Y, which turns Three.js's −Z view direction onto +X).

## 6. C3 integration and the program API

Camera frames do not go through the 60 Hz sensor tick or the stream's ring buffers, because they are far larger than readings. The sensor manager skips camera configurations. Camera lifecycle events are published on the bus channel `camera.event` (error, recovered); the frames themselves never go over the bus.

### `robotCamera` (sandbox global)

| Call | Result |
| --- | --- |
| `robotCamera.list()` | `[{ id, name, enabled, partId, resolution, width, height, hFov, vFov, near, far, rateHz }]` |
| `robotCamera.getState(id)` | The above plus `status` (idle, live, disabled, error), `frames`, `fps`, `rendererReady`, `error?` |
| `robotCamera.capture(id, { format? })` | Promise of `{ cameraId, width, height, format, data, brightness, meanColor, frame, timestamp, source }`. `format`: `"rgba"` (4 bytes per pixel, default), `"gray"` (1 byte per pixel) or `"none"` (no pixels, numbers only). Rows run top to bottom. |
| `robotCamera.subscribe(id, fn, { maxHz?, format? })` | `{ id, maxHz, unsubscribe() }`. Default 2 Hz, at most 5 Hz and at most the camera's rate. |
| `robotCamera.unsubscribeAll()` | Ends every camera subscription of the program. |

### Security

- Programs receive only validated, serializable data: plain objects and a fresh `Uint8ClampedArray` copy per image.
- Programs never get Three.js objects, WebGL contexts, render targets, DOM elements or application stores. Network and storage APIs are already removed from the sandbox.
- Arguments are checked against the protocol allowlist: `camera.list`, `camera.state`, `camera.capture`, `camera.subscribe`, `camera.unsubscribe`.
- Captures are asynchronous: a capture is rendered in the next animation frame, so it never blocks the simulation or the UI.

### Limits (per program run, `ExecutionLimits`)

| Limit | Default |
| --- | --- |
| Captures per second | 5 |
| Captures waiting at once | 2 |
| Camera subscriptions | 2 |
| Frames per second per subscription | 5 |
| Image bytes per second (captures and frames together) | 8 MB. A capture above it is refused; a subscription frame above it is skipped. |
| Largest image | 640 × 480 × 4 B ≈ 1.2 MB (the resolution presets) |
| Pending captures, all programs and the UI | 8 |
| Capture timeout | 3 s ("keep the workspace visible") |
| Renders per animation frame | 2 |

## 7. Code Studio

- **JavaScript:** the `robotCamera` global, editor autocompletion, and the API reference ("Camera" group).
- **Blockly "Camera" category:**
  - number of cameras;
  - camera … is ready;
  - brightness (0–100) seen by camera …;
  - red / green / blue (0–255) seen by camera …;
  - capture image from camera …;
  - every frame from camera … at most … per second do;
  - value of this camera frame (only inside the frame block; the generator reports an error elsewhere);
  - stop camera subscriptions.

  Camera blocks use the same SENSOR field checks as the sensor blocks: a missing camera stops the program before it runs.

## 8. UI

- **Camera tab** (bottom panel): choose the camera, live image (scaled to fit), resolution preset, pause and resume, and status (live, idle, paused, disabled, error) with the measured and configured frame rate, frames shown, field of view (horizontal and vertical) and clipping. When the robot has no camera, it shows an empty state with **Add camera** (Build Mode).
- The Sensors tab and the Robot Control sensor list do not show cameras; they point to the Camera tab.
- The image is drawn straight onto a canvas. React state is updated at most twice a second.

## 9. Files

**New:**
- `src/features/camera/cameraMath.ts` — optics, pose, image statistics.
- `src/features/camera/cameraManager.ts` — demand, scheduling, captures, subscriptions, cleanup.
- `src/features/camera/cameraStore.ts` — the UI snapshot.
- `src/features/camera/render/CameraRenderer.tsx` and `render/cameraLayer.ts` — the renderer and the camera layer.
- `src/features/camera/components/CameraMonitor.tsx` — the Camera tab.
- `src/features/camera/api/cameraApi.ts` and `api/sandboxCameraBridge.ts` — the host API and the per-run bridge with its limits.
- `src/features/code-studio/blockly/cameraBlocks.ts` — the Blockly blocks.
- `src/features/robot-model/cameraPlacement.ts` — where a new Camera part goes.
