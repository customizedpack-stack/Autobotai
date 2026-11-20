# Phase 11 implementation plan

Branch `phase-11-learning`, based on `phase-10-hardware`. Every milestone extends existing code; nothing is rewritten.

## Architecture decisions

1. **One new feature module**, `src/features/learning/`:
   - `model/` — typed, versioned definitions (projects, tutorials, capability statuses, experience modes).
   - `catalog/` — the six project definitions and the tutorial builder.
   - `engine/` — verification checks, tutorial sequencing, the purpose matcher, relationship and program analysis.
   - `store/` — `learningStore` (persisted as `arai.learning.v1`) and a non-persisted inspection state.
   - `components/` — library, detail, learn, purpose-builder pages, the workspace learning panel.
   - `tests/` — unit and integration tests.
2. **No new robot model.** Projects are created by the existing `projectStore.createProject` from existing templates. Extra setup (a camera, arm actuators, a starter program, an environment) uses the existing builders: `defaultCamera` + `cameraMountSpot`, `buildActuator`, `useProgramStore.createProgram`, `setProjectEnvironment`.
3. **No project schema change.** Which library entry a project came from is stored in the learning store, keyed by project id. Tutorial progress stores ids, step states and verification results only, never a robot copy.
4. **Verification reads real state.** Checks read the live scene store when the project is open (unsaved edits count), otherwise the saved project, plus the program, environment, blueprint and execution stores. Drive checks reuse `diagnoseDrive`. Manual checks are labeled "Manual check".
5. **Experience mode** is added to `settingsStore` (`arai.settings.v1`) with a default of Professional. Changing it never touches project data or the running simulation.
6. **Workspace integration** is one learning panel beside the viewport, opened by `?tutorial=<id>` or `?inspect=1`. Inspection uses its own `inspectedId`; the viewport sends clicks there only while inspection is on.
7. **Routes** (React Router, same conventions): `/learn`, `/library`, `/library/:slug`, `/builder`. Existing routes are unchanged.
8. **Purpose Builder** is deterministic keyword and answer scoring against the six definitions; no external AI.

## Milestones and checkpoints

| Milestone | Deliverables | Checkpoint |
|---|---|---|
| 11.1 | Shared navigation, sidebar cleanup, dashboard redesign, experience mode setting, Beginner workspace (core modes + More tools + guide strip) | typecheck, lint, existing unit tests |
| 11.2 | Six definitions, capability statuses, library and detail pages, safe project creation (Open Robot, completed example) | unit tests for definitions, mapping, filtering |
| 11.3 | Nine-stage tutorial builder with conditional steps, Learn → Do → Verify, persisted progress, panel, completion summary | unit and integration tests for sequencing and checks |
| 11.4 | Inspection panel, hierarchy, relationships, program explanation, build sequence, read-only guard | unit tests for relationships and program explanation |
| 11.5 | Purpose Builder page and matcher, unsupported goals | unit tests for matching |
| 11.6 | Responsive checks (1440/1024/768/600/375), accessibility checks, five e2e journeys, full regression, docs and screenshots | full gate |
