# activity-resubmission Specification

## Purpose
Lets the owner of a rejected activity correct its self-reported data and resubmit it for review, keeping the rejection history, the photos and the per-day uniqueness, and serialized with validation, withdrawal and the close of the challenge.

## Requirements

### Requirement: Owners correct and resubmit a rejected activity
`PUT /api/activities/:id/resubmission` SHALL let the owner of a `REJECTED` activity of an `ACTIVE`
challenge in which they are enrolled send it again for validation. The body SHALL contain
`exerciseType`, `durationMinutes` and `photos` (at least one), and MAY contain `distanceKm`,
`avgHeartRate`, `heartRateMinutes` and `notes`, with the same validators as registering; it MUST
NOT contain `challengeId`, `date`, `status` or any other field (400). The values SHALL pass the
registration rules with the challenge's current configuration: the stored date within the period
and on a valid weekday, `heartRateMinutes` not greater than `durationMinutes`, and the heart-rate
rule with the proof derived from the final photos; a violation SHALL answer 400 with the same
message as registering. On success the response SHALL be 200 with the activity, its compliance
fields and its rejection history; the activity SHALL keep its id and date, become `PENDING`, have
`rejectionReason`, `validatedById`, `validatedAt` and `validationNote` cleared and its
`resubmissionCount` increased by one. The checks SHALL use the challenge and the activity as
re-read under the locks, in this order: closed challenge (400 "El reto está cerrado; sus
actividades son definitivas"), challenge not active (400 "El reto no está activo"), not the owner,
admins included (403 "No puedes reenviar esta actividad"), status not `REJECTED` (403 "Solo se
pueden reenviar actividades rechazadas"), not enrolled (403 "No participas en este reto"), then
photos and field rules. An unknown id SHALL answer 404 "Actividad no encontrada". A resubmission
SHALL never answer 409, since the date does not change.

#### Scenario: Owner fixes the heart-rate data
- **GIVEN** a challenge with `minHeartRateMinutes` 20 and a participant's `REJECTED` activity with reason "Falta la captura de FC", one activity photo and no heart-rate photo
- **WHEN** the participant sends the same activity photo, a new heart-rate capture of their own and `heartRateMinutes` 25
- **THEN** the response is 200, the activity is `PENDING` with the same id and date, `rejectionReason` is null and `resubmissionCount` is 1
- **AND** `rejections` lists one item with reason "Falta la captura de FC"

#### Scenario: Ranking and calendar
- **GIVEN** a participant's `REJECTED` activity
- **WHEN** they resubmit it
- **THEN** the ranking does not change
- **AND** the calendar shows that day as pending with no rejection reason, and `summary.rejected` decreases by one and `summary.pending` increases by one

#### Scenario: Rule violation
- **WHEN** the owner resubmits with `durationMinutes` 30 and `heartRateMinutes` 40
- **THEN** the response is 400 "Los minutos con FC no pueden superar la duración de la actividad" and the activity stays `REJECTED` with its photos

#### Scenario: Day no longer valid
- **GIVEN** a participant's `REJECTED` activity on a Saturday
- **AND** the admin then removed Saturday from `validDays`
- **WHEN** the participant resubmits it
- **THEN** the response is 400 "Ese día de la semana no es válido para este reto" and the activity stays `REJECTED`

#### Scenario: Date or challenge in the body
- **WHEN** the owner sends a resubmission body with `date`, `challengeId` or `status`
- **THEN** the response is 400 and the activity is unchanged

#### Scenario: Activity that is not rejected
- **GIVEN** the owner's activity is `PENDING` or `VALIDATED`
- **WHEN** they send a valid resubmission
- **THEN** the response is 403 "Solo se pueden reenviar actividades rechazadas" and the activity is unchanged

#### Scenario: Double submission
- **WHEN** the owner sends the same valid resubmission twice in a row
- **THEN** the first answers 200 and the second 403 "Solo se pueden reenviar actividades rechazadas", and `resubmissionCount` is 1

#### Scenario: Not the owner
- **WHEN** another participant or an admin sends a resubmission for the activity
- **THEN** the response is 403 "No puedes reenviar esta actividad"

#### Scenario: Closed challenge first
- **GIVEN** a `REJECTED` activity of a `COMPLETED` challenge
- **WHEN** anyone sends a resubmission for it
- **THEN** the response is 400 "El reto está cerrado; sus actividades son definitivas", before the ownership and status checks

#### Scenario: Unknown activity
- **WHEN** the owner sends a resubmission for an id that does not exist
- **THEN** the response is 404 "Actividad no encontrada"

### Requirement: Resubmitted photos are the owner's own and dropped photos are released
The `photos` of a resubmission SHALL be the activity's final list. A photo whose `cloudinaryId` and
`url` equal a photo already stored for that activity SHALL be kept without checking its upload
again, with the `type` sent in the body. Every other photo MUST be the participant's own upload
for that challenge, with the same check and message as registering. The same id MUST NOT appear
twice (400 "La misma foto no puede adjuntarse dos veces"). `hasHeartRateProof` SHALL be derived
from the final list. After the resubmission commits, the system SHALL release each dropped photo's
file that no other record references, without changing the response; if the resubmission fails,
no photo SHALL be changed or released.

#### Scenario: Keep one photo, replace another
- **GIVEN** a `REJECTED` activity with photos P1 and P2
- **WHEN** the owner resubmits with P1 and a new own upload P3
- **THEN** the activity has P1 and P3, and P2's file is released after the response

#### Scenario: Re-tag a kept capture
- **GIVEN** a `REJECTED` activity whose only photo P1 is a heart-rate capture stored as type `ACTIVITY`
- **WHEN** the owner resubmits P1 with type `HEART_RATE` and an own upload P2 of type `ACTIVITY`
- **THEN** the activity has `hasHeartRateProof` true and no file is released

#### Scenario: Someone else's file
- **WHEN** the owner resubmits with a photo uploaded to another participant's folder
- **THEN** the response is 400, the activity stays `REJECTED` and none of its photos is released

#### Scenario: Dropped file still in use
- **GIVEN** a dropped photo whose file is also referenced by another record
- **WHEN** the resubmission commits
- **THEN** that file is kept

### Requirement: Every rejection is kept as history
Rejecting an activity SHALL store, in the same transaction, a history entry with the reason, the
rejecting admin and the time. `rejectionReason` SHALL remain the reason of the current rejection.
Validating a rejected activity SHALL clear `rejectionReason` and keep its history. Resubmitting
SHALL keep the history. Deleting an activity SHALL delete its history. When the schema change is
applied, each existing `REJECTED` activity with a reason SHALL get one history entry with that
reason. The backfill SHALL be idempotent: running it again SHALL only add an entry for a `REJECTED`
activity whose current reason has no entry yet, so it can be re-run after a rollback and redeploy.
An import that updates an existing activity SHALL keep its history and SHALL NOT add entries.

#### Scenario: Two rejections and a resubmission
- **GIVEN** an activity rejected with "Foto borrosa", resubmitted, then rejected with "Falta la captura de FC"
- **WHEN** the owner reads `GET /api/activities/me`
- **THEN** the activity is `REJECTED` with `rejectionReason` "Falta la captura de FC", `resubmissionCount` 1 and `rejections` "Foto borrosa" then "Falta la captura de FC"

#### Scenario: Admin reverses a rejection
- **GIVEN** a `REJECTED` activity with one history entry
- **WHEN** an admin validates it
- **THEN** it is `VALIDATED` with `rejectionReason` null and its history still has the entry

#### Scenario: Withdrawn activity
- **GIVEN** a `REJECTED` activity with two history entries
- **WHEN** its owner withdraws it
- **THEN** the activity and both entries are deleted

#### Scenario: Backfill
- **GIVEN** before the schema change, a `REJECTED` activity with reason "Foto borrosa" and a `PENDING` activity
- **WHEN** the migration is applied
- **THEN** the rejected activity has one history entry "Foto borrosa" and the pending one has none

#### Scenario: Catch-up backfill after a rollback
- **GIVEN** the schema change was applied, the previous version was redeployed and an admin rejected a pending activity with "Sin captura" while it ran, and the new version is deployed again
- **WHEN** the catch-up backfill runs twice
- **THEN** that activity has exactly one history entry "Sin captura" and no other activity gains entries

### Requirement: Only pending activities can be rejected
`POST /api/activities/:id/reject` SHALL decide on the activity re-read under the challenge lock and
the activity row lock. After the closed-challenge check (400, which keeps its precedence), an
activity whose status is not `PENDING` MUST be refused with 409 "Solo se pueden rechazar
actividades pendientes", without changing the activity nor its history. Validating a `REJECTED`
activity SHALL remain allowed.

#### Scenario: Rejecting again
- **GIVEN** a `REJECTED` activity with reason "Foto borrosa" and one history entry
- **WHEN** an admin rejects it with "Otra razón"
- **THEN** the response is 409 "Solo se pueden rechazar actividades pendientes", `rejectionReason` is still "Foto borrosa" and the history still has one entry

#### Scenario: Rejecting a validated activity
- **GIVEN** a `VALIDATED` activity of an `ACTIVE` challenge
- **WHEN** an admin rejects it
- **THEN** the response is 409 "Solo se pueden rechazar actividades pendientes" and the activity stays `VALIDATED` with its score

#### Scenario: Closed challenge keeps its precedence
- **GIVEN** a `VALIDATED` activity of a `COMPLETED` challenge
- **WHEN** an admin rejects it
- **THEN** the response is 400 "El reto está cerrado; sus actividades son definitivas"

### Requirement: Rejection history is visible only to the owner and admins
The activities returned by `GET /api/activities/me` to their owner, and by `GET /api/activities`,
`GET /api/activities/pending` and `GET /api/activities/:id` to admins (and to the owner for the
detail), SHALL include `resubmissionCount` and `rejections`, a list of `{ reason, rejectedAt }`
ordered oldest first, without the identity of the admin who rejected. The calendar, the ranking,
the results, the close preview and the CSV record SHALL NOT include the history.

#### Scenario: Another participant asks for the detail
- **WHEN** a participant requests `GET /api/activities/:id` of another participant's activity with history
- **THEN** the response is 403 "No puedes ver esta actividad" and no reason is returned

#### Scenario: Admin queue
- **GIVEN** a resubmitted activity with one earlier rejection
- **WHEN** the admin requests `GET /api/activities/pending`
- **THEN** its item has `resubmissionCount` 1 and `rejections` with that reason and its time, and no admin id or name

#### Scenario: Results stay clean
- **WHEN** any user reads the ranking or the calendar of a challenge with rejection history
- **THEN** no history entry appears in the response

### Requirement: Changes to one activity are serialized
Validating, rejecting, deleting and resubmitting an activity SHALL lock the activity row
(`SELECT … FOR UPDATE`) after locking its challenge and before re-reading the activity, so that
concurrent operations on the same activity run one after the other and each decides on the state
committed by the previous one. The locks SHALL always be taken in the order challenge, then
activity. No such race SHALL answer 500. For validating and deleting, the only observable changes
SHALL be 404 "Actividad no encontrada" instead of an error when a concurrent operation deleted the
activity, and the row-lock conflict below. When the row lock cannot be taken within the writers'
5-second lock timeout, the response MUST be 409 "La actividad se está modificando; vuelve a
intentarlo en unos segundos" without changes; a timeout on the challenge lock SHALL keep the message
"El reto se está cerrando; vuelve a intentarlo en unos segundos".

#### Scenario: Validation commits before the resubmission
- **WHEN** an admin validates a `REJECTED` activity while its owner resubmits it, and the validation commits first
- **THEN** the resubmission answers 403 "Solo se pueden reenviar actividades rechazadas" and the activity stays `VALIDATED` with the data the admin saw

#### Scenario: Resubmission commits before the validation
- **WHEN** the owner's resubmission commits first
- **THEN** the validation assesses the heart-rate rule on the resubmitted values and photos

#### Scenario: Rejection racing the resubmission
- **WHEN** an admin rejects a `REJECTED` activity while its owner resubmits it
- **THEN** either the rejection runs first and answers 409 "Solo se pueden rechazar actividades pendientes" and the resubmission then answers 200, or the resubmission commits first and the rejection applies to the resubmitted `PENDING` activity and adds one history entry

#### Scenario: Row held by another operation
- **GIVEN** another transaction holds the lock of an activity's row for more than 5 seconds
- **WHEN** an admin validates that activity
- **THEN** the response is 409 "La actividad se está modificando; vuelve a intentarlo en unos segundos" and the activity is unchanged

#### Scenario: Withdrawal racing a validation
- **WHEN** the owner withdraws a `PENDING` or `REJECTED` activity while an admin validates it, and the withdrawal commits first
- **THEN** the validation answers 404 "Actividad no encontrada", never 500

### Requirement: The web lets the owner correct and resubmit a rejected activity
In "Mis actividades", a `REJECTED` row of an `ACTIVE` challenge SHALL offer "Corregir y reenviar"
as the first, primary action and "Retirar" second. It SHALL open the upload form in resubmission
mode (`/dashboard/upload?reenviar=<id>`), titled "Corregir y reenviar", with the fields prefilled,
the date shown read-only, the same client checks and the button "Reenviar". The form SHALL use the
challenge of the activity itself, not the challenge chosen in the active-challenge selector. Its
activity-photo and heart-rate-capture slots SHALL be prefilled with the stored photos (first
`ACTIVITY` or `METRICS` photo and first `HEART_RATE` photo) as remote previews; any other stored
photo SHALL be listed under "Otras fotos (n)" and kept unless removed. Each existing photo SHALL
offer "Quitar", choosing a file SHALL replace the photo of that slot, and an existing photo SHALL
be movable to the other slot when it is empty ("Usar como captura de FC" / "Usar como foto de la
actividad"), its type then being the slot's. Only new files SHALL be uploaded; the activity-photo
slot SHALL be required. On success the dashboard SHALL show "Actividad reenviada. Queda pendiente
de validación." in a status region that receives focus, and the list, the calendar and "Mi avance"
SHALL update. On an API error the form SHALL show the API message. If the activity cannot be read
(403 or 404), is not `REJECTED`, belongs to a challenge that is not `ACTIVE` or is not the user's
own, the form SHALL show only "Esta actividad ya no se puede reenviar." with a link back to the
dashboard. Any row whose activity has earlier rejections SHALL show a collapsed disclosure
"Rechazos anteriores (n)" (a native `details` element or an equivalent control with
`aria-expanded`) listing each date and reason, not counting the current rejection of a `REJECTED`
row.

#### Scenario: Participant fixes a rejected day from the phone
- **GIVEN** a participant on a phone-sized screen with a rejected activity whose reason is "Falta la captura de FC"
- **WHEN** they tap "Corregir y reenviar", keep the activity photo, add a heart-rate capture, fill the heart-rate minutes and tap "Reenviar"
- **THEN** the dashboard shows "Actividad reenviada. Queda pendiente de validación." and the row shows "Pendiente" and "Rechazos anteriores (1)"

#### Scenario: Validated meanwhile
- **GIVEN** the resubmission form is open
- **WHEN** an admin validates the activity and the participant then taps "Reenviar"
- **THEN** the form shows "Solo se pueden reenviar actividades rechazadas"

#### Scenario: Stale link
- **WHEN** the participant opens `/dashboard/upload?reenviar=<id>` for a pending activity or one of another participant
- **THEN** the page shows "Esta actividad ya no se puede reenviar." and a link back

#### Scenario: Closed challenge
- **WHEN** the participant views a rejected activity of a challenge that is not active
- **THEN** the row offers no "Corregir y reenviar"

#### Scenario: Activity of another active challenge than the selected one
- **GIVEN** a participant enrolled in active challenges A and B, with B selected, and a rejected activity of A
- **WHEN** they open its resubmission link and send it with a new photo
- **THEN** the photo is uploaded for challenge A and the response is 200

#### Scenario: Prefilled photos, remove and re-tag
- **GIVEN** a rejected activity whose only photo is a heart-rate capture stored as type `ACTIVITY`
- **WHEN** the participant opens "Corregir y reenviar", taps "Usar como captura de FC", adds a new activity photo and taps "Reenviar"
- **THEN** only the new file is uploaded and the activity keeps the capture with type `HEART_RATE`

#### Scenario: Imported activity with several photos
- **GIVEN** a rejected activity with three `ACTIVITY` photos
- **WHEN** the participant opens "Corregir y reenviar"
- **THEN** the first fills the activity slot, "Otras fotos (2)" lists the other two with "Quitar", and removing one drops only that photo on submit

#### Scenario: Rejected row on a phone
- **GIVEN** a participant on a 375 px wide screen with a rejected activity
- **WHEN** they look at its row
- **THEN** "Corregir y reenviar" is the first and primary action, "Retirar" comes second, and the page has no horizontal scroll

#### Scenario: Notice announced and focused
- **WHEN** a resubmission succeeds
- **THEN** the dashboard's notice "Actividad reenviada. Queda pendiente de validación." is in a `role="status"` region that has the focus

#### Scenario: History disclosure
- **GIVEN** a pending activity with one earlier rejection
- **WHEN** the participant activates "Rechazos anteriores (1)" with the keyboard
- **THEN** the list opens showing the date and reason, and its expanded state is exposed to assistive technology

### Requirement: The admin sees resubmitted activities and their history
In the admin "Validar" page, a card whose activity has `resubmissionCount` greater than 0 SHALL
show the badge "Reenviada" ("Reenviada ×n" when n is 2 or more) and the list of earlier rejections
with date and reason. The pending count in the menu SHALL count a resubmitted activity like any
other `PENDING` activity of an active challenge. No other notification SHALL be sent.

#### Scenario: Admin reviews a resubmission
- **GIVEN** an activity rejected with "Foto borrosa" and resubmitted by its owner
- **WHEN** the admin opens "Validar"
- **THEN** its card shows "Reenviada", the reason "Foto borrosa" with its date and the new photos and values
- **AND** the "Validar" menu badge includes it
