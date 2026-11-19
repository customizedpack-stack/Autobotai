# Physics ↔ Robot Integration (Phase 5)

How the physics engine connects to the robot model (C1), the Command Bus (C2), Code Studio and the viewport, without bypassing any of them. Engine internals are in `PHASE-5-PHYSICS-ENGINE.md`.

## 1. Data flow

```
Robot model (C1: sceneStore objects, joints, actuators, controllers)
        │  read once on Start / Reset / environment change
        ▼
buildRobotAssembly()  ──►  PhysicsWorld (Rapier)  ◄── tick(1/60 s) × n   (simulationManager loop)
                                  │
                                  │ publish() once per frame
                                  ▼
                       robotStateStore (C4 runtime state: rootPoses, jointPositions, actuators, movement)
                                  │
                                  ▼
                       Viewport (unchanged renderer), telemetry, status bar

Keyboard / buttons / Code Studio ──► Robot Control API ──► C2 Command Bus (validate) ──► movement engine
                                                                                     │
                                                          external controller set? ──┴──► PhysicsController.execute()
```

- The physics world is built from the **saved design**. Runtime results never write back to the design; "Apply pose" is still the only (undoable) way to copy a driven pose into the design.
- The viewport did not change: it already renders `robotStateStore` poses. Physics simply becomes the writer of that state.

## 2. One controller at a time

The movement engine (Phase 3) gained an **external controller** slot (`setExternalController`).

| Engine | Who moves the robot | Kinematic loop |
| --- | --- | --- |
| Kinematic (default) | Movement engine (Phase 3 math) | Runs as before |
| Physics, running or paused | `PhysicsController` | Never steps; `execute` delegates to the physics controller |
| Physics, stopped | Nobody (C2 refuses movement with a clear message) | Not running |

Switching engines, stopping the simulation and leaving Control Mode / Code Studio always end the previous controller first (`shutdown` of the kinematic engine, `dispose` of the physics world). Unit tests check that two controllers or two loops never exist at the same time.

**No silent migration.** The engine choice is runtime state (`simulationStore`), never saved. Every project, old or new, opens on the Kinematic engine. Nothing in a project changes when Physics is used.

## 3. C2 rules with the Physics engine

All commands still go through `validateCommand` (C2). Added rule (`checkPhysicsReady`), only when the engine is Physics:

| Situation | Movement commands (drive, turn, setJointTarget) | Stop | Reset |
| --- | --- | --- | --- |
| Starting | Refused: "The physics simulation is starting…" | Accepted | Accepted |
| Running | Accepted, executed by physics | Accepted | Accepted (rebuilds the world at the design pose) |
| Paused | Refused: "…paused. Resume it to move the robot." | Accepted | Accepted |
| Stopped | Refused: "Start the physics simulation…" | Accepted | Accepted |
| Joint **preview** (`setJointTarget`, mode `preview`) | Refused in Physics: preview is a kinematic tool | — | — |

There is still one stop implementation: `robotControl.stop()` → C2 → the active controller's stop (physics brakes the wheels and holds servos).

## 4. Command mapping in the Physics Integration Adapter

| C2 command | Physics behavior |
| --- | --- |
| `drive` (speed, duration) | Sets the linear intent. The Phase 3 differential-drive math turns linear + angular intent into wheel angular velocities; each DC motor gets a velocity target with its torque limit. Timed commands end on **simulated** time. |
| `turn` (rate, duration) | Sets the angular intent; combined with drive gives arcs. |
| `setJointTarget` (mode `move`) | Servo / generic actuator position target, limited by max velocity and torque. Ends as completed (within tolerance) or stopped (deadline passed). |
| `stop` | Zero intent, wheels braked (velocity 0 with full torque), pending commands end as stopped, servos hold their current angle. |
| `reset` | Rebuilds the physics world from the design pose. |

The robot moves because wheels push against the ground through friction; there is no direct pose writing in Physics.

## 5. Code Studio

- Programs call the same Robot Control API, so their commands go through C2 and reach the physics adapter. Programs have no access to Rapier, the world or the simulation manager.
- **Run** with the Physics engine: a stopped simulation is started for the program; a paused one must be resumed first (clear error in the Program console).
- **Pausing the simulation pauses the program**; resuming the simulation resumes it (only if the simulation caused the pause).
- **Stopping the simulation or switching the engine stops the program.**
- Program timing (`wait`, durations) still uses the program clock; robot motion uses simulated time.

## 6. UI

- **Simulation panel** (Robot Control panel in Control Mode and Code Studio): Kinematic / Physics selector, Start, Pause, Resume, Stop, Reset, gravity toggle, debug view toggle, environment preset, live info (bodies, joints, total mass, simulated time, step cost, awake bodies) and model issues.
- **Engine indicator:** the banner at the bottom of the viewport reads "Kinematic Simulation — No Physics" or "Physics Simulation — Running / Paused / Stopped"; the status bar shows the engine too.
- **Simulate tab** in the top bar: opens Control Mode with the Physics engine.
- **Inspector → Physics** (Build Mode): mass, friction, bounciness and collision per part. "auto" means the default is used; **Defaults** clears the overrides. Every edit is one undo step.
- **Joint preview** is replaced by a short note while Physics is selected.

## 7. Persistence

Optional per-part field `SceneObject.physics` (`mass`, `density`, `friction`, `restitution`, `collision`). No schema version change:

- Old projects have no field and get category defaults; nothing is written back.
- On load, valid values are kept and invalid ones are dropped with a warning (`sanitizePartPhysics`).
- The engine choice and simulation settings are runtime only and never saved.
