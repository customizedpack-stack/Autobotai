# Phase 11 audit — the Phase 10 interface

Inspected on the `phase-10-hardware` baseline (version 0.10.0) before any Phase 11 change.

Files reviewed: `src/app/App.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/AppSidebar.tsx`, `src/app/routes/DashboardPage.tsx`, `ProjectsPage.tsx`, `NewRobotPage.tsx`, `WorkspacePage.tsx`, `src/components/workspace/*` (top bar, panels, status bar), `src/components/common/*`, `src/components/dashboard/*`, `src/features/robot-library/templates.ts`, `src/stores/*`, the Code Studio, Blueprint, hardware, sensor, camera and environment features, and the 13 end-to-end suites.

## Findings

| # | Area | What was found | Effect | Phase 11 action |
|---|---|---|---|---|
| 1 | Sidebar | Footer still says "Phase 4 · Code Studio" | Stale, contradicts the status bar ("Phase 10") | Replaced with a short current-status note |
| 2 | Sidebar | "Coming in later phases" lists "Community — Phase 8" and "AI Assistant — Phase J". Phase 8 shipped cameras, not community; "Phase J" is not a phase name used anywhere else | Misleading roadmap | Removed the stale phase labels; the list is now titled "Not available yet" and shows no phase numbers |
| 3 | Sidebar | "Learning Center" shown as locked | Phase 11 builds it | Became **Learn Robotics** |
| 4 | Navigation | Mobile header has only Dashboard / Projects / New Robot, with different labels than the sidebar ("Projects" vs "My Projects") | Inconsistent labels | One shared navigation list for both |
| 5 | Navigation | "New Robot" is both a sidebar item and the dashboard's main button; there is no way to start from a goal | Users must already know which template they want | **Robot Builder** (goal first, rule-based) with a link to the existing template page |
| 6 | Dashboard | Hero "Build. Code. Simulate. Innovate." then a 4-card "journey" strip that is static and includes "AI Brain — Phase J" | No next action; stale roadmap | Dashboard rebuilt around the next action (start learning, explore projects, create a robot, continue learning, recent projects, progress). The heading is kept so existing links and tests stay valid |
| 7 | Dashboard | Recent projects and templates both shown as cards with similar weight | Hard to tell saved work from samples | Recent projects first; templates kept at the bottom as "Start from a template" (existing template links and tests stay valid) |
| 8 | Workspace | Six mode buttons are always visible; Blueprint opens eight tabs plus Hardware | Heavy for a first-time user | Beginner Mode shows the four core modes and a "More tools" switch; Professional Mode is unchanged |
| 9 | Workspace | No contextual help that says what to do next | Users stall after creating a robot | Beginner guide strip and the tutorial panel |
| 10 | Workspace | On screens under 768 px the mode labels collapse to icons only | Acceptable; already has a dismissible small-screen banner | Kept |
| 11 | Templates | Explorer Bot template joint descriptions still say "Continuous drive arrives with motor control in Phase 3" | Stale text inside new projects | Reported only. Changing the template text would change what new projects store; left as is to avoid altering saved structures (listed in KNOWN-LIMITATIONS) |
| 12 | New Robot page | Category cards show "Starter template coming in a later phase" for industrial and quadruped | Honest | Kept |
| 13 | Accessibility | Global `:focus-visible` outline exists; icon buttons have `aria-label`; headings are mostly semantic | Good base | New pages follow the same rules; checked in the e2e suite |
| 13b | Accessibility | The `faint` text token `#64748b` has 3.55:1 contrast on panels (below WCAG AA 4.5:1) and is used for secondary text everywhere | Hard to read | Token raised to `#808ea4` (5.09:1 on panels) |
| 14 | Accessibility | Project cards hide the delete button until hover (`focus:opacity-100` covers keyboard) | OK | Kept |
| 15 | Safety | The E-STOP button lives in the workspace top bar and shows whenever a device is connected | Must never be hidden by a simplified mode | Beginner Mode does not touch it |
| 16 | Data | Projects (`arai.projects.v1`), programs (`arai.programs.v1`), environments (`arai.environments.v1`), settings (`arai.settings.v1`) and workspace layout are separate persisted stores | A clean place to add learning data without touching projects | New `arai.learning.v1` store; the project schema is unchanged (no migration needed) |

## Existing capabilities verified for the project library

| Capability | Status in code | Evidence |
|---|---|---|
| Differential drive (Explorer Bot) | Works in kinematic and physics engines | `autoConfigureDrive`, `diagnoseDrive`, drive e2e suites |
| Distance sensor | Physics engine only, ray cast | `robotSensors.distance`, sensors suite |
| Wheel encoders, IMU, odometry | Simulation only (the reference hardware has no encoders) | `robotSensors.encoder/imu/odometry`; Phase 10 program check refuses them on the physical target |
| Camera | Simulation only; image, brightness and mean color; **no object recognition** | `robotCamera`, camera suite |
| Arm joints | Position actuators move joints (`robotControl.joint`); the Robotic Arm template has **no actuators** until the user adds them; **no grasping physics** | actuator code, builder suite |
| Line sensing | **No line sensor** exists in simulation or hardware | sensor types are distance, encoder, IMU, camera |
| Environments | Templates `floor`, `arena`, `obstacles`, `ramp-test` plus user environments | environment suite |
| Physical hardware | Only the Explorer Bot reference profile; tested with the **simulated device only**; ESP32 compile blocked | Phase 10 report |
| Verified prices | Pololu 1101, 1429, 713, 989 have list prices; ESP32-DevKitC and Pololu 2490 have none | Phase 9 catalog |

## Conflicts noted before changing anything

- **Reverse Engineering vs. Builder selection.** The viewport's click handler writes to the shared `selectionStore`, which drives the gizmo and the inspector. Inspection must not edit, so it gets its own `inspectedId` state and the viewport routes clicks there only while inspection is active.
- **"Robot Builder" vs. "New Robot".** The brief names a "Robot Builder" navigation item; the existing `/new` page already creates robots from templates. To avoid a duplicate page, Robot Builder is the goal-first Purpose Builder (`/builder`) and it links to `/new` for choosing a template directly.
- **Experience mode default.** All existing e2e suites expect the full workspace. Professional Mode is the default, so existing users and tests are unaffected; the dashboard asks new users to choose.
