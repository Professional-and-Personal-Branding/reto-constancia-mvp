## ADDED Requirements

### Requirement: Payment state is visible only to its owner and the admin
No API response to a PARTICIPANT SHALL contain a field that identifies another participant's
payment state, amount paid or payment proof (`paid`, `paidAt`, `amountPaid`, `paymentProofUrl`,
`paymentProofCloudinaryId`, `paymentProofUploadedAt`). A participant SHALL see their own payment
state through `me`. The `payout` of the results SHALL stay public.

#### Scenario: No field identifies someone else's payment
- **GIVEN** participant A has not paid
- **WHEN** participant B reads the ranking, a challenge detail or the active list
- **THEN** no object about A carries any payment field

#### Scenario: Each participant sees their own state
- **GIVEN** participant A has not paid
- **WHEN** A reads the active list
- **THEN** A's `me.paid` is `false` and `me.paymentProofUrl` is A's own proof or `null`

#### Scenario: The pot stays public
- **WHEN** any role reads the results
- **THEN** `payout` is complete

#### Scenario: A winner who did not pay
- **GIVEN** a winner who did not pay
- **WHEN** a participant reads the results
- **THEN** the winner appears in `winners` with their name and no indication of payment

## MODIFIED Requirements

### Requirement: Web shows finance and payout
The admin participants page SHALL show the financial summary (expected, collected, pending, and the budget with whether it is automatic or manual and whether collected covers it) and each participant's payment state. The challenge form SHALL let the admin choose an automatic budget (fee × enrolled participants) or enter a manual amount, and switch back to automatic when editing. The results page SHALL show the payout per winner and the collected pot next to the prize description, labelled as projected while the challenge is active; for a paid challenge with nothing collected it SHALL say that no payments have been recorded yet, and for a free challenge that the prize is not monetary. The results page SHALL show participants' emails only to admins; participants see names, with their own row marked as "(tú)".

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

#### Scenario: Emails only for admins in the ranking
- **GIVEN** a challenge with several participants, selected in the web
- **WHEN** a participant opens the results page
- **THEN** the table shows names and no email, and their own row says "(tú)"
- **AND WHEN** an admin opens the same page with the same challenge selected
- **THEN** each name shows the participant's email
