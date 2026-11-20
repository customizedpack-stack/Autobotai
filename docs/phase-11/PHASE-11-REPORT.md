# Phase 11 report — Guided Robotics Learning Platform and UI/UX redesign

Branch `phase-11-learning` (based on `phase-10-hardware`). Version 0.11.0.

## 1. Status

**Complete.** All six milestones are implemented and tested. Typecheck, lint, 499 unit and integration tests, the build, 14 browser suites (262 steps) and the 261 firmware host checks all pass on the final code.

Physical hardware tests and ESP32 compilation remain **not run / blocked**, exactly as in Phase 10.

## 2. Milestones

| Milestone | Status | Evidence |
|---|---|---|
| 11.1 UX audit and navigation redesign | Done | `PHASE-11-AUDIT.md`; new navigation, dashboard and experience modes; e2e Beginner and Professional journeys |
| 11.2 Robotics Project Library | Done | Six versioned definitions, verified statuses, library and detail pages, safe creation; unit tests and e2e |
| 11.3 Guided Tutorial Engine | Done | One nine-stage journey, Learn → Do → Verify on real state, persisted progress, completion; unit, integration and e2e |
| 11.4 Reverse Engineering Mode | Done | Read-only inspection, relationships, program explanation, build sequence; unit tests and e2e |
| 11.5 Guided Robot Purpose Builder | Done | Rule-based matcher, guided questions, honest unsupported goals; unit tests and e2e |
| 11.6 Integration, responsive polish and QA | Done | Five-width layouts, accessibility checks, contrast fix, full regression |

## 3. Features implemented

- **Navigation:** Dashboard, Learn Robotics, Project Library, My Projects and Robot Builder, as one list for the sidebar and mobile header. The stale phase labels are removed.
- **Dashboard:** built around the next action, in this order: welcome, mode choice, "What do you want to build?", Start Learning / Explore Projects / Create a Robot, Continue Learning, Learning Progress, recent projects, templates.
- **Experience modes:**
  - Beginner: core modes plus More tools, a one-line tip and the next action.
  - Professional: unchanged; it is the default.
  - Reverse Engineering: projects open in inspection.
  - The mode is persisted in settings and never changes project data. The E-STOP is untouched.
- **Project Library:** six projects on existing templates. Each shows its capability statuses (Supported, Simulation Only, Physical Build Guide Available, Hardware Deployment Available, Requires Configuration, Not Yet Supported). The detail page has four working actions and a budget from verified prices only.
- **Tutorial engine:**
  - reusable definitions with conditional steps;
  - automatic checks on the live robot (components, selection, drive via `diagnoseDrive`, joint actuators, sensors, saved programs, environments, Blueprint mappings, completed runs, saved state) and labeled manual checks;
  - recovery help on failure;
  - persisted progress; pause, resume, review, skip optional steps, restart;
  - a completion summary.
- **Reverse Engineering:**
  - separate inspection state, purple highlight and camera focus;
  - hierarchy, relationships, joints, Blueprint parts;
  - line-by-line program explanation linked to the inspected part;
  - derived build sequence;
  - read-only guards.
- **Purpose Builder:** a free-text goal plus five optional questions. It returns the best match with reasons, alternatives, statuses, verified budget and the tutorial, and gives honest messages for unsupported goals.

## 4. Files

**Created**

- `src/features/learning/`:
  - `model/types.ts`
  - `catalog/projects.ts`, `catalog/tutorials.ts`
  - `engine/checks.ts`, `engine/tutorialEngine.ts`, `engine/progress.ts`, `engine/evidence.ts`, `engine/projectFactory.ts`, `engine/origins.ts`, `engine/library.ts`, `engine/budget.ts`, `engine/purposeMatcher.ts`, `engine/reverse.ts`, `engine/programExplain.ts`
  - `store/learningStore.ts`, `store/learningSession.ts`
  - 12 component files
  - 4 pages
  - 2 test files
- `src/components/layout/navigation.tsx`
- `tests/e2e/learning.e2e.mjs`
- `docs/phase-11/` (10 documents)
- `docs/testing/phase-11/` (29 screenshots)

**Modified (backward-compatible)**

- `App.tsx` (routes), `bootstrap.ts` (evidence recorder)
- `AppShell`, `AppSidebar`, `DashboardPage`
- `WorkspacePage` (session, panel, inert panels while inspecting), `WorkspaceTopBar` (Beginner tools, tutorial and inspect buttons, read-only Save), `StatusBar`
- `Viewport`, `SceneObjectNode`, `CameraRig`, `viewportStore` (inspection highlight and focus)
- `settingsStore` (experience mode), `useWorkspaceShortcuts` (read-only Ctrl+S)
- `logger.ts` and `consoleStore.ts` (early-message buffer, see the test report)
- `AppProviders.tsx` (start-up message)
- `index.css` (faint text contrast)
- `package.json` (0.11.0)
- `README.md`
- e2e `helpers.mjs`, `run-all.mjs`, `sensors.e2e.mjs` (race fix)

**Data and migrations:** none needed.

- The project schema is unchanged.
- The new learning data lives in `arai.learning.v1`.
- The new settings fields have defaults, and Zustand `persist` merges them into stored settings.

## 5. Existing phases preserved

All 13 Phase 1–10 browser suites pass unchanged (237 steps), plus all 477 earlier unit tests.

- Rapier, the robot model, C1, C2 and C3, Code Studio and its sandbox, cameras, the environment editor, Blueprint and hardware are reused, not replaced.
- Professional Mode is the default.

## 6. Tests actually executed

See `TEST-REPORT.md`. Summary:

| Command | Exit code | Result |
|---|---|---|
| typecheck | 0 | No errors |
| lint | 0 | No findings |
| test | 0 | 499/499 |
| build | 0 | OK |
| test:e2e | 0 | 14 suites, 262/262 steps |
| test:firmware | 0 | 261 checks |

## 7. Tests failed

None in the final run.

During development, the first full run failed two existing steps: Phase 1 and v2 migration messages were missing from the Console because of a chunking change. One step had a race in the existing sensors test. Both were fixed and the full gate was rerun.

## 8. Tests not executed

- Physical hardware tests (no hardware).
- ESP32 firmware compilation (blocked).
- Screen reader testing.
- Non-Chromium browsers.

## 9. Build and lint

The build succeeds and lint is clean. The startup JavaScript is 0.91 MB in one chunk; Phase 10 loaded 1.06 MB in two. The new pages and the project factory load on demand.

## 10. Regression

The browser suite checks that a project built with Phase 7–10 features keeps byte-identical stored data after every Phase 11 page and mode change. The one exception is the documented Phase 7 `environmentId` → `"floor"` case. The project's program and hardware profile are still present. The inspected example project is byte-identical before and after inspection.

## 11. Screenshots

`docs/testing/phase-11/`: 13 journey screenshots and 16 responsive screenshots.

## 12. Known limitations

See `KNOWN-LIMITATIONS.md`. In short:

- no line sensor, grasping, recognition, soil sensors or mapping;
- physical deployment only for the Explorer Bot reference profile, never tested on real hardware;
- manual checks are self-reported;
- "expected behavior" is a completed run, not a measured behavior;
- example robots are normal projects;
- programs can still be saved inside Code Studio during inspection.

## 13. Manual verification required

- Read the six project pages and tutorials for wording and teaching quality.
- Try the Beginner flow on a phone-sized screen with touch.
- A screen reader pass (NVDA or VoiceOver).
- Physical hardware: everything listed in the Phase 10 report is still not run.

## Acceptance checklist

| Criterion | Result |
|---|---|
| Phase 1–10 functionality preserved | Yes (13 earlier suites, 477 earlier unit tests) |
| Existing projects remain compatible | Yes (regression step; no schema change) |
| Dashboard redesigned | Yes |
| Beginner Mode works | Yes (e2e) |
| Professional Mode works | Yes (e2e) |
| Reverse Engineering Mode works | Yes (e2e) |
| Six project definitions available | Yes |
| Each project opens a usable robot template | Yes (unit test for all six; e2e for Obstacle Avoidance) |
| Project support status is accurate | Yes (statuses checked against code; unit tests) |
| Tutorial Engine works | Yes |
| Learn → Do → Verify works | Yes |
| Tutorial progress saves and resumes | Yes |
| Failed verification explains recovery | Yes |
| Reverse component exploration works | Yes |
| Program explanation uses actual program data | Yes |
| Guided Purpose Builder works | Yes |
| Recommendations match actual capabilities | Yes |
| Unsupported goals are handled honestly | Yes |
| Desktop, tablet and mobile layouts verified | Yes (automated overflow checks and screenshots) |
| Accessibility checks completed | Automated checks yes; screen reader not run |
| Existing regression tests pass | Yes |
| New unit tests pass | Yes (20) |
| New integration tests pass | Yes (2) |
| New E2E tests pass | Yes (25 steps) |
| Documentation complete | Yes |
| Screenshots captured | Yes |
| Known limitations documented | Yes |
