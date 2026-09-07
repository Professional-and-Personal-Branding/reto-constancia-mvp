## Why

Each challenge stores `feePerParticipant` and `budgetTotal`, and each participant can be marked as paid with an amount and a proof, but nothing ties these together: the admin cannot see at a glance how much was expected, how much was collected, who still owes, or whether the budget is covered, and the winner payout is never computed (the results page only shows the free-text prize). This is Gap #4. Reconciling fees with payments and showing the payout per winner turns the finance side of the challenge from informative to actionable, without changing how points and winners are calculated.

## What Changes

- New admin endpoint `GET /challenges/:id/finance` with a **financial summary**: expected total (fee x participants), collected total (sum of paid amounts), pending total, budget coverage, and the list of participants with their payment state (`paid`, `partial`, `unpaid`).
- **Payout** in results: `GET /challenges/:id/results` gains a `payout` block with the pot (`budgetTotal`), the number of winners (manual awards first, otherwise the computed winners) and the amount per winner, or an explicit "no monetary prize" state when the budget is 0.
- **Payment consistency**: marking a participant as paid without an amount records `feePerParticipant` as the amount; marking as unpaid clears amount and date (already the case) and is reflected by the summary. Amounts below the fee are reported as `partial`.
- **Web**: the admin participants page shows the summary cards (expected, collected, pending, budget coverage) and per-row payment state; the results page shows the payout per winner next to the prize description.
- Docs: `docs/challenge-rules.md` (Gap #4 resolved, definitions), `docs/architecture.md` (endpoint), `docs/test-cases.md` (new cases); `scripts/parallel-session-test.mjs` gains finance checks.

No **BREAKING** change: one endpoint is added and one optional block is added to the results payload. Payment eligibility does not affect the ranking or the winners (see design Non-Goals; flagged for the owner).

## Capabilities

### New Capabilities
- `challenge-finance`: financial summary of a challenge (expected, collected, pending, coverage, per-participant payment state), payout per winner, and the payment-marking consistency rules.

### Modified Capabilities
<!-- none: challenge-lifecycle and activity-heart-rate-compliance are unaffected -->

## Impact

- **Backend**: new `backend/src/challenges/finance.service.ts` (pure `computeFinance()` and `computePayout()` plus a Prisma-backed `getFinance(id)`), `challenges.controller.ts` (`GET :id/finance`, admin), `results.service.ts` (adds `payout` using the shared helper), `challenges.service.ts` (`markPayment` defaults the amount), unit specs (`finance.service.spec.ts` new, `results.service.spec.ts` extended), e2e suite `challenge-finance.e2e-spec.ts`.
- **Database**: no schema change, no migration.
- **Frontend**: `app/dashboard/admin/participants/page.tsx` (summary cards, per-row state), `app/dashboard/results/page.tsx` (payout), `lib/types.ts` (`ChallengeFinance`, `ChallengePayout`).
- **Scripts/Docs**: `scripts/parallel-session-test.mjs` (section 10), `docs/challenge-rules.md`, `docs/architecture.md`, `docs/test-cases.md`.
- **Dependencies**: none added.
