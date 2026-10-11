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

### Requirement: Payment proofs must be the participant's own upload
A participant SHALL be able to attach a payment proof only to a challenge they are enrolled in, and
only with an asset uploaded to their own `payment-proof` folder for that challenge, with its URL
exactly the storage URL of that id. A non-participant MUST receive 403 "No participas en este reto";
any other proof MUST be rejected with 400 "El comprobante debe subirse desde la plataforma" and
nothing is stored. The closed-challenge rule of "Payments close with the challenge" still applies
first. Admins SHALL NOT attach proofs: the admin payment endpoint MUST reject proof fields with 400,
and marking or unmarking a payment MUST leave the stored proof unchanged.

#### Scenario: Own proof
- **GIVEN** a participant enrolled in an active challenge
- **WHEN** they attach a proof uploaded to their own `payment-proof` folder
- **THEN** the proof is stored

#### Scenario: Someone else's proof
- **WHEN** a participant submits the proof id of another participant
- **THEN** the response is 400 and their record is unchanged

#### Scenario: Not enrolled
- **WHEN** a user who is not enrolled uploads a proof for the challenge
- **THEN** the response is 403 "No participas en este reto"

#### Scenario: Admin sends proof fields
- **WHEN** an admin marks a payment sending `paymentProofUrl` or `paymentProofCloudinaryId`
- **THEN** the response is 400 and the participant record is unchanged

#### Scenario: Unmarking keeps the proof
- **GIVEN** a participant with a stored proof
- **WHEN** the admin marks the payment as unpaid
- **THEN** the stored proof is unchanged

### Requirement: Replaced payment proofs are kept unless configured otherwise
Replacing a payment proof SHALL keep the previous file by default, because it is financial
evidence. Only when `UPLOAD_DELETE_REPLACED_PROOFS` is `true` SHALL the previous file be released
after the change is committed, and only if no other record references it. Unmarking a payment
SHALL never touch the stored proof.

#### Scenario: Default keeps the old proof
- **GIVEN** the flag is not set
- **WHEN** a participant replaces their payment proof
- **THEN** the previous file is kept

#### Scenario: Flag enabled
- **GIVEN** `UPLOAD_DELETE_REPLACED_PROOFS=true`
- **WHEN** a participant replaces their payment proof with a different file
- **THEN** the previous file is released after the change is saved

#### Scenario: Same file again
- **GIVEN** the flag is enabled
- **WHEN** a participant submits the same proof id again
- **THEN** nothing is released

### Requirement: A payment proof awaiting review is derived from the stored payment
The system SHALL consider that a participant has a proof to review when the challenge charges a
fee (`feePerParticipant > 0`), the participant has a stored payment proof, and no recorded payment
covers it: either the payment is not recorded (`paid` is false), or the payment state is `partial`
and the proof was uploaded after the last recorded payment (`paymentProofUploadedAt` later than
`paidAt`). This fact MUST be derived from the stored columns and MUST NOT be stored. A proof to
review MUST NOT add anything to the collected total: only the admin records payments.

#### Scenario: Proof uploaded, payment not recorded
- **GIVEN** a challenge with `feePerParticipant = 120` and a participant who uploaded a proof
- **WHEN** the admin has not recorded their payment
- **THEN** the participant has a proof to review
- **AND** the collected total does not include them

#### Scenario: Recording the payment clears it
- **GIVEN** a participant with a proof to review
- **WHEN** the admin records a payment of 120
- **THEN** the participant no longer has a proof to review and their state is `paid`

#### Scenario: Partial payment and a newer proof
- **GIVEN** a challenge with `feePerParticipant = 120` and a participant with a recorded payment of 60
- **WHEN** the participant uploads a new proof after that payment was recorded
- **THEN** the participant has a proof to review and their state stays `partial`

#### Scenario: Partial payment with an older proof
- **GIVEN** a participant who uploaded a proof and then had a payment of 60 recorded out of 120
- **WHEN** the proof is not replaced
- **THEN** the participant has no proof to review and their state is `partial`

#### Scenario: Proof after a full payment
- **GIVEN** a participant whose payment of 120 out of 120 is recorded
- **WHEN** they upload another proof
- **THEN** the participant has no proof to review

#### Scenario: Unmarking a payment with a proof stored
- **GIVEN** a participant with a stored proof and a recorded payment
- **WHEN** the admin marks the payment as unpaid
- **THEN** the participant has a proof to review again

#### Scenario: Free challenge
- **GIVEN** a challenge with `feePerParticipant = 0` and a participant who uploaded a proof
- **THEN** the participant has no proof to review

#### Scenario: No proof
- **GIVEN** a participant who has not uploaded a proof and has no payment recorded
- **THEN** the participant has no proof to review and their state is `unpaid`

### Requirement: Admins see the proofs to review
The financial summary SHALL also include `proofsToReview`, the number of participants with a proof
to review, and each participant row SHALL include `proofToReview` (boolean) and `proofUploadedAt`
(the upload time of their proof, or null). Every other field of the summary SHALL keep its value.
The summary stays admin-only. The admin participants page SHALL show a "Por revisar" card with that
count, highlighted when it is above zero, and a filter over the enrolled list with the options
Todos, Por revisar, Sin pagar, Parciales and Pagados, each with its count. The "Por revisar" filter
SHALL list only participants with a proof to review, the oldest upload first, and each of those
rows SHALL show "Comprobante por revisar" with the upload date next to the link to the proof and
the existing payment form. After the admin records a payment the count and the filter SHALL update
immediately.

#### Scenario: Count in the summary
- **GIVEN** a challenge with `feePerParticipant = 120` and three participants: one with a proof and no payment, one paid 60 who then uploaded a new proof, and one paid 120
- **WHEN** the admin requests the financial summary
- **THEN** `proofsToReview` is 2
- **AND** the first two rows have `proofToReview: true` with their `proofUploadedAt`, and the third has `proofToReview: false`
- **AND** `counts`, `collectedTotal` and `pendingTotal` are the same as without the proofs

#### Scenario: Participant cannot read the queue
- **WHEN** a participant requests the financial summary
- **THEN** the request is rejected with `403 Forbidden`

#### Scenario: Admin filters the queue
- **GIVEN** a challenge with two proofs to review and three other participants
- **WHEN** the admin opens the participants page and selects "Por revisar"
- **THEN** the card says 2, only the two participants are listed, the oldest upload first, each with "Comprobante por revisar", the upload date and "Ver comprobante de pago"

#### Scenario: Recording a payment from the queue
- **GIVEN** the admin has the "Por revisar" filter selected with one participant listed
- **WHEN** the admin records that participant's payment with the fee pre-filled
- **THEN** the participant leaves the list, the card says 0 and the participant appears under "Pagados"

#### Scenario: Partial payment recorded from the queue
- **GIVEN** a challenge with a fee of 120 and a participant with a proof to review
- **WHEN** the admin records a payment of 60
- **THEN** the participant leaves "Por revisar" and appears under "Parciales", owing 60

### Requirement: Each participant sees their own payment status
`me` SHALL include `paymentStatus`, derived on the server for the caller's own enrolment only:
`paid` when the payment state is `paid` (always for a free challenge); `in_review` when the caller
has a proof to review; `partial` when the payment state is `partial` and nothing is in review;
`pending` otherwise. No response to a PARTICIPANT SHALL carry the payment status of another
participant. The participant dashboard SHALL show, for their own enrolment:
- `pending`: "Estado: pendiente de pago" and a prompt to upload the proof;
- `in_review`: "Estado: comprobante en revisión" with the upload date, and the amount already
  recorded when a partial payment exists;
- `partial`: "Estado: pago parcial" with the amount paid, the fee and the amount still owed, in the
  challenge currency;
- `paid`: "Estado: pagado".

For a challenge with `feePerParticipant = 0` the dashboard SHALL say that the challenge has no fee
and SHALL NOT offer to upload a proof.

#### Scenario: Pending
- **GIVEN** a participant with no proof and no payment in a challenge with a fee of 120
- **WHEN** they read the active list
- **THEN** their `me.paymentStatus` is `pending`
- **AND** the dashboard says "Estado: pendiente de pago" and offers "Subir comprobante"

#### Scenario: Proof sent, in review
- **GIVEN** a participant who uploaded a proof with no payment recorded
- **WHEN** they open the dashboard
- **THEN** `me.paymentStatus` is `in_review` and the dashboard says "Estado: comprobante en revisión" with the upload date

#### Scenario: Partial
- **GIVEN** a participant with a recorded payment of 60 out of 120 BOB and no newer proof
- **WHEN** they open the dashboard
- **THEN** `me.paymentStatus` is `partial` and the dashboard says they paid 60 of 120 BOB and owe 60

#### Scenario: Confirmed
- **GIVEN** a participant whose payment of 120 out of 120 is recorded
- **WHEN** they open the dashboard
- **THEN** `me.paymentStatus` is `paid` and the dashboard says "Estado: pagado"

#### Scenario: Free challenge
- **GIVEN** a challenge with `feePerParticipant = 0`
- **WHEN** a participant opens the dashboard
- **THEN** `me.paymentStatus` is `paid`, the dashboard says the challenge has no fee and there is no upload button

#### Scenario: No one else's status
- **GIVEN** participant A has a proof to review
- **WHEN** participant B reads the active list, a challenge detail or the ranking
- **THEN** no object about A carries `paymentStatus`, `proofToReview` or any payment field
