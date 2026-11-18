# Phase 4 Report — Code Studio

Date: 18 Nov 2026 · Version 0.4.0 · Branch `phase-4-code-studio`

Architecture: `docs/architecture/CODE-STUDIO.md`. Sandbox and protocol: `docs/architecture/CODE-EXECUTION-SANDBOX.md`.

> **Updated after the second review (19 Nov 2026).** Three reported defects were fixed, and two more were found and fixed during the extra checks. See "Second review fixes" at the end of this report. The test numbers in section 12 are the latest executed results.

## 1. Features implemented

- **Code Studio mode.** The **Code** tab in the top bar was locked before Phase 4 and is now active.
  - Build and Control work as before.
  - The layout has four areas: programs and robot info on the left, the editor in the center, the existing 3D viewport beside it, and a new **Program** console tab at the bottom.
  - Tablet widths stack the editor above the viewport.
- **Blockly visual programming** with 8 categories and 23 custom AutoBotAI blocks:
  - Program, Movement, Robot Joints, Timing, Logic, Math, Variables, Output.
  - Joint dropdowns are filled from the open robot.
- **Blockly → JavaScript generator.**
  - Checks run before any code is made: one start block, no empty inputs, toolbox blocks only, existing joints, literal joint targets within limits.
  - Problems appear as warnings on the blocks.
  - Generated code can be viewed read-only or saved as a new JavaScript program.
- **JavaScript editor (CodeMirror 6)**:
  - Highlighting, line numbers, indentation and folding.
  - Find & replace, undo/redo.
  - Robot API autocomplete with documentation, and hover help.
  - Syntax errors underlined while typing, and the runtime error line marked.
  - Format (Prettier), Revert, starter templates, an unsaved indicator, Ctrl+S and Ctrl+Enter.
- **Sandboxed execution.** Programs run in a Web Worker inside an opaque-origin, CSP-locked iframe, never in the main thread. The worker talks to the app only through an allowlisted message protocol.
- **One execution path for both languages:** sandbox → host bridge → existing Robot Control API (source `code`) → C2 → movement engine.
- **Execution controls:**
  - Run, Pause, Resume, Stop (always available), Reset Robot.
  - A status badge with run time.
  - States: Idle, Preparing, Running, Paused, Stopping, Completed, Error.
- **Limits:** 5 min of run time, 30 commands per second, 60 s per wait, console limits, a sandbox start timeout and an invalid-message limit.
- **Program storage.** Create, rename, save, open, duplicate, and delete with confirmation.
  - Programs are kept per project, in their own versioned browser store.
  - Robot project schema v3 is unchanged.
  - Unsaved programs are protected by the existing "Unsaved changes" dialog.
- **Console feedback:**
  - Program started, completed, paused, resumed and stopped.
  - Commands accepted and rejected, validation errors, runtime errors with line numbers, worker, timeout and security errors, and Blockly generation errors.
  - Each entry has a timestamp, a level, a session id and a command id.

## 2. Architecture decisions

1. **A third workspace mode, `code`.** C2 accepts movement commands when `canDrive(mode)` is true (Control or Code). Build Mode is refused with the unchanged Phase 3 message. This is a documented extension, not a change to Phase 3 behavior.
2. **The keyboard does not drive in Code Studio.** Typing in an editor must never move the robot. Leaving Code Studio stops a running program, through a new `onSessionEnd` hook in `controlSession.ts`, called before the engine shuts down.
3. **A new command source, `'code'`**, added to `CommandSource`. Program commands are identifiable in Bus Events.
4. **Sandbox: an opaque-origin iframe with a Web Worker.** A worker alone is not treated as a security boundary. A spike confirmed in headless Chrome that, before the build:
   - the origin is opaque;
   - storage and the parent are blocked;
   - fetch, XHR, WebSocket, importScripts, dynamic import and eval are blocked;
   - the UI keeps rendering during `while(true)`;
   - removing the frame kills the worker.
5. **No `eval` or `new Function` anywhere.** The program becomes part of the worker's script file.
6. **The worker runtime is a real typed function.** It is turned into worker source with `Function.prototype.toString()`, so it is type-checked, linted and unit-tested.
7. **Cooperative pause.** The host stops the robot and holds requests. Blockly loops check in every iteration. Resume continues timed moves for the time that was left. The limitation for JavaScript is documented in section 8.
8. **Programs are stored apart from projects** (`arai.programs.v1`), so schema v3 needs no migration.
9. **"C3" naming.** C3 stays the Sensor Stream, as in the master plan. Code Studio is a module whose robot traffic uses C2. As agreed, the doc is `CODE-STUDIO.md` instead of `C3-CODE-STUDIO.md`.
10. **Lazy loading.** The editor pane (CodeMirror) loads on first use of Code Studio, Blockly only for block programs, and Prettier only for Format. The execution manager connects itself when its chunk loads.

## 3. New files

`src/features/code-studio/`:

| Area | Files |
| --- | --- |
| Storage | `storage/programTypes.ts`, `programStore.ts`, `programMigration.ts`, `starterPrograms.ts` |
| Runtime | `runtime/executionManager.ts`, `executionStore.ts`, `executionTypes.ts`, `executionLimits.ts`, `hostBridge.ts`, `messageProtocol.ts`, `sandboxTypes.ts` |
| Sandbox | `sandbox/sandboxHost.ts`, `workerRuntime.ts` |
| Blockly | `blockly/blocklySetup.ts`, `robotBlocks.ts`, `toolbox.ts`, `generator.ts` |
| Editor and API | `editor/codeEditorSetup.ts`, `api/apiReference.ts` |
| Components | `components/CodeStudioPane.tsx`, `CodeStudioToolbar.tsx`, `BlocklyEditor.tsx`, `JavaScriptEditor.tsx`, `CodeStudioSidePanel.tsx`, `ProgramConsole.tsx`, `ExecutionStatus.tsx` |
| State and actions | `codeStudioStore.ts`, `programActions.ts`, `runActions.ts`, `editorRegistry.ts` |
| Checks | `utils/programValidation.ts` |
| Tests | `testUtils.ts`, `node-vm.d.ts` (types for the test helper only), and 7 test files (section 12) |

Other new files:
- **Browser test:** `tests/e2e/code-studio.e2e.mjs`.
- **Blockly icons:** `public/blockly-media/` (12 files copied from Blockly, with its Apache-2.0 license), so nothing loads from static.blockly.com.
- **Docs:** `docs/architecture/CODE-STUDIO.md`, `docs/architecture/CODE-EXECUTION-SANDBOX.md`, this report.

## 4. Modified files

| Area | Files | Change |
| --- | --- | --- |
| Mode | `stores/robotStateStore.ts` | `'code'` mode; `canDrive`, `isDesignLocked` |
| C2 | `features/controls/commands.ts` | `'code'` source; Code mode can drive |
| Engine | `features/controls/movementEngine.ts` | Steps in drive-capable modes |
| Session | `features/controls/controlSession.ts` | `onSessionEnd` hook; Code Studio message; M from Code goes to Build |
| Bus | `core/bus/channels.ts` | `codeStudio.execution`, `codeStudio.programChanged`; mode type |
| Console | `types/console.ts`, `utils/logger.ts` | `'code'` log source; optional sessionId / commandId on entries |
| Editing lock | `features/projects/workspaceActions.ts` | Locked in Code Studio too |
| Workspace page | `app/routes/WorkspacePage.tsx` | Lazy Code Studio pane next to the same viewport; unsaved-program protection |
| Workspace UI | `WorkspaceTopBar`, `LeftPanel`, `RightPanel`, `BottomPanel`, `StatusBar`, `ViewportToolbar`, `ObjectsPanel`, `RobotControlPanel` (new `code` variant) | Code Studio integration |
| Viewport | `features/viewport/Viewport.tsx`, `CameraRig.tsx` | Locked or drive-capable checks |
| Hooks | `hooks/useWorkspaceShortcuts.ts` | Ctrl+S saves the program; keys inside editors stay there |
| Dashboard | `components/layout/AppSidebar.tsx`, `app/routes/DashboardPage.tsx` | Code Studio shown as available (no longer "coming in Phase 4") |
| Stores | `stores/workspaceStore.ts` | `'program'` bottom tab |
| Start-up | `app/bootstrap.ts` | Connects the program store |
| Styles | `index.css` | Blockly toolbox styling |
| Tests | `tests/e2e/run-all.mjs` | Adds the Code Studio suite |
| Project | `package.json` | Dependencies, `overrides`, version 0.4.0 |
| Docs | `README.md`, `docs/architecture/C2-COMMAND-BUS.md`, `docs/architecture/PHASE-1-ARCHITECTURE.md`, `src/features/code-studio/README.md` | Updated for Phase 4 |

No Phase 1–3 test was removed or weakened.

## 5. Dependencies added

| Package | Version | License | Why |
| --- | --- | --- | --- |
| `blockly` | 13.4.0 | Apache-2.0 | Visual programming, with its JavaScript generator (lazy chunk ≈ 222 KB gzip) |
| `codemirror` + `@codemirror/view`, `state`, `commands`, `language`, `lang-javascript`, `autocomplete`, `search`, `lint` | 6.x | MIT | The code editor (Code Studio chunk ≈ 220 KB gzip, including all Code Studio code) |
| `@lezer/highlight` | 1.2.5 | MIT | Syntax-highlight tags for the editor theme (already a CodeMirror dependency, now declared directly) |
| `acorn` | 8.19.0 | MIT | Syntax check before running and while typing (reads code; never runs it) |
| `prettier` | 3.10.1 | MIT | The Format button. Loaded only when clicked (≈ 171 KB gzip) |

**Note on `overrides`.** Blockly 13.4 lists `jsdom <31` as a peer dependency. It is used only by Blockly's Node.js entry file (`core-node.js`), and only when no `document` exists. The browser build never loads it. The project's tests already use jsdom 31, so `package.json` has `"overrides": { "blockly": { "jsdom": "$jsdom" } }` instead of forcing the install. All Blockly tests pass with it.

**Bundle sizes (gzip):**

| Bundle | Phase 3 | Phase 4 |
| --- | --- | --- |
| Dashboard | 129.6 KB | 125.0 KB (a shared store chunk was split out) |
| Workspace | 295.4 KB | 301.0 KB |
| Code Studio editor (lazy) | — | 220.1 KB |
| Blockly (lazy) | — | 222.3 KB |
| Prettier (on demand) | — | ≈ 171 KB |

`npm audit` reports 6 high-severity advisories in `picomatch`, through Vite and Vitest (build and test tools only, not in the app bundle). They existed before Phase 4. The suggested fix is a breaking Vite downgrade, so it was not applied.

## 6. Blockly functionality

| Category | Blocks |
| --- | --- |
| Program | when program starts · wait ms · repeat N times · repeat while/until · forever · if · if/else · stop program |
| Movement | move forward (speed, ms) · move backward · drive at speed · turn left (rate, ms) · turn right · set drive speed % · set turn rate · stop robot · reset robot |
| Robot Joints | set joint target (dropdown, value, ° or m, "wait") · preview joint · position / lower / upper limit of joint · wait until joint reaches its target |
| Timing | wait ms · wait seconds · every N ms repeat |
| Logic | if/else · compare · and/or · not · true/false |
| Math | number · arithmetic · min/max · random integer |
| Variables | create · set · change · get |
| Output | print · log value · report robot status · text |

- Generated code uses only `robotControl`, `robot`, `wait`, `console` and `__checkpoint`. A test asserts that it never contains store, engine, window, document, localStorage, fetch or eval references.
- A saved block whose joint was deleted keeps the id and shows "⚠ missing joint". It is never silently re-targeted, and the run is refused.

## 7. JavaScript editor functionality

- CodeMirror 6 with the AutoBotAI dark theme.
- Syntax highlighting, line numbers, indentation (Tab), bracket matching and folding.
- Find & replace (Ctrl+F; the replace field is in the same panel), undo/redo, copy/paste.
- Autocomplete for all 12 Robot Control API methods, plus `robot.*`, `wait`, `print` and `console.log`. Each entry has a signature and documentation, and there is hover help on API calls. Only methods that exist are offered.
- Syntax errors are underlined while typing; a runtime error marks its line and scrolls to it.
- **Format** uses Prettier, which supports top-level `await` and `return`.
- **Revert** throws away unsaved changes.
- Starter templates (Drive and turn, Drive a square, Drive an arc, List joints) can be loaded; Ctrl+Z undoes a template load.
- The default starter program is the one in the brief, adapted to the sandbox API (`await robotControl.stop()`).

## 8. Sandbox implementation and limitations

- **Implementation.** See `CODE-EXECUTION-SANDBOX.md`.
  - An opaque-origin iframe (`sandbox="allow-scripts"`) with a strict CSP.
  - It runs a blob Web Worker that loads the restricted runtime first, then the program.
  - A private MessageChannel connects it to the host.
  - Everything the worker sends is validated against the allowlist, and the host checks the session on every message.
  - Removing the frame kills the worker.
- **Limitations, stated plainly:**
  - **Pause in hand-written JavaScript.** It works at robot calls, `wait()` and Blockly loop checkpoints. A JavaScript loop that never calls the API or `wait()` cannot be paused, only stopped; the robot is still stopped immediately and commands are held. The Pause tooltip says so.
  - **Isolation depends on the browser.** It relies on browser features (opaque origins, CSP, workers). A browser bug would weaken it. No stronger guarantee is claimed.
  - **CPU use.** A runaway program uses one CPU core until Stop or the 5-minute limit. On the 2-core test machine the UI kept rendering (12–13 vs 18–19 frames per second with software 3D).
  - **Hosting pages.** A page that blocks `blob:` workers in sandboxed frames makes Run report a clear error. Code never falls back to running in the main thread.
  - **`setInterval` is not available.** Use a loop with `wait()`. `setTimeout` is tracked, at most 60 s.

## 9. Robot Control API integration

- The sandbox mirrors `robotControl`: `drive.forward/backward/set`, `turn.left/right/set`, `stop`, `reset`, `joint(id).setTarget/preview`, `setSpeedPercent`, `getState`.
- **Inside the sandbox every method returns a Promise.**
  - Timed moves and joint targets resolve when finished.
  - Untimed moves resolve when they are accepted.
  - C2 rejections throw `RobotCommandError` with the C2 message.
- The existing API's **signatures and return values are unchanged**. The host bridge calls them with `source: 'code'`.
- `turn.left({ rate, durationMs })` is accepted as in the brief. The Phase 3 option name `speed` also works.
- **Validation:**
  - Joint limits, actuators, disabled motors, drive setup, Build Mode restrictions, ranges and durations all come from **C2**.
  - The host bridge adds checks for argument types, the rate limit, the `wait()` range and the speed-percent range.
  - Inside the sandbox, `setSpeedPercent` refuses values outside 0–100 with an error, instead of the API's silent clamping. The API itself is unchanged.
- Code Studio never writes to `robotStateStore` and never calls the engine.

## 10. Program storage implementation

- **Store:** `arai.programs.v1`, format version 1.
  - Fields: `{ id, projectId, name, description, language, source, version, createdAt, updatedAt }`.
  - The source is the editable representation (Blockly JSON or JavaScript), so saving either type keeps what the user edits.
- **Project safety:** every operation checks the program's project against the open project. Deleting a project deletes its programs.
- **Loading:** stored data is repaired on every load; broken entries are skipped with a warning.
- The last opened program per project is remembered.
- **Unsaved edits:** drafts are kept per program while switching. The unsaved dot is shown in the toolbar and the program list. Leaving the workspace with unsaved programs shows the existing dialog, listing them, and "Save and leave" saves them too.

## 11. Security measures

- **No user code in the main thread:** no `eval` and no `new Function`.
- **An opaque-origin sandbox frame**, so there is no access to app storage, cookies, IndexedDB, the DOM or app objects.
- **A strict CSP**, so there is no network, no script loading and no eval in the frame or worker.
- **APIs removed from the worker scope,** with read-only API globals.
- **An allowlisted message protocol** with session checks, argument validation and a limit on invalid messages.
- **The host bridge plus full C2 validation** for every robot command, and a rate limit.
- **Hard stop by removing the frame,** plus an explicit host-side robot stop on every run end. Late messages are ignored.
- **Blockly icons are served locally;** no third-party requests.
- **Proof:** the browser suite runs a probe program in the sandbox. fetch, XHR, WebSocket, importScripts, dynamic import, localStorage, IndexedDB, document, window, parent, eval, Function and postMessage are all blocked, and the app secret stored in localStorage is not readable.

## 12. Tests executed and actual results

All results below were **executed** on 18 Nov 2026 (Node 22, headless Chrome with software WebGL, 2 CPU cores).

**Unit and integration tests (Vitest), all executed:** `npm run test` → **197 / 197 passed** in 20 files (178 at the first delivery, plus 19 regression tests from the second review).

| Group | Tests |
| --- | --- |
| Phase 1–3 tests (unchanged) | 113 |
| `messageProtocol.test.ts` | 6 |
| `workerRuntime.test.ts` | 10 |
| `hostBridge.test.ts` (real API, C2, engine) | 15 (5 new) |
| `executionManager.test.ts` (real runtime in an isolated VM) | 16 (1 new) |
| `programStore.test.ts` | 14 (5 new) |
| `runActions.test.ts` (new) | 8 |
| `programValidation.test.ts` | 4 |
| `blockly.test.ts` (headless Blockly) | 11 |

The suite covers the brief's checklist:
- **Blockly:** workspace init, block loading, joint dropdowns, generation, invalid and unsupported blocks, API-only code.
- **Sandbox:** approved messages only, valid requests reaching the bridge, invalid messages rejected, timeout, crashes, Stop, late messages, no restricted APIs.
- **Robot API:** forward, backward, left and right turns, combined motion, stop, reset, joint targets, invalid targets, missing actuators, Build Mode restrictions, Bus Events.
- **Storage:** create, save, reopen, rename, duplicate, delete, project association, schema v3 unchanged.

**Browser end-to-end (Playwright), all executed:** `npm run test:e2e` → **5 / 5 suites, 98 / 98 steps passed**.

| Suite | Steps |
| --- | --- |
| Phase 1 journey | 21 / 21 |
| Phase 1 corrections | 20 / 20 |
| Phase 2 builder | 21 / 21 |
| Phase 3 control | 17 / 17 |
| **Phase 4 Code Studio** | **19 / 19** |

The Code Studio suite covers the brief's 18-step journey:

| Step in the brief | How it is tested |
| --- | --- |
| 1–2 | Dashboard, then open an existing project |
| 3–4 | Code Studio opens; Blockly is selected |
| 5 | Drag a block from the toolbox; build a movement program |
| 6–7 | Run; the robot moves in the viewport |
| 8 | Commands appear in Bus Events |
| 9–10 | Stop; the robot stops and the worker is gone |
| 11 | Switch to JavaScript (starter code, autocomplete) |
| 12–13 | Run a JavaScript movement program; movement and logs |
| 14 | Pause and resume: the robot is frozen while paused; total distance 0.40 m ± 0.05 |
| 15 | Invalid command (C2 message), runtime error with line, syntax error |
| 16–18 | Save, rename, reload; the program is restored |

Additional checks:
- An endless loop does not freeze the UI, and Stop takes under 500 ms (measured 16.6 ms in the page).
- The sandbox probes above.
- The joint dropdown.
- Duplicate and delete with confirmation.
- The unsaved-program dialog.
- Leaving Code Studio stops a running program, and Build and Control still work.
- Programs stay with their project.
- No console errors or failed requests.

**Honest note on one flaky run.** In the first full run, one Phase 1 corrections step ("Orbiting to a non-standard angle shows Custom view") failed once. It drags the camera with the mouse, and the 2-core software-rendering machine was busy right after the previous suite. Run alone it passed 3 of 3 times, and the following full run passed 98 of 98. Phase 4 did not change this code path; the Build Mode viewport size is unchanged.

**Request-failure filter in the Code Studio suite.** The suite treats any failed network request as an error. The one exception is the sandbox worker's own `blob:` script, which Chrome reports as "aborted" when a finished program's frame is removed. That is intended teardown, and it is documented in the test.

## 13. Build and lint results (executed)

| Check | Result |
| --- | --- |
| `npm run typecheck` (TypeScript strict) | Pass, 0 errors |
| `npm run lint` (oxlint) | Pass, exit code 0, no findings |
| `npm run build` | Pass; no chunk-size warning after splitting Blockly into its own chunk |

## 14. Known issues

- Pause cannot interrupt a JavaScript loop that never calls the robot API or `wait()` (see section 8).
- There is no conversion from JavaScript back to Blockly. Blockly → JavaScript is one-way, as the brief allows.
- Blockly's built-in procedure (function) blocks are not offered, because generated functions would not be `async`. Repeat, loops and variables cover the robot use cases.
- Programs can command any valid motion, including driving through obstacles. There are no collisions until Phase 5.
- The live demo uses in-memory routing (as in earlier phases). Whether the demo host allows sandboxed `blob:` workers could not be verified from here; if it does not, Run shows a clear error. The normal build was fully tested.
- `npm audit` reports dev-tool advisories that existed before Phase 4 (section 5).
- All browser tests ran in headless Chrome. Firefox and Safari were not tested.

## 15. Remaining work

- Manual review of Code Studio on a real desktop browser and a tablet.
- Optional: translation of block labels, block-highlighting during execution, and user-defined async functions as Blockly blocks.

## 16. Recommended next phase

**Phase 5 — Physics simulation.** Replace the kinematic step inside the movement engine with a physics engine, using mass, friction, gravity, collisions and the stored `maxTorque`.
- Code Studio needs no changes, because programs already go through the API and C2.
- Timed moves and Pause/Resume keep working through `command.status`.

**Sensors (C3, Phase 6)** would then extend the sandbox protocol with read operations and add a Sensors block category, as described in `CODE-STUDIO.md`.

Phase 5 has **not** been started. It is waiting for your review and approval.

## Manual testing instructions

1. Run `npm install`, then `npm run dev`, and open the printed address.
2. Create an **Explorer Bot** and click **Code** in the top bar.
3. The starter block program is shown. Click **Run**: the robot drives forward, turns left and stops, and the **Program** tab lists each step.
4. Click **Movement** in the block toolbox and drag a block under the others. Click **JavaScript (read-only)** to see the generated code.
5. Click **JavaScript** in the toolbar. Type `robotControl.` and see the autocomplete. Run the starter program.
6. Replace the code with `await robotControl.drive.forward({ speed: 1, durationMs: 3000 });`. Click **Run**, then **Pause**: the robot stops. Click **Resume**: it continues for the remaining time.
7. Try `await robotControl.drive.set(3);`. A red error bar shows the C2 message.
8. Try `while (true) {}`, then **Stop**. The app stays responsive and stops at once.
9. Click **Save** (or press Ctrl+S), rename the program, reload the page and open **Code** again: the program is back.
10. Click **Build**: editing works again. Press **M** for Control Mode: keyboard driving works as in Phase 3.

## Second review fixes (19 Nov 2026)

All fixes are small and targeted. No feature was rebuilt, no Phase 1–3 behavior changed, schema v3 is unchanged, and no test was removed or weakened.

| # | Defect | Fix | Files | New tests |
| --- | --- | --- | --- | --- |
| 1 | `uniqueProgramName()` could loop forever: with a 60-character base, `"name (2)".slice(0, 60)` gave back the same name every time | The suffix gets its room first and only the base is shortened, so every attempt is different. At most 10,000 numbered attempts, then random suffixes (checked), then a time-based suffix. Always terminates; case-insensitive | `storage/programStore.ts` | 4 in `programStore.test.ts`: 15 copies of a 60-character name, repeated duplicates of copies, case-insensitive clash, fallback with all 10,000 numbered names taken |
| 2 | The paused request queue had no limit | New limit `maxPausedRequests` (default 50). Extra requests are rejected at once with "Too many requests while the program is paused (limit N) …". Read-only requests (`getState`, `joints`, `joint.info`) are answered during a pause without queuing. A program's `stop()` is always accepted and runs in order, and Resume then does not restart the interrupted motion. Disposal rejects every held request. Nothing held runs while paused | `runtime/hostBridge.ts`, `runtime/executionLimits.ts` | 5 in `hostBridge.test.ts`: full queue, repeated pause/resume cycles in order, read-only during pause, stop during pause (full queue, no restart), disposal settles all |
| 3 | A Blockly run or convert could use stale context after the lazy Blockly load | The project, program and a session epoch (raised when leaving Code Studio or closing a project) are captured before the load and verified after it: same project, same block program, not deleted, still in Code Studio. Generation runs only after that check (it is synchronous). No unsafe `!`. The same protection applies to Convert | `runActions.ts`, `components/CodeStudioPane.tsx` (the read-only code view refreshes for its program) | `runActions.test.ts` (8): unchanged case runs; switching program, switching project, deleting the program, leaving and returning, leaving to Control all cancel; Convert protected; null results handled |
| 4 | Found during the extra checks: **Duplicate** saved the original's unsaved edits as a side effect | The copy takes the unsaved edits; the original stays unsaved | `programActions.ts` | 1 in `programStore.test.ts` |
| 5 | Found during the extra checks: **Ctrl+S inside the code editor ran twice.** It saved, then logged a misleading "has no unsaved changes" (confirmed in the browser) | The editor's own Ctrl+S binding was removed. The app-wide handler already saves the program in Code Studio, inside the editor too, and blocks the browser's save dialog. Ctrl+S elsewhere is unchanged | `editor/codeEditorSetup.ts`, `components/JavaScriptEditor.tsx`, `components/CodeStudioPane.tsx` | Browser check in the Code Studio suite: Ctrl+S saves exactly once |

Also added during the extra checks: 1 test in `executionManager.test.ts`. A worker crash during movement stops the robot, later messages from the crashed session are ignored, and Stop still works afterwards.

**One existing test was adapted, not weakened.** A host-bridge test used `getState` as the example of a request held during a pause. Read-only requests are now answered during a pause by design. The test now holds a robot command (`setSpeedPercent(50)`, which leaves the path unchanged) and still asserts that it waits until Resume. A separate new test asserts that read-only requests are answered while paused.

**Extra checks with no defect found:**
- Worker and iframe cleanup: no sandbox frame is left after completion, Stop, error or leaving Code Studio.
- Late messages are rejected.
- The robot is stopped after the project closes.
- Pause/resume works with timed and untimed movement.
- C2 validation applies to every program command.
- Program persistence and migration work.
- Build and Control modes, the viewport and keyboard driving are unchanged.

**Results (all executed on 19 Nov 2026):**

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no findings |
| `npm run test` | **197 / 197** in 20 files |
| `npm run build` | Pass |
| `npm run test:e2e` | **98 / 98** steps in 5 suites (21 + 20 + 21 + 17 + 19) |

**Remaining limitations (unchanged):**
- Pause cannot interrupt a JavaScript loop that never calls the robot API or `wait()`.
- The demo host's support for sandboxed `blob:` workers was not verifiable from here.
- Only Chrome was tested.

