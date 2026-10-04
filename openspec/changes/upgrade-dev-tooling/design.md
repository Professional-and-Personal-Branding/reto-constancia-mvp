## Context

`npm audit` (2026-10-03) reports the `braces` advisory through dev tooling only. Spike done in a
detached worktree of `develop` (nothing committed):

| Project | Before | Action in spike | After |
|---|---|---|---|
| backend | 37 high | Jest 30.5, @types/jest 30, ts-jest 29.4.14, typescript-eslint 8.71, ts-loader 9.6.2 | **0** |
| frontend | 8 high | `npm audit fix --package-lock-only` | 7 (Tailwind 3 chain + Next ESLint plugin chain) |
| frontend | 8 high | + Tailwind 4 | 5 (Next ESLint plugin chain only) |
| e2e | 0 | none | 0 |

Backend spike checks: 139/139 unit tests (13 suites), `eslint` exit 0 with the typescript-eslint 8
`recommended` set, `tsc --noEmit` clean, `nest build` clean, `npm audit --omit=dev` still 0.

`@next/eslint-plugin-next` pins `fast-glob@3.3.1` even in its latest release (16.3.8), and every
`fast-glob` release depends on `micromatch` -> `braces`. The "fix" npm suggests is a downgrade to
`eslint-config-next@14`, which does not match Next 15 and is rejected.

## Goals / Non-Goals

**Goals:** backend dev audit at 0; frontend reduced to what has no upstream fix; residual
written down; zero behavior change.

**Non-Goals:** Tailwind 4, ESLint 9, Next 16, a CI gate on dev advisories (see proposal).

## Decisions

1. **Upgrade the backend test and lint tools in one PR.** They are independent of runtime code;
   one full battery run validates them together.
   *Alternative:* `overrides` forcing `braces`/`micromatch` - rejected, there is no patched
   version to force.
2. **Stay on ESLint 8 with typescript-eslint 8.** typescript-eslint 8 supports
   `eslint ^8.57.0 || ^9`, so the legacy `.eslintrc.js` keeps working; flat config is a separate,
   larger change.
3. **`ts-jest` stays on 29.4.x.** Its peer range covers Jest 30; there is no `ts-jest` 30.
4. **Frontend: accept the residual instead of Tailwind 4.** Tailwind 4 does not get the frontend
   to 0 and carries real visual risk for the themed UI; cost exceeds benefit today.
5. **CI unchanged.** Keeps `npm audit --omit=dev --audit-level=moderate`.

## Risks / Trade-offs

- Jest 30 behavior changes (stricter matchers, renamed `--testPathPattern` CLI flag,
  Node >= 18) -> no script uses the renamed flag; the full battery
  (`node scripts/run-tests.mjs`, `node scripts/validate-test-cases.mjs`) from a reset DB must
  stay green, including the API e2e suite the spike did not run (it needs the DB).
- typescript-eslint 8 changes `recommended` (e.g. `no-unused-expressions`,
  `no-empty-object-type`) -> spike lint was clean; any new finding is fixed in code, not muted.
- Residual frontend findings remain visible in `npm audit` -> documented with the condition to
  revisit (a `braces` patch, or `@next/eslint-plugin-next` dropping `fast-glob`).

## Migration Plan

Dev-only: after merge, developers run `npm ci` in `backend/` and `frontend/`. Nothing to deploy;
rollback is reverting the PR.

## Open Questions

None.
