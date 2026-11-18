# Phase 2 Delivery Report — Modular Robot Builder

Date: 18 Nov 2026 · Version 0.2.0 · Branch `phase-2-builder`

Phase 2 was built on top of the existing Phase 1 application. Nothing was rebuilt from scratch: the existing stores, catalog, templates, Connector Bus, undo/redo history, project storage and viewport were extended. The Phase 1 corrections delivered together with this phase are documented in `docs/PHASE-1-REPORT.md`, section 9.

## 1. Phase 1 corrections completed

| Correction | Result |
| --- | --- |
| Browser Back / Forward protection | Done. One `useBlocker` guards every route change. Single dialog: Save and leave / Discard changes and leave / Cancel. `beforeunload` kept. |
| Orientation gizmo sync | Done. Camera settle detection classifies the real camera direction (standard view or Custom) into the existing `viewportStore.activeView`. |
| Node.js requirements | Done. `engines`: `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`. README updated. Only Node 22.23.5 verified. |
| Responsive workspace | Done. Drawers below 1024 px, wrapping toolbars, dismissible banner below 768 px; desktop unchanged. |
| Regression tests | Done. 20-step browser suite plus the unchanged 21-step Phase 1 journey; see section 8. |

## 2. Phase 2 features completed

**Viewport transform controls**
- Move (W), Rotate (E) and Scale (R) gizmos, plus a Select-only tool (Q). They use `TransformControls` from `@react-three/drei`, which is already installed.
- A gizmo-axis toggle switches between world and local axes.
- A snap toggle (S) snaps to 1 cm, 15° and 0.1×.
- Gizmos and the inspector edit the **same** local transform in `sceneStore`. While you drag, the inspector updates live, and the whole drag becomes **one** undo step through a transient change: `beginTransientChange` → `previewTransform` → `endTransientChange`. Numeric edits still go through `updateTransform` and update the viewport immediately.
- The orbit camera is disabled while a gizmo is being dragged.

**Parent–child hierarchy**
- Every component has `parentId` (Phase 1 reserved it) and a **local** transform. Children are derived from `parentId`.
- The viewport renders the tree as nested groups, so moving a parent moves everything attached to it while the children's local transforms stay the same.
- The Objects tab is now a tree under the robot's name:
  - Rows expand and collapse, and indentation shows nesting.
  - Joint badges (REV / FIX / PRI) can be clicked to select the joint.
  - Drag a row onto another row to attach it. Drop it on the robot name to detach it.
- The inspector has a Parent selector that lists only valid parents. It also shows the world position and the attached parts.
- Reparenting keeps the world pose. Self-parenting and loops are refused, both in the UI and in the model layer.
- Deleting a component moves its children up to its parent at the same world pose and removes the joints that involve it.

**Joint system**
- Fixed, revolute and prismatic joints, each with: id, name, type, parent, child, axis, origin position and rotation (in the parent frame), lower and upper limits, and metadata.
- The **Add joint…** dialog validates live: different components, no second joint on a child, no loop, non-zero axis, lower ≤ upper. If the child isn't attached to the chosen parent yet, it's attached in the same step and keeps its world position.
- The **joint inspector** edits:
  - name and type (changing the type resets the limits to that type's defaults);
  - axis, with X/Y/Z buttons or a custom vector that is normalized;
  - origin position and rotation;
  - limits, in degrees or radians for revolute joints and meters for prismatic joints.
  - It also links to the parent and child, and has a safe delete. Rejected edits fall back to the stored value.
- Joint markers in the 3D view are clickable and drawn on top of the parts: a ring and arrow for revolute, a double arrow for prismatic, a wire cube for fixed. A toolbar toggle shows or hides them.
- Joints are stored and validated only. Motion under joint limits arrives with physics in Phase 5.

**Drag-and-drop placement**
- Drag any catalog component (all seven categories) into the 3D view:
  - A translucent preview follows the pointer, and the part under the pointer is highlighted in amber.
  - Dropping on the ground places the component resting on the floor as a top-level part.
  - Dropping on a part places it on that part's surface and **attaches it to that part**.
  - The new component is selected.
- Clicking a component still adds it at the center.
- The existing catalog is used, and component data is validated before it enters the scene (`validateComponentDraft`).

**Robot Model Connector (C1)**
- Activated on the existing Connector Bus. It handles commands, events and bus requests for every structural change; see section 7 and `docs/architecture/C1-ROBOT-MODEL-CONNECTOR.md`.

**Schema v2**
- Versioned configuration with hierarchy and joints, plus automatic v1 → v2 migration; see section 6 and `docs/architecture/SCHEMA-V2.md`.

**Templates**
- All four templates now have a real hierarchy and joints:
  - Explorer Bot: 2 revolute wheel joints and 1 fixed sensor mount.
  - Robotic Arm: revolute shoulder, elbow and wrist.
  - Humanoid: waist, neck, shoulders, hips and ankles, 8 joints in total.
  - Quadcopter: 4 rotor joints.
- Template world positions are converted to local positions when a project is created, and a test verifies that every part ends up exactly where the template places it.

**Undo / redo**
- Add, delete, move, rotate, scale, reparent, create joint, edit joint and delete joint all use the one existing history, now with joints included in each snapshot.

## 3. Updated folder structure (new and changed areas)

```
src/
  app/
    bootstrap.ts            NEW  connects console + C1 before any store loads
    App.tsx                 data router (createBrowserRouter / createMemoryRouter)
    routes/WorkspacePage.tsx  useBlocker guard, compact drawers
  core/bus/channels.ts      C1 events and requests added
  features/
    robot-model/            NEW  model layer (no UI)
      mat4.ts               4×4 matrix math without Three.js (keeps the dashboard bundle small)
      transforms.ts         local ↔ world transforms, world bounds
      hierarchy.ts          children, descendants, loop checks, valid parents, tree order
      joints.ts             joint types, defaults, validation, construction
      validation.ts         component draft validation, whole-model validation
      operations.ts         pure add/remove/reparent/joint operations
      schema.ts             schema v2 + migrations
      robotModelConnector.ts  C1 connector
      *.test.ts             unit tests
    builder/placement.ts    NEW  drop placement rules
    inspector/              JointDialog, JointInspector, VectorRow (NEW); Inspector, NumberField (changed)
    viewport/               SceneObjectNode, JointMarker, TransformGizmo, objectRegistry, jointStyle, dragTypes (NEW)
  hooks/useMediaQuery.ts    NEW
  types/joint.ts            NEW
tests/e2e/
  helpers.mjs, corrections.e2e.mjs, builder.e2e.mjs, run-all.mjs   NEW
docs/
  PHASE-2-REPORT.md, architecture/C1-ROBOT-MODEL-CONNECTOR.md, architecture/SCHEMA-V2.md   NEW
```

## 4. New and modified files

| File | Change |
| --- | --- |
| README.md | Modified |
| docs/PHASE-1-REPORT.md | Modified |
| package-lock.json | Modified |
| package.json | Modified |
| src/app/App.tsx | Modified |
| src/app/providers/AppProviders.tsx | Modified |
| src/app/routes/WorkspacePage.tsx | Modified |
| src/components/workspace/BottomPanel.tsx | Modified |
| src/components/workspace/LeftPanel.tsx | Modified |
| src/components/workspace/ObjectsPanel.tsx | Modified |
| src/components/workspace/RightPanel.tsx | Modified |
| src/components/workspace/SettingsDialog.tsx | Modified |
| src/components/workspace/StatusBar.tsx | Modified |
| src/components/workspace/ViewportToolbar.tsx | Modified |
| src/components/workspace/WorkspaceTopBar.tsx | Modified |
| src/core/bus/channels.ts | Modified |
| src/features/builder/README.md | Modified |
| src/features/component-library/ComponentLibraryPanel.tsx | Modified |
| src/features/inspector/Inspector.tsx | Modified |
| src/features/inspector/NumberField.tsx | Modified |
| src/features/projects/materialize.ts | Modified |
| src/features/projects/workspaceActions.ts | Modified |
| src/features/robot-library/templates.ts | Modified |
| src/features/viewport/CameraRig.tsx | Modified |
| src/features/viewport/SceneObjectMesh.tsx | Removed |
| src/features/viewport/Viewport.tsx | Modified |
| src/features/viewport/cameraPresets.ts | Modified |
| src/hooks/useWorkspaceShortcuts.ts | Modified |
| src/main.tsx | Modified |
| src/stores/projectStore.ts | Modified |
| src/stores/sceneStore.ts | Modified |
| src/stores/selectionStore.ts | Modified |
| src/stores/viewportStore.ts | Modified |
| src/types/index.ts | Modified |
| src/types/project.ts | Modified |
| src/types/scene.ts | Modified |
| docs/PHASE-2-REPORT.md | New |
| docs/architecture/C1-ROBOT-MODEL-CONNECTOR.md | New |
| docs/architecture/SCHEMA-V2.md | New |
| src/app/bootstrap.ts | New |
| src/features/builder/placement.ts | New |
| src/features/inspector/JointDialog.tsx | New |
| src/features/inspector/JointInspector.tsx | New |
| src/features/inspector/VectorRow.tsx | New |
| src/features/robot-model/ | New |
| src/features/viewport/JointMarker.tsx | New |
| src/features/viewport/SceneObjectNode.tsx | New |
| src/features/viewport/TransformGizmo.tsx | New |
| src/features/viewport/dragTypes.ts | New |
| src/features/viewport/jointStyle.ts | New |
| src/features/viewport/objectRegistry.ts | New |
| src/hooks/useMediaQuery.ts | New |
| src/types/joint.ts | New |
| tests/e2e/builder.e2e.mjs | New |
| tests/e2e/corrections.e2e.mjs | New |
| tests/e2e/helpers.mjs | New |
| tests/e2e/run-all.mjs | New |

`src/features/robot-model/` contains: `mat4.ts`, `transforms.ts`, `hierarchy.ts`, `joints.ts`, `validation.ts`, `operations.ts`, `schema.ts`, `robotModelConnector.ts`, `robotModel.test.ts`, `schema.test.ts`, `connector.test.ts`.

Refactors and why:
- `SceneObjectMesh.tsx` was replaced by `SceneObjectNode.tsx`. Hierarchy needs nested groups (a part carries its children), which the flat mesh could not express.
- `VectorRow` moved out of `Inspector.tsx` into its own file so the joint inspector can reuse it.
- `sceneStore.removeObject` was replaced by the C1 command `removeComponent`, because deletion must now also fix the hierarchy and joints.
- `App.tsx` moved to the data router, which `useBlocker` requires.

## 5. New dependencies

**None.** `TransformControls` comes from `@react-three/drei`, which was already installed. Only the `engines` field was added to `package.json`.

Bundle sizes (gzip): dashboard 122 KB (Phase 1: 97 KB; the increase comes from the data router and the robot-model code; no Three.js code is in this bundle), workspace 288 KB loaded only when the workspace opens.

## 6. Schema v2 details

Summary (full text in `docs/architecture/SCHEMA-V2.md`):
- `RobotProject` gains `joints: RobotJoint[]`, and `schemaVersion` becomes 2.
- `SceneObject.parentId` forms the tree, and `transform` is **local** to the parent.
- `RobotJoint` = `{ id, name, type, parentId, childId, axis, origin { position, rotation }, limits { lower, upper }, metadata }`.
- **Migration v1 → v2:**
  - Transforms are kept unchanged, because v1 objects are all roots, so world equals local.
  - `joints: []` is added.
  - Missing fields get defaults and a warning.
  - Unknown fields are kept.
  - Unreadable entries are copied to `arai.projects.unreadable` instead of being dropped.
  - Migration runs automatically through the persisted store's version (1 → 2) and logs "Upgraded N project(s) from schema v1 to v2".

## 7. C1 Robot Model Connector

Summary (full reference in `docs/architecture/C1-ROBOT-MODEL-CONNECTOR.md`):
- **Commands:** `getModel`, `validate`, `addComponent`, `insertAssembly`, `removeComponent`, `reparent`, `createJoint`, `updateJoint`, `deleteJoint`. Each one validates, applies the change as one undo step, and publishes events.
- **Events:** `robotModel.componentAdded`, `componentRemoved`, `componentReparented`, `jointCreated`, `jointUpdated`, `jointDeleted`, `rejected`, `changed`.
- **Requests:** `robotModel.request.reparent`, `removeComponent`, `createJoint`, `updateJoint`, `deleteJoint`.

You can watch all of this traffic live in the workspace's **Bus Events** tab.

## 8. Tests executed and actual results (18 Nov 2026, Node 22.23.5, headless Chrome with software WebGL)

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, 0 errors |
| `npm run lint` | Pass, 0 warnings |
| `npm run test` | **49 / 49 pass** in 5 files (15 Phase 1 tests unchanged + 34 new) |
| `npm run build` | Pass |
| `npm run test:e2e` | **3 / 3 suites pass**: Phase 1 journey 21/21, corrections 20/20, builder 21/21; 0 console errors in every suite |

New unit tests (34):
- **Hierarchy and transforms:** world transforms through the parent chain; parent movement moves children while their local transforms stay the same; parent rotation; self-parent and loop prevention; reparenting keeps the world position; rejected reparents.
- **Deletion and joints:** deletion moves children up and removes joints; joint creation with automatic attach; joint validation (6 cases); one joint per child; reparenting a jointed child is blocked; joint editing with axis normalization; joint deletion.
- **Component validation:** 5 cases.
- **Templates:** world positions match and every model is valid; Explorer Bot structure.
- **Schema migration:** v1 → v2 keeps the data; defaults and warnings; unknown fields kept; missing parent; v2 unchanged; non-object input; stored-project migration with backup.
- **C1 connector:** events for add, reparent and remove; rejection; joint create, edit and delete with undo and redo; bus requests; reparent undo; saving joints.
- **Gizmo:** a gizmo drag is one undo step with a live value; a click with no movement records nothing.
- **Drop placement:** on the ground, and on a part with attach.

New builder browser steps (21):
1. The tree hierarchy and its joint badges.
2. Expanding and collapsing tree nodes.
3. Selecting in the tree.
4. A move-gizmo drag: the inspector updates live, the attached wheel follows, and one undo restores it.
5. The rotate gizmo.
6. The scale gizmo.
7. A numeric edit updates the viewport.
8. Dragging a component onto the ground: it lands resting on the floor as a top-level part.
9. Dragging onto a part: the preview shows, then the component attaches to the Top Plate.
10. Reparenting from the inspector keeps the world position.
11. Reparenting by dragging in the tree.
12. Loop prevention, both in the parent list and in the tree.
13. Creating a joint.
14. The joint dialog blocks invalid joints.
15. Editing a joint's type, axis, limits and origin, with an invalid limit rejected, plus undo.
16. Deleting a joint, plus undo.
17. Deleting a parent moves its children up and removes its joints, plus undo.
18. Save and reload.
19. The Arm, Humanoid and Drone templates.
20. A Phase 1 schema v1 project opens after migration.
21. No console errors.

Problems found by these tests and fixed during the phase:
- **View label stuck after an orbit:** camera damping drift kept the camera "moving" forever, so it never counted as settled. Fixed with a threshold relative to the camera distance.
- **Number fields committed twice on Enter:** a rejected joint edit was reported twice. Enter now only blurs, and the blur does the single commit.
- **Number fields kept rejected values:** they now fall back to the stored value.
- **Start bundle grew:** Three.js had been pulled into the dashboard bundle. Fixed by the small `mat4.ts` module.

## 9. Known limitations

- Joints are defined, validated and saved, but nothing moves on them yet. Motion and limit enforcement arrive with physics (Phase 5), and drive control with Phase 3.
- Scaling a parent also scales its children (scale is inherited, as in Three.js and URDF tools). A non-uniformly scaled parent with rotated children cannot be represented exactly; the closest position, rotation and scale is used.
- A component that has a joint must have its joint deleted before it can move to another parent. This is deliberate, so a joint never points at the wrong parent.
- Duplicate copies the selected component only, not its children or joints.
- The "Joints" category in the component library still adds marker shapes (visual placeholders). Real joints are created with **Add joint…** in the inspector.
- Drag-and-drop uses HTML5 drag events, so it doesn't work on touch screens yet. On tablets, click a component to add it, then use the gizmo.
- The drop preview is checked by screenshot only; the placement rules are covered by unit tests.
- The live demo uses in-memory routing, so the browser's own Back and Forward buttons don't move between app pages in the demo. The protection is tested in the normal build.
- Everything was tested in headless Chrome with software WebGL. Please also try it in your own browser.

## 10. Manual testing instructions

1. Run `npm install`, then `npm run dev`, and open the printed address. Use Node 22.22.2 or newer.
2. Create an **Explorer Bot**. Open the **Objects** tab. You'll see the Chassis with its parts nested under it and REV/FIX badges on the wheels and sensor.
3. Click **Chassis**, press **W**, and drag the arrows in the 3D view. The wheels and plate follow, and Position X in the inspector updates while you drag. Press **Ctrl+Z** once to undo the whole drag. Try **E** (rotate) and **R** (scale).
4. Open **Components** and drag **Lidar** onto the floor. Then drag **Camera** onto the top plate. The plate turns amber, and after the drop the camera's Parent shows "Top Plate".
5. Select **Lidar**, set Parent to **Chassis**, and check that World position stays the same. Drag the Lidar row onto **Top Plate** in the tree.
6. Select **Chassis** and open the Parent list. Its own parts are not offered, because that would create a loop.
7. Select **Lidar** and click **Add joint…**, then **Create joint**. In the joint inspector, click **X** for the axis and set Lower to `-45`. Then try Lower `500`: it's refused and the console explains why. Change the type to **Prismatic**, then press **Ctrl+Z**.
8. Select **Chassis** and press **Delete**. Its parts move up to the top level and the wheel joints are removed. Press **Ctrl+Z** to restore everything.
9. Click **Save** and reload the page. The tree and joints are still there.
10. Make a change, then press the browser's **Back** button. Try Cancel, Discard, and Save and leave.
11. Click the orientation gizmo at the bottom right of the 3D view. The view label at the top right follows it.
12. Make the browser window narrower than 1024 px. The side panels become drawers.

## 11. Recommended next steps (Phase 3 — Robot Movement & Control)

1. Activate **C2 Command Bus**: typed movement commands (drive, turn, set joint target, stop) with validation.
2. Add actuator definitions (motor ↔ joint binding, torque and velocity limits) to the schema as v3, with a migration.
3. Add a differential-drive controller for Explorer Bot using its two revolute wheel joints. Add keyboard and on-screen controls, speed presets, and stop and reset.
4. Clearly labeled **simplified kinematic movement** until physics (Phase 5) takes over.
5. A joint preview slider (move a revolute or prismatic joint within its limits) to check designs before physics.

Phase 3 will not start until you review and approve.
