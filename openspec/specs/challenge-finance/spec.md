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
The system SHALL expose to admins a financial summary of a challenge with: `currency`, `feePerParticipant`, `budgetTotal`, `participantsTotal`, counts per payment state, `expectedTotal` (fee x participants), `collectedTotal` (sum of `amountPaid` of participants marked paid), `pendingTotal` (max(0, expected - collected)), `budgetCovered` (collected >= budget) and `budgetDelta` (collected - budget), plus the list of participants with their state and amount. Amounts SHALL be reported with two decimals.

#### Scenario: Mixed payments
- **GIVEN** a challenge with `feePerParticipant = 120`, `budgetTotal = 600`, `currency = BOB` and 5 participants, of which 3 paid 120, 1 paid 60 and 1 unpaid
- **WHEN** the admin requests the financial summary
- **THEN** `expectedTotal = 600`, `collectedTotal = 420`, `pendingTotal = 180`, `budgetCovered = false`, `budgetDelta = -180`
- **AND** counts are `paid: 3`, `partial: 1`, `unpaid: 1`
- **AND** the participant list marks the state of each one

#### Scenario: Budget covered
- **GIVEN** a challenge with `feePerParticipant = 120`, `budgetTotal = 600` and 6 participants all paid 120
- **WHEN** the admin requests the financial summary
- **THEN** `collectedTotal = 720`, `pendingTotal = 0`, `budgetCovered = true`, `budgetDelta = 120`

#### Scenario: Only admins
- **WHEN** a participant requests the financial summary
- **THEN** the request is rejected with `403 Forbidden`

#### Scenario: Unknown challenge
- **WHEN** an admin requests the financial summary of a non-existent challenge
- **THEN** the request is rejected with `404`

### Requirement: Payout per winner
Challenge results SHALL include a `payout` block: `pot` equal to `budgetTotal`, `winnersCount` equal to the number of manual awards when any exist, otherwise the number of computed winners, `perWinner` equal to `pot / winnersCount` rounded down to two decimals when `winnersCount > 0` and `pot > 0`, and `monetary` false when `pot` is `0`. Payout MUST NOT change the ranking or the winners.

#### Scenario: Single winner
- **GIVEN** a challenge with `budgetTotal = 600` and one computed winner
- **WHEN** results are requested
- **THEN** `payout` is `{ pot: 600, winnersCount: 1, perWinner: 600, monetary: true }`

#### Scenario: Two winners share the pot
- **GIVEN** a challenge with `budgetTotal = 500` and two winners
- **WHEN** results are requested
- **THEN** `perWinner = 250`

#### Scenario: Manual awards define the split
- **GIVEN** a challenge with `budgetTotal = 600`, two computed winners and three manual awards
- **WHEN** results are requested
- **THEN** `winnersCount = 3` and `perWinner = 200`

#### Scenario: No monetary prize
- **GIVEN** a challenge with `budgetTotal = 0`
- **WHEN** results are requested
- **THEN** `payout.monetary` is false and `perWinner = 0`

#### Scenario: No winner yet
- **GIVEN** a challenge with `budgetTotal = 600` and no validated activities
- **WHEN** results are requested
- **THEN** `winnersCount = 0` and `perWinner = 0`

### Requirement: Web shows finance and payout
The admin participants page SHALL show the financial summary (expected, collected, pending, budget coverage) and each participant's payment state. The results page SHALL show the payout per winner next to the prize description, or that the prize is not monetary.

#### Scenario: Admin sees the summary
- **GIVEN** the admin opens the participants page of a challenge with mixed payments
- **THEN** the page shows expected, collected and pending totals in the challenge currency and flags whether the budget is covered
- **AND** a partially paid participant is labelled as partial with the amount

#### Scenario: Participant sees the payout
- **GIVEN** a challenge with `budgetTotal = 600` and two winners
- **WHEN** a participant opens the results page
- **THEN** it shows 300 per winner in the challenge currency
