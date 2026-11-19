# Phase 7 Report — Environment Editor (C5)

Version 0.7.0, branch `phase-7-environment` (based on `phase-6-sensors`). Date: 19 Nov 2026.

This report has two parts. **Report A** covers the Phase 6 final corrections, which were finished and gated before any Phase 7 work. **Report B** covers the Phase 7 Environment Editor.

Labels used in Report B:

- **Implemented** — the code exists and is wired into the app.
- **Tested automatically** — a Vitest unit or integration test, or a Playwright browser test, checks it and passes.
- **Tested in browser** — exercised in a real Chrome browser by the Playwright suite `tests/e2e/environment.e2e.mjs`, which performs the brief's manual workflows A–F step by step, and confirmed by reviewing the screenshots. No separate hand-driven browser session was run in this phase, so nothing below is labeled "tested manually by a person".
- **Not tested** — implemented, but no test checks it.
- **Known limitation** — a deliberate gap or a known weakness.

---

# Report A — Phase 6 Final Corrections

Full details are in `docs/PHASE-6-REPORT.md`, section 12. These corrections were committed (`49c68de`) on `phase-6-sensors` and pushed to PR #6 before Phase 7 started.

**IMU correction.**
- The IMU keeps a sample counter that `reset()` clears.
- The first valid acceleration is sample 2 in the Physics engine (velocity is measured from the rigid body) and sample 3 in the Kinematic engine (velocity comes from two poses).
- Until then the reading is `valid: false` with the exact message "Warming up: acceleration needs N samples (k so far)." The acceleration fields are documented as zero placeholders while the reading is not valid.
- No acceleration is invented, and starting mid-motion causes no spike.

**Encoder reset rate protection.**
- `sensor.resetEncoder` has its own per-run limit, `maxEncoderResetsPerSecond` (default 10, set in `ExecutionLimits`).
- Extra resets are rejected with "Too many encoder resets: the limit is N per second. Reset once, then read the encoder."
- Reads are not affected, and a new run starts with a fresh window.

**Also fixed.** An inverted encoder reported −0 after a reset; it now reports 0.

**Files modified.** `imuSensor.ts`, `sandboxSensorBridge.ts`, `sensorManager.ts`, `executionLimits.ts`, `hostBridge.ts`, `SENSOR-SIMULATION.md`, `SENSOR-API.md` (new), `PHASE-6-REPORT.md`.

**Tests added.** `imuWarmup.test.ts` (8 tests) and `encoderResetLimit.test.ts` (7 tests).

**Correction gate (run before Phase 7).**

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Pass |
| `npm run lint` | 0 | Pass, 0 warnings |
| `npx vitest run` | 0 | 319 passed, 0 failed (36 files) |
| `npm run build` | 0 | Pass |
| `npm run test:e2e` | 0 | 7 suites, 125 / 125 steps |

---

# Report B — Phase 7 Environment Editor

## 1. Features implemented

| Feature | Status |
| --- | --- |
| Environment workspace mode (Edit Mode) with toolbar, library, objects list, inspector and status tab | Implemented, tested in browser |
| Six object kinds: ground, wall, box, platform, ramp, obstacle (box, cylinder, sphere) | Implemented, tested automatically |
| Create, select, move, rotate, resize, duplicate, rename, delete, lock, hide | Implemented, tested automatically (store) and in browser (move, rotate, duplicate, delete, size, friction) |
| Reset rotation | Implemented, not tested |
| Static and dynamic bodies with mass, friction, restitution and collision on or off | Implemented, tested automatically |
| Test Environment, Stop, Edit this environment | Implemented, tested in browser |
| Save, reopen, rename, duplicate and delete environments | Implemented, tested automatically; save and reload tested in browser |
| Four templates; editing a template edits a copy; reset to template | Implemented, tested automatically |
| Undo and redo through the existing buttons and shortcuts | Implemented, tested automatically and in browser |
| Validation with inline errors and a validation summary | Implemented, tested automatically (rules); the inline error display is not tested in browser |
| Distance sensor, encoders and IMU in custom environments | Implemented, tested automatically and in browser |
| Blockly and JavaScript programs in custom environments | Implemented, tested in browser |

## 2. Architecture decisions

1. **Environments are separate assets** (`arai.environments.v1`). A project stores only `environmentId`, an optional field, so schema v3 is unchanged and no migration runs.
2. **Draft and saved copy.** The editor edits a draft; physics is built only from the saved definition. Unsaved edits never reach a running world.
3. **Edit Mode never touches a live world.** Entering the editor stops the simulation. Test Mode rebuilds the world from scratch.
4. **One physics world, one loop.** Environment objects are added to the existing `PhysicsWorld`. No second engine or loop was created.
5. **Collision groups instead of excluded colliders.** ENV, ROBOT and GROUND groups decide what collides and what the sensor rays can hit.
6. **Programs see only sensors.** No environment or physics object reaches the sandbox.

See `docs/architecture/PHASE-7-ENVIRONMENT-EDITOR.md` (including the 11-point technical assessment) and `docs/architecture/ENVIRONMENT-PHYSICS-INTEGRATION.md`.

## 3. Object library

Ground (static only), wall, box, platform, ramp (a wedge rising toward +X, with an incline field) and obstacle (box, cylinder or sphere). Each has sensible default size, color and physics values. Objects are added at a free spot or where they are dropped in the viewport. **Status:** implemented and tested automatically; every kind except the ground was added through the UI in the browser test (A5–A9).

## 4. Editing tools

- Transform gizmo for move, rotate and scale; scale is folded into the object's size. One drag is one undo step. **Move and rotate tested in browser (B1–B3); the store side of scaling is tested automatically; scaling with the gizmo is not tested in browser.**
- Numeric fields for position, rotation (degrees), size and ramp incline. **Tested in browser (B4–B6).**
- Duplicate (Ctrl+D), Delete, Rename, Lock, Hide. **Duplicate and delete tested in browser (B7–B10); all tested automatically in the store tests.**
- The viewport's snap toggle also applies to environment objects. Escape clears the selection. **Neither is tested.**

## 5. Physics integration

Static objects are fixed colliders; dynamic objects are dynamic bodies with the object's mass. Ramps use a 6-point convex hull. An environment with no ground object gets the default floor. Each object reports `active`, `no-collision` or `failed` in the Environment status tab, and a failed object does not stop the rest from building. `dispose()` frees everything.

**Tested automatically** (`environmentPhysics.test.ts`, 9 tests): a custom ground supports the robot; an empty environment gets the default floor; a wall stops the robot; a dynamic box settles and is pushed; a ramp tilts the robot nose-up through real contact; friction 0 slides and friction 2 holds on a steep ramp; restitution 0.8 bounces and 0 does not; collider sizes match, failures are reported per object and collision off adds no collider; rebuilding never leaves duplicate bodies and Stop frees the world.

**Tested in browser:** C1–C10 (the custom ground holds the robot, driving over the ramp changes the IMU, the wall stops the robot, Stop stops it).

## 6. Sensor integration

**Tested automatically** (`environmentSensors.test.ts`, 8 tests): the distance sensor detects a custom wall at the right distance, a box and a pillar; the reading changes after the obstacle is moved or rotated; a pushed dynamic box moves in the reading; self-collision stays filtered and no-hit stays null; custom ground planes are ignored by default and seen when ground filtering is off; a wall that stops the robot also stops the wheel encoders.

**Tested in browser:** D1–D10 (the sensor detects the custom wall, the reading changes when the wall is moved or rotated, driving changes the encoders and turning changes the IMU). Screenshot 10 shows a reading of 1.735 m with the stream running in Physics.

**Small sensor change:** when no ray has a valid hit but one is too close, the aggregate hit point and normal now come from that ray, so the drawing still shows the obstacle. Documented in `SENSOR-SIMULATION.md`.

## 7. Code Studio integration

No API change. Programs read the environment through sensors only.

**Tested in browser:** E1–E7 (a JavaScript program reads the front distance sensor in the custom environment; Stop cleans up) and E8–E12 (a Blockly obstacle-detection program stops the robot before the custom wall). The existing Code Studio suite (20 steps) still passes.

## 8. Persistence

Environments are saved in `arai.environments.v1`; only the list of environments is persisted, not the draft or history. Stored data is cleaned on load: bad values become defaults, duplicate ids are renewed and unknown fields are kept. A project remembers its environment; projects without one use the empty environment; deleting an environment falls back to the empty one.

**Tested automatically:** save, reload from browser storage, duplicate, delete, template copies, cleanup of invalid data, project memory. **Tested in browser:** F1–F8 (save, reload the page, reopen the project: objects, transforms, physics values and sensors remain).

## 9. Undo and redo

Each draft has its own history (100 steps). Add, delete, move, rotate, resize and property changes are one step each, and a whole gizmo drag is one step. The workspace Undo and Redo buttons and Ctrl+Z / Ctrl+Y use the environment history in Environment mode and the robot history (C1) elsewhere.

**Tested automatically** (3 store tests) and **in browser** (B7–B10).

## 10. New files

- `src/types/environment.ts`
- `src/features/environment/config/environmentConfig.ts`
- `src/features/environment/config/templates.ts`
- `src/features/environment/store/environmentStore.ts`
- `src/features/environment/environmentSession.ts`
- `src/features/environment/components/EnvironmentScene.tsx`, `EnvironmentGizmo.tsx`, `EnvironmentLeftPanel.tsx`, `EnvironmentInspector.tsx`, `EnvironmentToolbar.tsx`, `EnvironmentStatus.tsx`
- `src/features/physics/engine/environmentColliders.ts`
- `src/features/environment/tests/helpers.ts`, `environmentPhysics.test.ts`, `environmentSensors.test.ts`, `environmentStore.test.ts`, `environmentPerformance.test.ts`
- `tests/e2e/environment.e2e.mjs`
- `docs/PHASE-7-REPORT.md`, `docs/architecture/PHASE-7-ENVIRONMENT-EDITOR.md`, `docs/architecture/ENVIRONMENT-PHYSICS-INTEGRATION.md`
- `docs/testing/phase-7/` (14 screenshots)

**Deleted:** `src/features/physics/components/EnvironmentObstacles.tsx` (the Phase 5 obstacle drawing; obstacles are now drawn by `EnvironmentScene`, and the Obstacle Course template keeps the same objects and values).

## 11. Modified files

- App and workspace: `AppProviders.tsx`, `DashboardPage.tsx`, `NewRobotPage.tsx`, `WorkspacePage.tsx`, `BottomPanel.tsx`, `LeftPanel.tsx`, `RightPanel.tsx`, `StatusBar.tsx`, `ViewportToolbar.tsx`, `WorkspaceTopBar.tsx`, `ConsoleView.tsx`, `Viewport.tsx`, `CameraRig.tsx`, `useWorkspaceShortcuts.ts`, `workspaceActions.ts`
- State and types: `robotStateStore.ts`, `workspaceStore.ts`, `projectStore.ts`, `controlSession.ts`, `channels.ts`, `types/console.ts`, `types/project.ts`
- Physics: `physicsWorld.ts`, `physicsConfig.ts`, `environments.ts`, `simulationManager.ts`, `simulationStore.ts`, `SimulationPanel.tsx`
- Sensors: `sensorManager.ts`, `distanceSensor.ts`, `physicsSource.ts`
- Other: `package.json`, `package-lock.json` (version 0.7.0 only), `README.md`, `docs/architecture/SENSOR-SIMULATION.md`, `tests/e2e/run-all.mjs`

**Top bar change:** below 1024 px wide, inactive mode tabs show only their icon (with a tooltip and an accessible name). The fifth tab made the top bar overflow at 900 px and 600 px; the existing Phase 1 corrections suite caught it, and this fixed it without changing that test.

## 12. Dependencies

None added or removed. The editor uses the existing React Three Fiber, drei (`TransformControls`), Three, Zustand and Rapier packages.

## 13. Performance results

Measured in Node with Rapier compat 0.21, 5 s of simulated time at 60 Hz (`environmentPerformance.test.ts`):

| Objects | Dynamic | Colliders | Create | Build bodies | 5 s simulation | Per tick |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 2 | 19 | 1.0 ms | 8.9 ms | 183 ms | 0.61 ms (includes JIT warm-up) |
| 25 | 5 | 34 | 3.0 ms | 1.8 ms | 49 ms | 0.16 ms |
| 50 | 10 | 59 | 8.3 ms | 7.3 ms | 58 ms | 0.19 ms |

**Not measured:** rendering frame rate in the browser with 50 objects.

## 14. Unit test results

29 new tests in 4 files (store 11, physics 9, sensors 8, performance 1). Full suite: see section 16.

## 15. Browser test results

`tests/e2e/environment.e2e.mjs` runs workflows A–F of the brief in Chrome: 19 / 19 steps passed, including "No browser console errors". The other seven suites (Phases 1–6, regression workflow G) also pass; see section 16.

## 16. Runtime verification (final gate)

Run on 19 Nov 2026 on the final code of this branch, one command after another:

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Pass |
| `npm run lint` | 0 | Pass, 0 warnings, 0 errors |
| `npx vitest run` | 0 | 348 passed, 0 failed, 0 skipped (40 files; 319 from Phases 1–6 plus 29 new) |
| `npm run build` | 0 | Pass (only the existing large-chunk notice) |
| `npm run test:e2e` | 0 | 8 suites, 144 / 144 steps: workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19 |

No existing test was removed or weakened. An earlier run of the same gate failed in the corrections suite (the top bar overflowed by 7 px at 900 px and 107 px at 600 px after the Environment tab was added); the top bar was fixed and the full gate above was run again.

## 17. Screenshots

All taken by the browser test from the running app, in `docs/testing/phase-7/`:

1. `01-environment-editor-empty-state.png`
2. `02-object-library.png`
3. `03-ground-and-walls.png`
4. `04-boxes-and-ramp.png`
5. `05-selected-object-inspector.png`
6. `06-transform-gizmo.png`
7. `07-physics-properties-panel.png`
8. `08-test-mode-with-robot.png`
9. `09-robot-colliding-with-wall.png`
10. `10-distance-sensor-detects-custom-wall.png`
11. `11-sensor-monitor-live-readings.png` (the same moment as 10, framed on the Sensors tab)
12. `12-javascript-sensor-reading.png`
13. `13-blockly-obstacle-detection.png`
14. `14-saved-and-reloaded-environment.png`

## 18. Known limitations

- No multi-select: one object is edited at a time.
- Hidden objects are not drawn but stay physical; use "collision off" to remove an object from physics.
- No one-click reset of position and size (only rotation); use the fields or undo.
- Environments live in this browser only, like projects and programs (cloud saving is Phase 8).
- The Environment Editor toolbar has not been checked at small screen widths.
- Rendering performance with many objects was not measured in the browser.

## 19. Remaining work

- Multi-select and group transforms.
- Alignment helpers (align and distribute objects).
- Reset position and size in one click.
- A small-screen layout check for the Environment Editor toolbar.
- Export and import of environments as files.

## 20. Recommended next phase

Camera simulation, which can reuse the custom environments as scenes. Cloud accounts and saving stay in Phase 8, as planned; Phase 8 was not started.
