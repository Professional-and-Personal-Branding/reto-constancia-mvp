## ADDED Requirements

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
