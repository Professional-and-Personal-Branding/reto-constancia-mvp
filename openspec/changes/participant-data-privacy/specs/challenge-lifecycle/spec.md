## ADDED Requirements

### Requirement: Challenge reads are projected by role
`GET /challenges/active/list`, `GET /challenges/active` and `GET /challenges/:id` SHALL include
`me`: the caller's own enrolment with exactly `paid`, `paidAt`, `amountPaid`, `paymentProofUrl`,
`paymentProofUploadedAt` and `joinedAt`, or `null` when the caller is not enrolled. `me` MUST NOT
include `paymentProofCloudinaryId`. For a PARTICIPANT the response SHALL NOT include the
`participants` key. For an ADMIN the response SHALL keep the full `participants` rows with
`user.email` and payment data, plus `me`. Each element of `active/list` SHALL keep
`isParticipant` for both roles.

#### Scenario: Participant lists the active challenges
- **GIVEN** a participant enrolled in an active challenge
- **WHEN** they call `GET /challenges/active/list`
- **THEN** no element has a `participants` key
- **AND** every element has `isParticipant`
- **AND** `me` of the challenge they are enrolled in has exactly the six own-payment keys with their own values

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
- **AND** `me` has the admin's own enrolment and `isParticipant` is `true`

### Requirement: Participant roster is admin-only
`GET /challenges/:id/participants` SHALL be available only to admins.

#### Scenario: Participant asks for the roster
- **WHEN** a participant calls `GET /challenges/:id/participants`
- **THEN** the response is 403

#### Scenario: Admin asks for the roster
- **WHEN** an admin calls `GET /challenges/:id/participants`
- **THEN** the response lists the enrolled users with `email`, `role` and `active`, as before

### Requirement: Activity detail is visible only to its owner or an admin
`GET /activities/:id` SHALL return the activity only to its owner or an admin, with the same
response shape as before. Any other user SHALL get 403 "No puedes ver esta actividad" and no
activity data. An unknown id SHALL return 404 to every role.

#### Scenario: Someone else's activity
- **WHEN** a participant requests an activity that belongs to another participant
- **THEN** the response is 403 "No puedes ver esta actividad"

#### Scenario: Own activity
- **WHEN** the owner requests their activity
- **THEN** they receive it, including `heartRateCompliant`

#### Scenario: Admin
- **WHEN** an admin requests any activity
- **THEN** they receive it

#### Scenario: Unknown activity
- **WHEN** any user requests an activity id that does not exist
- **THEN** the response is 404
