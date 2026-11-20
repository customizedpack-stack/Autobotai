# UI and UX changes

## Navigation (sidebar and mobile header share one list)

Dashboard (`/`) · Learn Robotics (`/learn`) · Project Library (`/library`, `/library/:slug`) · My Projects (`/projects`) · Robot Builder (`/builder`).

- The new pages are lazy-loaded routes inside the existing `AppShell`.
- `/new` (template-based creation) is unchanged. It is reached from the dashboard's "Create New Robot" and "Create a Robot", and from Robot Builder.
- The stale sidebar labels are removed: "Phase 4 · Code Studio", "Community — Phase 8", "AI Assistant — Phase J" and a locked "Learning Center". The sidebar now lists modules that do not exist yet without phase numbers, and has the experience mode selector.
- The status bar says "Phase 11"; the version is 0.11.0.

## Dashboard (built around the next action)

The sections, in order:

1. Welcome to AutoBotAI (the "Build. Code. Simulate. Innovate." heading is kept).
2. Experience mode choice (first visit only).
3. "What do you want to build?" (goes to Robot Builder).
4. Start Learning, Explore Projects and Create a Robot.
5. Continue Learning, beside a Learning Progress summary.
6. My Recent Projects (existing project cards and empty state).
7. Start from a template (existing template cards).

The old static "journey" strip with "AI Brain — Phase J" was removed.

## Experience modes

They are stored in `settingsStore` (`arai.settings.v1`): `experienceMode` and `experienceChosen`. "Reset settings" keeps the mode. Changing the mode never touches projects or the running simulation.

| Mode | Workspace |
|---|---|
| Professional (default) | Unchanged from Phase 10 |
| Beginner | Build, Control, Code and Simulate are shown. The "…" button reveals the Environment Editor and Blueprint, and an active mode is always shown. A one-line tip for the current mode with the next action (start or resume a tutorial). The E-STOP and all hardware safety controls are untouched. |
| Reverse Engineering | Projects open in read-only inspection |

## Workspace additions

- A tutorial button and an inspect (magnifier) button in the top bar.
- A learning side panel beside the viewport. On compact screens it overlays the viewport.
- A purple highlight and camera focus for the inspected part.

## Accessibility

- New pages have one `h1` each, labeled form controls, `aria-hidden` decorative icons, `aria-current` on step lists and `role="radiogroup"` for the mode choice.
- Keyboard navigation uses the existing global `:focus-visible` outline. The browser suite checks these.
- **Contrast fix:** the `faint` text token changed from `#64748b` (3.55:1 on panels, below WCAG AA) to `#808ea4` (5.09:1 on panels, 4.75:1 on panel-2, 5.59:1 on the app background). This is the only global visual change.

## Responsive

The new pages are checked at 1440, 1024, 768, 600 and 375 px with no horizontal overflow. The workspace with the tutorial panel is checked at 1024, 768 and 375 px; the panel stays within the screen width. Screenshots are in `docs/testing/phase-11/`.

## Bundle note

The new pages and the project factory load on demand.

The startup JavaScript is 0.91 MB, in one entry chunk. On Phase 10 it was 1.06 MB, split over two chunks (385 KB + 679 KB).
