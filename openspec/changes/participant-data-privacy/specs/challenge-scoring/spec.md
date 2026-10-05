## ADDED Requirements

### Requirement: Results hide other participants' contact and payment data
For a PARTICIPANT, `GET /challenges/:id/results` SHALL return rows of `ranking`, `tiedAtTop` and
`winners` with exactly `userId`, `name`, `validatedDays`, `pendingDays`, `rejectedDays`,
`totalKm`, `score` and `qualified`, and rows of `awards` with exactly `userId`, `name`,
`awardedAt` and `notes`. Every other top-level field SHALL be identical to the admin response,
and the order of the rows SHALL NOT change. For an ADMIN the response SHALL stay as before,
with `email` and `paid` on the rows.

#### Scenario: Ranking for a participant
- **WHEN** a participant calls `GET /challenges/:id/results`
- **THEN** every row of `ranking`, `tiedAtTop` and `winners` has exactly the eight public keys

#### Scenario: Awards for a participant
- **GIVEN** a challenge with recorded awards
- **WHEN** a participant calls `GET /challenges/:id/results`
- **THEN** every row of `awards` has exactly `userId`, `name`, `awardedAt` and `notes`

#### Scenario: Top level unchanged
- **WHEN** the same results are requested by a participant and by an admin
- **THEN** both responses have the same top-level keys
- **AND** `challengeId`, `challengeName`, `status`, `totalValidDays`, `topScore`, `drawNeeded`, `notes` and `payout` are identical
- **AND** the order of `userId` in `ranking`, `tiedAtTop` and `winners` is identical

#### Scenario: Admin keeps contact and payment data
- **WHEN** an admin calls `GET /challenges/:id/results`
- **THEN** the rows include `email` and `paid`, as before
