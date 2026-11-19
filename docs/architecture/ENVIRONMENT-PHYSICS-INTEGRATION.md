# Environment and physics integration

## One world, one loop

`simulationManager` still owns the only simulation loop (fixed 1/60 s tick). When the Physics engine starts, it creates one `PhysicsWorld` with `WorldSettings.environment` set to either a saved `EnvironmentDefinition` or a template id. The world builds the robot (Phase 5) and then every environment object. Stop, Reset and switching environments dispose the world with `dispose()`, which frees every Rapier object it created. No second engine, world or loop exists.

## Building objects

`PhysicsWorld.addEnvironmentObject(object)` returns an `EnvironmentBody` record `{ objectId, name, status, error, body, collider, dynamic }`:

- `active` — a body and collider were created.
- `no-collision` — collision is switched off; the object is drawn only.
- `failed` — validation failed or Rapier refused the shape; the error is shown in the Environment status tab and the rest of the world still builds.

Static objects use fixed bodies. Dynamic objects use dynamic bodies with the object's mass; their drawn mesh follows `environmentPose(id)` every frame. Friction and restitution come from the object. Ramps are convex hulls of a 6-point wedge; cylinders and spheres use primitive colliders.

## Default floor

An environment with no object of kind "ground" gets a 50 m half-extent floor slab, so the robot never falls forever. An environment with ground objects uses only those (the robot can drive off their edge and fall).

## Collision groups

| Group | Bit | Members | Collides with |
| --- | --- | --- | --- |
| ENV | 0x1 | walls, boxes, platforms, ramps, obstacles | ROBOT, ENV, GROUND |
| ROBOT | 0x2 | robot parts | ENV, GROUND |
| GROUND | 0x4 | default floor, ground objects | ROBOT, ENV |

Distance sensor rays belong to ROBOT and test ENV (plus GROUND when `ignoreGround` is off). The robot's own parts are never hit, and no collider needs to be excluded by handle.

## Edit Mode and Test Mode

Edit Mode (Environment workspace mode) never touches a live world: entering it stops the simulation. **Test Environment** saves the draft and starts Physics, which builds a fresh world from the saved definition. Encoders, the IMU and the distance sensor then read that world exactly as in Phase 6.

## What user programs can reach

Nothing new. Programs read sensors through C3; the environment and the physics world are never exposed to the sandbox.
