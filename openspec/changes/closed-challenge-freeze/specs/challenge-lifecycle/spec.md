## ADDED Requirements

### Requirement: Writes that depend on the challenge state are serialized with closing
Every write that depends on the challenge state SHALL run in a transaction that first locks the
challenge row and re-reads its status: creating, validating, rejecting and deleting activities;
adding and removing participants; recording payments and payment proofs; updating or activating
the challenge; and writing each import row. If the status read under the lock is `COMPLETED`, the
write MUST be rejected without changes. A write that waits more than 5 seconds for the lock MUST
answer 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos" without changes, never
500.

#### Scenario: Validation racing the close
- **WHEN** a validation and a close of the same challenge run at the same time
- **THEN** either the validation commits first and the results used at close include it, or it waits for the close and answers 400
- **AND** no stored draw disagrees with the final ranking

#### Scenario: Rules PATCH racing the close
- **WHEN** a PATCH of `pointsPerKm` and a close of the same challenge run at the same time
- **THEN** either the new rules are stored before the close computes its results, or the PATCH answers 400 "No se puede modificar un reto cerrado"

#### Scenario: Import running while the challenge closes
- **GIVEN** an import commit of 50 rows of one challenge, at row 20
- **WHEN** the admin closes that challenge
- **THEN** the committed rows count for the close, and rows 21 to 50 are reported in `errors` with "El reto M/AAAA está cerrado; no se pueden importar actividades"

#### Scenario: Activity uploaded while closing
- **WHEN** a participant registers an activity while the challenge closes
- **THEN** either it is created `PENDING` before the close or the response is 400 "El reto no está activo"; no activity is ever created after the close

#### Scenario: Lock held too long
- **GIVEN** the challenge row is locked by a close for more than 5 seconds
- **WHEN** an admin validates an activity of that challenge
- **THEN** the response is 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos" and the activity is unchanged

### Requirement: Activities of a closed challenge are final
Validating, rejecting or deleting an activity of a `COMPLETED` challenge SHALL answer 400 "El reto
está cerrado; sus actividades son definitivas", for admins too. This check SHALL come before the
role, ownership and activity-status checks.

#### Scenario: Validating a late activity
- **GIVEN** a `PENDING` activity of a `COMPLETED` challenge
- **WHEN** an admin validates it
- **THEN** the response is 400, the activity stays `PENDING` and the results do not change

#### Scenario: Rejecting after closing
- **GIVEN** a `VALIDATED` activity of a `COMPLETED` challenge
- **WHEN** an admin rejects it
- **THEN** the response is 400 and it stays `VALIDATED`

#### Scenario: Validating twice after closing
- **WHEN** an admin validates again a `VALIDATED` activity of a `COMPLETED` challenge
- **THEN** the response is 400

#### Scenario: Active challenge unchanged
- **WHEN** an admin validates an activity of an `ACTIVE` challenge
- **THEN** it behaves as before, including the heart-rate rule with override

### Requirement: Only an active challenge can be closed, always through the same step
`POST /challenges/:id/close`, `PATCH` with `status = COMPLETED` and `POST /challenges/:id/awards` on
a challenge that is not `COMPLETED` SHALL run the same closing step. Closing a `DRAFT` by any of
them MUST answer 400 "Solo se puede cerrar un reto activo". A `PATCH` with `status = COMPLETED`
and any other defined field MUST answer 400 "Para cerrar el reto envía solo el estado". Award user
ids MUST be checked against the participants under the same lock.

#### Scenario: Closing a draft
- **WHEN** an admin closes a `DRAFT` challenge
- **THEN** the response is 400 and it stays `DRAFT`

#### Scenario: Awarding a draft
- **WHEN** an admin registers awards on a `DRAFT` challenge
- **THEN** the response is 400 and no award is created

#### Scenario: Mixed closing PATCH
- **WHEN** an admin sends `{ status: 'COMPLETED', pointsPerKm: 5 }` to an `ACTIVE` challenge
- **THEN** the response is 400, it stays `ACTIVE` and `pointsPerKm` is unchanged

#### Scenario: Closing PATCH equals close
- **WHEN** an admin sends `{ status: 'COMPLETED' }` to an `ACTIVE` challenge with a `DRAW` tie
- **THEN** the outcome is the same as `POST /close`, including the stored draw

#### Scenario: Awarding an active challenge
- **GIVEN** an `ACTIVE` challenge with four tied participants, `maxWinners = 2` and `DRAW`
- **WHEN** an admin awards two of them
- **THEN** the challenge is `COMPLETED` with exactly those two awards and the admin's note

#### Scenario: Closing twice
- **WHEN** an admin closes a challenge that is already `COMPLETED`
- **THEN** it is returned unchanged and no new draw happens

### Requirement: The automatic draw note is reserved
Registering awards with `notes` equal to "Sorteo automático al cierre" (ignoring surrounding
spaces) MUST answer 400 "Esa nota está reservada para el sorteo automático".

#### Scenario: Reserved note
- **WHEN** an admin sends awards with the note " Sorteo automático al cierre "
- **THEN** the response is 400 and no award changes

## MODIFIED Requirements

### Requirement: Closed challenges are final
Once a challenge is `COMPLETED`, updating it SHALL be rejected with 400 "No se puede modificar
un reto cerrado", whatever the fields, including its status: a closed challenge cannot be
edited, moved back to `DRAFT` or reactivated. Its activities, participants, payments and imported
rows SHALL be final as well. Registering its award SHALL remain allowed, so a prize drawn in person
after closing can still be recorded; an award registered after closing SHALL replace any awards
stored by the automatic draw.

#### Scenario: Editing a closed challenge's rules
- **GIVEN** a `COMPLETED` challenge with `pointsPerKm = 1`
- **WHEN** an admin updates it with `pointsPerKm = 5`
- **THEN** the response is 400 "No se puede modificar un reto cerrado"
- **AND** its rules and final results are unchanged

#### Scenario: Moving a closed challenge back to draft
- **GIVEN** a `COMPLETED` challenge
- **WHEN** an admin updates it with `status = DRAFT`
- **THEN** the response is 400 and the challenge stays `COMPLETED`

#### Scenario: Award after closing
- **GIVEN** a `COMPLETED` challenge
- **WHEN** an admin registers its award
- **THEN** the award is recorded and the challenge stays `COMPLETED`

#### Scenario: Replacing the automatic draw
- **GIVEN** a `COMPLETED` challenge with two awards stored by the automatic draw
- **WHEN** an admin registers two other participants as winners
- **THEN** only the two new awards remain, the challenge stays `COMPLETED` and the results note says "Premiación registrada por el administrador."
