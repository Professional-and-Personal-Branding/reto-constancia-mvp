## MODIFIED Requirements

### Requirement: Challenge reads are projected by role
`GET /challenges/active/list`, `GET /challenges/active` and `GET /challenges/:id` SHALL include
`me`: the caller's own enrolment with exactly `paid`, `paidAt`, `amountPaid`, `paymentProofUrl`,
`paymentProofUploadedAt`, `joinedAt` and the derived `paymentStatus` (`pending`, `in_review`,
`partial` or `paid`, as defined in `challenge-finance`), or `null` when the caller is not enrolled.
`me` MUST NOT include `paymentProofCloudinaryId`. For a PARTICIPANT the response SHALL NOT include
the `participants` key. For an ADMIN the response SHALL keep the full `participants` rows with
`user.email` and payment data, plus `me`. Each element of `active/list` SHALL keep
`isParticipant` for both roles.

#### Scenario: Participant lists the active challenges
- **GIVEN** a participant enrolled in an active challenge
- **WHEN** they call `GET /challenges/active/list`
- **THEN** no element has a `participants` key
- **AND** every element has `isParticipant`
- **AND** `me` of the challenge they are enrolled in has exactly the six own-payment keys plus `paymentStatus`, with their own values

#### Scenario: Participant not enrolled
- **WHEN** a participant who is not enrolled calls `GET /challenges/:id`
- **THEN** `me` is `null` and there is no `participants` key

#### Scenario: Several active challenges
- **GIVEN** two active challenges and a participant enrolled only in the first
- **WHEN** they call `GET /challenges/active/list`
- **THEN** the first has `isParticipant: true` and `me` with data
- **AND** the second has `isParticipant: false` and `me: null`

#### Scenario: Default active challenge
- **WHEN** a participant calls `GET /challenges/active`
- **THEN** the same challenge as before is chosen and it has `me` and no `participants` key

#### Scenario: Enrolled admin
- **GIVEN** an admin enrolled in an active challenge
- **WHEN** they call `GET /challenges/active/list`
- **THEN** `participants` has the full rows with `user.email` and payment data
- **AND** `me` has the admin's own enrolment with its `paymentStatus` and `isParticipant` is `true`

### Requirement: Admins can preview what closing a challenge implies
`GET /api/challenges/:id/close-preview` SHALL be available only to admins and SHALL NOT modify
anything. For an `ACTIVE` challenge it SHALL return:
- the pending activities (exact count and up to 50 items with participant and date);
- the participants with a proof to review, as defined in `challenge-finance` (a proof uploaded and
  no payment recorded, or a partial payment with a proof uploaded after it);
- the participants who have not paid or paid partially;
- whether a draw is needed, the winners without draw, the draw candidates and seats;
- the projected payout in the challenge currency.

For a `DRAFT` challenge it MUST answer 400 "Solo se puede cerrar un reto activo", for a
`COMPLETED` one 400 "El reto ya está cerrado", and for a participant 403.

#### Scenario: Pending activities
- **GIVEN** an active challenge with three `PENDING` activities
- **WHEN** an admin requests the preview
- **THEN** `pendingActivities.count` is 3 and the items name the participants and dates

#### Scenario: Unpaid and proofs to review
- **GIVEN** one participant who has not paid and another with a proof uploaded and no payment recorded
- **WHEN** an admin requests the preview
- **THEN** the first appears in `unpaid` with state `unpaid` and the second in `proofsToReview`

#### Scenario: Partial payment with a newer proof
- **GIVEN** a participant with a recorded payment of 60 out of 120 who then uploaded a new proof
- **WHEN** an admin requests the preview
- **THEN** the participant appears in `unpaid` with state `partial` and also in `proofsToReview`

#### Scenario: Same queue as the participants page
- **GIVEN** an active challenge with proofs to review
- **WHEN** an admin requests the preview and the financial summary
- **THEN** `proofsToReview` of the preview lists exactly the participants whose finance row has `proofToReview: true`

#### Scenario: Draw projection
- **GIVEN** four participants tied at the top, `maxWinners = 2` and `DRAW`
- **WHEN** an admin requests the preview
- **THEN** `drawNeeded` is true, `guaranteedWinners` is empty, `drawCandidates` has four entries, `drawSeats` is 2 and `payout.winnersCount` is 2

#### Scenario: Kilometres tied at the cut-off
- **GIVEN** A with 30 km and B, C and D with 20 km, all with the same score, `maxWinners = 2` and `TOTAL_KM`
- **WHEN** an admin requests the preview
- **THEN** `guaranteedWinners` is A, `drawCandidates` are B, C and D, `drawSeats` is 1 and `payout.winnersCount` is 2

#### Scenario: Not active
- **WHEN** an admin requests the preview of a `DRAFT` or a `COMPLETED` challenge
- **THEN** the response is 400 with "Solo se puede cerrar un reto activo" or "El reto ya está cerrado"

#### Scenario: Participant
- **WHEN** a participant requests the preview
- **THEN** the response is 403

#### Scenario: Read-only
- **WHEN** an admin requests the preview twice
- **THEN** the challenge, its activities, payments and awards are unchanged and no draw is stored
