## 1. Branch and baseline

- [ ] 1.1 Create branch `feature/configurable-scoring-rules` from `develop` and verify `git branch --show-current` prints it
- [ ] 1.2 Run the baseline (`cd backend && npm run lint && npx jest`, `cd frontend && npx tsc --noEmit`) and verify all green

## 2. Schema and DTOs

- [ ] 2.1 Add `TiebreakRule` enum and the four fields (`pointsPerValidatedDay`, `pointsPerKm`, `minValidatedDaysToQualify`, `maxWinners`, `tiebreakRule`) with defaults to `Challenge` in `schema.prisma`; create migration `add_challenge_scoring_rules` with `npx prisma migrate dev`; verify `prisma generate` compiles and `migrate deploy` applies on a fresh DB
- [ ] 2.2 Add the four optional fields with validation (`@Min(0)`, `@Min(1)` for `maxWinners`, `@IsEnum`) to `CreateChallengeDto`/`UpdateChallengeDto` and persist them in `ChallengesService.create()`/`update()`; verify `npm run build`

## 3. Scoring module (TDD)

- [ ] 3.1 Create `backend/src/challenges/scoring.spec.ts` with red tests for `computeScore()`: defaults give the validated days; `(10, 1)` with 3 days and 12.5 km gives 42.5; rounding to two decimals. Implement `backend/src/challenges/scoring.ts` and verify green
- [ ] 3.2 Add red tests for `selectWinners()`: fewer tied than `maxWinners` -> all win, no draw; `DRAW` with 4 tied and `maxWinners = 2` -> two winners from the tied set and `drawNeeded`; `TOTAL_KM` picks the highest kilometres without a draw; `TOTAL_KM` with equal kilometres at the cut-off -> draw needed; `SHARE_ALL` returns everyone; empty input -> no winners. Implement and verify green

## 4. Results service

- [ ] 4.1 Use `computeScore()` in `ResultsService.getResults()`, add `score` and `qualified` to each ranking entry, sort by score then kilometres, and build `tiedAtTop` from qualified participants only; extend `results.service.spec.ts` (default scoring unchanged, km scoring, minimum to qualify excluding the top scorer, ranking order); verify green
- [ ] 4.2 Replace the hardcoded `computeWinners()` with `selectWinners()` driven by the challenge configuration, keep manual awards prevailing, and add the rule description to `notes`; extend the spec (maxWinners 1, SHARE_ALL, TOTAL_KM, awards override) and verify green including the existing payout assertions

## 5. E2E

- [ ] 5.1 Create `backend/test/challenge-scoring.e2e-spec.ts` (self-cleaning, year 2096 data): challenge with `pointsPerValidatedDay = 10`, `pointsPerKm = 1`, `minValidatedDaysToQualify = 2`, `maxWinners = 1`, `tiebreakRule = TOTAL_KM`; activities via Prisma; results expose `score`/`qualified`, the participant below the minimum does not win, the winner is the one with more kilometres, payout is the full pot for one winner; a `SHARE_ALL` challenge splits among all tied; `maxWinners = 0` -> 400. Verify `npm run test:e2e` green

## 6. Frontend

- [ ] 6.1 Add the four fields to `lib/types.ts` (`Challenge`) and `score`/`qualified` to `ParticipantRanking`; verify `npx tsc --noEmit`
- [ ] 6.2 Challenge form: "Reglas de puntaje" block with the four inputs, defaults pre-filled and one-line help; verify in the browser that creating a challenge with custom values persists them
- [ ] 6.3 Results page: describe the active rule, show the `Puntos` column when the scoring is not the default, mark non-qualified rows; verify in the browser with the seeded challenge (unchanged view) and with a custom challenge (points and minimum visible)
- [ ] 6.4 Run `npm run lint`, `npx tsc --noEmit` and `npm run build` (dev server stopped) and verify all pass

## 7. Regression script and docs

- [ ] 7.1 Add scoring checks to `scripts/parallel-session-test.mjs`: the seeded challenge keeps `score == validatedDays` and `qualified` true for the top; create a challenge with custom rules and verify they persist and are reflected in its results notes; verify exit 0
- [ ] 7.2 Update `docs/challenge-rules.md` (Gap #3 resolved, the four fields, the rules table marked as configurable, note that changing rules mid-month re-computes the ranking), `docs/architecture.md` (data model) and `docs/test-cases.md` (TC-SCORE-01..05); verify Mermaid renders

## 8. Verification and delivery

- [ ] 8.1 `openspec validate configurable-scoring-rules --strict`; map every scenario to a test or manual check above
- [ ] 8.2 Backend lint+build+unit+e2e and frontend lint+tsc+build green locally
- [ ] 8.3 Conventional Commits on `feature/configurable-scoring-rules`, PR to `develop`, CI green
- [ ] 8.4 After merge: `/opsx:archive configurable-scoring-rules` and verify `openspec/specs/challenge-scoring/spec.md`
