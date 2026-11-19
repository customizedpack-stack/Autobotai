# Phase 7 — Final Verification

Date: 19 Nov 2026. Code: `main` after PR #5, #6 and #7 (version 0.7.0), plus the fixes listed in section 7 (branch `phase-7-verification`).

Scope: verification and necessary bug fixes only. Camera simulation and Phase 8 were not started.

Status words used: **Passed**, **Failed**, **Not run**, **Blocked**.

## 1. Summary

| Area | Status |
| --- | --- |
| Runtime (Node.js version) | Passed |
| Automated verification (final run, 6 commands) | Passed (exit code 0 for all six) |
| Browser verification, workflows A–F and Phase 1–6 regression | Passed |
| Environment Editor at 1440, 900 and 600 px | Passed after a fix (failed first, see section 7) |
| Performance, 10 / 25 / 50 objects in the browser | Passed (measured), with a caveat: software rendering only |
| Real-GPU frame rate | Blocked (no GPU in this environment) |
| Regression and safety checks | Passed |

Bugs found: 4, all fixed (section 7). One of them only affected the test harness.

## 2. Runtime

| Check | Result | Status |
| --- | --- | --- |
| `node --version` | v22.23.5 | Passed |
| Required (`package.json` engines) | `^22.22.2 || ^24.15.0 || >=26.0.0`, unchanged | Passed: 22.23.5 satisfies `^22.22.2` |
| `npm --version` | 10.9.9 | (informational) |

The engines field was not modified.

## 3. Automated verification

### 3.1 Baseline: merged `main` before any change

Run at the start of this pass, on `main` as merged (commit `958740b`):

| Command | Exit code | Result | Status |
| --- | --- | --- | --- |
| `npm ci` | 0 | 182 packages added, 189 audited, 0 vulnerabilities | Passed |
| `npm run typecheck` | 0 | No errors | Passed |
| `npm run lint` | 0 | 0 warnings, 0 errors | Passed |
| `npx vitest run` | 0 | 348 passed, 0 failed, 0 skipped (40 files) | Passed |
| `npm run build` | 0 | Built | Passed |
| `npm run test:e2e` | 0 | 8 suites, 144 / 144 steps (workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19) | Passed |

### 3.2 Final run: after the fixes, in this order

Run on the final code of branch `phase-7-verification`, one command after another:

| Command | Exit code | Result | Status |
| --- | --- | --- | --- |
| `npm ci` | 0 | 182 packages added, 189 audited, 0 vulnerabilities | Passed |
| `npm run typecheck` | 0 | No errors | Passed |
| `npm run lint` | 0 | 0 warnings, 0 errors | Passed |
| `npx vitest run` | 0 | 349 passed, 0 failed, 0 skipped (40 files; 348 before plus 1 new) | Passed |
| `npm run build` | 0 | Built | Passed |
| `npm run test:e2e` | 0 | 9 suites, 157 / 157 steps: workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19, verification 13 | Passed |

After that run, the server stop fix was also applied to `workspace.e2e.mjs` (section 7.4). `npm run build` (exit 0) and `npm run test:e2e` (exit 0, 9 suites, 157 / 157 steps) were then run again on that final code, and no preview server was left running afterwards. The source code did not change between the two runs.

## 4. Browser verification

All browser checks ran in headless Google Chrome through Playwright against the production build (`vite preview`), with `--use-angle=swiftshader` (software WebGL; this machine has no GPU). No person clicked through the app by hand in this pass.

### 4.1 Phase 7 workflows (existing suite `environment.e2e.mjs`, 1440 × 900)

| Check | Steps | Status |
| --- | --- | --- |
| Environment creation and editing | A1–A9 | Passed |
| Add, select, move (gizmo), rotate (gizmo), resize and edit in the inspector, duplicate, delete, undo, redo | A5–A9, B1–B10 | Passed |
| Static and dynamic physics; Test Mode; Stop; Edit again | C1–C10 | Passed |
| Robot collision with a custom wall; driving over a ramp changes the IMU | C5–C8 | Passed |
| Distance sensor detects a custom wall; the reading follows when the wall is moved or rotated | D1–D6 | Passed |
| Encoder and IMU readings while driving and turning | D7–D10 | Passed |
| JavaScript program reading the sensor; Stop cleans up | E1–E7 | Passed |
| Blockly obstacle-detection program stops before the custom wall | E8–E12 | Passed |
| Save, reload the browser, reopen: objects, transforms, physics and sensors remain | F1–F8 | Passed |
| No browser console errors | — | Passed |

### 4.2 Phase 1–6 workflows (existing suites)

workspace (21 steps), corrections (20, including the 900 px and 600 px layout checks), builder (21), control (17), code-studio (20), physics (15), sensors (11). Status: **Passed** (see the step counts in section 3).

### 4.3 New verification suite (`tests/e2e/verification.e2e.mjs`)

| Check | Viewport | Status |
| --- | --- | --- |
| V1: Environment Editor opens, a template and an object are added, no horizontal overflow, toolbar buttons (Edit Mode badge, name, Save, Test) and the inspector are fully visible and usable | 1440 × 900 | Passed |
| V1 (same) | 900 × 900 (compact layout, panels as drawers) | Passed after fix 7.1 |
| V1 (same) | 600 × 900 (compact layout) | Passed after fix 7.1 |
| V2: a project stored without `environmentId` opens with the empty environment, is not rewritten just by opening, runs physics and opens the editor | 1440 × 900 | Passed |
| V2b: a project pointing at a deleted environment falls back to the empty environment | 1440 × 900 | Passed |
| V3: one physics world at a time through 3 Resets and 2 environment changes; Stop disposes the world and the loop | 1440 × 900 | Passed |
| V3b: program sensor subscriptions end on program Stop; leaving the session frees the world | 1440 × 900 | Passed |
| V4: sandbox isolation | 1440 × 900 | Passed |
| V5: 10 / 25 / 50 objects built and measured in Edit Mode and Test Mode | 1440 × 900 | Passed (measured) |
| No browser console errors | all | Passed |

Viewport sizes tested: **1440 × 900, 900 × 900 and 600 × 900.**

### 4.4 Screenshots (new, from the verification suite)

In `docs/testing/phase-7/verification/`:

- `v1-environment-editor-1440.png`, `v1-environment-editor-900.png`, `v1-environment-editor-600.png`
- `v1-environment-inspector-1440.png`, `v1-environment-inspector-900.png`, `v1-environment-inspector-600.png`
- `v4-sandbox-isolation.png`
- `v5-edit-10-objects.png`, `v5-edit-25-objects.png`, `v5-edit-50-objects.png`
- `v5-test-10-objects.png`, `v5-test-25-objects.png`, `v5-test-50-objects.png`

The 14 Phase 7 screenshots in `docs/testing/phase-7/` were taken again by the final run, so they show the corrected toolbar.

## 5. Performance

Measured in the browser with `requestAnimationFrame` intervals over 4 s per case (the canvas renders every frame). The environments mix static walls, platforms, ramps and pillars with dynamic boxes. "Step cost" is the simulation panel's measured physics time per tick inside the browser.

| Environment | Colliders | Edit Mode | Test Mode (physics running) | Physics step cost |
| --- | --- | --- | --- | --- |
| Empty (baseline) | — | 13.5 FPS, median 66.7 ms, p95 83.4 ms (Build Mode) | 12.9 FPS, median 83.3 ms, p95 100.0 ms | — |
| 10 objects | 19 | 10.9 FPS, median 83.4 ms, p95 116.6 ms | 9.9 FPS, median 100.0 ms, p95 116.7 ms | 0.32 ms |
| 25 objects | 34 | 11.2 FPS, median 83.4 ms, p95 100.0 ms | 10.3 FPS, median 100.0 ms, p95 116.7 ms | 0.28 ms |
| 50 objects | 59 | 12.8 FPS, median 83.3 ms, p95 100.0 ms | 11.9 FPS, median 83.3 ms, p95 100.0 ms | 0.47 ms |

These figures are from the last full run. The earlier runs gave the same picture: 8–13 FPS in every case, and step costs of 0.27–0.53 ms. Every environment built all of its objects (10, 25 and 50 environment bodies), and Stop left 0 live worlds each time.

**How to read these numbers.**
- This machine has no GPU. Chrome draws with SwiftShader, a software renderer on the CPU, so every frame costs about 70–100 ms even with an empty scene. These numbers say nothing about the frame rate on a real computer with a graphics card. **A real-GPU measurement is Blocked here** and should be done on a normal desktop before release.
- What the numbers do show: going from the empty environment to 50 objects does not change the frame time much in this setup, so the scene size is not the bottleneck. Physics stays small at about 0.3–0.5 ms per step, against a 16.7 ms frame budget.
- Node physics timings were not used as a substitute. They are in `docs/PHASE-7-REPORT.md` only for reference.

## 6. Regression and safety

| Check | How it was verified | Status |
| --- | --- | --- |
| No existing test modified or weakened | `git diff` on the test files: the only changes are one new unit test, a new browser suite, the suite list in `run-all.mjs` and the server stop fix in `helpers.mjs` and `workspace.e2e.mjs` (section 7.4). No assertion was removed or loosened. | Passed |
| Rapier is still the only physics engine | No dependency change; the new hook only counts live `PhysicsWorld` objects | Passed |
| No second simulation loop | V3: `loopRunning` is true while running and false after Stop; worlds never exceed 1 (Reset × 3, environment change × 2) | Passed |
| Robot schema v3 unchanged | No schema file changed; V2 shows store version 3 and project schema 3 | Passed |
| Old projects without `environmentId` still open | V2 and V2b | Passed |
| Stop disposes the simulation world | V3: after Stop, live worlds 0, bodies 0, colliders 0, loop stopped, no controller | Passed |
| Stop ends sensor subscriptions | V3b: listeners 0 → 2 during the program → 0 after Stop; E1–E7 too | Passed |
| No environment or physics internals in sandbox programs | V4: 25 names probed (`window`, `document`, `parent`, `top`, `localStorage`, `indexedDB`, `fetch`, `RAPIER`, `PhysicsWorld`, `useEnvironmentStore`, `environment`, `__araiSimulation` and others), all `undefined`. No global name matches rapier, physic, environ, collider, rigid, arai or zustand. `robotSensors` has only distance, encoder, imu, list and odometry; `robotControl` has only drive, getState, joint, reset, setSpeedPercent, stop and turn. A sensor reading is plain JSON data with no functions. | Passed |

## 7. Bugs found and files changed

### 7.1 Environment Editor toolbar cut off (product bug)

- **Found by:** V1. At 900 px the page overflowed by 49 px and at 600 px by 216 px. At 1440 px the "Test Environment" button was clipped at the edge of the 3D view column, and "not saved" wrapped onto two lines.
- **Cause:** the toolbar had fixed long labels and was sized by nothing; its column is much narrower than the window when the side panels are open.
- **Fix:** the toolbar now uses a container query, so it follows the width of its own column. In narrow columns, Reset Environment and Stop Simulation show only their icons (with tooltip and accessible name), "Test Environment" becomes "Test", and the save state becomes a colored dot with a tooltip. Test ids and accessible names are unchanged.
- **File:** `src/features/environment/components/EnvironmentToolbar.tsx`

### 7.2 Opening an environment did not bring it into view (product bug)

- **Found by:** reviewing the V1 screenshots. After opening the Basic Test Arena, the camera stayed on the robot and the walls were off-screen.
- **Fix:** opening an environment in the editor now frames the scene (the same action as the "Frame all" button).
- **File:** `src/features/environment/environmentSession.ts`

### 7.3 New objects were placed outside a walled arena (product bug)

- **Found by:** the V1 screenshots. A new box in the Basic Test Arena landed at (4.5, −3.5), outside the 6 m × 6 m walls.
- **Cause:** the free-spot search treated every object as a square of its longest side, so a 6 m long, 0.1 m thin wall blocked a 6 m × 6 m square.
- **Fix:** it uses each object's real footprint, including its rotation.
- **Test added:** `environmentStore.test.ts` gets "new objects land inside a walled arena, clear of the walls". It fails on the old code and passes on the new code (both were run).
- **File:** `src/features/environment/config/environmentConfig.ts`

### 7.4 Browser tests left preview servers running (test harness bug)

- **Found by:** a new suite could not start, because servers from earlier suites were still running (8 stale `vite preview` processes).
- **Cause:** `stop()` killed the `npx` wrapper, not the Vite server.
- **Fix:** the server runs in its own process group, and cleanup ends the whole group. The Phase 1 workspace suite starts its own server, so it got the same fix. No test logic or assertion changed.
- **Files:** `tests/e2e/helpers.mjs`, `tests/e2e/workspace.e2e.mjs`

### 7.5 Test-only diagnostics (no behavior change)

- `PhysicsWorld.liveCount` counts worlds created and not yet disposed.
- `simulationDiagnostics()` reports live worlds, bodies, colliders, environment bodies, loop state and controller. It is placed on `window` only when a browser test sets `__ARAI_E2E__` before the app loads, in the same way as the existing test hooks. Sandbox programs cannot see it (V4).
- **Files:** `src/features/physics/engine/physicsWorld.ts`, `src/features/physics/simulation/simulationManager.ts`

### 7.6 New test files

- `tests/e2e/verification.e2e.mjs` (13 steps), added to `tests/e2e/run-all.mjs`.

**Environment note:** port 4190 refused connections in this sandbox even with a server listening on it, so the new suite uses port 4195. This is unrelated to the app.

## 8. Remaining known limitations

- Real-GPU browser frame rate not measured (no GPU here).
- When rendering is slower than about 12 FPS, the simulation runs slower than real time, by design. The loop takes at most 5 physics steps (83 ms) per frame, which prevents runaway catch-up. This happened only with the software renderer.
- No multi-select; one object is edited at a time.
- Hidden objects are not drawn but still collide; use "Collision off" to remove one from physics.
- Only rotation has a one-click reset; position and size do not.
- Environments are stored in this browser only (cloud saving is Phase 8).
- Opening the editor with the default empty environment shows "No environment open" until the user picks a template or creates one. This is intended, but it can surprise a new user.
- All browser checks are automated (Playwright in headless Chrome). No hand-driven session was run in this pass.

## 9. Sign-off

**Phase 7 is ready for final sign-off**, with one open item for the person signing off: check the frame rate once on a normal desktop with a graphics card. That check could not be done here (Blocked: no GPU), and the software-rendering numbers above are not a substitute for it.

Everything else in the brief is Passed:
- The Node.js runtime meets the requirement.
- All six commands pass with exit code 0.
- All workflows, A–F and Phase 1–6, pass in the browser.
- The editor works at 1440, 900 and 600 px.
- All regression and safety checks pass.

The four bugs found in this pass are fixed and covered by tests. Camera simulation and Phase 8 were not started.
