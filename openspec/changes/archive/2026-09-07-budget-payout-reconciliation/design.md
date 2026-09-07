## Context

See proposal.md - Why. Current state that shapes the approach:

- `Challenge.feePerParticipant` and `budgetTotal` are `Decimal(10,2)` with default 0; `currency` defaults to `BOB`. `ChallengeParticipant` has `paid`, `paidAt`, `amountPaid` (nullable Decimal) and proof fields.
- `ChallengesService.markPayment()` writes `paid`, `paidAt` and `amountPaid` from `MarkPaymentDto` (`amountPaid` optional); the admin UI sends the fee as amount when toggling to paid, but the API does not enforce it.
- `ResultsService.getResults()` returns ranking, winners (manual awards prevail over computed), `drawNeeded` and notes; there is no money anywhere in the payload. The frontend `ChallengeResults` type mirrors it.
- The admin participants page already computes `paidCount` and `totalPaid` client-side; the results page only renders `prizeDescription`.
- Prisma `Decimal` values are serialized as strings; the frontend parses them with `parseFloat`.

## Goals / Non-Goals

**Goals:**
- One pure, unit-tested source for the finance numbers and the payout split, reused by the API and by results.
- Give the admin an actionable view (who owes, is the budget covered) without new tables.
- Keep money out of the ranking logic: payout is presentational data derived from the existing winners.

**Non-Goals:**
- Payment eligibility rules (e.g. "unpaid participants cannot win") - the owner has not asked for it; ranking and winners are untouched. Flagged in the proposal.
- Recording expenses, multiple prizes or non-monetary prize allocation.
- Currency conversion; one currency per challenge.
- Payment reminders/notifications.

## Decisions

1. **New `FinanceService` in the challenges module with pure helpers.**
   `computeFinance(challenge: { feePerParticipant, budgetTotal, currency }, participants: { userId, paid, amountPaid, user }[]) => ChallengeFinance` and `computePayout(budgetTotal: number, winnersCount: number) => ChallengePayout`. Decimals are converted with `Number()` and rounded to two decimals (`Math.round(x * 100) / 100`; payout uses `Math.floor` so the split never exceeds the pot). `getFinance(id)` loads the challenge with participants (404 if missing) and calls the helper. Alternative: put everything in `ResultsService` - rejected, it mixes scoring with money and grows an already central service.

2. **Payment state thresholds.** `fee <= 0` -> everyone `paid`. Otherwise `paid && amount >= fee` -> `paid`; `paid && amount < fee` (including null amount on legacy rows) -> `partial`; else `unpaid`. `collectedTotal` sums `amountPaid ?? 0` of rows with `paid = true` only (a proof without admin confirmation does not count).

3. **`markPayment` defaults the amount to the fee.** In `ChallengesService.markPayment()`: when `dto.paid && dto.amountPaid === undefined`, load the challenge and use `feePerParticipant`. Unpaid clears amount/date (existing behavior kept). Alternative: make `amountPaid` required in the DTO - rejected (breaking for the current UI and import flows).

4. **Payout inside results, computed from existing winners.** `ResultsService.getResults()` adds `payout = computePayout(Number(challenge.budgetTotal), awards.length > 0 ? awards.length : winners.length)`. No change to ranking/tie/draw logic. `monetary = pot > 0`.

5. **Endpoint and access.** `GET /challenges/:id/finance` with `@Roles(ADMIN)`; participants keep seeing only their own `paid` flag through existing payloads and the payout through results.

6. **Frontend.**
   - `lib/types.ts`: `ChallengeFinance`, `ParticipantFinance`, `ChallengePayout`; `ChallengeResults.payout`.
   - Participants page: replace the client-side sums with `useQuery(['finance', challenge.id])`; four summary cards (Esperado, Recaudado, Pendiente, Presupuesto cubierto/faltante) and a state chip per row (`Pagado`, `Parcial: X`, `Debe X`). Invalidate `['finance']` after marking payments.
   - Results page: under the prize description show `perWinner` and `winnersCount` ("600 BOB para 1 ganador" / "250 BOB por ganador (2)") or "Premio no monetario" when `!monetary`.

## Risks / Trade-offs

- [Legacy rows marked paid with null amount] -> reported as `partial` with amount 0, which surfaces them for the admin to fix; documented in `docs/challenge-rules.md`.
- [Floating point in money math] -> all sums done on numbers rounded to 2 decimals at the end; amounts are small (fees), and the pure helper is unit-tested with the spec's examples.
- [Payout shown before the challenge closes] -> labelled as "proyectado" while `status = ACTIVE`; final when `COMPLETED`.

## Migration Plan

No database migration. Additive API; deploy backend then frontend (an old frontend simply ignores `payout`). Rollback is a redeploy of the previous version.

## Open Questions

- Should unpaid participants be excluded from winning, or should the pot be `collectedTotal` instead of `budgetTotal`? Both would change the spec; deferred until the owner decides, and easy to add as a per-challenge setting later.
