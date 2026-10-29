# activity-withdrawal Specification

## Purpose
Lets participants take back an activity they registered by mistake while it still awaits
validation, without asking an admin to delete it through the API.

## Requirements

### Requirement: Only pending or rejected activities can be withdrawn by their owner
A participant SHALL be able to delete their own activity only while it is `PENDING` or `REJECTED`
and its challenge is not `COMPLETED`. Deleting another participant's activity, or one's own
`VALIDATED` activity, MUST be rejected with 403; for one's own `VALIDATED` activity the message
SHALL be "Solo se pueden eliminar actividades pendientes o rechazadas". The ownership and status
checks SHALL use the activity as re-read under the challenge lock. An admin MAY delete any activity
of a challenge that is not `COMPLETED`. Deleting any activity of a `COMPLETED` challenge, by anyone,
MUST be rejected with 400 "El reto está cerrado; sus actividades son definitivas"; this check takes
precedence over the ownership checks. Once deleted, the day SHALL be free for a new registration of
that participant in that challenge, which `POST /activities` SHALL accept or reject with all of its
usual rules; withdrawing SHALL NOT allow two activities of the same participant, day and challenge
to exist at the same time. No limit SHALL apply to how many times a day is withdrawn and registered
again while the challenge is open.

#### Scenario: Own pending activity
- **GIVEN** a participant has a `PENDING` activity
- **WHEN** they delete it
- **THEN** the activity is removed and the response is 204

#### Scenario: Own rejected activity
- **GIVEN** a participant has a `REJECTED` activity with a rejection reason in an `ACTIVE` challenge
- **WHEN** they delete it
- **THEN** the activity and its rejection reason are removed and the response is 204

#### Scenario: Registering the day again after withdrawing a rejected activity
- **GIVEN** a participant withdrew their `REJECTED` activity of a valid day of an `ACTIVE` challenge
- **WHEN** they register a compliant activity for the same date
- **THEN** the response is 201 and the new activity is `PENDING`

#### Scenario: Day no longer valid
- **GIVEN** a participant's `REJECTED` activity on a Saturday
- **AND** the admin then removed Saturday from `validDays`
- **WHEN** the participant withdraws it and registers that date again
- **THEN** the withdrawal answers 204 and the registration answers 400 "Ese día de la semana no es válido para este reto"

#### Scenario: Validated activity
- **GIVEN** a participant has a `VALIDATED` activity
- **WHEN** they try to delete it
- **THEN** the response is 403 "Solo se pueden eliminar actividades pendientes o rechazadas" and the activity remains

#### Scenario: Someone else's activity
- **WHEN** a participant tries to delete another participant's activity, pending or rejected
- **THEN** the response is 403

#### Scenario: Admin validates the rejected activity first
- **GIVEN** a participant's `REJECTED` activity
- **WHEN** an admin validates it and the participant's deletion runs after that validation commits
- **THEN** the deletion answers 403 and the activity stays `VALIDATED`

#### Scenario: Owner withdraws first
- **GIVEN** a participant's `REJECTED` activity
- **WHEN** the participant's deletion commits before an admin validates it
- **THEN** the validation answers 404 "Actividad no encontrada"

#### Scenario: Admin deletes in a closed challenge
- **GIVEN** an activity of a `COMPLETED` challenge
- **WHEN** an admin deletes it
- **THEN** the response is 400 and the activity remains

#### Scenario: Owner withdraws a pending activity of a closed challenge
- **GIVEN** a participant's `PENDING` activity of a `COMPLETED` challenge
- **WHEN** they delete it
- **THEN** the response is 400 and the activity remains

#### Scenario: Owner withdraws a rejected activity of a closed challenge
- **GIVEN** a participant's `REJECTED` activity of a `COMPLETED` challenge
- **WHEN** they delete it
- **THEN** the response is 400 "El reto está cerrado; sus actividades son definitivas" and the activity remains

#### Scenario: Admin deletes in an active challenge
- **WHEN** an admin deletes an activity of an `ACTIVE` challenge
- **THEN** the response is 204

### Requirement: The web offers withdrawing pending and rejected activities
"Mis actividades" SHALL show a "Retirar" action on each of the participant's `PENDING` and
`REJECTED` activities and no action on validated ones. A rejected activity SHALL show its rejection
reason and the hint "Puedes retirarla y registrar ese día de nuevo.". Withdrawing MUST ask for an
in-page confirmation before deleting: "¿Retirar esta actividad?" for a pending activity and
"¿Retirar esta actividad rechazada? Se borrará con sus fotos y podrás registrar ese día de nuevo."
for a rejected one, with "Sí, retirar" and "No". The list, the pending count, the calendar and the
day's upload button MUST update after the activity is removed. After withdrawing a rejected
activity, the web SHALL show "Actividad retirada." and, when that day's calendar entry is `valid`
and the challenge is `ACTIVE`, a "Registrar ese día" link to the upload form prefilled with that
date. A rejected day in "Mi mes" SHALL keep linking to its row in "Mis actividades", where the
action is offered. When the API refuses the withdrawal, its message SHALL be shown and the list
refreshed.

#### Scenario: Withdraw with confirmation
- **GIVEN** a participant sees a pending activity in "Mis actividades"
- **WHEN** they press "Retirar" and confirm
- **THEN** the activity disappears from the list and the pending count decreases by one

#### Scenario: Cancel the confirmation
- **WHEN** the participant presses "Retirar" and then cancels
- **THEN** nothing is deleted

#### Scenario: Day becomes available again
- **GIVEN** the withdrawn activity was today's
- **WHEN** it is withdrawn
- **THEN** the dashboard offers uploading today's activity again

#### Scenario: Correct a rejected day
- **GIVEN** a participant sees a rejected activity of a past valid day with its reason and the hint
- **WHEN** they press "Retirar" and confirm the rejected-activity question
- **THEN** the activity disappears, "Actividad retirada." is shown with a "Registrar ese día" link
- **AND** the link opens the upload form with that date selected and no "Ya registraste una actividad para ese día" hint

#### Scenario: From "Mi mes"
- **GIVEN** a rejected day in "Mi mes"
- **WHEN** the participant activates it
- **THEN** the page moves to that activity's row, which shows the reason, the hint and "Retirar"
- **AND** after withdrawing, the day shows "Sin registro" and links to the upload form with that date

#### Scenario: Validated activity
- **WHEN** the participant sees a validated activity in "Mis actividades"
- **THEN** it offers no "Retirar" action

#### Scenario: Withdrawal refused
- **GIVEN** the admin validated a rejected activity after the participant loaded the list
- **WHEN** the participant withdraws it
- **THEN** the message "Solo se pueden eliminar actividades pendientes o rechazadas" is shown and the row shows "Validado" after the refresh

### Requirement: Deleting an activity releases its uploaded photos
After an activity is deleted (withdrawn by its owner while `PENDING` or `REJECTED`, or deleted by
an admin, in a challenge that is not closed), the system SHALL release each of its photo files that
is no longer referenced. The 204 response and the web's withdraw flow SHALL NOT change, even if
storage fails. If the deletion itself fails, no file SHALL be released.

A registration made from the web SHALL always attach newly uploaded files, whose ids are assigned by
the storage and never chosen by the client, so releasing the photos of a withdrawn activity MUST NOT
affect a registration of the same day made from the web. A registration sent through the API that
reuses the id of a file of a deleted activity SHALL be accepted or rejected with the usual rules, but
the system SHALL NOT guarantee that such a file still exists; this only concerns files in the
caller's own upload folder.

#### Scenario: Withdrawn activity
- **GIVEN** a participant's `PENDING` activity with two uploaded photos
- **WHEN** they withdraw it
- **THEN** the response is 204 and both files are released

#### Scenario: Withdrawn rejected activity
- **GIVEN** a participant's `REJECTED` activity with an activity photo and a heart-rate capture they uploaded
- **WHEN** they withdraw it
- **THEN** the response is 204 and both files are released

#### Scenario: Storage fails
- **GIVEN** storage deletion fails
- **WHEN** the owner withdraws a pending activity
- **THEN** the response is 204, the activity disappears from "Mis actividades" and a warning is logged

#### Scenario: Deletion rejected
- **WHEN** a deletion is rejected (for example, the challenge is closed or the activity is validated)
- **THEN** no file is released

#### Scenario: Registering the same day again from the web
- **GIVEN** a participant withdrew a `REJECTED` activity and its photos are being released
- **WHEN** they register that day again from the web with new photos
- **THEN** the new activity keeps its new files, which the release of the withdrawn activity does not touch

#### Scenario: Reusing a released file id through the API
- **GIVEN** a participant withdrew an activity whose photo had id X
- **WHEN** they register that day again through the API sending id X
- **THEN** the registration follows the usual rules and the file X is not guaranteed to exist
