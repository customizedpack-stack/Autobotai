# Phase 1 Architecture Decisions

Status: approved plan, implemented 18 Nov 2026.

> **Updated in Phase 2:** routing moved to React Router's data router (needed for `useBlocker`); demo builds use `createMemoryRouter`. The scene model is now schema v2 with a component hierarchy, local transforms and joints (see `SCHEMA-V2.md`). Structural edits go through the C1 Robot Model Connector (see `C1-ROBOT-MODEL-CONNECTOR.md`). `SceneObjectMesh` was replaced by `SceneObjectNode` (nested rendering).

## How Phase 1 maps to the master build plan

| Master plan | Covered in Phase 1 |
| --- | --- |
| Phase 0 — DNA | Shared types (`src/types`), separated stores, and a minimal typed **Connector Bus** (`src/core/bus`) |
| Phase A — Face | Dashboard, create-robot flow, multi-panel workspace, real 3D viewport |
| Everything else | Not implemented. Boundaries reserved in `src/features/*/README.md` |

## Decisions

1. **Single Vite app, monorepo-ready.** Folders mirror the future packages (`types` → `shared-types`, `core/bus`, `features/*`). Moving to pnpm workspaces later is a file move, not a rewrite.
2. **Connector Bus now, no extra libraries.** `ConnectorBus` is a ~60-line typed publish/subscribe class. All console output (C7 Telemetry and Log) and editor events (`project.*`, `scene.changed`, `selection.changed`, `viewport.viewChanged`) flow through it. The Bus Events tab shows the traffic live. Connectors C1–C8 from the master plan are declared in `channels.ts` with the phase that activates them. A throwing subscriber is isolated so one module cannot break another.
3. **Component library clicks add a placeholder at the origin.** No drag-and-drop, attachment or joints (Phase 2).
4. **State is split by concern** (Zustand): `projectStore` (persisted local drafts), `sceneStore` (open scene + undo/redo, 100 steps), `selectionStore`, `workspaceStore` (panel layout, persisted), `viewportStore` (camera view requests, grid/axes/shadows), `consoleStore`, `settingsStore` (persisted).
5. **Editor commands live outside components** (`features/projects/workspaceActions.ts`): save, undo, redo, add component, insert template, delete, duplicate. Toolbar buttons, keyboard shortcuts and, later, code and AI call the same commands.
6. **Three.js is isolated in `features/viewport`.** The viewport only reads stores. Camera presets are pure functions (`cameraPresets.ts`) with unit tests. Overlay toolbars are normal React UI outside the Canvas.
7. **Coordinate convention:** Y-up, meters, rotations stored in radians (displayed in degrees by default). Robotics tools often use Z-up; the Robot Formats phase will convert at import/export time.
8. **Inspector edits commit on Enter or blur**, so one edit equals one undo step. Arrow keys nudge (Shift = ×10). No-op edits are ignored so history stays clean.
9. **Code splitting:** the workspace (Three.js) loads only when opened. Dashboard bundle ≈ 97 KB gzip; workspace ≈ 277 KB gzip.
10. **Demo builds** (`npm run build:demo`) use relative paths and in-memory routing so they work from any static host.
11. **Axis labels are WebGL sprites**, not HTML overlays. HTML overlays caused a DOM `removeChild` error when the workspace closed; sprites avoid it.
12. **Card thumbnails are SVG schematics**, not live 3D. Browsers allow only a few WebGL contexts, so 3D is kept to the one workspace viewport.

## Data model (schema v1)

`RobotProject { id, name, category, templateId, schemaVersion, objects[], createdAt, updatedAt, savedAt }`

`SceneObject { id, name, category, geometry (box | cylinder | sphere | capsule | cone), color, transform { position, rotation, scale }, visible, parentId (reserved, null), metadata { componentId, description, createdAt } }`

Phase 2 extends this with hierarchy and joints; the `schemaVersion` field allows migration.
