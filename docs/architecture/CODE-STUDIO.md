# Code Studio

Status: active since Phase 4. Source: `src/features/code-studio/`. Sandbox details: `CODE-EXECUTION-SANDBOX.md`.

> **About the name.** The Phase 4 brief called Code Studio "C3". In the master build plan, **C3 is the Sensor Stream** (Phase 6). Code Studio is a module, not a connector: its robot traffic travels over **C2**. As agreed before the build, the master-plan numbering is kept and this document is named `CODE-STUDIO.md`.

## What it does

Code Studio lets users program the open robot in two ways:

- **Blockly** (visual blocks)
- **JavaScript** (a code editor)

Both are interfaces to **one** execution path:

```
Blockly blocks ──generate──► JavaScript ─┐
JavaScript editor ───────────────────────┤
                                         ▼
              Sandbox (opaque-origin iframe → Web Worker, restricted runtime)
                                         │  allowlisted messages only
                                         ▼
              HostBridge (validate) → robotControl API (source "code")
                                         ▼
              C2 Command Bus (validation, events) → movement engine → robotStateStore
```

Programs never touch Zustand stores, the movement engine, the DOM or the network. Every movement command passes C2 validation and appears in Bus Events.

## Workspace integration

- **A third workspace mode, `code`.** It is the **Code** tab in the top bar (previously locked).
  - `robotStateStore.mode` is `'build' | 'control' | 'code'`.
  - The helper `canDrive(mode)` is true for `control` and `code`, so C2 accepts movement commands in both.
  - Build Mode is still refused, with the unchanged message "Switch to Control Mode to move the robot."
  - `isDesignLocked(mode)` is true for every mode except `build`, so editing is locked in `code` as in `control`.
- **The keyboard does not drive in Code Studio**, so typing in an editor never moves the robot.
  - Editor shortcuts stay inside the editors (`[data-code-editor]`).
  - Ctrl+S saves the open program.
  - M returns to Build Mode.
- **Layout in Code Studio:**
  - **Left panel:** programs, robot information, joints and the API list.
  - **Center:** the toolbar and the editor.
  - **Right of the editor:** the existing 3D viewport.
    - It is the **same** viewport element; it is never remounted.
    - Below 1024 px it sits under the editor.
  - **Bottom:** a new **Program** tab next to Console, Bus Events and Status.
  - The properties panel folds into a "Status" rail. It holds the robot status, speed, telemetry and motors, and is restored when you leave Code Studio.
- **Leaving Code Studio stops the program.** Changing mode or closing the project stops a running program first, through the new `onSessionEnd` hook in `controlSession.ts`.

## Modules

| Folder / file | Role |
| --- | --- |
| `storage/programTypes.ts`, `programStore.ts`, `programMigration.ts`, `starterPrograms.ts` | Program model, versioned storage, migration, starter content |
| `codeStudioStore.ts` | Editor session state (open program, unsaved drafts, baselines); never saved |
| `programActions.ts` | Create, open, save, rename, duplicate, delete, unsaved checks (light, no editor code) |
| `runActions.ts` | Run: Blockly → generate & check → run; JavaScript → run. "Convert to JavaScript program" |
| `blockly/` | Blockly setup, custom blocks + generators, toolbox, checked generation |
| `editor/codeEditorSetup.ts` | CodeMirror 6 setup: theme, autocomplete, hover help, syntax lint, error line, Prettier format |
| `api/apiReference.ts` | The program API list (single source for autocomplete, hover help, side panel) |
| `runtime/executionManager.ts` | Sessions, state machine, limits, Stop / Pause / Resume / Reset, logs |
| `runtime/hostBridge.ts` | Host-side API bridge: validation, rate limit, robotControl calls, pause bookkeeping |
| `runtime/messageProtocol.ts` | Allowlisted message protocol v1 and validators |
| `runtime/executionLimits.ts`, `executionStore.ts`, `executionTypes.ts`, `sandboxTypes.ts` | Limits, UI status store, states, sandbox interface |
| `sandbox/workerRuntime.ts` | Restricted runtime that runs inside the worker before the program |
| `sandbox/sandboxHost.ts` | Opaque-origin iframe + CSP + Web Worker host |
| `utils/programValidation.ts` | Syntax check (acorn) and robot requirements before a run |
| `components/` | CodeStudioPane, toolbar, Blockly and JavaScript editors, side panel, Program console, status badge |

Loading:
- **CodeStudioPane** (with CodeMirror) is lazy-loaded when Code Studio opens.
- **Blockly** is a second lazy chunk, loaded only when a block program is shown or generated.
- **Prettier** loads only when you click Format.
- The dashboard bundle is unchanged in practice.

## Blockly

- **Package:** `blockly@13.4.0`. Its English messages, the library blocks and the JavaScript generator are bundled. Icons are served from `public/blockly-media/`, never from static.blockly.com.
- **Categories:**
  - **Program:** when program starts, wait, repeat, repeat while/until, forever, if, if/else, stop program.
  - **Movement:** move forward, move backward, drive at speed, turn left, turn right, set drive speed, set turn rate, stop robot, reset robot.
  - **Robot Joints:** set joint target (with "wait"), preview joint, joint position/limits, wait until joint reaches target.
  - **Timing:** wait ms, wait seconds, every N ms repeat.
  - **Logic:** if/else, compare, and/or, not, true/false.
  - **Math:** number, arithmetic, min/max, random integer.
  - **Variables:** create, set, change, get.
  - **Output:** print, log value, report robot status, text.
- **Joint dropdowns** list the open robot's movable joints, and the unit label follows the joint type: ° for rotating joints, m for sliding joints. A saved block whose joint no longer exists keeps its id and shows "⚠ missing joint"; it is never silently re-targeted, and the run is refused until a joint is chosen again.
- **Checks before generation:**
  - Exactly one "when program starts" block. Blocks not attached to it are ignored, with a warning.
  - Every value input must be filled.
  - Only blocks from the toolbox are allowed. For example `text_print`, which would generate `window.alert`, is refused.
  - Joints must exist.
  - Problems are shown on the blocks themselves as warning bubbles.
- **Generation:**
  - Code uses the same sandbox API as JavaScript programs.
  - Every loop gets `await __checkpoint();` (the Blockly loop trap), so Pause works inside loops and "forever" never blocks message handling.
  - Joint targets are converted from degrees to radians.
  - Literal targets are checked against the joint limits before the run.
- **Generated code** can be inspected (Blocks | JavaScript (read-only)) or saved as a new JavaScript program ("Convert to JavaScript program"). The block program is kept. There is no conversion from JavaScript back to blocks.

## JavaScript editor

- **Package:** CodeMirror 6 (`codemirror@6.0.2` with `@codemirror/*`). Monaco was rejected: about 100 MB to install, it needs its own workers, and it would make the workspace much heavier.
- **Features:**
  - Syntax highlighting, line numbers, indentation, bracket matching, code folding.
  - Find & replace (Ctrl+F) and undo/redo.
  - Robot API autocomplete with documentation, and hover help on API calls.
  - Syntax errors underlined while typing (acorn).
  - The runtime error line is highlighted.
  - Format (Prettier, loaded on demand), Revert to saved, and starter templates (Drive and turn, Drive a square, Drive an arc, List joints).
  - An unsaved dot.
  - Ctrl+S save, Ctrl+Enter run.

## Program storage

- **Where:** a separate versioned browser store, `arai.programs.v1` (format version 1). `RobotProject` schema v3 is **unchanged**.
- **Fields:** `{ id, projectId, name, description, language, source, version, createdAt, updatedAt }`. The source is the editable representation: Blockly JSON or JavaScript text.
- **Project safety:** every operation checks the program's `projectId` against the open project. Deleting a project deletes its programs.
- **Repair:** broken stored entries are skipped and reported; incomplete ones are repaired.
- **Unsaved edits:** they are kept per program in memory while switching programs. Leaving the workspace with unsaved programs shows the existing "Unsaved changes" dialog, listing the programs, and "Save and leave" saves them.

## Execution states

`idle → preparing → running ⇄ paused → stopping → idle`, or `→ completed | error`.

| Action | What happens |
| --- | --- |
| **Run** | Checks (open project, non-empty program, syntax, drive readiness when driving is used, joints and literal targets), switches to Code Studio mode, creates a session, starts the sandbox |
| **Pause** | The robot is stopped through the API. New requests from the program are held. The program halts at its next robot call, `wait()` or loop checkpoint |
| **Resume** | Re-issues the interrupted motion for the time that was left. Waits continue, then held requests run in order |
| **Stop** | Always available. Invalidates the session, kills the worker (removes the frame) and stops the robot through the API |
| **Reset Robot** | Stops a running program, then calls the existing `robotControl.reset()` (runtime pose only; the design is unchanged) |
| **Program end** | When the program and all its timed moves, waits and timers have finished, the robot is stopped and the state becomes Completed |

## Console

Program output and execution events go to the existing console, with source `code`. Each entry carries a timestamp, a level and a message, plus the session id and command id where relevant. The **Program** tab shows them with short session and command ids and a "Current run only" filter.

Bus events:
- `codeStudio.execution`: preparing, running, paused, completed, error, idle.
- `codeStudio.programChanged`: created, saved, renamed, deleted.
- Program commands appear as `command.*` with `source: "code"`.

## Phase 5 integration points

- **Physics backend.** The movement engine is the only place that moves the robot. Phase 5 can replace its kinematic step with physics without changing the bridge, the API or programs. `maxTorque` is already stored.
- **Pause with physics.** Pause and Resume re-issue the remaining motion through the API, which still works with physics. Timed moves would continue to use C2 `command.status`.
- **Sensors (C3, Phase 6).** Add read operations to `SANDBOX_OPS` (for example `sensor.read`), a host handler in `HostBridge`, entries in `API_REFERENCE`, and blocks in a new "Sensors" category. The protocol allowlist is the single place to extend.
- **AI (Phase J).** AI-generated programs can be stored as normal programs and run through the same sandbox. They need no special path.
