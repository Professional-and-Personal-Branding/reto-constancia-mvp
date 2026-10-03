# challenge-finance Specification

## Purpose
Defines the financial view of a challenge: how fees and payments are reconciled into expected, collected and pending totals with a per-participant payment state, how the prize pot is split among winners, and how payment marking keeps amounts consistent.

## Requirements

### Requirement: Payment state per participant
The system SHALL derive a payment state for each participant of a challenge: `paid` when `paid` is true and the recorded amount is greater than or equal to `feePerParticipant`; `partial` when `paid` is true and the recorded amount is lower than the fee; `unpaid` otherwise. When `feePerParticipant` is `0` every participant is `paid`.

#### Scenario: Full payment
- **GIVEN** a challenge with `feePerParticipant = 120`
- **WHEN** a participant is marked paid with `amountPaid = 120`
- **THEN** their payment state is `paid`

#### Scenario: Partial payment
- **GIVEN** a challenge with `feePerParticipant = 120`
- **WHEN** a participant is marked paid with `amountPaid = 60`
- **THEN** their payment state is `partial`

#### Scenario: No payment
- **GIVEN** a challenge with `feePerParticipant = 120`
- **WHEN** a participant has not been marked paid
- **THEN** their payment state is `unpaid`

#### Scenario: Free challenge
- **GIVEN** a challenge with `feePerParticipant = 0`
- **WHEN** a participant has not been marked paid
- **THEN** their payment state is `paid`

### Requirement: Marking a payment records a consistent amount
When an admin marks a participant as paid without an amount, the system SHALL record `feePerParticipant` as `amountPaid`. When an admin marks a participant as unpaid, the system SHALL clear `amountPaid` and `paidAt`.

#### Scenario: Paid without amount
- **GIVEN** a challenge with `feePerParticipant = 120`
- **WHEN** the admin marks a participant as paid without `amountPaid`
- **THEN** the participant has `amountPaid = 120` and a `paidAt` timestamp

#### Scenario: Paid with explicit amount
- **WHEN** the admin marks a participant as paid with `amountPaid = 150`
- **THEN** the participant has `amountPaid = 150`

#### Scenario: Marked unpaid
- **GIVEN** a participant marked paid
- **WHEN** the admin marks them as unpaid
- **THEN** `paid` is false, `amountPaid` is null and `paidAt` is null

### Requirement: Financial summary of a challenge
The system SHALL expose to admins a financial summary of a challenge with: `currency`, `feePerParticipant`, `budgetTotal` (the effective budget), `budgetMode` (`auto` or `manual`), `participantsTotal`, counts per payment state, `expectedTotal` (fee x participants), `collectedTotal` (sum of `amountPaid` of participants marked paid), `pendingTotal` (max(0, expected - collected)), `budgetCovered` (collected >= effective budget) and `budgetDelta` (collected - effective budget), plus the list of participants with their state and amount. The effective budget SHALL be the manual budget when the admin set one, otherwise `expectedTotal`. Amounts SHALL be reported with two decimals.

#### Scenario: Mixed payments
- **GIVEN** a challenge with `feePerParticipant = 120`, an automatic budget, `currency = BOB` and 5 participants, of which 3 paid 120, 1 paid 60 and 1 unpaid
- **WHEN** the admin requests the financial summary
- **THEN** `budgetTotal = 600`, `budgetMode = auto`, `expectedTotal = 600`, `collectedTotal = 420`, `pendingTotal = 180`, `budgetCovered = false`, `budgetDelta = -180`
- **AND** counts are `paid: 3`, `partial: 1`, `unpaid: 1`
- **AND** the participant list marks the state of each one

#### Scenario: Budget covered
- **GIVEN** a challenge with `feePerParticipant = 120`, a manual budget of 600 and 6 participants all paid 120
- **WHEN** the admin requests the financial summary
- **THEN** `budgetTotal = 600`, `budgetMode = manual`, `collectedTotal = 720`, `pendingTotal = 0`, `budgetCovered = true`, `budgetDelta = 120`

#### Scenario: Only admins
- **WHEN** a participant requests the financial summary
- **THEN** the request is rejected with `403 Forbidden`

#### Scenario: Unknown challenge
- **WHEN** an admin requests the financial summary of a non-existent challenge
- **THEN** the request is rejected with `404`

### Requirement: Payout per winner
Challenge results SHALL include a `payout` block: `pot` equal to the challenge's collected total
(the sum of `amountPaid` over its participants, rounded to two decimals), `winnersCount` equal to
the number of manual awards when any exist, otherwise the number of computed winners,
`perWinner` equal to `pot / winnersCount` rounded down to two decimals when `winnersCount > 0`
and `pot > 0`, otherwise `0`, and `monetary` true exactly when the challenge charges a fee
(`feePerParticipant > 0`). The budget MUST NOT affect the payout. Payout MUST NOT change the
ranking or the winners, and whether a participant has paid MUST NOT change who wins.

#### Scenario: Single winner
- **GIVEN** a challenge with `feePerParticipant = 120`, a budget of 600, payments of 120, 120 and 60, and one computed winner
- **WHEN** results are requested
- **THEN** `payout` is `{ pot: 300, winnersCount: 1, perWinner: 300, monetary: true }`

#### Scenario: Two winners share the pot
- **GIVEN** a challenge that collected 500 and has two winners
- **WHEN** results are requested
- **THEN** `perWinner = 250`

#### Scenario: Manual awards define the split
- **GIVEN** a challenge that collected 600, with two computed winners and three manual awards
- **WHEN** results are requested
- **THEN** `winnersCount = 3` and `perWinner = 200`

#### Scenario: Paid challenge with nothing collected yet
- **GIVEN** a challenge with `feePerParticipant = 120` and no payments recorded
- **WHEN** results are requested
- **THEN** `payout.pot = 0`, `perWinner = 0` and `monetary` is true

#### Scenario: No monetary prize
- **GIVEN** a challenge with `feePerParticipant = 0`
- **WHEN** results are requested
- **THEN** `payout.monetary` is false and `perWinner = 0`

#### Scenario: Budget does not set the prize
- **GIVEN** two challenges with the same payments and winners, one with an automatic budget and one with a manual budget of 900
- **WHEN** results are requested for both
- **THEN** both report the same `pot` and `perWinner`

#### Scenario: An unpaid participant can still win
- **GIVEN** the participant with the highest score has not paid
- **WHEN** results are requested
- **THEN** that participant is a winner and receives `perWinner` like any other winner

#### Scenario: No winner yet
- **GIVEN** a challenge that collected 600 and has no validated activities
- **WHEN** results are requested
- **THEN** `winnersCount = 0` and `perWinner = 0`

### Requirement: Web shows finance and payout
The admin participants page SHALL show the financial summary (expected, collected, pending, and the budget with whether it is automatic or manual and whether collected covers it) and each participant's payment state. The challenge form SHALL let the admin choose an automatic budget (fee × enrolled participants) or enter a manual amount, and switch back to automatic when editing. The results page SHALL show the payout per winner and the collected pot next to the prize description, labelled as projected while the challenge is active; for a paid challenge with nothing collected it SHALL say that no payments have been recorded yet, and for a free challenge that the prize is not monetary.

#### Scenario: Admin sees the summary
- **GIVEN** the admin opens the participants page of a challenge with mixed payments and an automatic budget
- **THEN** the page shows expected, collected and pending totals in the challenge currency, the budget marked as automatic, and whether it is covered
- **AND** a partially paid participant is labelled as partial with the amount

#### Scenario: Admin sets a manual budget and goes back to automatic
- **GIVEN** an active challenge with a fee of 120, 5 participants and an automatic budget
- **WHEN** the admin edits it with a manual budget of 800, and later switches it back to automatic
- **THEN** the budget is 800 marked as manual, and then 600 marked as automatic

#### Scenario: Participant sees the payout
- **GIVEN** an active challenge that collected 600 and has two winners
- **WHEN** a participant opens the results page
- **THEN** it shows 300 per winner and a pot of 600 in the challenge currency, marked as projected

#### Scenario: Nothing collected yet
- **GIVEN** a paid challenge with no payments recorded
- **WHEN** a participant opens the results page
- **THEN** it says the pot is 0 because no payments have been recorded yet

### Requirement: Admins record partial payments from the web
The admin participants page SHALL let the admin enter the amount received when marking a
participant as paid, pre-filled with the challenge fee. The amount MUST be greater than zero.
Saving MUST record it as `amountPaid`; an amount below the fee MUST show the participant as
partial with the amount still owed, and the financial summary MUST update immediately.

#### Scenario: Partial payment
- **GIVEN** a challenge with a fee of 120 and an unpaid participant
- **WHEN** the admin records a payment of 60
- **THEN** the participant shows as partial, owing 60
- **AND** the collected total increases by 60

#### Scenario: Full payment by default
- **WHEN** the admin records a payment without changing the pre-filled amount
- **THEN** the participant shows as paid in full

#### Scenario: Invalid amount
- **WHEN** the admin enters 0 or leaves the amount empty
- **THEN** the payment cannot be saved and the form explains why

### Requirement: Budget follows the participants' fees unless set manually
A challenge's budget SHALL be automatic unless the admin sets a manual amount: creating a
challenge without `budgetTotal` makes it automatic, sending a non-negative amount on create or
update makes it manual, and updating with `budgetTotal = null` makes it automatic again. An
automatic budget SHALL equal `feePerParticipant × enrolled participants` at every read, so it
changes when participants enroll or leave or the fee changes; a manual budget MUST NOT change by
itself.

#### Scenario: Automatic budget follows enrollment
- **GIVEN** a challenge created without a budget, with a fee of 120 and 4 participants
- **WHEN** a fifth participant enrolls
- **THEN** the budget goes from 480 to 600

#### Scenario: Automatic budget follows the fee
- **GIVEN** an active challenge with an automatic budget, a fee of 120 and 5 participants
- **WHEN** the admin changes the fee to 150
- **THEN** the budget is 750

#### Scenario: Manual budget stays put
- **GIVEN** a challenge with a manual budget of 800
- **WHEN** participants enroll or the fee changes
- **THEN** the budget stays 800

#### Scenario: Back to automatic
- **GIVEN** a challenge with a manual budget of 800, a fee of 120 and 5 participants
- **WHEN** the admin updates it with `budgetTotal = null`
- **THEN** the budget is automatic and equals 600

### Requirement: Payments close with the challenge
Once a challenge is `COMPLETED`, the system SHALL reject recording a payment, clearing a payment
and uploading a payment proof for it, with 400 "No se puede modificar un reto cerrado". The
collected total, and therefore the pot, of a closed challenge MUST NOT change. A late payment is
recorded in another challenge, as any other payment.

#### Scenario: Recording a payment after closing
- **GIVEN** a `COMPLETED` challenge and an unpaid participant
- **WHEN** an admin marks the participant as paid
- **THEN** the response is 400 and the participant stays unpaid
- **AND** the challenge's `payout.pot` is unchanged

#### Scenario: Clearing a payment after closing
- **GIVEN** a `COMPLETED` challenge and a paid participant
- **WHEN** an admin marks the participant as unpaid
- **THEN** the response is 400 and the payment stays recorded

#### Scenario: Uploading a payment proof after closing
- **GIVEN** a `COMPLETED` challenge
- **WHEN** a participant uploads a payment proof for it
- **THEN** the response is 400
