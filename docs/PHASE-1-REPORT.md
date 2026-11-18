# Phase 1 Delivery Report — Foundation & UI Architecture

Date: 18 Nov 2026 · Version 0.1.0

## 1. Completed features

- **Dashboard:** welcome header, Create New Robot, journey cards (Design available; Program, Simulate and AI shown with their phase), recent projects with an empty state and delete confirmation, four sample templates (Explorer Bot, Robotic Arm, Humanoid Robot, Quadcopter Drone) clearly labeled "Sample template", and a navigation sidebar. Modules that are not built yet are listed as locked roadmap items, not clickable buttons.
- **My Projects page:** all local drafts with open and delete.
- **Create Robot flow:** 6 categories, starter templates per category (plus Blank), name validation, live summary, Create Workspace.
- **Workspace:**
  - Top bar: back to dashboard (with unsaved-changes guard), editable project name, save state, Build / Code (Phase 4) / Simulate (Phase 5) modes, undo and redo, panel toggles, settings, Save.
  - Left panel: Components (7 categories, 23 placeholder components, click to add), Library (insert a starter robot into the scene), Templates (start a new project), Objects (scene list with show/hide), and search for each tab.
  - Center: real Three.js scene with grid, labeled X/Y/Z axes, lights and shadows, orbit/pan/zoom, Perspective/Front/Back/Left/Right/Top views with smooth camera moves, frame-all, grid/axes/shadow toggles, an orientation gizmo, click-to-select with highlight.
  - Right panel: properties inspector with name, category, position, rotation and scale editing, reset, metadata, hide, duplicate and delete. With nothing selected it shows the project summary.
  - Bottom panel: Console with level filters, Bus Events (live Connector Bus traffic), and Status (system, simulation "not connected", connectors C1–C8 and their phases). Collapsible.
  - Status bar, settings dialog (rotation units, nudge step, unsaved warning, hints), keyboard shortcuts.
- **Local draft saving** in the browser, which survives page reloads.
- **Connector Bus** (master plan Phase 0) carrying all logs and editor events.

## 2. Folder structure

See README.md, "Project layout", and docs/architecture/PHASE-1-ARCHITECTURE.md.

## 3. Dependencies

| Package | Version | Why |
| --- | --- | --- |
| react, react-dom | 19.3 | UI |
| react-router-dom | 7.18 | Dashboard / new / workspace routes |
| three | 0.187 | 3D rendering |
| @react-three/fiber | 9.8 | React renderer for Three.js |
| @react-three/drei | 10.7 | OrbitControls, Grid, Gizmo, Edges |
| zustand | 5.1 | Separated app and editor stores |
| lucide-react | 1.75 | Consistent icon set |
| tailwindcss + @tailwindcss/vite | 4.3 | Styling with design tokens (dev) |
| typescript | 7.0 | Strict typing (dev) |
| vite, @vitejs/plugin-react | 8.3 / 6.1 | Dev server and build (dev) |
| oxlint | 1.90 | Linting (dev, came with the Vite template) |
| vitest, jsdom | 5.1 / 31 | Unit tests (dev) |
| playwright | 1.65 | Browser journey test (dev) |

No physics, coding, AI, auth or backend libraries were added.

## 4. Build and test results (all actually run)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | Pass, 0 errors |
| Lint | `npm run lint` | Pass, 0 warnings |
| Unit tests | `npm run test` | 15 / 15 pass |
| Production build | `npm run build` | Pass. Dashboard 97 KB gzip, workspace 277 KB gzip (lazy) |
| Browser journey (headless Chrome, WebGL via SwiftShader) | `npm run test:e2e` | 21 / 21 steps pass, 0 console errors |

Browser journey steps: dashboard empty state and templates · navigation · create robot with validation · workspace panels · real WebGL render check (pixel analysis) · orbit, pan and zoom change the image · all six view buttons produce distinct views · keyboard view shortcut · select by clicking in 3D · select from Objects list · edit position, rotation and scale with undo/redo · rename · add a component · console, bus events and status · collapse/expand all three panels · save and reload · unsaved-changes guard with Save and leave · reopen from dashboard · Arm, Humanoid and Drone templates render · unknown project shows not-found · no console errors.

Screenshots from the run are in `docs/testing/screenshots/`.

## 5. Known limitations

- Drafts live in one browser only. Clearing site data deletes them. Cloud storage is Phase 8.
- Objects are placeholder primitives with no mass, joints or behavior. No drag-and-drop or move gizmo yet (Phase 2). → *Resolved in Phase 2.*
- ~~The browser Back button does not show the unsaved-changes dialog.~~ → *Fixed, see section 9.*
- ~~The workspace is desktop-first (1280 px+). Smaller screens show a notice with "Continue anyway".~~ → *Improved, see section 9.*
- ~~Clicking the orientation gizmo moves the camera but the view label does not change.~~ → *Fixed, see section 9.*
- Rendering was tested in headless Chrome with software WebGL. Please also check it manually in your own browser.

## 6. Manual testing instructions

1. Run `npm install` then `npm run dev` and open the printed address.
2. On the dashboard, click **Create New Robot**, keep Mobile Robot + Explorer Bot, name it, click **Create Workspace**.
3. In the 3D view: left-drag to orbit, right-drag to pan, scroll to zoom. Click each view button (Perspective, Front, Back, Left, Right, Top). Press `1`–`6` and `F`.
4. Click the robot body. Check the Properties panel. Change Position X to `0.5` and press Enter. Press `Ctrl+Z` and `Ctrl+Shift+Z`.
5. In Components, click **Lidar**. It appears at the center and is selected. Check the Console and Bus Events tabs.
6. Collapse and expand the left, right and bottom panels.
7. Click **Save**, reload the page, and check that your changes are still there.
8. Change something, click the back arrow at top left, and try the three options in the dialog.

## 7. Recommended next steps (Phase 2 — Modular Robot Builder)

1. Move/rotate gizmos in the viewport (drei TransformControls) wired to the same `updateTransform` command.
2. Parent-child hierarchy using the reserved `parentId`, with a tree view in Objects.
3. Joint definitions (revolute, prismatic, fixed) with axis and limits, and joint editing in the inspector.
4. Drag-and-drop from the component library onto the scene or onto a parent part.
5. Activate connector C1 (Robot Model Connector) and bump the project schema to v2 with a migration.

Phase 2 will not start until you approve.

## 8. Files created

- docs/architecture/PHASE-1-ARCHITECTURE.md
- src/app/App.tsx
- src/app/providers/AppProviders.tsx
- src/app/routes/DashboardPage.tsx
- src/app/routes/NewRobotPage.tsx
- src/app/routes/NotFoundPage.tsx
- src/app/routes/ProjectsPage.tsx
- src/app/routes/WorkspacePage.tsx
- src/components/common/Badge.tsx
- src/components/common/Button.tsx
- src/components/common/EmptyState.tsx
- src/components/common/Logo.tsx
- src/components/common/Modal.tsx
- src/components/common/Tabs.tsx
- src/components/dashboard/DeleteProjectDialog.tsx
- src/components/dashboard/ProjectCard.tsx
- src/components/dashboard/RobotThumbnail.tsx
- src/components/dashboard/TemplateCard.tsx
- src/components/layout/AppShell.tsx
- src/components/layout/AppSidebar.tsx
- src/components/workspace/BottomPanel.tsx
- src/components/workspace/LeftPanel.tsx
- src/components/workspace/ObjectsPanel.tsx
- src/components/workspace/RightPanel.tsx
- src/components/workspace/SettingsDialog.tsx
- src/components/workspace/StatusBar.tsx
- src/components/workspace/ViewportToolbar.tsx
- src/components/workspace/WorkspaceTopBar.tsx
- src/core/bus/channels.ts
- src/core/bus/connectorBus.ts
- src/features/builder/README.md
- src/features/code-studio/README.md
- src/features/component-library/ComponentLibraryPanel.tsx
- src/features/component-library/catalog.ts
- src/features/console/ConsoleView.tsx
- src/features/console/StatusView.tsx
- src/features/controls/README.md
- src/features/inspector/Inspector.tsx
- src/features/inspector/NumberField.tsx
- src/features/projects/materialize.ts
- src/features/projects/workspaceActions.ts
- src/features/robot-formats/README.md
- src/features/robot-library/RobotLibraryPanel.tsx
- src/features/robot-library/templates.ts
- src/features/sensors/README.md
- src/features/simulation/README.md
- src/features/viewport/CameraRig.tsx
- src/features/viewport/SceneAxes.tsx
- src/features/viewport/SceneObjectMesh.tsx
- src/features/viewport/Viewport.tsx
- src/features/viewport/cameraPresets.ts
- src/features/viewport/webgl.ts
- src/hooks/useWorkspaceShortcuts.ts
- src/index.css
- src/main.tsx
- src/stores/consoleStore.ts
- src/stores/projectStore.ts
- src/stores/sceneStore.ts
- src/stores/selectionStore.ts
- src/stores/settingsStore.ts
- src/stores/stores.test.ts
- src/stores/viewportStore.ts
- src/stores/workspaceStore.ts
- src/types/console.ts
- src/types/index.ts
- src/types/project.ts
- src/types/scene.ts
- src/types/viewport.ts
- src/utils/cn.ts
- src/utils/format.ts
- src/utils/id.ts
- src/utils/logger.ts
- src/utils/math.test.ts
- src/utils/math.ts
- src/utils/storage.ts
- tests/e2e/workspace.e2e.mjs

Also: README.md, package.json, vite.config.ts, tsconfig.app.json, index.html, public/favicon.svg, .gitignore

## 9. Corrections delivered on 18 Nov 2026 (with Phase 2)

| # | Issue | Fix | Files |
| --- | --- | --- | --- |
| 1 | Browser Back / Forward did not ask about unsaved changes | Switched to React Router's data router (`createBrowserRouter`; demo builds use `createMemoryRouter`), which is required for `useBlocker`. One blocker in the workspace now guards in-app links, the back arrow, browser Back and browser Forward with a single dialog: **Save and leave**, **Discard changes and leave**, **Cancel**. The `beforeunload` guard for closing or reloading the tab is unchanged. | `src/app/App.tsx`, `src/app/routes/WorkspacePage.tsx` |
| 2 | Orientation gizmo did not update the view label | `CameraRig` now watches the real camera. When it settles (after a button, a gizmo click, an orbit drag or damping), its direction is matched against the six standard views, otherwise "Custom view". It writes the existing `viewportStore.activeView`; there is no second camera state. A relative movement threshold avoids waiting forever on damping drift. | `src/features/viewport/CameraRig.tsx`, `cameraPresets.ts` (`classifyView`), `src/stores/viewportStore.ts` |
| 3 | README claimed Node 20+ | Checked every dependency's `engines` field in `package-lock.json`. The binding limits come from Vitest and jsdom: Node **^22.22.2, ^24.15.0 or ≥26**. Vite alone accepts 20.19+. `package.json` now has an `engines` field; `package-lock.json` was regenerated with `--package-lock-only` (no dependency changes). Only Node 22.23.5 is verified. | `package.json`, `package-lock.json`, `README.md` |
| 4 | Workspace broke below 1280 px | Below 1024 px the side panels start closed and open as slide-over drawers on top of the viewport (the viewport keeps its size; click outside to close). The viewport toolbar wraps, secondary labels hide on small screens, the console is shorter, and the blocking full-screen notice became a slim dismissible banner under 768 px. The desktop layout is unchanged. | `WorkspacePage.tsx`, `LeftPanel.tsx`, `RightPanel.tsx`, `WorkspaceTopBar.tsx`, `ViewportToolbar.tsx`, `BottomPanel.tsx`, `StatusBar.tsx`, `src/hooks/useMediaQuery.ts` |

### Regression results after the corrections (all actually run, 18 Nov 2026)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, 0 warnings |
| `npm run test` | 49 / 49 pass (the 15 Phase 1 tests are unchanged and still pass) |
| `npm run build` | Pass |
| Original Phase 1 browser journey (`tests/e2e/workspace.e2e.mjs`, unchanged) | 21 / 21 steps, 0 console errors |
| New corrections suite (`tests/e2e/corrections.e2e.mjs`) | 20 / 20 steps, 0 console errors |

The corrections suite covers: Back with Cancel, Back with Discard, Forward after discard, Back with Save, Forward protection, `beforeunload` still active, single dialog for the in-app arrow, toolbar/label agreement, gizmo Y → Top view, gizmo X → Right view, orbit → Custom view, desktop layout unchanged at 1440 px, drawers at 900 px and 600 px without resizing the viewport, no horizontal overflow or clipped toolbar, the small-screen banner, and restoring the desktop layout.
