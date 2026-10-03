## Why

The prize pot is the challenge's `budgetTotal`, a number the admin types when creating the
challenge, whether or not that money was ever collected. The business decided that the pot is
what participants actually paid: the prize cannot promise money nobody put in. (The other open
business question, whether someone who did not pay can win, was decided as "yes, as today":
payments still do not affect the ranking or the winners.)

## What Changes

- **BREAKING (results):** `payout.pot` becomes the challenge's collected total, the sum of the
  `amountPaid` recorded for its participants, instead of `budgetTotal`. `perWinner` and the split
  between winners keep their current rules (manual awards first, rounded down to two decimals).
- `payout.monetary` becomes "the challenge charges a fee" (`feePerParticipant > 0`), so a paid
  challenge with no payments recorded yet shows a pot of 0 instead of "premio no monetario". A
  free challenge stays non-monetary.
- `budgetTotal` stays as the admin's **target**: the finance summary keeps comparing collected
  against it (budget coverage); it no longer defines the prize.
- The ranking keeps labelling the prize "proyectado" while the challenge is active, since the pot
  grows as payments are recorded.
- **Payments close with the challenge:** once a challenge is `COMPLETED`, recording or clearing a
  payment and uploading a payment proof are rejected with 400. A late payment belongs to the next
  challenge, where the admin records it as usual. This also freezes the pot of a closed challenge.
- Web copy, guide and catalog stop describing the pot as the budget. `docs/challenge-rules.md`
  records both business decisions.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-finance`: the "Payout per winner" requirement now takes the pot from the collected
  total and defines `monetary` by the fee; a new requirement closes payments with the challenge.

## Impact

- **Backend:** `computePayout` and `ResultsService` use the collected total (already computed for
  the finance summary); `markPayment` and the payment-proof upload reject closed challenges. No
  schema changes, no new endpoints; the `payout` shape is unchanged.
- **Frontend:** the ranking's prize line and the empty-pot message.
- **Tests:** finance unit tests, results unit tests, finance and platform-rules API e2e, the
  parallel-session check "pote = presupuesto", the Playwright finance journey and the guide
  captures whose prize amounts change.
- **Docs:** guide steps 3.4 and 6.1, QA catalog, `challenge-rules.md`, CHANGELOG.
