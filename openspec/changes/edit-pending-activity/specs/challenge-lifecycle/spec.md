## MODIFIED Requirements

### Requirement: Writes that depend on the challenge state are serialized with closing
Every write that depends on the challenge state SHALL run in a transaction that first locks the
challenge row and re-reads its status: creating, editing, validating, rejecting and deleting
activities; adding and removing participants; recording payments and payment proofs; updating or
activating the challenge; and writing each import row. If the status read under the lock is
`COMPLETED`, the write MUST be rejected without changes. A write that waits more than 5 seconds for
the lock MUST answer 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos" without
changes, never 500.

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

#### Scenario: Activity edited while closing
- **WHEN** a participant edits a pending activity while the challenge closes
- **THEN** either the edit commits before the close or it answers 400 "El reto está cerrado; sus actividades son definitivas"; no activity changes after the close

#### Scenario: Lock held too long
- **GIVEN** the challenge row is locked by a close for more than 5 seconds
- **WHEN** an admin validates an activity of that challenge
- **THEN** the response is 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos" and the activity is unchanged

### Requirement: Activities of a closed challenge are final
Validating, rejecting, editing or deleting an activity of a `COMPLETED` challenge SHALL answer 400
"El reto está cerrado; sus actividades son definitivas", for admins too. This check SHALL come
before the role, ownership and activity-status checks.

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

#### Scenario: Editing after closing
- **GIVEN** a `PENDING` activity of a `COMPLETED` challenge
- **WHEN** its owner edits it
- **THEN** the response is 400 and the activity is unchanged

#### Scenario: Active challenge unchanged
- **WHEN** an admin validates an activity of an `ACTIVE` challenge
- **THEN** it behaves as before, including the heart-rate rule with override
