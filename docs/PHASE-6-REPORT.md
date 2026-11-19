# Phase 6 Report — Sensor Simulation (C3 Sensor Stream)

Date: 19 Nov 2026 · Version 0.6.0 · Branch `phase-6-sensors` (built on `phase-5-physics`)

Architecture: `docs/architecture/C3-SENSOR-STREAM.md` (stream, lifecycle, naming) and `docs/architecture/SENSOR-SIMULATION.md` (the three sensors, units, conventions, API, security).

> **Note on the brief.** The attached brief ended in the middle of section 23 ("Kinematic mode compatibility"). The technical assessment proposed how Kinematic mode would work, and that proposal was approved (19 Nov 2026). In Kinematic mode, encoders and the IMU follow the kinematic motion, labeled `source: "kinematic"`, and the distance sensor reports `valid: false` with a clear message, because there is no physical world. The approval also covered leaving existing projects unchanged, with an "Add default sensors" button. Requirements in the missing part of the brief could not be checked.

## 1. Summary

Robots can now sense their simulated world. A **distance sensor** casts real Rapier rays (one, or up to 15 across a field of view). **Wheel encoders** count the real wheel joint rotation continuously. An **IMU** reports orientation, angular velocity and acceleration from the real rigid-body motion, with gravity handled by two clearly named values. Readings flow through a central **C3 Sensor Stream** to the Sensor Monitor, the Robot Control panel, the inspector, the viewport ray view and — through the sandbox — to JavaScript (`robotSensors`) and new Blockly **Sensors** blocks.

## 2. Stage status

| Stage | Scope | Status |
| --- | --- | --- |
| Assessment | 12-point technical assessment before implementation | **Complete** (approved) |
| 1 — Configuration and persistence | Sensor types, validation, optional `sensors` field, load-time cleanup, C1 commands with undo, Explorer Bot defaults | **Complete** |
| 2 — Runtime | Sensor manager, C3 stream (ring buffers, subscriptions, lifecycle events), physics and kinematic sources, distance, encoders, odometry, IMU | **Complete** |
| 3 — Code Studio | Sandbox protocol, host sensor bridge with limits and ownership, `robotSensors` in the worker, 15 Blockly blocks, API reference and autocomplete | **Complete** |
| 4 — Workspace UI | Inspector Sensors section and per-part sensors, Sensor Monitor tab, Robot Control readings, viewport ray view | **Complete** |
| 5 — Tests and docs | 54 sensor unit tests, a browser suite, full gate, documentation | **Complete** |

## 3. Naming: C3

`channels.ts` and the master plan already define **C3 = Sensor Stream**; the Phase 4 pointer `C3-CODE-STUDIO.md` already says Code Studio is a module whose robot traffic goes over C2. That document is unchanged; the new `C3-SENSOR-STREAM.md` documents the stream and points to it, so both names lead to the right place.

## 4. Architecture in short

- `src/features/sensors/`: `config/` (validation, defaults, cleanup), `core/` (types, mount math, manager, UI store), `stream/` (stream, ring buffer), `distance/`, `encoders/`, `imu/`, `sources/` (physics, kinematic), `api/` (host API, per-run sandbox bridge), `components/` (UI), `tests/`.
- **No new loop.** The physics simulation manager calls the sensor manager after every 1/60 s tick; the kinematic engine calls it after every step (step observer). Rates of 10/20/30/60 Hz are sampled in simulated time.
- **Read-only sources.** Sensors read Rapier bodies, joints and ray queries but never change them; physics keeps ownership of robot movement. Programs never see Rapier, stores or the stream.
- **Bus use.** Lifecycle events on the existing Connector Bus (`sensor.stream`, `sensor.event`, `robotModel.sensorChanged`); readings stay in the stream so they do not flood the bus.

## 5. Sensors

| | Distance | Wheel encoder | IMU |
| --- | --- | --- | --- |
| Measures | Ray hits against the environment | Actual wheel joint angle | Actual rigid-body motion |
| Default rate | 20 Hz | 60 Hz | 60 Hz |
| Key values | distance (m or **null**), detected, status, hit point / normal, rays | angle (continuous), angleDelta, angularVelocity, revolutions, ticks, distance | orientation (quaternion, roll/pitch/yaw), angularVelocity, linearAcceleration (no gravity), specificForce (accelerometer) |
| Kinematic engine | Invalid: needs Physics | Works (kinematic wheel angle) | Works (from kinematic poses) |
| Special cases | no-hit ≠ 0; too-close; self-hits impossible; ground filter | wrap-safe; reset; direction setting | warm-up sample instead of a spike; restarts on reset |

Odometry from the two drive encoders is shown and offered as an **estimate**, separate from the physics pose; the docs explain its drift.

## 6. Code Studio

- `robotSensors` (JavaScript) is a separate global; `robotControl` is unchanged. Reads are asynchronous, unknown ids and wrong types give clear errors, disabled sensors resolve with `valid: false`, stale readings carry `stale: true`, subscriptions end on Stop and on every other end of the run.
- Six read-only sandbox operations and one host → worker `sensor` message. Limits: 200 reads/s, 8 subscriptions per run, 20 deliveries/s per subscription; nothing is delivered while paused; a run is tied to its project.
- Blockly **Sensors** category: 15 blocks generating `robotSensors` calls only; deleted sensors are reported before running.

## 7. Persistence and compatibility

- Optional `sensors` field, **schema v3 unchanged**. Projects without sensors load and save without a new field. Invalid entries are cleaned up with warnings (bad values → defaults, missing part/joint → disabled, duplicate ids → new id, unknown fields kept). Readings are never saved.
- Sensor edits go through C1 and are one undo step each; removing a part or joint removes its sensors in the same undo step.
- Phase 1–5 behavior is unchanged; all Phase 1–5 tests still pass.

## 8. Files

**New:** `src/types/sensor.ts`; `src/features/sensors/**` (config, core, stream, distance, encoders, imu, sources, api, components, tests — 30 files); `src/features/code-studio/blockly/sensorBlocks.ts`; `tests/e2e/sensors.e2e.mjs`; `docs/architecture/C3-SENSOR-STREAM.md`, `docs/architecture/SENSOR-SIMULATION.md`, this report.

**Modified (main ones):**

| File | Change |
| --- | --- |
| `physics/simulation/simulationManager.ts` | Sensors ticked after each physics tick; attach on start, detach on stop |
| `physics/integration/physicsController.ts`, `physics/bodies/robotAssembly.ts`, `physics/physicsConfig.ts` | Rebuild generation, part frames in links, sensor ray collision groups |
| `controls/movementEngine.ts` | Step observer for kinematic sensor sampling |
| `robot-model/robotModelConnector.ts`, `operations.ts`, `schema.ts` | Sensor commands, pruning with removed parts/joints, load-time cleanup |
| `stores/sceneStore.ts`, `projectStore.ts`, `projects/workspaceActions.ts`, `types/project.ts` | Sensors in history, save and project data |
| `code-studio/runtime/messageProtocol.ts`, `hostBridge.ts`, `executionManager.ts`, `executionLimits.ts`, `sandbox/workerRuntime.ts` | Sensor operations, push messages, limits, `robotSensors` |
| `code-studio/blockly/blocklySetup.ts`, `generator.ts`, `toolbox.ts`, `api/apiReference.ts`, `editor/codeEditorSetup.ts` | Sensors blocks, checks, toolbox, docs, autocomplete |
| `inspector/Inspector.tsx`, `components/workspace/{BottomPanel,RobotControlPanel,StatusBar}.tsx`, `viewport/Viewport.tsx` | Sensor UI |
| `core/bus/channels.ts`, `types/console.ts` | Sensor channels, `sensor` log source, C3 marked active |
| `code-studio/blockly/blockly.test.ts`, `runtime/messageProtocol.test.ts` | Expected lists extended with the new Sensors category and the six new operations (still exact-match checks) |

**Dependencies added:** none (Rapier already has ray queries).

## 9. Known limitations

- No camera or 360° LiDAR simulation; the multi-ray distance sensor is not called LiDAR.
- One robot per project, so "other robot bodies" cannot be detected yet (the ray filter already allows it).
- Distance sensors need the Physics engine.
- Blockly has no callback-style subscribe block (block programs run step by step); JavaScript has `subscribe()`.
- Odometry drifts from the true pose over time (documented, by design).
- The missing part of the brief (from section 23 on) could not be checked.

## 10. Tests executed and actual results

Run on 19 Nov 2026 on the final code of this branch.

| Gate step | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass, no warnings |
| Unit tests | `npx vitest run` | **304 / 304 passed** in 34 files (Phase 5: 250) |
| Build | `npm run build` | Pass |
| Browser tests | `npm run test:e2e` | **125 / 125 steps passed** in 7 suites |

Browser suites: workspace 21/21, corrections 20/20, builder 21/21, control 17/17, code-studio 20/20, physics 15/15, **sensors 11/11 (new)**.

Sensor unit tests (54):

- `distanceSensor.test.ts` (9): wall distance and hit normal, no-hit = null, distance shrinks while driving, min/max range, no self-detection, ground only when not filtered (h / sin 30°), multi-ray aggregate, Kinematic message, Build Mode message.
- `wheelEncoder.test.ts` (9): wrap math, continuity over many turns, forward counts up past 2 revolutions with matching rolled distance, reverse and reset, encoder equals the real joint angle, odometry vs. true pose, Reset restarts, missing joint, kinematic encoder.
- `imuSensor.test.ts` (8): Euler math, rest (specific force 9.81 up, acceleration 0), yaw rate when turning, forward and braking acceleration, gravity off, world frame, warm-up after reset (no spike), kinematic IMU.
- `sensorManager.test.ts` (9): ring buffer bound, subscribe/unsubscribe/history, exact 20/60/10 Hz rates, defaults and no duplicates, pause and resume, disabled sensors, stop clears everything, no double sources across engine switches, part removal with undo.
- `sensorPersistence.test.ts` (7): Explorer defaults, old projects unchanged, save and reload, undo/redo, cleanup of invalid entries, validation messages, "Add default sensors".
- `sensorApi.test.ts` (8): JavaScript reads, subscribe rate cap and unsubscribe, Stop removes subscriptions, clear errors, Kinematic behavior, paused programs get no readings, bridge limits and old-run refusal, project identity.
- `sensorBlocks.test.ts` (3): generated code uses `robotSensors` only, missing sensors stop the run, obstacle-avoidance program stops before the wall.
- `sensorPerformance.test.ts` (1): 5 s of physics took 166 ms without sensors and 173 ms with a 15-ray scanner at 60 Hz, two encoders and an IMU.

Browser sensors suite: default sensors listed; settings edit, refusal of an invalid value and undo; Kinematic readings and the distance message; wall distance and ray drawing on Physics; driving changes distance and encoders, turning shows on the IMU; pause marks readings stale; disabling a sensor; a JavaScript program with reads and a subscription; a Blockly program that stops before the wall; settings restored after reload; no console errors.

## 11. Manual testing

1. Create an **Explorer Bot**; the inspector lists four sensors under **Sensors**.
2. Click **Simulate**, choose **Obstacle course**, open the **Sensors** tab at the bottom: the distance sensor shows about 1.1 m to the wall; rays are drawn in the viewport.
3. Hold **W**: the distance drops, encoders count up. Hold **A**: the IMU turn rate rises.
4. **Pause**: readings turn "Stale". **Resume**: "Active" again.
5. In **Code**, run `console.log(await robotSensors.distance("front-distance").read())`.

## 12. Final corrections (19 Nov 2026)

**A — Kinematic IMU warm-up.** The implementation was inspected:
- Physics velocity is measured from the rigid body, so the first valid acceleration is sample 2.
- Kinematic velocity comes from two poses, so it is sample 3.

The behavior already invented no acceleration. The warm-up is now explicit:
- A sample counter is kept and cleared by `reset()`, together with the previous pose and velocity.
- The error message is exact: "Warming up: acceleration needs N samples (k so far).".
- The acceleration fields are documented as zero placeholders while `valid` is false.
- The at-rest exception (the kinematic engine is not stepping) is documented in the code and in `SENSOR-SIMULATION.md`.

New tests (`imuWarmup.test.ts`, 8): the sample counts; kinematic samples 1, 2 and 3; no spike when sampling starts mid-motion; physics samples 1 and 2; reset and warm-up again; the at-rest measurement; kinematic driving; physics Reset with no spike afterwards.

**B — Encoder reset rate protection.**
- `sensor.resetEncoder` now has its own per-run limit, `maxEncoderResetsPerSecond` (default 10, configurable in `ExecutionLimits`).
- Excess requests are rejected with a clear `SensorApiError`.
- Reads are unaffected, and new runs start fresh.
- See `docs/architecture/SENSOR-API.md`.

New tests (`encoderResetLimit.test.ts`, 7): a normal reset; repeated resets; excessive resets with the exact error and unaffected reads; window recovery; a new run after an old one; stale-run and old-project rejection; the default limit; the limit inside a program; Stop with 30 pending resets and a subscription, then a clean next run.

**Also fixed:** an inverted encoder reported −0 after a reset; it now reports 0.

**Files modified:**
- `src/features/sensors/imu/imuSensor.ts`
- `src/features/sensors/api/sandboxSensorBridge.ts`
- `src/features/sensors/core/sensorManager.ts`
- `src/features/code-studio/runtime/executionLimits.ts`
- `src/features/code-studio/runtime/hostBridge.ts`
- `docs/architecture/SENSOR-SIMULATION.md`
- `docs/architecture/SENSOR-API.md` (new)
- this report

**Correction gate (executed 19 Nov 2026, after both corrections):**

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Pass |
| `npm run lint` | 0 | Pass, 0 warnings |
| `npx vitest run` | 0 | 319 passed, 0 failed, 0 skipped (36 files) |
| `npm run build` | 0 | Pass |
| `npm run test:e2e` | 0 | 7 suites, 125 / 125 steps (workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11) |

## 13. Recommended next phase

An environment editor (C5) so users can build their own obstacle courses for the sensors, followed by camera simulation.
