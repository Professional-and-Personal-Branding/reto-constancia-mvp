## Context

See proposal.md. `computePayout(budgetTotal, winnersCount)` in `finance.service.ts` builds the
payout and `ResultsService` calls it with the challenge's `budgetTotal`. The collected total
already exists: `computeFinance` sums `amountPaid` for the finance summary (paid without amount
counts as the fee, recorded at payment time). Payments can still be recorded on a closed
challenge today (there is no `COMPLETED` guard on `markPayment` or on the payment-proof upload);
this change adds that guard.

## Goals / Non-Goals

**Goals:**
- One definition of "collected" shared by the finance summary and the payout.
- Keep the `payout` response shape, so clients only see different numbers.

**Non-Goals:**
- Excluding unpaid participants from winning (decided: they can win).
- Storing a snapshot of the pot at closing: closing payments makes it unnecessary.
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

### Payments close with the challenge
`markPayment` and `uploadMyPaymentProof` reject `COMPLETED` challenges with the message the other
closed-challenge guards use. With no payment changes after closing, the collected total, and so
the pot, of a closed challenge is final without storing a snapshot. A late payment is recorded by
the admin in the next challenge like any other payment; nothing moves between challenges
automatically.
*Alternative:* keep payments open and freeze the pot in a new column at closing. Rejected: the
business rule is that a closed challenge takes no more payments, and a snapshot would let the
recorded payments and the prize disagree.

### Budget becomes a target
`budgetTotal` keeps its field and its coverage comparison in the finance summary (labelled as the
target in the copy). Removing it would break existing data and the admin's goal tracking for no
gain.

## Risks / Trade-offs

- [Prize shown to participants drops for challenges where little was collected] → that is the
  intended business rule; the ranking marks the amount as projected while the challenge is active.
- [An admin tries to record a late payment on the closed challenge] → the API answers 400 with a
  clear message, and the guide explains that it goes to the next challenge.
