# Phase 7 — Environment Editor (C5)

The Environment Editor lets a user build the world a robot is tested in: ground planes, walls, boxes, platforms, ramps and obstacles. The editor is a fourth workspace mode next to Build, Control and Code. It reuses the existing viewport, the existing Rapier world and the existing sensors. Nothing in Phases 1–6 was replaced.

## 1. Technical assessment (the 11 points of the brief)

1. **Where environments live.** Environments are reusable assets in their own store (`arai.environments.v1`), not inside the robot project. A project only remembers which environment it uses (`environmentId`, an optional field, so schema v3 is unchanged and no migration was needed). One environment can be used by many robots.
2. **Data model.** `EnvironmentDefinition { id, name, version, templateId, objects[], createdAt, updatedAt }` and `EnvironmentObject { id, name, kind, shape?, position, rotation, size, body, mass, friction, restitution, collision, color, visible, locked }` in `src/types/environment.ts`. Sizes are full sizes in meters, rotations are Euler angles in radians. `ENVIRONMENT_FORMAT_VERSION = 1`.
3. **Draft and saved copy.** The editor always works on a draft. The physics world is only ever built from the saved definition (`resolveEnvironment(id)`). Unsaved edits can never reach a running simulation.
4. **Templates.** Four built-in templates: Empty Environment (`floor`), Basic Test Arena (`arena`), Obstacle Course (`obstacles`, the Phase 5 preset, unchanged) and Ramp Test (`ramp-test`). Opening a template creates a new unsaved copy with its own `envd_` id, so templates are never edited. **Reset to template** restores the copy's objects from its template.
5. **Edit and Test modes.** Environment mode is Edit Mode: the simulation is stopped, the robot cannot be selected or driven, and objects can be edited. **Test Environment** validates the draft, saves it, assigns it to the project, switches to Control Mode and starts the Physics engine. **Edit this environment** stops the simulation and returns to the editor. Edit Mode never changes a live world.
6. **Physics.** Environment objects are added to the single existing Rapier world by `PhysicsWorld.addEnvironmentObject`. There is no second engine and no second loop; the world is created and disposed exactly as in Phase 5. See `ENVIRONMENT-PHYSICS-INTEGRATION.md`.
7. **Sensors.** The distance sensor casts real rays against environment objects through collision groups. Encoders and the IMU read the robot as before, so ramps, collisions and pushes show up in their readings with no sensor changes.
8. **Code Studio.** Programs see the environment only through sensors. No environment or physics object is exposed to the sandbox, and the sandbox API is unchanged.
9. **Undo and redo.** Each draft has its own history (100 steps). The existing Undo and Redo buttons and Ctrl+Z / Ctrl+Y act on the environment history in Environment mode and on C1 (the robot model) everywhere else. A gizmo drag is one undo step.
10. **Validation.** `validateEnvironmentObject` and `validateEnvironment` reject NaN or infinite values, out-of-range sizes, positions, masses, friction and restitution, empty or duplicate names, a dynamic ground and more than 200 objects. `sanitizeEnvironment` repairs stored data on load (bad values become defaults, duplicate ids are renewed, unknown fields are kept) and reports warnings.
11. **Performance.** Measured with 10, 25 and 50 objects (see section 6). Building the world and stepping it stays well below a 16 ms frame.

## 2. Object library

| Kind | Shape | Body | Collider |
| --- | --- | --- | --- |
| Ground | box slab | static only | cuboid, GROUND group |
| Wall | box | static or dynamic | cuboid |
| Box | box | static or dynamic | cuboid |
| Platform | box | static or dynamic | cuboid |
| Ramp | wedge rising toward +X | static or dynamic | convex hull of 6 points |
| Obstacle | box, cylinder or sphere | static or dynamic | cuboid, cylinder or ball |

New objects are placed at a free spot (a spiral search that keeps away from other objects and from the robot start area) unless they are dropped at a point in the viewport.

## 3. Editing

- Create from the Library tab (click or drag into the viewport) or from the toolbar's **Add object** menu.
- Select in the viewport or in the Objects tab. Move and rotate with the transform gizmo; scaling with the gizmo is folded into the object's size when the drag ends.
- The inspector edits name, position, rotation (in degrees), size, ramp incline, body type, mass, friction, restitution, collision and color, with inline validation errors.
- Duplicate (Ctrl+D), Delete (Delete key), Rename (inspector or double-click in the Objects tab), Lock, Hide, and Reset rotation. There is no one-click reset of position and size; those are set in the numeric fields or undone with Ctrl+Z.
- A locked object only accepts Lock and Hide changes. A hidden object is not drawn but stays physical (a known limitation, see the report).

## 4. Files

- `src/types/environment.ts` — data model.
- `src/features/environment/config/environmentConfig.ts` — limits, library, defaults, placement, validation, sanitizing.
- `src/features/environment/config/templates.ts` — the four templates.
- `src/features/environment/store/environmentStore.ts` — saved environments, the draft, history, bus events.
- `src/features/environment/environmentSession.ts` — Test / Edit flow and project wiring.
- `src/features/environment/components/` — scene, gizmo, left panel, inspector, toolbar, status tab.
- `src/features/physics/engine/environmentColliders.ts` — collider shapes.

## 5. Events (C5 Environment Connector)

| Channel | When |
| --- | --- |
| `environment.opened` | A draft is opened (saved environment or a template copy). |
| `environment.edited` | The draft changes (add, update, remove, undo, redo). |
| `environment.changed` | A saved environment is created, saved, renamed, duplicated or deleted. |
| `simulation.environmentChanged` | The simulation switches to another environment; the project remembers it. |

## 6. Performance (Node, Rapier compat 0.21, 5 s of simulated time at 60 Hz)

| Objects | Dynamic | Colliders | Create | Build bodies | 5 s simulation | Per tick |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 2 | 19 | 1.0 ms | 8.9 ms | 183 ms | 0.61 ms (includes JIT warm-up) |
| 25 | 5 | 34 | 3.0 ms | 1.8 ms | 49 ms | 0.16 ms |
| 50 | 10 | 59 | 8.3 ms | 7.3 ms | 58 ms | 0.19 ms |

The test (`environmentPerformance.test.ts`) asserts generous upper bounds, not these numbers, so it does not fail on slower machines.
