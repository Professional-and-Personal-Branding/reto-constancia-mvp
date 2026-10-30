## ADDED Requirements

### Requirement: Owners correct the data of a pending activity
`PATCH /api/activities/:id` SHALL let the owner of a `PENDING` activity of an `ACTIVE` challenge
change `exerciseType`, `durationMinutes`, `distanceKm`, `avgHeartRate`, `heartRateMinutes` and
`notes`; `distanceKm`, `avgHeartRate`, `heartRateMinutes` and `notes` MAY be set to `null` to clear
them. The body MUST contain at least one of those fields and MUST NOT contain any other field (the
date, the photos, the challenge and the status cannot change); otherwise the response is 400. The
merged values SHALL pass the same field rules as registering: `heartRateMinutes` not greater than
`durationMinutes`, and the challenge's current heart-rate rule with the heart-rate proof derived
from the activity's unchanged photos. On success the response SHALL be 200 with the activity and
its compliance fields; the activity SHALL stay `PENDING` with the same date and photos. No schema
change SHALL be required.

#### Scenario: Owner fixes the minutes
- **GIVEN** a participant's `PENDING` activity of an `ACTIVE` challenge with `durationMinutes` 45 and two photos
- **WHEN** the participant sends `PATCH /api/activities/:id` with `{ "durationMinutes": 54 }`
- **THEN** the response is 200 with `durationMinutes` 54 and `status` `PENDING`
- **AND** the activity keeps its date and the same two photos, and no photo is released

#### Scenario: Clearing an optional field
- **WHEN** the owner sends `{ "distanceKm": null }` for a pending activity with a distance
- **THEN** the response is 200 and the activity has no distance

#### Scenario: New heart-rate data checked against the current rule
- **GIVEN** a challenge with `minHeartRateMinutes` 20 and a pending activity with a heart-rate photo and `heartRateMinutes` 25
- **WHEN** the owner sends `{ "heartRateMinutes": 12 }`
- **THEN** the response is 400 with "Se requieren al menos 20 min de registro de FC (indicaste 12)" and the activity is unchanged

#### Scenario: Heart-rate minutes above the duration
- **WHEN** the owner sends `{ "durationMinutes": 30, "heartRateMinutes": 40 }`
- **THEN** the response is 400 "Los minutos con FC no pueden superar la duración de la actividad"

#### Scenario: Date or photos cannot be edited
- **WHEN** the owner sends a body with `date`, `photos`, `status` or `challengeId`
- **THEN** the response is 400 and the activity is unchanged

#### Scenario: Empty body
- **WHEN** the owner sends `{}`
- **THEN** the response is 400 "Indica al menos un dato para corregir"

#### Scenario: Validated or rejected activity
- **GIVEN** the owner's activity is `VALIDATED` or `REJECTED`
- **WHEN** the owner sends a valid correction
- **THEN** the response is 403 "Solo se pueden editar actividades pendientes" and the activity is unchanged

#### Scenario: Not the owner
- **WHEN** another participant or an admin sends a correction for the activity
- **THEN** the response is 403 "No puedes editar esta actividad"

#### Scenario: Closed challenge first
- **GIVEN** a `PENDING` activity of a `COMPLETED` challenge
- **WHEN** anyone sends a correction for it
- **THEN** the response is 400 "El reto está cerrado; sus actividades son definitivas", before the ownership and status checks

#### Scenario: Unknown activity
- **WHEN** the owner sends a correction for an id that does not exist
- **THEN** the response is 404 "Actividad no encontrada"

#### Scenario: One activity per day is unaffected
- **WHEN** the owner corrects a pending activity
- **THEN** the date does not change and the request never answers 409

### Requirement: Editing and reviewing the same activity are serialized
Validating, rejecting, deleting and editing an activity SHALL lock the activity row
(`SELECT … FOR UPDATE`) after locking its challenge and before re-reading the activity, so that
concurrent operations on the same activity run one after the other and each decides on the state
committed by the previous one. The locks SHALL always be taken in the order challenge, then
activity.

#### Scenario: Edit commits before the validation
- **WHEN** the owner edits a pending activity and an admin validates it at the same time, and the edit commits first
- **THEN** the validation assesses the heart-rate rule on the edited values and the activity ends `VALIDATED` with them

#### Scenario: Validation commits before the edit
- **WHEN** the admin's validation commits first
- **THEN** the edit answers 403 "Solo se pueden editar actividades pendientes" and the activity keeps the values the admin validated

#### Scenario: Rejection racing the edit
- **WHEN** an admin rejects a pending activity while its owner edits it
- **THEN** exactly one of them applies first and the other decides on its result: either the edit answers 403, or the rejection applies to the edited activity

#### Scenario: Deletion racing a validation
- **WHEN** the owner withdraws a pending activity while an admin validates it, and the withdrawal commits first
- **THEN** the validation answers 404 "Actividad no encontrada", never 500

### Requirement: The web lets the owner correct a pending activity
In "Mis actividades", a `PENDING` row of an `ACTIVE` challenge SHALL offer "Editar" next to
"Retirar". It SHALL open an inline form prefilled with the six editable fields, show the date and
photos as read-only, apply the same client checks as the upload form and keep "Guardar" disabled
while the form is invalid or unchanged. After saving it SHALL show "Actividad corregida." and the
new values; on an API error it SHALL show the API message and refresh the list. `VALIDATED` and
`REJECTED` rows SHALL NOT offer "Editar". In the admin "Validar" page, a pending card whose data
changed after it was registered SHALL show the badge "Modificada".

#### Scenario: Participant corrects a typo from the phone
- **GIVEN** a participant with a pending activity of 45 minutes on a phone-sized screen
- **WHEN** they tap "Editar", change the duration to 54 and tap "Guardar"
- **THEN** the row shows 54 minutes, "Actividad corregida." and the same photos

#### Scenario: Validated meanwhile
- **GIVEN** the edit form is open
- **WHEN** an admin validates the activity and the participant then taps "Guardar"
- **THEN** the row shows "Solo se pueden editar actividades pendientes", the list refreshes and the row no longer offers "Editar"

#### Scenario: Invalid values blocked in the form
- **WHEN** the participant enters heart-rate minutes above the duration
- **THEN** "Guardar" stays disabled and the form explains why

#### Scenario: Admin sees the change
- **GIVEN** a pending activity edited by its owner
- **WHEN** the admin opens "Validar"
- **THEN** its card shows "Modificada" and the edited values
