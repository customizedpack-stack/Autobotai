# Phase 9 — Final Corrections and Verification

- **Date:** 2026-11-20
- **Branch:** `phase-9-corrections` (based on `phase-9-blueprint`)
- **Scope:** Phase 9 was not rewritten and Phase 10 was not started.

## Fix 1: Compatibility with more than one motor driver

**Problem.** The total channel count added up every mapped driver, but every motor's voltage and current were checked against `drivers[0]` only. On a robot with two or more drivers, a motor wired to another driver was judged against the wrong ratings.

**Fix** (`src/features/blueprint/engine/compatibility.ts`, `model/types.ts`, `model/normalize.ts`, `blueprintActions.ts`, `components/PartsTab.tsx`)

- **Explicit assignment.** A motor mapping can now record which driver it is wired to, as the optional field `driverMappingId` (the mapping id of a driver). It is set with the new **Driver** selector on each motor in Real Parts. Each change is one undo step and records a "Motor driver assigned" history event.
  - The virtual robot model is not touched. Component ids, joints, actuators and sensors stay the same.
  - Older blueprints load unchanged; the field is optional and the migration keeps it.
- **`motorDriverAssignments()`** sorts every motor into one of four cases:

| Case | When | What is checked |
|---|---|---|
| `explicit` | The user chose a driver | Checks run against that driver |
| `only-driver` | No choice stored and exactly one driver is mapped | It is the only possible driver, so checks run against it. The check title says "(the only mapped driver, …)" |
| `unassigned` | No choice stored and two or more drivers are mapped | One **Unknown** check, "driver not assigned", with the reason. No voltage or current check is made, so it can never show as Compatible |
| `missing-driver` | The chosen driver was removed | One **Unknown** check, "no longer mapped" |

- **Per-motor checks.** Voltage and current are checked for every motor against its own driver. Each check names that driver, so different driver models and ratings are handled correctly.
- **Channel capacity.** The existing check of total motors against total channels is kept. A new `driverload:` check compares each driver with the motors assigned to it, so a driver with too many motors is flagged even when the total capacity is enough.
- **Power checks** (battery against motor, battery against driver) now run for every motor and every driver, not only the first.
- **Reasons.** Every warning, incompatibility and Unknown comes with a reason.

**Tests**

- `src/features/blueprint/tests/corrections.test.ts`, describe "Fix 1", has 6 tests. They use two different driver models, the TB6612FNG and a test-only "small" driver rated 2–5 V, 0.5 A continuous and 1.2 A peak, with four motors (three HP micro motors and one 25D motor). They cover:
  - two drivers and no assignment (Unknown, nothing Compatible);
  - each motor against its own driver (one voltage-compatible with a current warning, one over voltage and over peak current);
  - too many motors on one driver while the total capacity is enough;
  - a removed driver;
  - undo, the migration, and save and reload;
  - a single driver.
- The browser test `tests/e2e/blueprint.e2e.mjs` covers C1 (a second driver makes both motors Unknown) and C2 (assigning each motor gives per-driver checks).

## Fix 2: Unsaved Build History warning

**Problem.** History events from model changes, program changes and completed runs were added to the log without marking the project as unsaved. Leaving without saving could therefore drop them without any warning. Also, an old project with history but no other blueprint content did not write its blueprint on Save, so that history was dropped even after saving.

**Fix** (`blueprintStore.ts`, `features/projects/workspaceActions.ts`, `components/workspace/WorkspaceTopBar.tsx`, `app/routes/WorkspacePage.tsx`, `components/HistoryTab.tsx`)

- **Detecting unsaved history.** Every recorded history event now marks the blueprint as unsaved and adds to a new counter, `unsavedEvents`. Undo, redo and saving a version count as well. Save resets both.
- **Indicators.**
  - The top bar shows "Unsaved changes" with an "N history" badge, and its tooltip lists what changed.
  - The Build History tab shows a banner.
  - The status bar shows "Draft: unsaved".
- **Leave warning.**
  - Leaving the workspace (the back arrow, links, or the browser's Back and Forward) uses the new `hasUnsavedProjectChanges()` check. It opens the existing dialog with **Cancel**, **Discard changes and leave** and **Save and leave**. The dialog now also says how many history events are unsaved.
  - Closing or reloading the tab still triggers the browser's own warning.
- **Never silently discarded.** Save now writes the blueprint whenever it has content or recorded history; only the automatic "Blueprint started" entry is not enough. An untouched old project still saves without a `blueprint` field. Discarding happens only when the user chooses "Discard changes and leave".
- **No save loop.** Loading a project does not mark it unsaved, saving records no history event, and saving twice changes nothing (all three are tested).
- **Saving stays manual.** Saving is still done only with the Save button or Ctrl+S, in local browser storage. Nothing is saved to the cloud or automatically.

**Tests**

- `corrections.test.ts`, describe "Fix 2", has 4 tests:
  - no loop on load or save;
  - a history-only event (saving a program) marks the project unsaved, and Save keeps it through a reload;
  - an old project stays untouched until it changes, and after a model edit its history is saved;
  - Cancel or Discard never writes history.
- The browser test covers:
  - **C3:** the badge and banner appear, and leaving shows the warning with the history count. Cancel keeps you in the workspace with the changes still unsaved.
  - **C4:** "Save and leave", then reopening, keeps the assignment history with nothing unsaved.
  - **C5:** saving a program in Code Studio is flagged as unsaved, and Save plus a reload keeps the event.

**Behavior change to note.** Saving or creating a Code Studio program, or finishing a run, now records a history event. Because of that, the project shows "Unsaved changes" until you click Save. This is intended, so that history is never dropped without a warning.

## Fix 3: Regression verification

All commands ran on 2026-11-20 in this environment (Node 22, headless Chrome with software rendering). Nothing below is estimated.

| Command | Exit code | Result |
|---|---|---|
| `npm run typecheck` | 0 | No errors |
| `npm run lint` | 0 | oxlint: no warnings or errors |
| `npm run test` | 0 | **430 / 430** tests in **44** files. That is 420 before plus 10 new. One existing assertion was made stricter (see below) and none were removed. |
| `npm run build` | 0 | Built |
| `npm run test:e2e` | 0 | **12 / 12 suites, 214 / 214 steps** |

End-to-end steps by suite:

| Suite | Steps | What it covers |
|---|---|---|
| workspace | 21 | Phase 1 journey |
| corrections | 20 | Phase 1 corrections |
| builder | 21 | |
| control | 17 | Differential drive |
| code-studio | 20 | |
| physics | 15 | |
| sensors | 11 | |
| environment | 19 | Environment Editor |
| verification | 13 | |
| drive-compatibility | 9 | |
| camera | 18 | Camera simulation |
| blueprint | 30 | The 22 Phase 9 steps, C1–C5, layout and console errors |

Each area the brief asked about, and where it was checked:

| Area | Checked by |
|---|---|
| Multiple motor drivers | Fix 1 unit tests; browser steps C1 and C2 |
| Multiple motor assignments | Fix 1 unit tests; browser step C2 |
| Missing assignment | Fix 1 unit tests (unassigned and removed driver); browser step C1 |
| Unsaved history | Fix 2 unit tests; browser steps C3 and C5 |
| Save and reload | Unit tests; browser steps 18, 19, C4 and C5 |
| Phase 1–8 workflows | All 11 earlier e2e suites and the 395 earlier unit tests |
| Differential drive | control, drive-compatibility and blueprint step 20 |
| Camera simulation | camera suite and blueprint step 22 |
| Environment Editor | environment and verification suites |
| Code Studio | code-studio suite and blueprint steps 21 and C5 |

**One test was adjusted.** In `blueprint.test.ts`, "marks a stall current above the driver peak incompatible and missing data unknown", the old check allowed any `driver:channels` result. It now also requires that the motor's voltage check and current check both exist and are both Unknown. Only the new per-driver capacity check (`driverload:`, which does not use motor electrical data) is allowed besides them. The assertion is stricter than before.

## Limitations

- **Single-driver default.** With exactly one mapped driver, motors without an explicit assignment are checked against that driver. It is the only possible driver, and the check title says so. With two or more drivers, nothing is assumed.
- **Assignment versus wiring.** The assignment is a blueprint record and is not taken from the wiring list. The "standard wires" helper still adds wires per driver, and it does not check them against the assignments.
- **Unsaved after program changes.** Program changes and completed runs make the project "unsaved", as described above.
- **Not tested here:** printing to PDF, real touch devices, Safari and Firefox. The same limits as in `docs/PHASE-9-REPORT.md` apply.
