# Auto Robots with AI

A browser-based platform where anyone can design a robot in 3D, program it and test it in a realistic simulation.

**Current status: Phase 4 — Code Studio** (on top of Phases 1–3). You can build robots from parts in 3D, attach parts, define joints, add motors, drive the robot with the keyboard or on-screen buttons, and now **program it** with Blockly blocks or JavaScript. Programs run in a secure sandbox and control the robot through the same validated commands as the keyboard. The simulation is kinematic for now; physics arrives in Phase 5 (see `docs/`).

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
| `npm run test:e2e` | All browser test suites: Phase 1 journey, Phase 1 corrections, Phase 2 builder, Phase 3 control, Phase 4 Code Studio (needs `npm run build` first and Chrome installed) |
| `npm run check` | Typecheck + lint + unit tests + build in one go |

## Technology

React 19 · TypeScript (strict) · Vite · Three.js · React Three Fiber · drei · Zustand · Tailwind CSS 4 · Lucide icons · Blockly · CodeMirror 6 · Vitest · Playwright.

## Project layout

```
src/
  app/            App entry, router, pages (routes/) and providers
  components/     Reusable UI: common/, layout/, dashboard/, workspace/
  features/       Product modules (each is a clear boundary)
    robot-model/        Robot model: hierarchy, transforms, joints, actuators, drive geometry, kinematics, schema v3, C1 connector
    controls/           C2 Command Bus, movement engine, differential drive, keyboard, Robot Control API
    code-studio/        Blockly and JavaScript programming, sandboxed execution, program storage
    builder/            Drop placement rules for the Robot Builder
    viewport/           Three.js scene, camera views, gizmos, joint markers, drag-and-drop
    inspector/          Properties panel
    component-library/  Component catalog and panel
    robot-library/      Robot categories and templates
    projects/           Project creation and editor commands
    console/            Console, bus events and status views
    simulation/ sensors/ robot-formats/
                        Reserved boundaries for later phases (README inside each)
  core/bus/       Connector Bus: typed message system between modules
  stores/         Zustand stores (project, scene + history, robot runtime state, selection, workspace, viewport, console, settings)
  types/          Shared TypeScript model (robot project, scene objects, console, viewport)
  hooks/ utils/   Shortcuts and helpers
docs/             Phase reports, architecture notes (C1 and C2 connectors, schemas v2 and v3, Code Studio and its sandbox) and test screenshots
tests/e2e/        Browser test suites (one per phase)
```

## Where your work is saved

Projects are saved as **drafts in your browser** (localStorage). Older drafts (Phase 1 and Phase 2) are upgraded to the current format (schema v3) automatically when you open the app. The driven position of a robot is never saved unless you click **Apply pose**. Code Studio programs are saved per robot project in the same browser (key `arai.programs.v1`). They stay on that computer and browser only. Cloud accounts and saving arrive in Phase 8.
