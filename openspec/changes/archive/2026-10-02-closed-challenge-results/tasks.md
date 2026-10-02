## 1. Closed challenges in the ranking

- [x] 1.1 Add `useClosedChallenges` (from `GET /challenges`, `COMPLETED` only, newest end date first); verify through the Playwright journey in 2.1 that only closed challenges are offered, in that order
- [x] 1.2 Make the ranking page read `?reto=<id>`: a `COMPLETED` id loads that challenge's results read-only (no award panel), anything else falls back to the active ranking; verify with Playwright (closed id, unknown id, active id)
- [x] 1.3 Add the "Retos cerrados" control and "Volver al reto activo" link, hidden when there are no closed challenges; verify with Playwright that the header selection is unchanged after returning
- [x] 1.4 Show the closed challenges in the no-active-challenge state; verify by reviewing the state with no active challenge (Playwright or manual check recorded in the catalog)

## 2. Tests and QA

- [x] 2.1 Add `e2e/tests/08-closed-results.spec.ts` covering the spec scenarios (open closed challenge with winners and final prize, header untouched, shareable address, unknown id); verify it passes with `npx playwright test tests/08-closed-results.spec.ts`
- [x] 2.2 Turn TC-CHAL-12 into an automated case linked to the new tests and close OBS-01 in `docs/qa/catalog.mjs`; verify `node scripts/validate-test-cases.mjs` reports it approved with no orphan tests

## 3. Documentation

- [x] 3.1 Capture the closed ranking in the guide suite (`17-ranking-cerrado.jpg`), update guide step 6.3 and the "what's new" block, rebuild and republish the guide; verify the capture shows the winners block in the light theme
- [x] 3.2 Update `CHANGELOG.md` and `docs/testing.md`; run `node scripts/run-tests.mjs` and verify all steps pass
