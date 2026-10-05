## 1. Backend projection

- [x] 1.1 On `feature/participant-data-privacy`, export `participantsInclude` (`satisfies Prisma.ChallengeInclude`) and `ChallengeWithParticipants` from `challenges.service.ts`; use the constant in `findActiveList`, `findActive` and `findOne`
- [x] 1.2 Add `backend/src/challenges/privacy.ts` with whitelisted `projectChallengeForViewer` and `projectResultsForViewer` (D4, D5), and `privacy.spec.ts`: admin unchanged plus `me`; participant without `participants`, exact `me` keys, `isParticipant` kept; not enrolled gives `me: null`; result rows with exact keys; top-level key set and values identical; injected unknown keys never leak
- [x] 1.3 Apply the projections in `challenges.controller.ts` (`active/list`, `active`, `:id`, `:id/results`) with explicit return types; `@Roles(ADMIN)` on `:id/participants`
- [x] 1.4 `GET /activities/:id`: `findOneForViewer` in `activities.service.ts` (owner or admin, 403 "No puedes ver esta actividad", 404 unknown) with unit tests; `findOne` unchanged for internal use
- [x] 1.5 Swagger: `@ApiResponse(403)` and updated summaries on the restricted endpoints
- [x] 1.6 API e2e block in `platform-rules.e2e-spec.ts`: participant token on `active/list`, `active` and `:id` (no `participants`, `me` present), results rows without `email`/`paid`, roster 403 vs 200, someone else's activity 403
- [x] 1.7 `npm run lint`, `tsc --noEmit`, `npm test`, `npm run test:e2e` green

## 2. Web

- [x] 2.1 `lib/types.ts`: `MyParticipation`, `Challenge.me`, `participants` documented as admin-only, `email`/`paid` optional on ranking and award rows
- [x] 2.2 Dashboard reads the caller's payment state from `challenge.me` (D7, no fallback)
- [x] 2.3 Results page paints emails only for `ADMIN`; "(tú)" and "no califica" unchanged
- [x] 2.4 `npm run lint`, `tsc --noEmit`, `npm test`, `npm run build` green

## 3. Playwright and QA

- [x] 3.1 `e2e/tests/11-privacy.spec.ts` with the existing admin and participant tokens only (Bruno and his activity created by admin, no extra login): API checks for both roles and UI checks (participant sees no emails and "(tú)", admin sees emails, participant dashboard shows own payment state), each UI test using `selectChallenge`
- [x] 3.2 Regenerate the guide captures that show the ranking (`playwright.guide.config.ts`)
- [x] 3.3 Add TC-SEC-06 to TC-SEC-11 to `docs/qa/catalog.mjs` linked to the real tests; run the validator and check the generated totals (expected 110 cases, 109 automated)

## 4. Docs and verification

- [x] 4.1 Guide step 6.1 note ("Solo ves tu propio estado de pago; el admin ve el de todos y los emails")
- [x] 4.2 Runbook smoke test: participant-token checks on `active/list`, results and roster
- [x] 4.3 `CHANGELOG.md` Sin publicar: Security entry plus the API contract note
- [x] 4.4 Reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs` (all approved); record in `docs/testing.md`
- [x] 4.5 Open the PR to `develop`; after merge, archive the change and prepare release 1.4.2
