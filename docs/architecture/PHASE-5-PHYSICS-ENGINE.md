# Phase 5 — Physics Engine

This document records which physics engine AutoBotAI uses, why it was chosen, and how the physics layer is built. How the engine connects to the robot model, C2 and Code Studio is described in `PHYSICS-ROBOT-INTEGRATION.md`.

## 1. Engine selection

| Option | License | Maintained | Joints and motors | Browser delivery | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Rapier 3D** (`@dimforge/rapier3d-compat` 0.21.0) | Apache-2.0 | Yes, active releases | Fixed, revolute, prismatic, spherical, generic; built-in joint motors with velocity/position targets and a max force | WebAssembly embedded in the JS package, no extra file to host | **Chosen** |
| cannon-es | MIT | No release since 2022 | Hinge and lock constraints; motors are basic | Pure JS | Rejected: unmaintained, weaker joint motors |
| MuJoCo (WASM) | Apache-2.0 | Yes | Excellent | Large WASM build, MJCF model format, no official npm package for the browser | Rejected for now: heavy, and the robot would need conversion to MJCF |
| `@react-three/rapier` | MIT | Yes | Same as Rapier | React components | Not used: it would run physics inside React, against the rule that physics stays outside React |

Rapier was chosen because it is maintained, permissively licensed, fast, deterministic for a fixed step, and has the joint motors the robot needs (DC motors and servos with a torque limit). The `-compat` build embeds the WASM file in base64, so the demo works from any folder without extra server setup.

**Bundle cost.** Rapier is loaded only when the Physics engine is first selected (dynamic `import()` in `engine/rapierLoader.ts`). The Rapier chunk is 4.3 MB (1.67 MB gzip). Build, Control and Code Studio in Kinematic mode do not download it.

## 2. Layering

```
src/features/physics/
  physicsConfig.ts          All constants (SI units): timestep, substeps, gravity, defaults, limits, collision groups, motor gains
  engine/
    rapierLoader.ts         Lazy, single load of Rapier
    physicsWorld.ts         PhysicsWorld: Rapier world, ground, obstacles, robot bodies and joints, stepping, read-outs
    environments.ts         Environment presets (empty floor, obstacle course)
    quat.ts                 Quaternion helpers and joint angle (twist) decomposition
  bodies/
    shapes.ts               Part geometry → collider shape (box, cylinder, sphere, capsule) with world scale
    materials.ts            Part physics: stored overrides + category defaults; load-time sanitizing; input checks
    robotAssembly.ts        Robot model (C1 data) → links, colliders, joints, mass (pure, no Rapier)
  actuators/
    motorControl.ts         DC motor (velocity), servo / generic actuator (position via velocity), off
  integration/
    physicsController.ts    Physics Integration Adapter: implements the movement-engine controller interface
  simulation/
    simulationStore.ts      Engine choice, run state, settings, live info (runtime only, never saved)
    simulationManager.ts    The single owner of the physics lifecycle and loop
  components/
    SimulationPanel.tsx     Engine selector and controls (UI)
    PhysicsDebugView.tsx    Debug visualization in the viewport
    EnvironmentObstacles.tsx  Draws obstacles of the selected environment
  tests/                    Unit and integration tests (Rapier runs in Node)
```

Only `simulationManager.ts` creates or destroys the physics world. The UI calls the manager. Blockly and JavaScript programs never see the engine: they send C2 commands like before.

## 3. Time stepping

| Setting | Value |
| --- | --- |
| Fixed tick | 1/60 s |
| Solver substeps per tick | 4 (240 Hz integration) |
| Solver iterations | 8 |
| Max frame time accepted | 0.25 s |
| Max ticks per animation frame | 5 (excess time is dropped, no spiral of death) |
| Sleeping | Enabled (Rapier default thresholds) |

The loop runs on `requestAnimationFrame` with an accumulator. After the ticks owed for a frame, the controller publishes runtime state **once** to `robotStateStore`, and the info panel is refreshed at most four times per second. No React update happens per physics step.

Pause cancels the frame loop, so simulated time is frozen. Resume restarts it with a fresh frame clock, so no time jump happens.

## 4. Bodies, colliders and materials

- **Links.** A link is a root part, or a part that is the child of a revolute or prismatic joint. Parts attached without a joint, or with a fixed joint, are merged into their parent link as extra colliders (a compound body). This keeps the solver small and makes fixed joints perfectly rigid.
- **Joint markers** (parts of the `joint` category) are visual helpers and get no collider and no mass.
- **Shapes** follow the rendered primitive and the part's world scale. Cylinders and capsules use the Y axis, like Three.js.
- **Mass.** A stored mass, or density × volume. Default densities come from the part category (body, wheel, motor, sensor and so on).
- **Friction and restitution.** Stored values or defaults. A wheel-category part with no moving joint (a caster ball) gets low friction (0.02) so it slides instead of braking the robot. Ground and obstacles combine friction by Multiply and restitution by Max, so a part's own values decide the contact.
- **Collision groups.** Robot parts collide with the environment only, not with each other (adjacent links overlap at their joints by design).

## 5. Joints and motors

| Robot joint | Rapier joint | Notes |
| --- | --- | --- |
| fixed | none (merged) | Child is part of the parent's compound body |
| revolute | revolute | Limits from the joint; anchors and axis from the joint frame |
| revolute + DC motor ("continuous") | revolute, no limits | A DC-motor wheel turns continuously; this is how a continuous joint is represented without changing the schema |
| prismatic | prismatic | Limits from the joint |

Motors use Rapier's force-based joint motors:

- **DC motor:** velocity target, `maxForce = maxTorque`. The damping factor is `maxTorque / 0.05`, so the full torque is reached at 0.05 rad/s of speed error.
- **Servo and generic actuator:** a position target. The velocity command is `clamp(8 × error, ±maxVelocity)`, applied with the same force limit. A move ends as completed within tolerance, or as stopped when the deadline (expected move time + 3 s) passes, for example when the torque is too weak.
- **Disabled or no actuator:** `maxForce = 0`, so the joint swings freely.

Joint angles are read by twist decomposition of the relative rotation about the joint axis; joint rates come from the angular velocity difference projected on the axis.

## 6. Debug visualization

The debug view draws, without React updates, straight into GPU buffers once per frame:

- collision shapes and the ground (Rapier debug lines),
- joint anchors (yellow points) and joint axes (yellow lines),
- body velocities (cyan lines),
- contact points (red points).

## 7. Performance notes

- One world, one loop, one publish per frame. The Explorer Bot needs about 0.2–0.4 ms per tick in Chrome (measured in the e2e run, shown as "Step cost" in the panel).
- Sleeping bodies cost almost nothing.
- Disposal frees the WASM world on Stop, engine switch and mode change. Tests check that no loop or controller is left behind.

## 8. Limits and known gaps

- Robot self-collision is off (parts of one robot never collide with each other).
- Two environment presets only; an environment editor belongs to a later phase (C5).
- Sensor simulation (distance sensor rays and so on) is not part of Phase 5.
- Spherical and planar joints are not in the robot model yet, so they are not mapped.
