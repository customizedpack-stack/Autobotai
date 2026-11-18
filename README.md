# Auto Robots with AI

A browser-based platform where anyone can design a robot in 3D, program it and test it in a realistic simulation.

**Current status: Phase 1 — Foundation and UI Architecture.** This version has the dashboard, the create-robot flow and the professional 3D workspace. Physics, coding and AI come in later phases (see `docs/`).

---

## Run it on your computer (step by step)

You only need to do steps 1 and 2 once.

1. **Install Node.js.** Go to <https://nodejs.org>, download the **LTS** version, and install it with the default options. (Version 20 or newer works.)
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
| `npm run test:e2e` | Full browser journey test (needs `npm run build` first and Chrome installed) |
| `npm run check` | Typecheck + lint + unit tests + build in one go |

## Technology

React 19 · TypeScript (strict) · Vite · Three.js · React Three Fiber · drei · Zustand · Tailwind CSS 4 · Lucide icons · Vitest · Playwright.

## Project layout

```
src/
  app/            App entry, router, pages (routes/) and providers
  components/     Reusable UI: common/, layout/, dashboard/, workspace/
  features/       Product modules (each is a clear boundary)
    viewport/           Three.js scene, camera views, selection rendering
    inspector/          Properties panel
    component-library/  Component catalog and panel
    robot-library/      Robot categories and templates
    projects/           Project creation and editor commands
    console/            Console, bus events and status views
    builder/ controls/ code-studio/ simulation/ sensors/ robot-formats/
                        Reserved boundaries for later phases (README inside each)
  core/bus/       Connector Bus: typed message system between modules
  stores/         Zustand stores (project, scene + history, selection, workspace, viewport, console, settings)
  types/          Shared TypeScript model (robot project, scene objects, console, viewport)
  hooks/ utils/   Shortcuts and helpers
docs/             Architecture notes, Phase 1 report and test screenshots
tests/e2e/        Browser journey test
```

## Where your work is saved

Phase 1 saves projects as **drafts in your browser** (localStorage). They stay on that computer and browser only. Cloud accounts and saving arrive in Phase 8.
