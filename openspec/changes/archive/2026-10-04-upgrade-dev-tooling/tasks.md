## 1. Backend dev tooling

- [x] 1.1 On `chore/upgrade-dev-tooling`, upgrade `jest` ^30.5.2, `@types/jest` ^30.0.0, `ts-jest` ^29.4.14, `ts-loader` ^9.6.2, `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` ^8.71.0 in `backend/`
- [x] 1.2 `npm run lint`, `tsc --noEmit` and `npm run build` clean; fix (do not mute) any new lint finding
- [x] 1.3 `npm test` and `npm run test:e2e` green against the local DB
- [x] 1.4 `npm audit` 0 and `npm audit --omit=dev` 0 in `backend/`

## 2. Frontend lockfile

- [x] 2.1 `npm audit fix --package-lock-only` in `frontend/` (non-major only); `npm run lint` and `npm run build` clean
- [x] 2.2 Confirm the remaining findings are only the Tailwind 3 and `@next/eslint-plugin-next` chains, and `npm audit --omit=dev` is 0

## 3. Verification

- [x] 3.1 Reset the DB and run `node scripts/run-tests.mjs` (11/11)
- [x] 3.2 `node scripts/validate-test-cases.mjs` from a reset DB (all cases approved)

## 4. Docs

- [x] 4.1 `docs/testing.md`: before/after audit table and the accepted frontend residual with the condition to revisit
- [x] 4.2 `docs/runbook-despliegue.md`: dependency note (production 0, dev residual) and republish the runbook page
- [x] 4.3 `CHANGELOG.md` Unreleased: "Changed" entry for the dev tooling upgrade
- [x] 4.4 Open the PR to `develop`; after merge, archive the change
