# Auto Robots with AI

A browser-based platform where anyone can design a robot in 3D, program it and test it in a realistic simulation.

**Current status: Phase 7 — Environment Editor** (on top of Phases 1–6). You can build robots from parts in 3D, attach parts, define joints, add motors, drive the robot, program it with Blockly blocks or JavaScript, run it in a real physics simulation (Rapier), give it **sensors** (a distance sensor that casts real rays, wheel encoders and an IMU), and now **build your own test environments** with ground planes, walls, boxes, platforms, ramps and obstacles (see `docs/`).

## Environment Editor

1. Open a robot and click **Environment** in the top bar.
2. Start from **Empty Environment** or a template (Basic Test Arena, Obstacle Course, Ramp Test). Editing a template makes your own copy.
3. Add objects from the **Library** tab. Select one to move or rotate it with the gizmo, or type exact values in the inspector (size, position, rotation, static or dynamic, mass, friction, bounciness, collision). Ctrl+Z undoes, Ctrl+D duplicates, Delete removes.
4. Click **Save**, then **Test Environment**. The robot starts in the Physics engine inside your environment: walls stop it, ramps tilt it, and the distance sensor sees your objects. **Edit this environment** brings you back.
5. Your environments are kept in this browser and can be reused by any robot.

Details: `docs/architecture/PHASE-7-ENVIRONMENT-EDITOR.md` and `docs/architecture/ENVIRONMENT-PHYSICS-INTEGRATION.md`.

## Sensors

1. A new **Explorer Bot** comes with four sensors: `front-distance`, `left-encoder`, `right-encoder` and `main-imu`. In Build Mode, the inspector's **Sensors** section lists them; click one to change its settings (range, rays, rate, ticks per revolution, mount position). Older robots get them with **Add default sensors**.
2. Open **Control** or **Simulate** and the **Sensors** tab at the bottom to watch live readings. The distance sensor needs the **Physics** engine; encoders and the IMU work in both engines.
3. In **Code**, read sensors with `robotSensors`, for example `await robotSensors.distance("front-distance").read()`, or use the Blockly **Sensors** blocks.

Details: `docs/architecture/SENSOR-SIMULATION.md` and `docs/architecture/C3-SENSOR-STREAM.md`.

## Physics simulation

1. Open a robot and click **Simulate** in the top bar (or **Control**, then choose **Physics** in the Simulation panel on the right).
2. The banner at the bottom of the 3D view shows which engine moves the robot: "Kinematic Simulation — No Physics" or "Physics Simulation — Running".
3. Use **Start**, **Pause**, **Resume**, **Stop** and **Reset**. Switch **Gravity** off and on, pick an **Environment** (a template or one you built), and turn on **Debug view** to see collision shapes, joints, velocities and contacts.
4. Drive with the keys, or run a Code Studio program. Pausing the simulation pauses the program.
5. In Build Mode, the **Physics** section of the inspector sets mass, friction, bounciness and collision for each part (undoable, saved with the project). Empty values use sensible defaults.

The physics engine is downloaded only the first time you choose Physics. Details: `docs/architecture/PHASE-5-PHYSICS-ENGINE.md` and `docs/architecture/PHYSICS-ROBOT-INTEGRATION.md`.

## Programming a robot (Code Studio)

1. Open a robot (for example an **Explorer Bot**) and click **Code** in the top bar.
2. Choose **Blockly** (blocks) or **JavaScript** (code editor) in the Code Studio toolbar.
3. Click **Run**. **Pause** / **Resume** hold and continue the program, **Stop** ends it and stops the robot at once, **Reset Robot** returns the robot to its design pose.
4. Output, commands and errors appear in the **Program** tab at the bottom. **Save** (Ctrl+S) keeps the program with this robot project.

Programs run in an isolated sandbox: they cannot reach the network, your browser storage or the page, and every robot command is checked exactly like keyboard commands. Details: `docs/architecture/CODE-STUDIO.md` and `docs/architecture/CODE-EXECUTION-SANDBOX.md`.

## Driving a robot

1. Create an **Explorer Bot** (its motors and drive are set up for you).
2. Click **Control** in the top bar, or press **M**.
3. Click the 3D view, then use the keys below. Press **M** again to go back to Build Mode and edit.

| Key | Control Mode | Build Mode |
| --- | --- | --- |
| W / ↑ | forward (hold) | Move tool |
| S / ↓ | backward (hold) | — |
| A / ← · D / → | turn left / right (hold) | — |
| Space | stop | — |
| R | reset to the design pose | Scale tool |
| M | back to Build Mode | to Control Mode |

The **Robot Control** panel on the right has hold-to-drive buttons, Stop, Reset, **Apply pose** (save the driven position into the design), a speed slider with presets, live telemetry, motor status and a joint preview. Keys never drive the robot while you are typing in a field.

---

## Run it on your computer (step by step)

You only need to do steps 1 and 2 once.

1. **Install Node.js.** Go to <https://nodejs.org>, download the **LTS** version, and install it with the default options.
   - Supported versions: **22.22.2 or newer on the 22 line, 24.15 or newer on the 24 line, or 26 and up.** These limits come from the test tools (Vitest and jsdom); Vite itself also accepts 20.19+, but `npm install` would warn and the tests would not run.
   - Verified so far on **Node 22.23.5**. Other versions in the supported range are expected to work but have not been tested yet.
   - To check your version, run `node -v` in a terminal.
2. **Get the code.** On the GitHub page of this repository, click the green **Code** button, then **Download ZIP**. Unzip it into a folder you can find, such as `Documents/autobotai`.
3. **Open a terminal in that folder.**
   - Windows: open the folder in File Explorer, click the address bar, type `cmd` and press Enter.
   - Mac: right-click the folder in Finder and choose **New Terminal at Folder**.
4. **Install the project's packages** (takes a minute the first time):
   ```
   npm install
   ```
5. **Start the app:**
   ```
   npm run dev
   ```
6. Open the address it prints (usually <http://localhost:5173>) in Chrome, Edge or Firefox.

To stop the app, click the terminal and press `Ctrl + C`.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app for development with live reload |
| `npm run build` | Type-check and build the production version into `dist/` |
| `npm run build:demo` | Build a version that can be hosted from any folder (`dist-demo/`) |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | Lint the code (oxlint) |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | All browser test suites: Phase 1 journey, Phase 1 corrections, Phase 2 builder, Phase 3 control, Phase 4 Code Studio, Phase 5 physics, Phase 6 sensors, Phase 7 environment editor and the Phase 7 final verification (needs `npm run build` first and Chrome installed) |
| `npm run check` | Typecheck + lint + unit tests + build in one go |

## Technology

React 19 · TypeScript (strict) · Vite · Three.js · React Three Fiber · drei · Zustand · Tailwind CSS 4 · Lucide icons · Blockly · CodeMirror 6 · Rapier 3D (physics) · Vitest · Playwright.

## Project layout

```
src/
  app/            App entry, router, pages (routes/) and providers
  components/     Reusable UI: common/, layout/, dashboard/, workspace/
  features/       Product modules (each is a clear boundary)
    robot-model/        Robot model: hierarchy, transforms, joints, actuators, drive geometry, kinematics, schema v3, C1 connector
    controls/           C2 Command Bus, movement engine, differential drive, keyboard, Robot Control API
    code-studio/        Blockly and JavaScript programming, sandboxed execution, program storage
    physics/            Rapier physics: world, bodies, joints, motors, simulation manager, debug view
    sensors/            Sensor simulation: distance rays, wheel encoders, IMU, C3 Sensor Stream, sensor API and UI
    builder/            Drop placement rules for the Robot Builder
    viewport/           Three.js scene, camera views, gizmos, joint markers, drag-and-drop
    inspector/          Properties panel
    component-library/  Component catalog and panel
    robot-library/      Robot categories and templates
    projects/           Project creation and editor commands
    console/            Console, bus events and status views
    robot-formats/
                        Reserved boundaries for later phases (README inside each)
  core/bus/       Connector Bus: typed message system between modules
  stores/         Zustand stores (project, scene + history, robot runtime state, selection, workspace, viewport, console, settings)
  types/          Shared TypeScript model (robot project, scene objects, console, viewport)
  hooks/ utils/   Shortcuts and helpers
docs/             Phase reports, architecture notes (C1 and C2 connectors, schemas v2 and v3, Code Studio and its sandbox, physics engine and integration, sensors and the C3 Sensor Stream, the Environment Editor and its physics integration) and test screenshots
tests/e2e/        Browser test suites (one per phase)
```

## Where your work is saved

Projects are saved as **drafts in your browser** (localStorage). Older drafts (Phase 1 and Phase 2) are upgraded to the current format (schema v3) automatically when you open the app. The driven position of a robot is never saved unless you click **Apply pose**. Code Studio programs are saved per robot project in the same browser (key `arai.programs.v1`). Environments are saved separately (key `arai.environments.v1`); a project only remembers which environment it uses. They stay on that computer and browser only. Cloud accounts and saving arrive in Phase 8.
