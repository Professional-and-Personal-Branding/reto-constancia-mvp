## MODIFIED Requirements

### Requirement: Payout per winner
Challenge results SHALL include a `payout` block: `pot` equal to the challenge's collected total
(the sum of `amountPaid` over its participants, rounded to two decimals), `winnersCount` equal to
the number of manual awards when any exist, otherwise the number of computed winners,
`perWinner` equal to `pot / winnersCount` rounded down to two decimals when `winnersCount > 0`
and `pot > 0`, otherwise `0`, and `monetary` true exactly when the challenge charges a fee
(`feePerParticipant > 0`). `budgetTotal` MUST NOT affect the payout. Payout MUST NOT change the
ranking or the winners, and whether a participant has paid MUST NOT change who wins.

#### Scenario: Single winner
- **GIVEN** a challenge with `feePerParticipant = 120`, `budgetTotal = 600`, payments of 120, 120 and 60, and one computed winner
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
- **GIVEN** two challenges with the same payments and winners but `budgetTotal` 600 and 900
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
The admin participants page SHALL show the financial summary (expected, collected, pending, budget coverage against the target budget) and each participant's payment state. The results page SHALL show the payout per winner and the collected pot next to the prize description, labelled as projected while the challenge is active; for a paid challenge with nothing collected it SHALL say that no payments have been recorded yet, and for a free challenge that the prize is not monetary.

#### Scenario: Admin sees the summary
- **GIVEN** the admin opens the participants page of a challenge with mixed payments
- **THEN** the page shows expected, collected and pending totals in the challenge currency and flags whether the target budget is covered
- **AND** a partially paid participant is labelled as partial with the amount

#### Scenario: Participant sees the payout
- **GIVEN** an active challenge that collected 600 and has two winners
- **WHEN** a participant opens the results page
- **THEN** it shows 300 per winner and a pot of 600 in the challenge currency, marked as projected

#### Scenario: Nothing collected yet
- **GIVEN** a paid challenge with no payments recorded
- **WHEN** a participant opens the results page
- **THEN** it says the pot is 0 because no payments have been recorded yet
