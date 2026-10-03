## 1. Data and backend

- [x] 1.1 Prisma migration: `Challenge.budgetTotal` nullable without default, with the data rule (0 or equal to fee × participants → NULL); verify `prisma migrate dev` applies on a seeded database and the seed's May challenge ends up automatic
- [x] 1.2 Effective-budget helper (`budgetTotal ?? fee × participants`) used by the finance summary, which also returns `budgetMode`; DTOs accept an optional budget on create and `null` on update; verify with `finance.service.spec.ts` and `challenges.service.spec.ts` (automatic follows enrollment and fee, manual stays, back to automatic)
- [x] 1.3 Collected-total function shared by the finance summary and `computePayout(collected, winnersCount, fee)` with `monetary = fee > 0`; `ResultsService` uses it; verify with finance and results unit tests (collected pot, nothing collected on a paid challenge, free challenge, budget ignored, unpaid top scorer still wins)
- [x] 1.4 Reject payment changes and payment-proof uploads on `COMPLETED` challenges; verify with unit tests and `platform-rules.e2e-spec.ts` cases (mark paid, mark unpaid and upload proof after closing → 400, pot unchanged)
- [x] 1.5 Update the API e2e expectations (`challenge-finance.e2e-spec.ts`, `challenge-scoring.e2e-spec.ts`, `platform-rules.e2e-spec.ts`) and the parallel-session finance checks; verify `npm run test:e2e` and the session script pass

## 2. Web

- [x] 2.1 Challenge form: "Presupuesto automático (cuota × inscritos)" checked by default, manual amount when unchecked, re-checking in edit sends `null`; verify with Playwright (manual 800, then back to automatic)
- [x] 2.2 Finance card shows the effective budget with "automático" or "ajustado"; ranking prize line shows the collected pot (projected while active), "aún no hay pagos registrados" for a paid challenge with nothing collected, "premio no monetario" only for free challenges; verify with the Playwright finance journey

## 3. QA and documentation

- [x] 3.1 Update the QA catalog (TC-FIN-02, TC-FIN-04, TC-FIN-05, TC-RES-04 and new cases for the automatic budget and for payments closing with the challenge) and record the four business decisions in `docs/challenge-rules.md`; verify `node scripts/validate-test-cases.mjs` approves every case with no orphan tests
- [x] 3.2 Regenerate the guide captures; update guide steps 2.1, 2.3, 3.3, 3.4, 6.1 and 6.3, the runbook (first migration since 1.0: backup), CHANGELOG and `docs/testing.md`; republish guide and runbook; run `node scripts/run-tests.mjs` and verify all steps pass
