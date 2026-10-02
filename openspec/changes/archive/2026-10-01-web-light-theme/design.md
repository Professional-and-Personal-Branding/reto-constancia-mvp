## Context

See proposal.md for the motivation. Today the palette is fixed in two places:
`frontend/tailwind.config.ts` defines the semantic tokens (`bg`, `bg-card`, `bg-elev`,
`line`, `ink`, `ink-dim`, `ink-mute`, `accent`, `ok`, `warn`, `bad`) as hex values, and
`frontend/app/globals.css` pins `color-scheme: dark` and the body colors. Components use
only those tokens, including opacity modifiers such as `bg-warn/15` and `border-bad/30`;
the only literal colors are `text-black` on the orange logo and primary button, and a
`bg-black/70` overlay on photo previews, which read correctly in both themes. The app is
a Next.js 15 App Router client-rendered dashboard; preferences already live in
`localStorage` (`reto.tokens`, `reto.selectedChallengeId`).

## Goals / Non-Goals

**Goals:**
- One set of semantic tokens, two palettes, switched by an attribute on `<html>`.
- No flash of the wrong theme on load, including hard reloads of private pages.
- Testable theme logic and palette contrast without a browser.

**Non-Goals:**
- Per-user theme stored on the server (the choice is per browser).
- A third "system" option in the switch (see Decisions).
- Redesigning layouts, typography or the accent color identity.

## Decisions

### Tokens become CSS variables with RGB channels
`tailwind.config.ts` maps each token to `rgb(var(--c-<token>) / <alpha-value>)`, and
`globals.css` defines the channels for `:root` (dark, today's values) and for
`:root[data-theme="light"]`. Channels instead of hex keep Tailwind's opacity modifiers
(`bg-ok/15`) working unchanged, so no component class has to change.
*Alternative:* Tailwind's `dark:` variant on every class. Rejected: it touches every
component and doubles the class lists for no behavioral gain.

### Resolved theme lives in `data-theme` on `<html>`
A small module `lib/theme.ts` holds the pure logic: `resolveTheme(stored, systemPrefersLight)`
returns `'light' | 'dark'` (stored choice wins; otherwise the system; no preference means
dark), plus read/write helpers for the `reto.theme` key. `color-scheme` is set alongside
the attribute so native controls follow the theme.

### Inline script before hydration prevents flashes
The root layout renders a tiny inline script in `<head>` that reads `reto.theme` and
`matchMedia('(prefers-color-scheme: light)')` and sets `data-theme` before the first
paint. `<html>` gets `suppressHydrationWarning` because the attribute is set outside React.
*Alternative:* a `next-themes` dependency. Rejected: one inline script and a hook cover
the need without a new dependency.

### Binary switch, stored choice overrides the system
The header switch flips between light and dark and stores the result. Until the person
uses it, the app follows the system and listens to `matchMedia` changes. A binary switch
is what was asked for and is the simplest control to understand; returning to "follow the
system" requires clearing site data, which is acceptable for this audience.
*Alternative:* a three-way control (System / Light / Dark). Deferred: more UI for a case
nobody has asked for.

### Light palette
Neutral, slightly warm grounds that keep the sports identity: background `#f6f5f2`, cards
`#ffffff`, raised `#efede8`, lines `#dedbd4`, ink `#151515`, dim `#4f4f4f`, mute `#6b6b6b`.
Status colors are darkened for white grounds (`ok #3f6212`, `warn #8a5a00`,
`bad #c81e1e`) and the accent becomes `#d9480f` so orange text stays readable; primary
buttons keep black text on the accent. Contrast targets come from the spec and are
checked by a unit test over the palette definition.

### Guide screenshots
The capture suite sets the light theme through `localStorage` before each page loads, so
captures show the real light theme. The guide frames each capture as a browser window
(title bar with the route) with a border that contrasts with both guide themes.

## Risks / Trade-offs

- [A component relies on a dark-only assumption, e.g. white text on `bg-elev`] →
  Playwright journeys run in both themes for the main screens and the captures are
  reviewed in light before publishing.
- [The inline script runs before React and could diverge from the hook's logic] → both
  call the same resolution rules; a Playwright test asserts the attribute at
  `DOMContentLoaded` matches the stored choice.
- [Photos and user images look different on light grounds] → no change needed; they keep
  their own colors and the preview overlay stays dark on purpose.

## Migration Plan

Frontend-only and backward compatible: with no stored choice and a dark or unknown system
preference the app looks exactly as today. Rollback is reverting the change; the stored
`reto.theme` key is then ignored.
