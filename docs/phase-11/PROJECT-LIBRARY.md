# Project Library

Code: `src/features/learning/catalog/projects.ts` (definitions), `engine/projectFactory.ts` (safe creation), `engine/library.ts` (filters), `engine/budget.ts` (verified prices), `pages/LibraryPage.tsx`, `pages/ProjectDetailPage.tsx`.

## Definition model

`ProjectDefinition` (version 1) has: id, version, name, slug, purpose, summary, description, realWorldUse, howItWorks, difficulty, category, templateId, learningObjectives, requiredComponents (existing component-catalog ids), requiredSensors (existing sensor types), requiredActuators, requiredController, simulationCapabilities, physicalRequirements, parts (existing Phase 9 catalog part ids), tutorialId, expectedResult, successCriteria, setup, keywords and environments.

The catalog is separate from saved projects. It reuses component and part ids; no catalog record is duplicated.

## The six projects

| Project | Difficulty | Template | Simulation | Physical |
|---|---|---|---|---|
| Obstacle Avoidance Robot | Beginner | Explorer Bot | Drive: Supported. Distance sensing: Supported (Physics engine) | Build guide; Hardware Deployment Available (Explorer Bot reference profile, tested with the simulated device only); Requires Configuration (battery, switch, pin map) |
| Line Following Robot | Beginner | Explorer Bot | Drive: Supported. **Line detection: Not Yet Supported** (no line sensor) | Line sensor hardware: Not Yet Supported; drive base build guide only |
| Pick & Place Robot Arm | Intermediate | Robotic Arm | Joint motion: Requires Configuration (the template has no actuators). **Grasping: Not Yet Supported** | Not Yet Supported (no arm parts in the verified catalog; Phase 10 deploys to the Explorer Bot only) |
| Delivery Robot | Intermediate | Explorer Bot | Drive, distance: Supported. Encoders and odometry: Simulation Only. **Route planning and maps: Not Yet Supported** | Build guide; encoder programs on hardware: Not Yet Supported (no encoders on the reference hardware) |
| Agriculture Monitoring Robot | Intermediate | Explorer Bot + camera | Camera: Simulation Only. **Soil sensing and plant recognition: Not Yet Supported** | Build guide; camera on hardware: Not Yet Supported |
| Security Patrol Robot | Advanced | Explorer Bot + camera | Drive, distance: Supported. Camera: Simulation Only. **Recognition: Not Yet Supported** | Build guide; camera on hardware: Not Yet Supported |

How each status was verified:

- Distance sensing needs the Physics engine (`robotSensors.distance` documentation and the sensors suite).
- Cameras return image data, brightness and mean color only (`robotCamera.capture`). There is no recognition code.
- There is no `line` sensor type (`SensorType = 'distance' | 'encoder' | 'imu' | 'camera'`).
- The gripper component says "a later phase (arms)" in the component catalog. There is no grasp code.
- The Robotic Arm template creates joints but no actuators (`projectStore.createProject` only auto-configures the Explorer Bot).
- Phase 10 deployment exists only for the reference profile. Its program check refuses encoders, IMU, odometry and cameras.

## Starter programs

Each definition has a starter JavaScript program that uses only documented API functions. A unit test checks the names against `API_REFERENCE` and checks the syntax.

Two programs are run end to end by the integration tests through the real Code Studio runtime: Pick & Place and Delivery. The Obstacle Avoidance program is run in the browser suite with the Physics engine.

## Actions on the detail page

| Action | What it does |
|---|---|
| Start Guided Tutorial | Dialog: resume an existing tutorial, start with a **new** project from the template, or use an existing project of the same template. Nothing is overwritten. |
| Explore Project | Opens a finished example robot (template + setup + starter program, created once and reused) in read-only Reverse Engineering inspection. |
| Open Robot | Creates a **new** ready-to-run project. If one exists, the dialog offers to open it or create another one. |
| Explore Components | Shows the template's parts, what each does and what it is attached to. |

The budget shows only verified Phase 9 list prices and names the parts that have none. Obstacle Avoidance: US$63.25 for 4 of 7 parts. Shipping, tax, battery, switch and wires are not included.
