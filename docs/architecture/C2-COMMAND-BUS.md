# C2 — Command Bus

Status: active since Phase 3. Used by Code Studio programs since Phase 4 (source `code`, see `CODE-STUDIO.md`). Sources: `src/features/controls/` (`commands.ts`, `commandBus.ts`, `movementEngine.ts`, `robotControlApi.ts`, `controlSession.ts`, `keyboardControls.ts`).

## Purpose

C2 carries **commands that make the robot move**: drive, turn, set a joint target, stop and reset. Keyboard keys, on-screen buttons, the Robot Control API and (later) Code Studio and AI all send the same commands, so they are validated the same way and appear in the same logs.

C1 changes what the robot *is* (parts, joints, actuators). C2 changes what the robot is *doing*. C2 never changes the saved design.

## How a command flows

```
Keyboard / buttons / robotControl API / bus request ('command.request')
        │
        ▼
submitCommand(type, payload, source)          ← commandBus.ts
        │  1. build RobotCommand { id, robotId, type, payload, timestamp, source }
        │  2. validateCommand(command, context)  ← commands.ts (pure)
        │       rejected → 'command.rejected', lastError, console error
        ▼
'command.accepted' → movementEngine.execute(command)
        │
        ▼
Movement engine (60 Hz fixed step, outside React)
        │  updates robotStateStore (runtime only)
        ▼
'command.status'  executing → completed | stopped | superseded | limited | failed
```

## Commands

| Type | Payload | Meaning |
| --- | --- | --- |
| `drive` | `{ speed: −1…1, durationMs? }` | Forward (+) or backward (−), as a fraction of the drive's max speed, scaled by the speed setting. `0` releases. |
| `turn` | `{ rate: −1…1, durationMs? }` | Left (+) or right (−). `0` releases. Drive and turn combine into an arc. |
| `setJointTarget` | `{ jointId, target, mode: 'actuator' \| 'preview' }` | `actuator`: the joint's position actuator moves it at its max velocity. `preview`: kinematic joint preview, jumps there (no actuator needed). Target in rad or m. |
| `stop` | `{}` | Stops all motion immediately. Always accepted, even in Build Mode. |
| `reset` | `{}` | Stops and returns the robot and all joints to the design pose. |

`durationMs` is 1 … 60 000. A new drive or turn replaces the previous one (status `superseded`).

## Validation (examples of real messages)

- "Target robot is not open in the workspace."
- "Switch to Control Mode to move the robot." (every command except stop, when the workspace is in Build Mode; since Phase 4, Control Mode **and Code Studio** may move the robot: `canDrive(mode)`)
- "This robot has no drive controller. Use \"Set up differential drive\" first."
- "Wheel joint … has no motor (missing actuator)." · "Motor \"Left Drive Motor\" is disabled." · "… must be speed-controlled."
- "speed must be between −1 and 1." · "durationMs must be between 1 and 60000."
- Joint targets: "Joint \"…\" is fixed and cannot move.", "Above the upper limit (3.142).", "Below the lower limit (…).", "Joint position must be a number."

## Events

| Channel | Payload |
| --- | --- |
| `command.request` | `{ type, payload, robotId?, source? }` — any module may send this |
| `command.accepted` | `{ command: RobotCommand }` |
| `command.rejected` | `{ command, errors: string[] }` |
| `command.status` | `{ commandId, type, status, detail? }` |
| `robot.modeChanged` | `{ mode: 'build' \| 'control' }` |

All of them show up in the **Bus Events** tab. Rejections are also written to the console as errors (source `control`).

`RobotCommand.source` is one of `keyboard`, `panel`, `api`, `bus` and, since Phase 4, `code` (a Code Studio program).

## Robot Control API

`src/features/controls/robotControlApi.ts`. Every call becomes a validated C2 command and returns `{ ok, command, errors }` (`errors` is empty when accepted).

```ts
robotControl.drive.forward({ speed: 0.5, durationMs: 2000 });
robotControl.drive.backward();
robotControl.drive.set(0.3);            // −1 … 1, 0 releases
robotControl.turn.left({ rate: 0.5 });
robotControl.turn.right();
robotControl.turn.set(-0.2);            // −1 (right) … 1 (left)
robotControl.stop();
robotControl.reset();
robotControl.joint(jointId).setTarget(0.3);   // position actuator
robotControl.joint(jointId).preview(0.3);     // kinematic preview
robotControl.setSpeedPercent(75);
robotControl.getState();                 // movement, speedPercent, rootPoses, jointPositions
```

Code Studio (Phase 4) is expected to call this API rather than the stores.

## Movement engine

- Fixed timestep of 1/60 s using a `requestAnimationFrame` accumulator; at most one loop runs; it stops when nothing moves.
- Runs outside React and writes only to `robotStateStore`.
- Tests replace the scheduler (`setScheduler(null)`) and call `step()` by hand, so they are exact and do not depend on timing.
- Leaving Control Mode, closing the robot or leaving the workspace stops the engine and clears runtime state (`endControlSession`).
