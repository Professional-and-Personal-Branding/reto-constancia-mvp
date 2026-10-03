## Context

See proposal.md. Today `Challenge.budgetTotal` is a required decimal with default 0, typed by the
admin; `computeFinance` compares collected against it, and `computePayout(budgetTotal, winners)`
makes it the pot. `computeFinance` already computes `expectedTotal` (fee × participants) and
`collectedTotal` (sum of `amountPaid`, where paid-without-amount stores the fee). Payments and
payment proofs can still be recorded on a closed challenge (no `COMPLETED` guard).

## Goals / Non-Goals

**Goals:**
- One definition of "collected" shared by the finance summary and the payout.
- A budget that is right by default and still adjustable, without a background job.
- Keep the `payout` response shape.

**Non-Goals:**
- Excluding unpaid participants from winning (decided: they can win).
- Moving a late payment between challenges automatically: the admin records it in the next one.
- Storing a snapshot of the pot at closing: closing payments makes it unnecessary.

## Decisions

### Nullable `budgetTotal`: empty means automatic
`budgetTotal` becomes `Decimal?` without default. `null` = automatic, a number = manual. The
effective budget is computed at read time (`budgetTotal ?? fee × participants`) in one helper
used by the finance summary and by the challenge responses that show it, so it follows
enrollment and fee changes with no job and no stored copy that could go stale.
*Alternative:* a separate `budgetMode` column plus a stored amount updated on every enrollment or
fee change. Rejected: two sources of truth and write paths in several services.

### Migration rule for existing challenges
The migration drops `NOT NULL` and the default, then sets `budgetTotal = NULL` where it is `0` (it
was never set; 0 used to mean "no monetary prize", which now follows the fee) or equals
`feePerParticipant × participants`. Any other value was a deliberate amount and stays manual.
The rule is deterministic and reversible by hand, and the runbook asks for a backup first.

### API semantics
Create: `budgetTotal` omitted → automatic; a number ≥ 0 → manual. Update: omitted → unchanged; a
number → manual; `null` → automatic. The finance summary returns the effective `budgetTotal` and
`budgetMode`, so the web never recomputes it.

### Collected total comes from the same function as the finance summary
`ResultsService` passes the participants' payments to the collected-total function that
`computeFinance` uses, and `computePayout(collected, winners, fee)` no longer reads the budget.
The ranking's pot and the "Recaudado" card can never disagree.

### `monetary` follows the fee
With the pot tied to payments, a paid challenge starts at 0. `monetary` becomes
`feePerParticipant > 0`, so the web can tell "no payments yet" from "free challenge".

### Payments close with the challenge
`markPayment` and `uploadMyPaymentProof` reject `COMPLETED` challenges with the message the other
closed-challenge guards use, which also makes the pot of a closed challenge final.

### Web: one control for the budget
The challenge form shows a checkbox "Presupuesto automático (cuota × inscritos)", checked by
default, with the computed amount as a hint; unchecking reveals a manual amount. In edit mode,
re-checking it sends `budgetTotal: null`. The finance card shows the effective budget with
"automático" or "ajustado".

## Risks / Trade-offs

- [The migration misclassifies a manual budget that happened to equal fee × participants] → it
  becomes automatic with the same value today; the admin can set it manual again. Documented in
  the CHANGELOG.
- [Prize shown to participants drops where little was collected] → intended; the ranking marks it
  as projected while the challenge is active.
- [An admin tries to record a late payment on a closed challenge] → 400 with a clear message; the
  guide says it goes to the next challenge.

## Migration Plan

Deploy runs `prisma migrate deploy` at startup. Take the database backup from the runbook first
(this is the first migration since 1.0.0). Rollback: restore the backup and redeploy 1.3.0; the
1.3.0 code cannot read `NULL` budgets.
