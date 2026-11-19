# Phase 5 Report — Physics Simulation

Date: 19 Nov 2026 · Version 0.5.0 · Branch `phase-5-physics`

Architecture: `docs/architecture/PHASE-5-PHYSICS-ENGINE.md` (engine, timestep, bodies, joints, motors, performance) and `docs/architecture/PHYSICS-ROBOT-INTEGRATION.md` (C1, C2, Code Studio, UI, persistence). The Phase 4 final fixes that came first are in `docs/PHASE-4-REPORT.md`, section "Final fixes and verification".

## 1. Summary

AutoBotAI now has two simulation engines. **Kinematic** is the Phase 3 engine and stays the default for every project. **Physics** uses Rapier 3D: the robot has mass, falls under gravity, rests on the ground, and moves because its wheel motors push against the ground through friction. Servos and generic actuators move joints with a torque limit. Static obstacles block the robot. Only one engine controls the robot at any time, and every command still goes through C2.

## 2. Stage status

| Stage | Scope | Status |
| --- | --- | --- |
| 1 — Physics foundation | Engine selection, physics world, fixed timestep, lifecycle, gravity | **Complete** |
| 2 — Rigid bodies | Robot bodies, mass, collision shapes, friction, restitution, ground collision | **Complete** |
| 3 — Joint constraints | Fixed (merged into compound bodies), revolute, prismatic, limits, robot model integration | **Complete** |
| 4 — Actuator physics | DC motor (velocity), servo and generic actuator (position), torque and velocity limits | **Complete** |
| 5 — Differential drive | Wheel joints, wheel–ground friction, physics-driven movement | **Complete** |
| 6 — Workspace integration | Engine selector, Start / Pause / Resume / Stop / Reset, gravity, environment, debug view, inspector Physics section | **Complete** |
| 7 — Code Studio integration | C2, Robot Control API, Blockly and JavaScript in physics mode | **Complete** |
| 8 — Compatibility and testing | Kinematic regression, physics integration, project compatibility, browser tests, performance tests | **Complete** |

Nothing in the eight stages is left incomplete. The known limitations in section 10 are outside the Phase 5 scope.

## 3. Engine selection

Rapier 3D (`@dimforge/rapier3d-compat` 0.21.0, Apache-2.0). Chosen over cannon-es (unmaintained since 2022), MuJoCo WASM (heavy, needs MJCF conversion) and `@react-three/rapier` (would run physics inside React). Rapier is lazy-loaded: the 4.3 MB chunk (1.67 MB gzip) is downloaded only when Physics is first selected. Full comparison: `PHASE-5-PHYSICS-ENGINE.md` §1.

## 4. Architecture in short

- `features/physics/` is a separate layer: engine, bodies, actuators, integration adapter, simulation manager, UI components, tests.
- **Simulation manager** is the only owner of the world and the loop. **Physics Integration Adapter** (`PhysicsController`) implements the movement engine's controller interface.
- **Timestep:** fixed 1/60 s tick, 4 substeps (240 Hz), 8 solver iterations, accumulator capped at 0.25 s and 5 ticks per frame, sleeping on.
- **Output:** one write to `robotStateStore` per frame; the info panel updates at most 4× per second. The viewport renderer did not change.

## 5. Rigid bodies, collisions and joints

- Links are root parts and children of revolute / prismatic joints. Parts without a joint and fixed-joint children are merged into the parent as compound colliders. Joint markers have no mass or collider.
- Mass is the stored value or density × volume (category defaults). Friction and restitution are stored values or defaults; caster balls get 0.02 friction.
- Ground and obstacles combine friction by Multiply and restitution by Max. Robot parts collide only with the environment.
- Revolute and prismatic joints keep their limits. A revolute joint with a DC motor has no limits, which is how a continuous joint is represented without a schema change.

## 6. Motor control and differential drive

- DC motor: velocity target with `maxForce = maxTorque`; full torque at 0.05 rad/s speed error.
- Servo and generic actuator: velocity = clamp(8 × position error, ±max velocity) with the same force limit; ends as completed within tolerance, or stopped after the deadline (for example a servo too weak to lift its arm).
- Differential drive: the Phase 3 math converts the drive / turn intent into wheel angular velocities, which become DC motor targets. The robot moves through wheel–ground contact.

## 7. Kinematic compatibility

- Every project opens on Kinematic. The engine choice is runtime state and is never saved, so there is no silent migration.
- With Physics running or paused, the movement engine delegates to the physics controller and its own loop never steps. Switching engines, stopping, or leaving Control Mode / Code Studio disposes the previous controller first.
- C2 adds one rule in Physics: movement needs a running simulation (clear messages for starting, paused and stopped), and joint preview is refused. Stop and Reset are always accepted. There is still one stop implementation.

## 8. Code Studio integration

- Programs use the same Robot Control API → C2 path. They never touch Rapier or the simulation manager.
- Run starts a stopped physics simulation; a paused one must be resumed first.
- Pausing the simulation pauses the program and resuming continues it. Stopping the simulation or switching engines stops the program.

## 9. Files

**New**

| File | Purpose |
| --- | --- |
| `src/features/physics/physicsConfig.ts` | All physics constants |
| `src/features/physics/engine/{rapierLoader,physicsWorld,environments,quat}.ts` | Engine wrapper, environments, math |
| `src/features/physics/bodies/{shapes,materials,robotAssembly}.ts` | Robot → bodies, colliders, joints, mass |
| `src/features/physics/actuators/motorControl.ts` | Motor commands |
| `src/features/physics/integration/physicsController.ts` | Physics Integration Adapter |
| `src/features/physics/simulation/{simulationStore,simulationManager}.ts` | Engine state and lifecycle |
| `src/features/physics/components/{SimulationPanel,PhysicsDebugView,EnvironmentObstacles}.tsx` | UI |
| `src/features/inspector/PhysicsSection.tsx` | Inspector Physics section |
| `src/features/physics/tests/*.test.ts` (7 files) | Unit and integration tests |
| `tests/e2e/physics.e2e.mjs` | Browser suite |
| `docs/architecture/PHASE-5-PHYSICS-ENGINE.md`, `docs/architecture/PHYSICS-ROBOT-INTEGRATION.md` | Architecture |

**Modified (main ones)**

| File | Change |
| --- | --- |
| `src/features/controls/movementEngine.ts` | External controller slot; `publishCommandStatus` export |
| `src/features/controls/commands.ts`, `commandBus.ts` | Engine and simulation state in the command context; `checkPhysicsReady` |
| `src/core/bus/channels.ts` | `simulation.changed` channel |
| `src/features/code-studio/runActions.ts`, `runtime/executionManager.ts` | Physics start on Run; programs follow simulation pause / resume / stop |
| `src/types/scene.ts`, `src/features/robot-model/schema.ts` | Optional `physics` field, sanitized on load |
| `src/stores/sceneStore.ts` | Undoable `setPartPhysics` |
| `src/features/viewport/Viewport.tsx` | Obstacles and debug view in the scene |
| `src/components/workspace/{RobotControlPanel,ViewportToolbar,StatusBar,WorkspaceTopBar}.tsx` | Simulation panel, engine banner, status, Simulate tab |
| Placeholder texts | "Phase 5" placeholders updated in dashboard, sidebar, status view, inspector notes, catalog |
| `tests/e2e/control.e2e.mjs`, `tests/e2e/workspace.e2e.mjs` | Two text assertions updated to the new real texts (see §11) |

**Dependency added:** `@dimforge/rapier3d-compat` 0.21.0 (Apache-2.0).

## 10. Known limitations

- Robot parts never collide with each other (self-collision off).
- Two environment presets only (empty floor, obstacle course); no environment editor yet.
- No sensor simulation (distance sensor rays) in this phase.
- Spherical and planar joints are not in the robot model, so they are not mapped.
- Program `wait` uses the program clock while robot motion uses simulated time; they match while the simulation keeps real-time pace.
- The Rapier chunk is large (1.67 MB gzip). It is lazy-loaded, so only Physics users pay for it.

## 11. Tests executed and actual results

All commands below were run on 19 Nov 2026 on the final code of this branch.

| Gate step | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass (exit 0) |
| Lint | `npm run lint` | Pass (exit 0, no warnings) |
| Unit tests | `npx vitest run` | **250 / 250 passed** in 26 files (Phase 4 baseline was 207) |
| Build | `npm run build` | Pass |
| Browser tests | `npm run test:e2e` | **114 / 114 steps passed** in 6 suites |

Browser suites: workspace 21/21, corrections 20/20, builder 21/21, control 17/17, code-studio 20/20, **physics 15/15 (new)**.

Physics unit and integration tests (43, all passing):

- `physicsWorld.test.ts` (7): world init and dispose, gravity ≈ 9.81 m/s² and gravity off, bodies settle on the ground, obstacles block, friction, restitution, mass vs acceleration.
- `rigidBodyFactory.test.ts` (8): Explorer Bot links and merged parts, caster friction, shapes and world scale, wheel axis, overrides and defaults, Robotic Arm limits and markers, prismatic constraints, load-time sanitizing.
- `simulationManager.test.ts` (17): lifecycle, pause / resume / stop, no duplicate controllers or loops, gravity off, C2 rules, forward / reverse / turns / arc, timed commands and braking, Reset, mass / friction / torque effects, obstacle collision, revolute anchors and limits, servo speed limit and holding, weak servo stops, disabled actuator is free, DC motor speed.
- `codeStudioPhysics.test.ts` (6): JavaScript and **Blockly** programs drive the physics robot via C2, Run starts the simulation, simulation pause / resume / stop controls the program, engine switch stops it, Run refused while paused.
- `partPhysicsPersistence.test.ts` (3): legacy projects unchanged, undoable edits, save / reload and invalid values dropped.
- `physicsPerformance.test.ts` (2): 10 simulated seconds of driving computed in **460 ms** in Node (budget 3000 ms); state published at most once per frame.

Browser physics suite steps: inspector mass edit with undo / redo and range check; Kinematic indicator by default; Physics start and settling; driving with W; pause freezes time and refuses movement; debug view changes the picture; the wall stops the robot; Reset; gravity toggle; Stop and switching back to Kinematic; leaving Control Mode and the Simulate tab; a JavaScript program on physics; simulation pause pauses the program; physics values saved and restored after reload; no console errors.

**Changed assertions (not weakened):** the control suite expected the old banner "Kinematic Simulation — Physics Engine Integration Coming in Phase 5", and the workspace suite expected "Not connected" for the physics engine in the Status view. Both texts are no longer true, so the assertions now expect the new texts ("Kinematic Simulation — No Physics" and "Rapier 0.21 · stopped"). They check the same element as before.

Measured in Chrome during the browser run: about 0.2–0.4 ms of physics time per tick for the Explorer Bot ("Step cost" in the panel).

## 12. Manual testing instructions

1. `npm install`, then `npm run dev`, and create an **Explorer Bot**.
2. Click **Simulate** in the top bar (or **Control**, then **Physics** in the Simulation panel). The banner turns green: "Physics Simulation — Running".
3. Hold **W** to drive. Try **Pause** (W does nothing, the console explains why), **Resume**, **Reset** and **Stop**.
4. Choose **Obstacle course** and drive into the wall. Turn on **Debug view** to see collision shapes, joints, velocities and contacts.
5. In **Build**, select the Chassis and change **Mass** in the Physics section; Ctrl+Z undoes it. Start Physics again and compare the total mass.
6. Open **Code**, run a program; pausing the simulation pauses the program.

## 13. Recommended next phase

Sensor simulation on top of the physics world (distance sensor ray casts, wheel encoders and an IMU on the C3 Sensor Stream), then an environment editor (C5).
