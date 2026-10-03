## Why

The prize pot is the challenge's `budgetTotal`, a number the admin types when creating the
challenge, whether or not that money was ever collected, and unrelated to how many people
enrolled. The business decided:

1. **The pot is what participants actually paid.** The prize cannot promise money nobody put in.
2. **The budget follows the participants' fees.** By default it is the fee times the enrolled
   participants and it updates as people enroll or leave or the fee changes. The admin can set a
   different amount (for example, an extra contribution) and go back to automatic later.
3. **A closed challenge takes no more payments.** A late payment belongs to the next challenge.
4. **Someone who did not pay can still win** (no change): payments do not affect the ranking or
   the winners.

## What Changes

- **BREAKING (results):** `payout.pot` becomes the challenge's collected total (the sum of the
  `amountPaid` recorded for its participants) instead of `budgetTotal`. The split between winners
  keeps its rules (manual awards first, rounded down to two decimals).
- `payout.monetary` becomes "the challenge charges a fee" (`feePerParticipant > 0`), so a paid
  challenge with nothing collected yet shows a pot of 0, not "premio no monetario".
- **Budget, automatic by default:** a challenge's budget is `feePerParticipant × enrolled
  participants` unless the admin sets a manual amount. Creating a challenge without a budget, or
  setting it back to automatic, uses the computed value. The finance summary reports the
  effective budget and whether it is automatic or manual; coverage compares collected against it.
- **BREAKING (data, migration):** `budgetTotal` becomes optional; empty means automatic. Existing
  challenges whose budget is 0 or equals fee × participants become automatic; any other value is
  kept as a manual budget.
- **Payments close with the challenge:** once a challenge is `COMPLETED`, recording or clearing a
  payment and uploading a payment proof are rejected with 400. This also freezes the pot of a
  closed challenge.
- Web: the challenge form offers "Presupuesto automático (cuota × inscritos)" or a manual amount;
  the finance card shows which one applies; the ranking shows the collected pot, projected while
  active. Guide, catalog and `docs/challenge-rules.md` record the four decisions.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-finance`: the financial summary uses an effective budget (automatic or manual), the
  payout takes the pot from the collected total with `monetary` defined by the fee, payments close
  with the challenge, and the web shows the budget mode and the collected pot.

## Impact

- **Database:** one migration making `Challenge.budgetTotal` nullable, with the data rule above.
- **Backend:** challenge DTOs (`budgetTotal` optional on create, nullable on update), the finance
  summary, `computePayout` and `ResultsService`, and the closed-challenge guard on payments and
  payment proofs. No new endpoints; the `payout` shape is unchanged and the finance summary gains
  `budgetMode`.
- **Frontend:** challenge form (automatic or manual budget), finance card, ranking prize line.
- **Tests:** finance and results unit tests, finance and platform-rules API e2e, the
  parallel-session finance checks, the Playwright finance journey and the guide captures.
- **Docs:** guide steps 2.1, 2.3, 3.3, 3.4, 6.1 and 6.3, QA catalog, `challenge-rules.md`,
  CHANGELOG and the runbook (first migration since 1.0: take the backup).
