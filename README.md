# Auto Robots with AI

A browser-based platform where anyone can design a robot in 3D, program it and test it in a realistic simulation.

**Current status: Phase 2 — Modular Robot Builder** (on top of the Phase 1 foundation). You can build robots from parts in 3D, move them with gizmos, attach parts to each other, and define joints. Physics, coding and AI come in later phases (see `docs/`).

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
| `npm run test:e2e` | All browser test suites: Phase 1 journey, Phase 1 corrections, Phase 2 builder (needs `npm run build` first and Chrome installed) |
| `npm run check` | Typecheck + lint + unit tests + build in one go |

## Technology

React 19 · TypeScript (strict) · Vite · Three.js · React Three Fiber · drei · Zustand · Tailwind CSS 4 · Lucide icons · Vitest · Playwright.

## Project layout

```
src/
  app/            App entry, router, pages (routes/) and providers
  components/     Reusable UI: common/, layout/, dashboard/, workspace/
  features/       Product modules (each is a clear boundary)
    robot-model/        Robot model: hierarchy, transforms, joints, validation, schema v2, C1 connector
    builder/            Drop placement rules for the Robot Builder
    viewport/           Three.js scene, camera views, gizmos, joint markers, drag-and-drop
    inspector/          Properties panel
    component-library/  Component catalog and panel
    robot-library/      Robot categories and templates
    projects/           Project creation and editor commands
    console/            Console, bus events and status views
    controls/ code-studio/ simulation/ sensors/ robot-formats/
                        Reserved boundaries for later phases (README inside each)
  core/bus/       Connector Bus: typed message system between modules
  stores/         Zustand stores (project, scene + history, selection, workspace, viewport, console, settings)
  types/          Shared TypeScript model (robot project, scene objects, console, viewport)
  hooks/ utils/   Shortcuts and helpers
docs/             Phase reports, architecture notes (C1 connector, schema v2) and test screenshots
tests/e2e/        Browser journey test
```

## Where your work is saved

Projects are saved as **drafts in your browser** (localStorage). Phase 1 drafts are upgraded to the Phase 2 format automatically when you open the app. They stay on that computer and browser only. Cloud accounts and saving arrive in Phase 8.
