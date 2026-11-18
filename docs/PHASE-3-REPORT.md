# Phase 3 Report — Robot Movement & Control

Date: 18 Nov 2026 · Version 0.3.0 · Branch `phase-3-control`

## 1. Summary

You can now drive a robot. Switch the workspace to **Control Mode** (top-bar **Control** button or the **M** key) and drive with **W A S D** or the arrow keys, or press and hold the on-screen arrow buttons. **Space** stops and **R** resets. A speed slider with 25 / 50 / 75 / 100 % presets sets how fast it goes, and live telemetry shows speed, turn rate, wheel speeds, position, heading and distance.

What was added:

- **Actuators:** DC Motor, Servo and Generic Joint Actuator, attached to joints from the inspector.
- **Differential-drive controller:** turns "forward + turn" into left and right wheel speeds.
- **The C2 Command Bus:** every movement is a validated command (drive, turn, setJointTarget, stop, reset), shown in Bus Events.
- **Movement engine:** fixed 60 Hz timestep, running outside React.
- **Joint preview:** move a revolute or prismatic joint with a slider or a typed value, within its limits.
- **Schema v3 with automatic migration:** Explorer Bot projects get their motors and drive set up automatically.

The simulation is **kinematic**. The robot moves exactly as commanded, with no mass, friction, gravity or collisions. The viewport, the control panel and the status bar say so: "Kinematic Simulation — Physics Engine Integration Coming in Phase 5".

Approved design decisions, all implemented:

1. Driving moves a live runtime pose, never the saved design. **Reset** returns to the design pose. **Apply pose** copies the driven pose into the design as one undo step.
2. Joint preview positions are temporary. They are not saved and not in undo history.
3. Explorer Bot gets two DC motors and a differential drive automatically, both for new projects and for upgraded old ones. Other robots get a **Set up differential drive** button.
4. Build/Control is a tab in the existing top-bar mode switch, plus the **M** key. This resolves the W/E/R conflict: in Build Mode, W/E/R are the gizmo tools; in Control Mode, W drives and R resets.

All existing Phase 1 and Phase 2 features, tests and saved projects still work (see section 10).

## 2. C2 Command Bus

Full reference: `docs/architecture/C2-COMMAND-BUS.md`.

| Command | Payload | Notes |
| --- | --- | --- |
| `drive` | `{ speed: −1…1, durationMs? }` | + forward, − backward, 0 releases |
| `turn` | `{ rate: −1…1, durationMs? }` | + left, − right; combines with drive into an arc |
| `setJointTarget` | `{ jointId, target, mode: 'actuator' \| 'preview' }` | rad or m, checked against limits |
| `stop` | `{}` | always accepted |
| `reset` | `{}` | stop and return to the design pose |

Each command becomes `RobotCommand { id, robotId, type, payload, timestamp, source }`, where source is keyboard, panel, api or bus. Commands are validated by a pure function (`commands.ts`).

- **Accepted:** a `command.accepted` event is sent and the movement engine runs the command. The engine reports progress with `command.status` (executing → completed / stopped / superseded / limited / failed).
- **Rejected:** a `command.rejected` event is sent with clear errors, and the console logs them (source `control`). The control panel shows the latest error.

Any module can send `command.request` on the bus. Mode changes publish `robot.modeChanged`.

## 3. Actuator architecture

Types: `src/types/actuator.ts`. Rules: `src/features/robot-model/actuators.ts`.

| Type | Joints | Mode | Motor part | Defaults (torque / velocity) |
| --- | --- | --- | --- | --- |
| DC Motor | revolute | velocity | required | 0.5 N·m / 20 rad/s |
| Servo | revolute | position | required | 1.5 N·m / 5 rad/s |
| Generic Joint Actuator | revolute, prismatic | position | optional | 10 / 2 |

Actuators are structural, so they go through the **C1 Robot Model Connector**. Each change is validated, recorded as one undo step and announced on the bus.

- **Commands:** createActuator, updateActuator, deleteActuator, setUpDifferentialDrive, updateController, removeController.
- **Events:** `robotModel.actuatorCreated/Updated/Deleted`, `robotModel.controllerChanged`.
- **Bus requests:** `robotModel.request.createActuator/updateActuator/deleteActuator`.

Validation refuses:
- an actuator on a fixed joint, or a second actuator on the same joint
- an actuator type that doesn't suit the joint type
- a missing or non-motor part
- zero or negative limits

Deleting a part or a joint also removes the actuators and controllers that depend on it, and the console reports what was removed. A joint whose type change would break its actuator or the drive is refused with an explanation.

**In the UI:**
- The joint inspector has a **Motor / actuator** section (type, motor part, max torque, max velocity, enabled, delete).
- The project summary has **Drive settings** (wheel radius, track width, max speed, max turn rate).

`maxTorque` is stored now and will be used by physics in Phase 5. In this kinematic phase, `maxVelocity` limits how fast joints and wheels turn.

## 4. Schema v3

Full reference: `docs/architecture/SCHEMA-V3.md`.

- `RobotProject` gains `actuators[]` and `controllers[]`, and `schemaVersion` is now 3.
- v2 → v3 adds empty lists. Explorer Bot projects instead get their two drive motors and a differential drive.
- Invalid stored actuators are kept but disabled, and reported as warnings.
- The migration chain is v1 → v2 → v3, so Phase 1 and Phase 2 drafts open without changes to their parts or joints.
- The storage key is unchanged and the store version is now 3.
- Runtime state (driven pose, joint preview, telemetry) is never saved.

## 5. Differential drive

Source: `src/features/controls/differentialDrive.ts`. Geometry: `src/features/robot-model/drive.ts`.

- **Frame:** forward = the root part's local +X, up = +Y, left = −Z. A positive turn rate turns left.
- **Wheel speeds:** `ωL = (v − ω·W/2) / r`, `ωR = (v + ω·W/2) / r`
  - v = linear speed (m/s), ω = turn rate (rad/s), W = track width, r = wheel radius
- **From wheels back to motion:** `v = r(ωL + ωR)/2`, `ω = r(ωR − ωL)/W`
- **Intent to motion:** `v = drive × maxLinearSpeed × speed%`, `ω = turn × maxAngularSpeed × speed%`
- **Motor limits:** if a wheel would exceed its motor's max velocity, both wheels are scaled down by the same factor. This keeps the path the same, just slower. The status shows `limited`.
- **Pose update:** the exact arc solution is used, not a straight-line approximation, so circles stay closed. Heading increases when turning left.
- **Automatic measurements:**
  - Wheel radius comes from the wheel cylinder's radius × scale.
  - Track width is the distance between the two wheel joint origins along Z, in the root frame.
  - Each wheel's spin direction comes from its joint axis.
  - If left and right look swapped, a warning is shown.
  - Both values can be overridden in Drive settings.

Explorer Bot at 50 % speed: 0.25 m/s, and each wheel turns at 3.57 rad/s (r = 0.07 m). The browser test measured this.

## 6. Robot Control API

`src/features/controls/robotControlApi.ts`. Every call becomes a validated C2 command, so blocks, JavaScript (Phase 4) and AI will all share one path.

```ts
robotControl.drive.forward({ speed: 0.5, durationMs: 2000 });
robotControl.drive.backward();
robotControl.turn.left({ rate: 0.5 });
robotControl.turn.right();
robotControl.drive.set(0.3); robotControl.turn.set(-0.2);
robotControl.stop();
robotControl.reset();
robotControl.joint(jointId).setTarget(0.3);   // position actuator, moves at its max velocity
robotControl.joint(jointId).preview(0.3);     // kinematic preview
robotControl.setSpeedPercent(75);
robotControl.getState();
```

## 7. Keyboard and on-screen controls

| Key | Control Mode | Build Mode |
| --- | --- | --- |
| W / ↑ | drive forward (while held) | Move tool |
| S / ↓ | drive backward | — |
| A / ← | turn left | — |
| D / → | turn right | — |
| Space | stop | — |
| R | reset to design pose | Scale tool |
| M | switch to Build Mode | switch to Control Mode |
| F, 1–6 | focus, camera views | same |

How keys behave:
- **Held keys combine:** W + A drives an arc. Releasing a key releases only its part of the motion.
- **Releasing all keys stops.** Switching windows (blur) or switching mode also releases every held key, so the robot never keeps driving by itself.
- **Typing never drives the robot.** Keys are ignored while the cursor is in a text field, a number field, a slider, a dropdown or the code editor.
- **Modified keys are left alone.** Keys with Ctrl, Cmd or Alt, and auto-repeat events, don't drive the robot. Ctrl+S still saves.

**On-screen Robot Control panel** (right side in Control Mode):
- Hold-to-drive arrow buttons and a Stop button. They use pointer capture, so sliding off a button stops the robot.
- **Reset** and **Apply pose** buttons.
- A speed slider and 25 / 50 / 75 / 100 % presets.
- Live telemetry and the latest error.
- Actuator status, with enable/disable switches.
- Joint preview.

**Build vs Control Mode:**
- Control Mode locks editing:
  - the gizmo, drag-and-drop, add / delete / duplicate and undo/redo are disabled
  - the left panel shows a notice
  - the status bar shows the mode
- A **follow-robot** camera toggle keeps the robot in view while driving.

## 8. Joint preview

- Choose any revolute or prismatic joint. Fixed joints are not listed, and the actuator section explains why they cannot be driven.
- A slider covers the joint's limits (degrees for revolute, meters for prismatic), and the limits are shown under it.
- You can type an exact value and press Enter. A value outside the limits is refused with a message such as "Above the upper limit (3.142).", and the position doesn't change.
- **Neutral** returns to 0, or to the nearest limit if 0 is outside the limits.
- Moving a joint moves the child part and everything attached to it, using `frame · motion(axis, q) · frame⁻¹`. Wheels driven by DC motors spin continuously while driving.
- Preview positions are temporary. Reset clears them, and they are never saved.
- Position actuators (servo and generic) move to `setJointTarget` targets at their max velocity, and their status shows `moving` and then `holding`.

## 9. New and modified files

**New (27):**
- Types: `src/types/actuator.ts`
- Robot model: `src/features/robot-model/actuators.ts`, `drive.ts`, `kinematics.ts`
- Controls: `src/features/controls/commands.ts`, `commandBus.ts`, `movementEngine.ts`, `differentialDrive.ts`, `robotControlApi.ts`, `controlSession.ts`, `keyboardControls.ts`
- Store and hook: `src/stores/robotStateStore.ts`, `src/hooks/useRobotKeyboard.ts`
- UI: `src/components/workspace/RobotControlPanel.tsx`, `JointPreview.tsx`
- Inspector: `src/features/inspector/ActuatorSection.tsx`, `ControllerSection.tsx`
- Routing: `src/app/routes/RouteError.tsx` (friendly error screen instead of a blank page)
- Unit tests: `actuators.test.ts`, `kinematics.test.ts`, `schemaV3.test.ts`, `differentialDrive.test.ts`, `commandBus.test.ts`, `movementEngine.test.ts`, `keyboard.test.ts`, plus `controls/testUtils.ts`
- Browser test: `tests/e2e/control.e2e.mjs`
- Docs: `docs/architecture/SCHEMA-V3.md`, `docs/architecture/C2-COMMAND-BUS.md`, this report

**Modified:**
- Types: `types/project.ts`, `types/index.ts`, `types/console.ts`
- Robot model: `robot-model/operations.ts`, `validation.ts`, `schema.ts`, `robotModelConnector.ts`, `mat4.ts`
- Stores: `stores/sceneStore.ts`, `projectStore.ts`, `viewportStore.ts`
- Bus: `core/bus/channels.ts`
- Editor commands and templates: `features/projects/workspaceActions.ts`, `robot-library/templates.ts`
  - The Explorer Bot's left wheel and left motor are now on −Z, so "left" really is left.
- Viewport: `viewport/SceneObjectNode.tsx`, `Viewport.tsx`, `CameraRig.tsx`
- Inspector: `inspector/Inspector.tsx`, `JointInspector.tsx`
- Workspace UI: `components/workspace/LeftPanel.tsx`, `ObjectsPanel.tsx`, `RightPanel.tsx`, `StatusBar.tsx`, `ViewportToolbar.tsx`, `WorkspaceTopBar.tsx`
- App and hooks: `app/App.tsx`, `bootstrap.ts`, `providers/AppProviders.tsx`, `routes/WorkspacePage.tsx`, `hooks/useWorkspaceShortcuts.ts`
- Tests:
  - `schema.test.ts` and `connector.test.ts` now expect the current schema version; no assertions were removed.
  - `robotModel.test.ts` sample data now includes actuators and controllers.
  - `tests/e2e/builder.e2e.mjs`: the upgrade message is now "v1 to v3".
  - `tests/e2e/run-all.mjs` now includes the control suite.
- Project: `package.json` (version 0.3.0), `README.md`, `docs/architecture/PHASE-1-ARCHITECTURE.md`, `docs/architecture/C1-ROBOT-MODEL-CONNECTOR.md`

## 10. Tests and actual results

Run on 18 Nov 2026, Node 22, headless Chrome with software WebGL (SwiftShader).

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` | pass, 0 errors |
| Lint | `npm run lint` | pass (exit code 0, no findings) |
| Unit tests | `npm run test` | **113 / 113 passed** in 12 files |
| Production build | `npm run build` | pass. Dashboard 129.6 KB gzip, workspace 295.4 KB gzip |
| Browser tests | `npm run test:e2e` | **79 / 79 steps passed** in 4 suites |

Unit tests by file:

| File | Tests |
| --- | --- |
| differentialDrive | 11 |
| commandBus | 10 |
| movementEngine | 14 |
| keyboard | 8 |
| kinematics | 9 |
| actuators | 7 |
| schemaV3 | 5 |
| schema | 7 |
| connector | 11 |
| robotModel | 16 |
| stores | 11 |
| math | 4 |

Browser suites:

| Suite | Steps passed |
| --- | --- |
| Phase 1 journey | 21 / 21 |
| Phase 1 corrections | 20 / 20 |
| Phase 2 builder | 21 / 21 |
| **Phase 3 control** | **17 / 17** |

The Phase 3 control suite checks:
- Build Mode is the default, and W there selects the Move tool instead of driving.
- Explorer Bot comes with its motors, and their limits can be edited.
- Control Mode shows the panel and the kinematic label, and locks editing.
- Holding W drives and releasing stops. S, A and D work, and W + A drives a left arc.
- Space stops and R resets.
- The on-screen hold buttons, Stop and Reset work.
- The 100 % preset is more than 2.5× faster than 25 %, and the slider is reflected in the status bar.
- Typing in a field does not drive the robot.
- A disabled motor rejects driving with a clear error in the panel and the console.
- `command.accepted`, `command.status` and `command.rejected` appear in Bus Events.
- Joint preview: the slider, the limits, a refused out-of-limit value, a typed value and Neutral all work, and fixed joints are not offered.
- Apply pose writes the driven position into the design, and one undo restores it.
- M toggles the mode, and Build Mode editing works again.
- Actuator settings survive save and reload.
- A stored schema v2 Explorer project is upgraded to v3, and it can drive.
- There are no browser console errors.

Problems found and fixed while testing:
- A dropdown in the actuator section re-rendered endlessly (React error #185). The list is now filtered in `useMemo`, and the routes got a friendly error screen.
- Four browser steps failed at first because the test pressed R while the speed slider still had focus. The app correctly ignored that keypress as typing, so the robot was never reset. The test now uses the Reset button, and re-enables the motor in a `finally` block.

## 11. Known limitations

- **Kinematic only.** There is no mass, inertia, friction, gravity or collision, so the robot can drive through obstacles and wheels never slip. `maxTorque` is stored but not used yet. Physics comes in Phase 5.
- **Drive types:** only differential drive is supported for now. Mecanum, Ackermann and tracked drives are not supported yet.
- **Caster wheels** are carried along with the robot but don't roll.
- **Floor height:** the robot drives on the design height of its root part. Driving over uneven ground needs physics.
- **Wheel radius** is measured only from cylinder-shaped wheels. Other shapes need the radius typed in Drive settings.
- **Drive suggestions:** "Set up differential drive" suggests wheels only when two revolute wheel joints share the same parent.
- **Stepper motors** in the library are treated as generic motor parts. They have no step-based control yet.
- **No keyboard driving on touch screens.** On a tablet, use the on-screen buttons.
- **Demo navigation:** the live demo uses in-memory routing, so the browser's Back button doesn't move between app pages there.
- **Workspace bundle size:** it grew from about 277 to 295 KB gzip.
- **Browser coverage:** everything was tested in headless Chrome with software WebGL. Please also try it in your own browser.

## 12. Manual testing instructions

1. Run `npm install`, then `npm run dev`, and open the printed address.
2. Create an **Explorer Bot**. Click a wheel joint in the inspector. You'll see **Left Drive Motor** (DC Motor) with its max torque and velocity.
3. Click **Control** in the top bar, or press **M**. The right panel becomes **Robot Control**, and an orange label says the simulation is kinematic.
4. Click an empty area of the 3D view. Hold **W**: the robot drives forward and the wheels spin. Release: it stops. Try **S**, **A**, **D**, and **W + A** for an arc. Press **Space** to stop and **R** to reset.
5. Click **Max 100%** and drive again. It's much faster. Drag the speed slider and watch the status bar.
6. Hold the on-screen arrow buttons. Turn on **follow** (crosshair icon in the viewport toolbar) and drive far: the camera follows.
7. Turn off **Left Drive Motor** in the Actuators list, then press W. Nothing moves, and a red message explains why. Turn it back on.
8. In **Joint preview**, pick the Left Wheel Joint and drag the slider. Type `400` and press Enter: it's refused. Type `-45`, then click **Neutral**.
9. Drive a little, then click **Apply pose**. Switch to **Build**: the chassis Position X changed. Press **Ctrl+Z** to undo it.
10. Click into a text field and type "wasd". The robot doesn't move.
11. Open the **Bus Events** tab to see `command.accepted`, `command.status` and `command.rejected`.
12. Save and reload the page. Motor settings are kept, and the robot is back at its design pose.
13. Create a **Robotic Arm**, select one of its joints, and add a **Generic Joint Actuator** (it needs no motor part; a Servo needs a motor part from the Motors library). Select a fixed joint: the actuator section explains that fixed joints cannot be driven.

## 13. Recommendations for Phase 4 (Code Studio)

- **Use the Robot Control API from code.** Blocks and JavaScript should call `robotControl` (or send `command.request`). They should never touch the stores, so code gets the same validation, logs and Bus Events as the keyboard.
- **Add an `await`-able wrapper** that resolves when a timed command completes (using `command.status`). Scripts like `await drive.forward({ durationMs: 1000 })` then read naturally.
- **Run user code in a sandbox,** a Web Worker or an iframe. It should talk to the workspace only through C2 messages, with a hard stop button that sends `stop` and stops the worker.
- **Add a "Run" state** next to Build and Control. Running code would lock the keyboard drive the same way Control Mode locks editing.
- **Expose read-only state** (`robotControl.getState()`) to scripts now. Sensors (C3) can then plug into the same pattern in Phase 6.
- **Keep the 60 Hz fixed step.** Phase 5 physics can replace the kinematic integrator inside the movement engine without changing commands or the API.

Phase 4 has not been started. It is waiting for your review and approval.
