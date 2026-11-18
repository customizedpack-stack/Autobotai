# Code Execution Sandbox

Status: active since Phase 4. Source: `src/features/code-studio/sandbox/` and `runtime/`.

## Goal

User programs (written by hand or generated from blocks) must never run in the app's main thread, must not reach the app's data or the network, and must only control the robot through the validated Robot Control API.

## Architecture

```
Main app (React, stores, C2)                      Opaque-origin sandbox frame                Web Worker
──────────────────────────────                    ───────────────────────────                ──────────
executionManager ── creates ──► <iframe sandbox="allow-scripts" srcdoc=…>
   │                             CSP: default-src 'none'; script-src 'unsafe-inline' blob:;
   │                                  worker-src blob:; connect-src 'none'; …
   │   MessageChannel (private port) ◄──► relay script ── new Worker(blob:) ──► restricted runtime
   │                                                                              + user program
   ▼
HostBridge ──► robotControl (source "code") ──► C2 ──► movement engine
```

**The frame** is created with `sandbox="allow-scripts"` and **without** `allow-same-origin`, so the browser gives it a unique **opaque origin**.
- It cannot read the app's localStorage, sessionStorage, cookies or IndexedDB, and cannot reach `window.parent`, the app's DOM or its JavaScript objects (stores, engine).
- Its Content Security Policy (a meta tag) blocks all network access (`connect-src 'none'`), all external scripts, `eval` and `new Function`. The **worker inherits this policy**, because it is created from a `blob:` URL by the frame.
- The frame only relays messages. It never runs user code itself.

**The worker** runs the restricted runtime followed by the user program. The program is wrapped in an `async function`, so `await` and `return` work at the top level. Program code is **never** evaluated with `eval` / `new Function`, in either the main thread or the worker: it becomes part of the worker script file. An endless loop blocks only the worker thread; the UI stays responsive.

**The restricted runtime** (`workerRuntime.ts`), as defense in depth:
- **Removes** these from the worker scope: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`, `caches`, `BroadcastChannel`, `Worker`, `SharedWorker`, `WebTransport`, `RTCPeerConnection`, `Request`, `postMessage`, `close`, `setInterval`, `requestAnimationFrame`, `Atomics`, `SharedArrayBuffer`.
- **Defines read-only globals:**
  - `robotControl`, `robot`, `wait`, `print`, `console`, `RobotCommandError`, `__checkpoint`.
  - A tracked `setTimeout` / `clearTimeout` (at most 60 s per timer).
- **Copies only known option keys** with plain values into messages, so nothing unexpected crosses the boundary.

## Message protocol (v1)

Every message carries `v: 1` and the `sessionId`.

| Direction | Kind | Fields |
| --- | --- | --- |
| worker → host | `ready` | — |
| worker → host | `call` | `id` (integer ≥ 1), `op` (allowlisted), `args` (plain object) |
| worker → host | `log` | `level` (`info` \| `warning` \| `error`), `text` |
| worker → host | `done` | — |
| worker → host | `fail` | `message`, `line?` |
| host → worker | `result` | `id`, `ok`, `value` or `error` |
| host → worker | `pause` / `resume` | — |

**Allowed operations:**
- **Driving:** `drive.forward`, `drive.backward`, `drive.set`, `turn.left`, `turn.right`, `turn.set`, `stop`, `reset`.
- **Joints:** `joint.setTarget`, `joint.preview`, `joint.wait`, `joint.info`, `joints`.
- **Other:** `setSpeedPercent`, `getState`, `wait`.

**Host checks for every message** (`parseWorkerMessage`, `validateArgs`):
1. Plain object, protocol version and the **current session id**. Messages from an old session are ignored.
2. Message kind and operation on the allowlist.
3. Arguments contain only known keys, with the right primitive types and finite numbers.
4. The rate limit.
5. Value ranges and robot rules come from the existing **C2 validation**, so programs get exactly the same messages as every other command source.

Malformed messages are ignored and logged. After more than 20 in one run, the run is ended as a security error. The frame envelope (`fromWorker`, `workerError`, `startFailed`) is validated separately.

## API seen by programs

`robotControl` mirrors the Phase 3 Robot Control API. Inside the sandbox:
- **Every call returns a Promise.**
- **Timed moves and joint targets** resolve when the move has finished (C2 `command.status`). Untimed moves resolve when they are accepted.
- **Turns:** `turn.left` / `turn.right` take `{ rate, durationMs }`, as in the Phase 4 brief. The Phase 3 option name `speed` is also accepted.
- **Rejections:** a rejected command throws `RobotCommandError` with the C2 message. If uncaught, it ends the program with that message.
- **Helpers:** `wait(ms)`, `robot.joints()`, `robot.jointInfo(id)`, `robot.waitForJoint(id)`, `console.log` / `warn` / `error`, `print`.

## Limits

| Limit | Default | When exceeded |
| --- | --- | --- |
| Run time (paused time excluded) | 5 minutes | Program stopped (timeout), robot stopped |
| Robot commands per second | 30 | Command rejected with a readable error |
| Single `wait()` | 60 s (C2 maximum duration) | Rejected |
| Console messages | 50 per second, 1000 per run | Extra messages dropped, with one warning |
| Console message length | 500 characters | Truncated |
| Sandbox start | 5 s | Run ended (sandbox error) |
| Invalid messages | 20 per run | Run ended (security error) |
| Requests held while paused | 50 | Rejected at once with a readable error. `stop()` never enters the queue (see below) |
| Incoming messages per session | 1000 per second | Rejected. Calls get an error answer, so promises settle. Enforced in the worker runtime **and** on the host |
| Message flood | more than 5000 per second | The run is ended as a security error. The worker reports it and the host also checks. Run-ending messages (`done`, `fail`) are never rate-filtered |

## Lifecycle and safety rules

- **One run at a time.** Each run gets a unique session id.
- **Ending a run.** When a run ends for any reason (Stop, completion, error, timeout, worker crash, sandbox start failure, leaving Code Studio, closing, switching or deleting the project), the manager does these in order:
  1. Invalidates the session.
  2. Removes the frame, which terminates the worker even inside an endless loop.
  3. Disposes the bridge (timers, listeners, held requests).
  4. Calls `robotControl.stop('code')`. Terminating a worker does not stop an already accepted motion, so the host always stops the robot explicitly.
- **Stop is always available**, including after errors.
- **Late messages** from an ended session are dropped by session check and by port closure.

## Pause and resume (documented model)

While paused, **nothing that moves the robot is executed**:
- Read-only requests (`getState`, `joints`, `joint.info`) are answered at once.
- Other requests wait in a bounded queue (50) and run in program order on resume. Requests beyond the limit are rejected at once.
- A program's `stop()` during a pause is handled at once and never queued:
  - The first one goes through the existing API and C2, so it is validated and tracked.
  - Repeated stops in the same pause are merged into it.
  - The interrupted motion and held motion requests are settled as stopped or superseded, so Resume cannot restart old movement.
  - The queue therefore never exceeds its limit.
- The toolbar **Stop** never goes through the queue: it invalidates the session, kills the worker and stops the robot.
- Ending the run rejects every held request, so no promise is left pending.

Pause is **cooperative**:
1. The host stops the robot and holds new requests.
2. The worker is told to pause. Generated Blockly code checks for this in every loop iteration (`__checkpoint`).
3. A JavaScript program halts at its next robot call or `wait()`.

**Limitation:** JavaScript code that loops **without** calling the robot API or `wait()` cannot be paused, only stopped. The robot is still stopped and no commands are accepted while paused. Resume continues interrupted timed moves for the remaining time and re-issues untimed motions and joint targets.

## Message flood protection

A worker can post messages much faster than the main thread can read them. A host-side limit alone acts too late: the messages pile up in the browser's queues. In testing, this crashed the page.

Programs can only send messages through the restricted runtime, because `postMessage` is removed from the worker scope. So the runtime enforces the same limits at the source:
- Over 1000 messages per second, extra output is dropped (with one notice) and extra robot calls fail at once inside the worker.
- Over 5000 per second, the runtime sends a single flood report (`fail` with `code: 'flood'`) and stops sending.

The host counts every incoming message per session per second as a second layer, rejects the excess, and ends sessions above the threshold. Stale sessions are dropped before any counting.

## Remaining risks (honest assessment)

- **Browser isolation is the boundary.** The design relies on standard browser isolation (opaque-origin sandboxed frames, CSP, dedicated workers). A browser bug in these features would weaken it. No guarantee beyond the browser's own is claimed.
- **CPU use.** A program can use one CPU core until it is stopped or reaches the 5-minute limit. On a 2-core test machine the UI stayed responsive: 12–13 vs 18–19 frames per second with software 3D rendering.
- **Memory use.** A program can allocate memory in its worker. Very large allocations may crash the worker. That is handled as a program error, and the robot is stopped.
- **Hosting pages.** The page that hosts the app must allow `blob:` workers inside sandboxed frames. If it does not, Run reports "Code execution could not start in this browser or hosting page". The run never falls back to running code in the main thread.
- **Robot-level checks.** The host validates message shape and C2 validates robot rules. A program can still send any valid command sequence, for example driving into a wall. That is by design: physics and collisions are Phase 5.

## Tests

- **Unit:**
  - `messageProtocol.test.ts`: allowlist, session, argument validation.
  - `workerRuntime.test.ts`: removed APIs, read-only API, messages, pause, timers, errors and lines.
  - `hostBridge.test.ts`: real API, C2 and engine; rate limit; pause/resume; joints.
  - `executionManager.test.ts`: real runtime in an isolated VM context; stop; late messages; timeout; security flood; sandbox failures; mode change.
- **Browser** (`tests/e2e/code-studio.e2e.mjs`):
  - An endless loop with UI frame measurement, then Stop in under 500 ms (measured about 17 ms) with the worker gone.
  - A probe program confirming that fetch, XHR, WebSocket, importScripts, dynamic import, localStorage, IndexedDB, document, window, parent, eval, Function and postMessage are all blocked.

## Phase 6: sensor operations

Six read-only operations were added to the allowlist: `sensor.list`, `sensor.read`, `sensor.subscribe`, `sensor.unsubscribe`, `sensor.resetEncoder` and `sensor.odometry`. They never move the robot, so they are answered while the program is paused, and they are not counted against the 30 commands per second. One host → worker message was added: `{ v: 1, kind: "sensor", subscriptionId, reading }` (a worker sending this kind is rejected). Checks and limits are described in `SENSOR-SIMULATION.md` ("Security"), and the program API in the same document.
