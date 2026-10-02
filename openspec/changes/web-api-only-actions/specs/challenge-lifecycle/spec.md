## ADDED Requirements

### Requirement: Admins edit draft and active challenges from the web
The admin challenges page SHALL offer editing a `DRAFT` or `ACTIVE` challenge with the same
form used to create one, pre-filled with the current values: name, period, valid days,
heart-rate minimum, fee, budget, currency, prize and scoring rules. Month and year MUST NOT be
editable. `COMPLETED` challenges MUST NOT offer editing in the web. Saving MUST show the API's
error message when the change is rejected.

#### Scenario: Edit an active challenge
- **GIVEN** an `ACTIVE` challenge with a fee of 120
- **WHEN** the admin opens "Editar", changes the fee to 150 and saves
- **THEN** the challenge keeps its status and now has a fee of 150

#### Scenario: Closed challenge is read-only
- **GIVEN** a `COMPLETED` challenge
- **WHEN** the admin opens the challenges page
- **THEN** that challenge offers no edit action

#### Scenario: Rejected change
- **WHEN** the admin saves a period whose start is after its end
- **THEN** the form shows "startDate debe ser menor que endDate" and nothing changes

### Requirement: Updating a challenge validates its period
Updating a challenge SHALL validate the resulting period, combining the new values with the
stored ones: the start date MUST be before the end date. A violation MUST be rejected with
400 and the same message as creation, without changing the challenge.

#### Scenario: Only the end date changes
- **GIVEN** a challenge from 2025-05-01 to 2025-05-31
- **WHEN** it is updated with `endDate = 2025-04-15`
- **THEN** the response is 400 "startDate debe ser menor que endDate" and the challenge is unchanged

### Requirement: Closed challenges are final
Once a challenge is `COMPLETED`, updating it SHALL be rejected with 400 "No se puede modificar
un reto cerrado", whatever the fields, including its status: a closed challenge cannot be
edited, moved back to `DRAFT` or reactivated. Registering its award SHALL remain allowed, so a
prize drawn in person after closing can still be recorded.

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

