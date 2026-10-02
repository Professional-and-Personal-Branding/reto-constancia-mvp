## 1. Theme logic

- [x] 1.1 Add `frontend/lib/theme.ts` with `resolveTheme`, the `reto.theme` storage helpers and the pre-hydration script (the palettes live only in `app/globals.css`, which the contrast test reads, so they cannot drift); verify with `lib/theme.test.ts` (stored choice wins, system light, no preference means dark) via `npm test` in `frontend/`
- [x] 1.2 Add a contrast test over both palettes (body text 4.5:1, secondary text and status colors 3:1 on the backgrounds they are used on); verify it passes in `npm test`

## 2. Tokens and themes

- [x] 2.1 Move the Tailwind color tokens to `rgb(var(--c-*) / <alpha-value>)` and define the dark channels on `:root` in `globals.css`; verify `npm run build` passes and the dark screens look unchanged in the existing Playwright journeys
- [x] 2.2 Define the light channels and `color-scheme: light` under `:root[data-theme="light"]`; verify the dashboard, upload form and ranking render light with `data-theme="light"` set

## 3. Default, switch and persistence

- [x] 3.1 Add the inline pre-hydration script in `app/layout.tsx` (with `suppressHydrationWarning` on `<html>`); verify a Playwright test reads the expected `data-theme` at `DOMContentLoaded` for stored light, stored dark and no choice
- [x] 3.2 Add a `useTheme` hook that follows `prefers-color-scheme` live while nothing is stored; verify a Playwright test switches the emulated color scheme and sees the theme change without reload
- [x] 3.3 Add the `ThemeSwitch` component (role `switch`, Spanish accessible name naming the action, keyboard operable) to the auth and dashboard headers; verify a Playwright test toggles it with the mouse and with the keyboard, and the choice survives a reload

## 4. QA and documentation

- [x] 4.1 Add the theme cases to `docs/qa/catalog.mjs` linked to the new tests; verify `node scripts/validate-test-cases.mjs` reports them approved with no orphan tests
- [x] 4.2 Make the guide capture suite use the light theme and regenerate `docs/guia-capturas/`; verify the 21 captures are light and the capture suite passes
- [x] 4.3 Frame captures in the guide as browser windows with the route in the title bar, add a guide step for the theme switch, rebuild the standalone guide and republish it; verify at 1280 px and 390 px in both guide themes
- [x] 4.4 Update `docs/e2e-playwright.md`, `docs/testing.md` and `CHANGELOG.md`; run `node scripts/run-tests.mjs` and verify 10 of 10 steps pass
