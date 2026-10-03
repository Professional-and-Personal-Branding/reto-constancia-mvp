## 1. Backend

- [ ] 1.1 Extract the collected-total calculation used by `computeFinance` and make `computePayout(collected, winnersCount, fee)` use it, with `monetary = fee > 0`; verify with updated `finance.service.spec.ts` cases (collected pot, nothing collected on a paid challenge, free challenge, budget ignored)
- [ ] 1.2 Make `ResultsService` pass the collected total and the fee; verify with `results.service.spec.ts` (same payments with different budgets give the same pot; an unpaid top scorer still wins)
- [ ] 1.3 Update the API e2e expectations (`challenge-finance.e2e-spec.ts`, `platform-rules.e2e-spec.ts`) and the parallel-session check to the collected pot; verify `npm run test:e2e` and the session script pass

## 2. Web

- [ ] 2.1 Update the ranking's prize line: pot as collected and projected while active, "aún no hay pagos registrados" for a paid challenge with nothing collected, "premio no monetario" only for free challenges; label the budget card as the target; verify with the Playwright finance journey

## 3. QA and documentation

- [ ] 3.1 Update the QA catalog (TC-FIN-04, TC-FIN-05, TC-RES-04 and the payout wording) and record both business decisions in `docs/challenge-rules.md`; verify `node scripts/validate-test-cases.mjs` approves every case with no orphan tests
- [ ] 3.2 Regenerate the guide captures, update guide steps 3.4 and 6.1, CHANGELOG and `docs/testing.md`; republish the guide; run `node scripts/run-tests.mjs` and verify all steps pass
