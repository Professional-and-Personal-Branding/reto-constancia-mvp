## 1. Branch and baseline

- [x] 1.1 Create branch `feature/budget-payout-reconciliation` from `develop` and verify `git branch --show-current` prints it
- [x] 1.2 Run the baseline (`cd backend && npm run lint && npx jest`, `cd frontend && npx tsc --noEmit`) and verify all green

## 2. Finance helpers (TDD)

- [x] 2.1 Create `backend/src/challenges/finance.service.spec.ts` with red tests for `computeFinance()`: mixed payments example from the spec (expected 600, collected 420, pending 180, covered false, delta -180, counts 3/1/1); budget covered example (720, 0, true, 120); free challenge (fee 0 -> all paid); legacy paid row with null amount -> partial. Verify they fail, implement `FinanceService.computeFinance()`, verify green
- [x] 2.2 Add red tests for `computePayout()`: single winner 600; two winners 250; three awards 200; pot 0 -> monetary false; zero winners -> perWinner 0; rounding never exceeds the pot (e.g. 100 / 3 = 33.33). Implement and verify green
- [x] 2.3 Implement `FinanceService.getFinance(id)` (404 on unknown challenge) and register the provider in `ChallengesModule`; verify `npm run build`

## 3. API wiring

- [x] 3.1 Add `GET /challenges/:id/finance` (`@Roles(ADMIN)`) to `challenges.controller.ts` with Swagger summary; verify build and that Swagger lists it
- [x] 3.2 Extend `results.service.ts` to add `payout` via `computePayout()` (awards count first, else computed winners); extend `results.service.spec.ts` with the payout assertions for one winner, two tied winners and manual awards; verify green
- [x] 3.3 Make `ChallengesService.markPayment()` default `amountPaid` to `feePerParticipant` when paid without amount; add unit tests (paid without amount, paid with amount, unpaid clears) in `challenges.service.spec.ts`; verify green

## 4. E2E

- [x] 4.1 Create `backend/test/challenge-finance.e2e-spec.ts` (self-cleaning, year 2098 data): challenge fee 120 / budget 600 / 5 participants; mark 3 paid without amount (-> 120), 1 paid with 60, 1 unpaid; `GET /finance` matches the spec numbers; participant -> 403; unknown id -> 404; results `payout` for one winner (600) after validating activities; `budgetTotal: 0` challenge -> `monetary: false`. Verify `npm run test:e2e` green

## 5. Frontend

- [x] 5.1 Add `ChallengeFinance`, `ParticipantFinance`, `ChallengePayout` and `ChallengeResults.payout` to `lib/types.ts`; verify `npx tsc --noEmit`
- [x] 5.2 Participants page: fetch `/challenges/:id/finance`, render the four summary cards and per-row payment state chips, invalidate `['finance']` after marking payments; verify in the browser with the seed data (expected/collected/pending shown, toggling a payment updates the cards)
- [x] 5.3 Results page: render payout next to the prize (per winner, count, projected vs final, non-monetary case); verify in the browser for the May challenge (600 BOB, one winner) and for a challenge with budget 0
- [x] 5.4 Run `npm run lint`, `npx tsc --noEmit` and `npm run build` (with the dev server stopped) and verify all pass

## 6. Regression script and docs

- [x] 6.1 Add section 10 to `scripts/parallel-session-test.mjs`: admin reads `/challenges/:id/finance` for May (fields present, expected = fee x participants, collected <= expected, participant states valid); Ana -> 403; results include `payout` with `pot` = budget. Verify exit 0
- [x] 6.2 Update `docs/challenge-rules.md` (Gap #4 resolved: definitions of states, totals and payout; open question on eligibility), `docs/architecture.md` (endpoint row), `docs/test-cases.md` (TC-FIN-01..05); verify Mermaid renders

## 7. Verification and delivery

- [x] 7.1 `openspec validate budget-payout-reconciliation --strict`; map every scenario to a test or manual check above
- [x] 7.2 Backend lint+build+unit+e2e and frontend lint+tsc+build green locally
- [ ] 7.3 Conventional Commits on `feature/budget-payout-reconciliation`, PR to `develop`, CI green
- [ ] 7.4 After merge: `/opsx:archive budget-payout-reconciliation` and verify `openspec/specs/challenge-finance/spec.md`
