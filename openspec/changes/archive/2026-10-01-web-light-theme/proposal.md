## Why

The web app only has a dark theme. Participants who use it outdoors or in bright places
asked for a light option. Screenshots of the dark app also blend into the interactive
guide when the guide is shown in its dark theme, so readers mistake captures for the
guide itself. A light theme with a visible switch solves both, and following the
operating system by default respects what each person already chose on their device.

## What Changes

- Add a light theme to every screen of the web app (sign-in, registration and the whole
  dashboard), with the same content, states and status colors as the dark theme.
- Follow the operating system theme by default, including live changes while the user
  has not chosen one.
- Add a theme switch in the header of the public and private layouts. The choice is
  remembered per browser and applied before the first paint, so pages never flash the
  wrong theme.
- Keep text and status colors at WCAG AA contrast in both themes, and make native
  controls (date pickers, selects, scrollbars) follow the active theme.
- Re-capture the interactive guide screenshots in the light theme and frame each one as
  a browser window, so captures stand apart from the guide in either guide theme. This
  is documentation work tracked in tasks; it adds no product requirement.

## Capabilities

### New Capabilities
- `web-theme`: light and dark themes for the web app, the default that follows the
  operating system, the theme switch, preference persistence and contrast guarantees.

### Modified Capabilities
<!-- None: no existing capability changes its requirements. -->

## Impact

- **Frontend only.** Color tokens move from fixed values to theme variables in
  `frontend/tailwind.config.ts` and `frontend/app/globals.css`. A theme switch component
  goes into `app/(auth)/layout.tsx` and `app/dashboard/layout.tsx`. An inline script in
  the root layout applies the stored theme before hydration.
- **No API, database or backend changes.** No new dependencies.
- **Tests:** unit tests for theme resolution and palette contrast (`npm test` in
  `frontend/`), Playwright journeys for the default, the switch and persistence, and new
  cases in the QA catalog (`docs/qa/catalog.mjs`).
- **Docs:** guide screenshots regenerated in the light theme and shown in a browser-window
  frame; new guide step for the switch; `e2e-playwright.md` notes the capture theme.
