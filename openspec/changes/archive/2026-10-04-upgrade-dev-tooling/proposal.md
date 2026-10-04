## Why

On 2026-10-03 GitHub published a high advisory for `braces` <= 3.0.3 (GHSA-vfj7-8cjw-p6xm,
stack-exhaustion denial of service through deeply nested patterns). No patched `braces` exists.
It reaches the repository only through development tools, via `micromatch` and `fast-glob`:

- **backend:** 37 high findings, all from Jest 29 (`jest-haste-map`, `@jest/transform`, ...),
  `@types/jest` 29, typescript-eslint 7 (`globby` -> `fast-glob`) and `ts-loader` 9.5.
- **frontend:** 8 high findings, from Tailwind CSS 3 (`chokidar`, `fast-glob`), from
  `@next/eslint-plugin-next` (pins `fast-glob` 3.3.1) and from an old `brace-expansion`.
- **e2e:** 0.

Production dependencies have 0 findings and CI (which audits `--omit=dev`) passes, so the server
and the web app are not exposed. A developer machine or CI runner is the only place the
vulnerable code runs, and only against the repository's own glob patterns. The value of this
change is a clean `npm audit` wherever an upstream fix exists today, so a real new advisory is
not lost in the noise, and keeping the test and lint tools on supported major versions.

A spike in a throwaway worktree confirmed the backend reaches 0 findings with no source change,
and that the frontend cannot reach 0 yet whatever we upgrade (see design).

## What Changes

- **backend (dev only):** Jest 29 -> 30, `@types/jest` 29 -> 30, `ts-jest` to the 29.4 line
  (supports Jest 30), typescript-eslint 7 -> 8 (still on ESLint 8, legacy `.eslintrc.js` kept),
  `ts-loader` 9.5 -> 9.6. Jest 30 and the new `ts-loader` use `picomatch` and `tinyglobby`
  instead of `micromatch`/`fast-glob`. Expected result: `npm audit` 0 in the backend.
- **frontend (dev only):** lockfile-only `npm audit fix` (non-major, `brace-expansion`).
  The remaining findings (`@next/eslint-plugin-next` -> `fast-glob` -> `micromatch` -> `braces`,
  and Tailwind 3) are documented as accepted residual risk, with the reason and the condition to
  revisit.
- **docs:** `docs/testing.md` records the before/after audit and the residual; the runbook's
  dependency note says production stays at 0 and dev tooling has a known residual.
- No application code, API, data or UI change. No release by itself: it rides the next release
  as a `chore`.

## Non-goals

- **Tailwind CSS 4.** It would remove the Tailwind path, but the frontend would still report the
  Next.js ESLint plugin chain, so the audit would not be clean. It is a CSS-first rewrite of the
  theme configuration (the light/dark token palette of the `web-theme` spec) with visual
  regression risk. Revisit together with a Next.js 16 upgrade or when Tailwind 3 stops being
  maintained.
- **ESLint 9 / flat config, Next.js 16.** Separate upgrades; not needed to clear findings.
- **Gating CI on dev advisories.** An advisory without an upstream fix would block every PR.
  CI keeps auditing production only.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
<!-- None: tooling only, no spec-level behavior change (skip_specs: true). -->

## Impact

- `backend/package.json`, `backend/package-lock.json`, `frontend/package-lock.json`.
- Possibly small test or lint adjustments if Jest 30 or typescript-eslint 8 flag something
  (the spike found none: 139/139 unit tests, lint, `tsc` and `nest build` clean).
- `docs/testing.md`, `docs/runbook-despliegue.md` (and its published page), `CHANGELOG.md`
  (Unreleased).
