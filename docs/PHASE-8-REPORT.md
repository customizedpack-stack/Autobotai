# Phase 8 Report — Camera Simulation

Version 0.8.0, branch `phase-8-camera` (based on `phase-7-verification`, PR #8). Date: 19 Nov 2026.

This branch has two parts, done in the brief's order:
- **Part A — Differential drive compatibility fix.** Report: `docs/DRIVE-COMPATIBILITY-FIX.md`. It passed its own full gate (5 commands, exit code 0; 365 unit tests; 166 browser steps) before any camera code was written.
- **Part B — Phase 8 Camera Simulation**, this report. Architecture: `docs/architecture/PHASE-8-CAMERA-SIMULATION.md`.

Cloud accounts, cloud saving and Phase 9 were not started. Phase 8 is camera simulation only: there is **no object recognition or other computer-vision AI**.

## 1. Implemented

| Feature | Where |
| --- | --- |
| Camera configuration (sensor type `camera` in the existing `sensors` list): name, mount part, position, rotation, horizontal FOV (vertical from the 4:3 aspect), resolution presets 160 × 120 / 320 × 240 / 640 × 480, near and far clipping, enabled, frame rate 5/10/15/30 Hz | `src/types/sensor.ts`, `sensors/config/sensorConfig.ts` |
| Camera hardware: **Add camera** places a Camera part at the robot's front top, looking forward; **Camera here** on an existing Camera part; move and rotate through the part (gizmo or fields); undo and redo; removing the part removes its camera | `robotModelConnector.addCamera`, `robot-model/cameraPlacement.ts`, Sensors inspector |
| Camera Inspector (settings) | `SensorSettings.tsx` |
| Rendering pipeline: dedicated render target and Three.js camera per camera, inside the existing canvas and scene; camera layer so editor helpers are never seen; no recursive viewport image; camera-only floor; occlusion through the depth buffer | `camera/render/CameraRenderer.tsx`, `cameraLayer.ts` |
| Render lifecycle: only cameras someone needs; per-camera rate limit; at most 2 renders per animation frame; release when idle, removed, resolution changed, project closed, viewport unmounted; unused targets released when the simulation stops | `camera/cameraManager.ts` |
| Pose: live engine pose (Kinematic and Physics, the same source as the other sensors), design pose in Build Mode and the Environment Editor | `cameraManager.cameraPose`, `cameraMath.ts` |
| Camera Monitor tab: choose the camera, live image, resolution preset, pause and resume, status, measured and configured frame rate, FOV, clipping, empty state; layout for desktop, 900 px and 600 px | `camera/components/CameraMonitor.tsx` |
| Program API `robotCamera`: list, getState, capture (rgba / gray / none), subscribe, unsubscribeAll; per-run limits on captures per second, waiting captures, subscriptions, frames per second and bytes per second; cleanup on Stop, finish, error and Reset Robot | `camera/api/*`, `hostBridge.ts`, `messageProtocol.ts`, `workerRuntime.ts`, `executionLimits.ts` |
| Blockly "Camera" blocks (8 blocks) and JavaScript autocompletion and API reference | `code-studio/blockly/cameraBlocks.ts`, `toolbox.ts`, `generator.ts`, `codeEditorSetup.ts`, `apiReference.ts` |
| Persistence: saved with the project (schema v3 unchanged); load-time cleanup; old projects untouched | `sensorConfig.sanitizeSensors` |

## 2. Automated tests passed

`src/features/camera/tests/camera.test.ts`: 25 tests, all passing. They cover every item of the brief's section 10:

| Brief item | Tests |
| --- | --- |
| Camera component creation | Add camera (part, config, placement, one undo step, undo/redo); Camera part from the library; second camera |
| Camera mounting and transforms | Design pose; part moved; part rotated 90° (looks along −Z); mount offset; mount tilt; part removed removes the camera |
| Camera configuration validation | FOV limits, resolution, near, far, far > 10 × near, frame rate, mount part, NaN; the connector refuses invalid values |
| Camera persistence | Save, reload, every setting restored, store version and schema stay 3 |
| Camera selection | Feed per camera id; API errors for missing cameras and for non-camera sensors |
| Camera feed lifecycle | Nothing rendered without demand; 10 Hz rate; release after idle time; disabled camera; resolution change; removal; project switch |
| Capture limits | Captures per second, waiting captures, bytes per second, subscriptions per run, maxHz clamp, formats |
| Subscription cleanup | Bridge dispose; Stop of a JavaScript program; Reset Robot |
| Missing camera errors | Missing id, wrong sensor type, disabled camera, no renderer, robot without cameras |
| Multiple cameras | 3 cameras at 30 Hz: never more than 2 renders per frame, all served |
| Environment visibility | Wall ahead; pillar; empty environment; outside the field of view; beyond the far clipping distance |
| Occlusion | A box behind a wall is never hit through the wall; it is hit when the wall is removed; a side box appears on the correct side of the image |
| Kinematic camera tracking | Drive and turn: the camera pose follows (source "kinematic") |
| Physics camera tracking | Drive into a custom wall: the camera follows the simulated chassis and sees the wall (source "physics") |
| Program Stop/Reset cleanup | JavaScript Stop; Reset Robot with a waiting capture |
| Legacy project compatibility | Phase 1 project, Phase 7 project, load-time cleanup is idempotent |
| Blockly | Code generated for every camera block; frame-value misuse reported; missing camera reported; a run receives frames and ends its subscription |

In Node (no GPU), visibility and occlusion are checked by ray casts through the same camera math the renderer uses (`applyCamera`). The rendered pixels themselves are checked in the browser (section 3).

**Existing tests changed** (extended, not weakened):
- `blockly.test.ts`: the exact toolbox category list now includes "Camera".
- `messageProtocol.test.ts`: the exact operation allowlist now includes the 5 `camera.*` operations, and `camera` was added to the message kinds a worker may **not** send, which makes that check stricter.
- `sensorPersistence.test.ts`: one type cast (`as typeof d`) so a test object still type-checks now that the sensor union has a fourth member. Its assertion is unchanged.

## 3. Browser tests passed

`tests/e2e/camera.e2e.mjs`, real Chrome (headless, SwiftShader software WebGL), production build. Every check reads the camera's actual pixels from the Camera Monitor canvas.

| Workflow | Check (from the image pixels) | Result |
| --- | --- | --- |
| A. Add a camera to Explorer Bot | Inspector → Sensors → Camera adds the part and the camera (default 320 × 240) | Passed |
| B. Position and rotate the camera | Raising the part by 10 cm and tilting the mount 25° each change the image; two undos restore it | Passed |
| C. Open Camera Monitor | Live, 320 × 240, FOV 60° / 47°, design-pose source in Build Mode | Passed |
| D. Live environment feed | Physics, custom environment: the center pixel is the red wall; the wall covers 23.5 % of the image; the green ramp at the right covers 2.25 % | Passed |
| E. Move the robot | Driving forward: the wall grows from 23.5 % to 33.1 % of the image | Passed |
| F. Turn the robot | After a left turn the center is no longer the wall, and the wall is on the right side of the image | Passed |
| G. Occlusion | A blue box behind the red wall: 0.000 % of the image is blue. The same box without the wall: 5.76 % | Passed |
| H. Kinematic mode | Source "kinematic"; the image changes while driving and turning (checker floor) | Passed |
| I. Physics mode | Source "physics" (steps D to G) | Passed |
| J. JavaScript capture | `list`, then an RGBA capture of 320 × 240 = 307,200 bytes, "redder" mean color, source physics; `getState`; a missing camera gives a clear error | Passed |
| K. Blockly camera workflow | Camera count 1, ready true, brightness 20.56, red 71; 5 frames in 1.5 s at 4 Hz; the subscription is gone afterwards | Passed |
| L. Stop and cleanup | Subscription active; after Stop: 0 subscriptions, 0 waiting captures | Passed |
| M. Save and reload | 160 × 120 and 75° restored; the feed is 160 × 120 after the reload | Passed |
| N. Old project without a camera | Opens; the Camera tab shows the empty state and **Add camera**; the stored project is not changed | Passed |
| Layout | Camera Monitor at 900 px and 600 px: no horizontal overflow; feed, camera menu, Pause and resolution all within the screen | Passed |
| Pause / resume | No new frames while paused; status "paused" | Passed |
| Performance measurements | Section 4 | Passed (recorded) |
| No browser console errors | — | Passed |

18 / 18 steps passed in the final gate run.

Screenshots in `docs/testing/phase-8/`:
1. `01-camera-added-to-explorer-bot.png`
2. `02-camera-monitor-design-pose.png`
3. `03-camera-position-and-rotation.png`
4. `04-live-feed-red-wall-physics.png`
5. `05-feed-follows-robot-forward.png`
6. `06-feed-after-left-turn.png`
7. `07-occlusion-wall-hides-box.png`
8. `08-occlusion-box-visible-without-wall.png`
9. `09-kinematic-feed.png`
10. `10-javascript-capture.png`
11. `11-blockly-camera-program.png`
12. `12-program-stopped-cleanup.png`
13. `13-saved-and-reloaded-camera.png`
14. `14-camera-monitor-900px.png` and `14-camera-monitor-600px.png`
15. `15-old-project-without-camera.png`

## 4. Performance (browser)

Measured in real Chrome with `requestAnimationFrame` over 3 s per case. **This machine has no GPU**: Chrome draws with SwiftShader, a software renderer on the CPU, so the whole view runs at about 10 FPS even without cameras. The numbers show the cost of cameras **relative** to that baseline; they are not real-hardware frame rates.

| Case | Browser view | Camera (measured / configured) |
| --- | --- | --- |
| Camera Monitor closed (no camera rendered; 0 render targets) | 10.4 FPS (median 99.9 ms, p95 116.7 ms) | — |
| Monitor open, 160 × 120 at 30 Hz | 9.6 FPS (median 100.0 ms, p95 133.3 ms) | 10.2 / 30 Hz |
| Monitor open, 320 × 240 at 30 Hz | 9.7 FPS (median 100.0 ms, p95 116.7 ms) | 9.8 / 30 Hz |
| Monitor open, 640 × 480 at 30 Hz | 8.3 FPS (median 116.7 ms, p95 150.0 ms) | 8.9 / 30 Hz |
| Two cameras: monitor at 640 × 480 and 30 Hz, plus a program subscription at 5 Hz (2 render targets) | 13.2 FPS (median 66.7 ms, p95 100.1 ms)* | — |
| Capture frequency (program capturing as fast as allowed for 3 s) | — | 4.64 captures/s accepted (limit 5/s); 7 refused by the limit |
| Memory: 10 cycles of 4 RGBA captures at 640 × 480 plus a subscription, then Stop | JS heap 99.3 → 43.7 MB (garbage collected); afterwards 0 subscriptions, 0 waiting captures, 0 render targets | — |

\* This case runs in Code mode, where the 3D view is smaller (Code Studio uses half of the screen), so the main view costs less. It is not a faster camera.

**Reading:**
- A closed monitor costs nothing (no render target, no rendering).
- 160 × 120 and 320 × 240 cost almost nothing over the baseline; 640 × 480 costs about 15 % in software rendering.
- The camera frame rate is bounded by the view's frame rate (about 10 here), so 30 Hz is not reachable in this environment; see the limitations.
- Repeated captures and Stops leave nothing behind.
- The 60 Hz robot simulation is unchanged: physics runs on its fixed tick; cameras only add render work in the frame loop.

**Not measured:** real-GPU frame rates (Blocked here: no GPU).

## 5. Final gate

Run on 19 Nov 2026 on the final code of this branch, one command after another:

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Pass |
| `npm run lint` | 0 | 0 warnings, 0 errors |
| `npx vitest run` | 0 | 390 passed, 0 failed, 0 skipped (42 files; 365 after Part A plus 25 camera tests) |
| `npm run build` | 0 | Pass |
| `npm run test:e2e` | 0 | 11 suites, 184 / 184 steps: workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19, verification 13, drive-compatibility 9, camera 18 |

Every Phase 1–7 suite passed unchanged (no regressions), with the camera renderer active in the viewport. No preview server was left running after the gate.

## 6. Not tested

- Real-GPU rendering performance. This environment has no GPU; every browser number is from software rendering.
- Several cameras rendering in the same frame on a real GPU.
- The camera feed when the browser tab is in the background. Chrome pauses `requestAnimationFrame` then, so no images are made and captures time out after 3 s with a clear message. This is by design but not covered by a test.
- Very long sessions (hours) of continuous camera use.

## 7. Known limitations

- **Frame rate is bounded by the 3D view's frame rate.** Images are rendered in the viewport's render loop. In this software-rendered environment the view runs at about 10 FPS, so a 30 Hz camera delivers about 10 frames per second. On a normal GPU at 60 FPS the configured rate is reachable.
- **Cameras need the 3D view.** If the workspace's 3D view is not mounted (WebGL unavailable), captures fail after 3 s with "The camera renderer is not available".
- **The Kinematic engine has no environment** (as in the main viewport), so cameras see the floor and the robot there. Environment objects appear in the Physics engine and in the Environment Editor.
- **Simulated images only:** no lens distortion, noise, motion blur, exposure or auto white balance; no depth image API; no object recognition.
- **Tone mapping:** camera images use the scene's lighting and sRGB output but not the main view's ACES tone mapping, so colors are slightly more saturated than in the viewport.
- **Pixel readback is synchronous on the GPU** (`readRenderTargetPixels`) for each rendered camera frame. At the preset sizes this is small, but it is the main cost at 640 × 480.
- The camera's own Camera part is seen from inside, so it is invisible to its camera (back faces are culled). Other robot parts in view are seen, as with a real camera.

## 8. Dependencies

None added or removed (Three.js 0.187, React Three Fiber 9.8 and Blockly, all already used).

## 9. Bugs found and fixed during Phase 8

- **The Camera Monitor showed only the top of the image** at large resolutions in a short panel; the image now scales to fit. Found in browser screenshot review.
- **Cameras saw only the background** at first: R3F's `onUpdate` did not run when the lights and meshes were created, so they were missing from the camera layer. Ref callbacks fixed it. Found by the first browser smoke test.
- **Stale "Phase 7" promises** in three component-library parts (power, arms, markers) were corrected.
