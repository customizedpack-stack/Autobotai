# Phase 11 test report

Runtime: Node v22.23.5, which meets the package engine requirement (`^22.22.2 || ^24.15.0 || >=26`). All commands were run on the final Phase 11 code.

## Results

| Command | Exit code | Result |
|---|---|---|
| `npm run typecheck` | 0 | No errors |
| `npm run lint` | 0 | oxlint, no findings |
| `npm run test` | 0 | 48 files, **499 tests passed** (Phase 10 baseline: 477; 22 new) |
| `npm run build` | 0 | Production build succeeded |
| `npm run test:firmware` | 0 | 18 vector cases, 254 instructions, **261 checks passed** (host g++; unchanged firmware) |
| `npm run test:e2e` | 0 | **14 suites, 262 steps passed** (Phase 10 baseline: 13 suites, 237 steps; new `learning` suite: 25 steps) |

Per suite: workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19, verification 13, drive-compatibility 9, camera 18, blueprint 30, hardware 23, learning 25.

## New unit tests (`src/features/learning/tests/learning.test.ts`, 20 tests)

Definitions and template mapping:

- six definitions with unique ids and slugs;
- every required component really exists in the mapped template;
- every part id exists in the Phase 9 catalog;
- every tutorial resolves.

Accurate support status:

- line sensing, grasping, camera hardware and recognition are "Not Yet Supported";
- hardware deployment is claimed only for the Explorer Bot, with the "simulated device only" caveat.

Starter programs:

- they parse;
- they call only documented API functions.

Library features:

- project filtering by text, difficulty and support;
- the verified budget (US$63.25 for 4 of 7 parts) and no budget without prices;
- safe creation: a new project for every library action; an existing project stays byte-identical; camera, actuators, environment and starter program are applied;
- deleting a project removes its learning records.

Tutorials:

- nine-stage order and conditional steps (camera, physical, arm actuators);
- Learn → Do → Verify on the real scene: manual-only steps never pass by themselves, and the selection check gives real details;
- persistence in `arai.learning.v1` without any robot copy, resume, and restart;
- drive verification returns the real `diagnoseDrive` output after deleting a wheel joint.

Checks against real state:

- arm actuators, camera, unsaved changes, saved program with the required API, environment and completed runs;
- only `completed` runs count; physics is required where stated.

Completion:

- optional skip, tutorial completion, and the summary separating verified, manual and skipped stages.

Reverse Engineering:

- relationships from the real hierarchy, joints, encoder sensor, actuator and controller;
- inspection does not touch the Builder selection;
- program lines linked to a component;
- program explanation from `API_REFERENCE`;
- nothing is invented for a robot without a program.

Purpose Builder:

- matching for garden, room, delivery, patrol and arm goals;
- guided answers, with deterministic output;
- unsupported goals (drone, face recognition) and the no-match case.

Experience mode:

- persisted in `arai.settings.v1`;
- a settings reset keeps it;
- project data is unchanged.

## New integration tests (`learningRuns.test.ts`, 2 tests)

The starter programs run through the existing Code Studio sandbox, hostBridge and Command Bus (kinematic engine, in-process sandbox):

- **Pick & Place:** completes; the joints move (more than 0.5 rad); the log shows the pick and home poses; the run is recorded as evidence.
- **Delivery:** completes and reports at least 1.5 m from the encoder; the run is recorded.

## New browser suite (`tests/e2e/learning.e2e.mjs`, 25 steps)

- **Regression setup:** a project built with Phase 7–10 features (camera, program, Blueprint hardware profile) before any Phase 11 page is used.
- **Beginner journey:**
  - Dashboard and the experience choice, then Library (six cards, filters) and Details (headings, deployment caveat, US$63.25 budget, component explorer).
  - Start Tutorial creates a new project, with fewer tools shown and More tools available.
  - Steps 1–6: manual check; a failed automatic check with why/where help, then a pass on the real selection; drive check; optional skip; starter program inserted through Code Studio.
  - Save, leave, resume from Continue Learning at the same step.
  - Obstacle Course plus Physics plus a real run of the program to completion; verify.
  - Completion summary ("Not built or tested by AutoBotAI").
- **Professional journey:** all six workspace modes; Builder, Code Studio, Simulate, Blueprint; no Beginner UI.
- **Existing project regression:** the Phase 10 project's stored data is unchanged after all Phase 11 pages and mode changes (one allowed Phase 7 case: `environmentId` undefined → `"floor"`, see KNOWN-LIMITATIONS). The program and hardware profile are still there.
- **Reverse journey:**
  - inspecting is read-only (Save disabled, panels inert);
  - component relationships, joints, program explanation with the related line highlighted, build sequence;
  - the inspected project is byte-identical afterwards.
- **Purpose Builder journey:**
  - garden goal with guided answers gives Agriculture Monitoring plus the soil limitation and alternatives;
  - the drone goal is reported as unsupported;
  - Modify My Idea, then Project details, then the tutorial dialog offers Resume;
  - Open Robot creates a new project with the starter program open.
- **Responsive:** five pages at 1440/1024/768/600/375 px with no horizontal overflow; the workspace tutorial panel at 1024/768/375 px.
- **Accessibility:**
  - each page has one `h1`;
  - every visible button and link has a name, and every form control has a label;
  - Tab reaches the navigation, the focus outline is visible, and Enter navigates.
- No browser console errors.

## Changes to existing tests (none removed, none weakened)

- `tests/e2e/sensors.e2e.mjs`, step "Code Studio: a Blockly Sensors program stops the robot before the wall":
  - **Problem:** the step waited for "Completed" right after clicking Run, but the badge still showed the previous run's "Completed" for a moment. In the first full Phase 11 run, it read the log too early.
  - **Fix:** it now first waits for this run to show "Preparing" or "Running". The check is stricter, not weaker.
- `tests/e2e/helpers.mjs`: `E2E_VERBOSE=1` prints the full error of a failed step (default output unchanged).
- `tests/e2e/run-all.mjs`: the `learning` suite was added at the end.

## Regression found and fixed during Phase 11

The first full run failed two existing steps: "A Phase 1 (schema v1) project still opens" and "A schema v2 project is upgraded". The migration message "Upgraded 1 project(s)…" no longer reached the Console.

- **Cause:** the new lazy pages share the project store, so the bundler moved it into a separate chunk that is evaluated before `bootstrap.ts` connects the Console.
- **Fix:** `utils/logger.ts` keeps messages logged before the Console connects (up to 200), and `connectConsoleToBus()` adds them on connection. Both suites pass again.

## Not executed

- Physical hardware tests: none (no hardware).
- ESP32 firmware compilation: still blocked (toolchain unavailable).
- Screen reader testing.
- Browsers other than the Playwright Chromium build.

## Screenshots

`docs/testing/phase-11/`:

- 01–13: the journeys;
- `responsive-<width>-<page>.png`: layouts at 1440, 1024, 768, 600 and 375 px.
