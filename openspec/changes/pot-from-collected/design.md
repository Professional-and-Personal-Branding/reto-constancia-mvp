## Context

See proposal.md. `computePayout(budgetTotal, winnersCount)` in `finance.service.ts` builds the
payout and `ResultsService` calls it with the challenge's `budgetTotal`. The collected total
already exists: `computeFinance` sums `amountPaid` for the finance summary (paid without amount
counts as the fee, recorded at payment time). Payments can still be recorded on a closed
challenge (there is no `COMPLETED` guard on `markPayment`), which matters for a late payment.

## Goals / Non-Goals

**Goals:**
- One definition of "collected" shared by the finance summary and the payout.
- Keep the `payout` response shape, so clients only see different numbers.

**Non-Goals:**
- Excluding unpaid participants from winning (decided: they can win).
- Freezing the pot when the challenge closes (see Open Questions).
- Changing how payments are recorded.

## Decisions

### Collected total comes from the same function as the finance summary
`ResultsService` already loads the participants; it passes their payments to the same
collected-total calculation `computeFinance` uses, and `computePayout(collected, winners, fee)`
no longer reads `budgetTotal`. A single function means the ranking's pot and the "Recaudado"
card can never disagree.
*Alternative:* query the finance summary from the results service. Rejected: an extra round trip
for data the results query already loads.

### `monetary` follows the fee, not the pot
With the pot tied to payments, "pot is 0" stops meaning "no money involved": a paid challenge
starts at 0. `monetary` becomes `feePerParticipant > 0`, so the web can tell "no payments yet"
from "free challenge".

### Budget becomes a target
`budgetTotal` keeps its field and its coverage comparison in the finance summary (labelled as the
target in the copy). Removing it would break existing data and the admin's goal tracking for no
gain.

## Risks / Trade-offs

- [Prize shown to participants drops for challenges where little was collected] → that is the
  intended business rule; the ranking marks the amount as projected while the challenge is active.
- [Late payments after closing change a closed challenge's pot] → see Open Questions.

## Open Questions

- Should payments on a closed challenge stay allowed (the pot of a closed challenge would then
  grow with late payments) or should the pot be frozen at closing? The default in this change is
  to keep payments allowed and the pot live; freezing needs a stored snapshot and is a separate
  change if wanted.
