# challenge-lifecycle Specification

## Purpose
Defines the lifecycle of a monthly challenge (DRAFT, ACTIVE, COMPLETED), allows several challenges to be active concurrently, and specifies how callers list active challenges, which one is resolved by default, and how a participant selects the challenge they work on.

## Requirements

### Requirement: Activation is an explicit lifecycle transition
The system SHALL only allow the transition `DRAFT -> ACTIVE`. Activating a challenge that is already `ACTIVE` MUST be an idempotent no-op. A `COMPLETED` challenge MUST NOT be re-activated. Only admins MAY activate a challenge. The same rules SHALL apply when the status is set to `ACTIVE` through the generic update endpoint.

#### Scenario: Activating a draft challenge
- **GIVEN** challenge A has status `DRAFT`
- **WHEN** an admin activates challenge A
- **THEN** the request succeeds with `200`
- **AND** challenge A has status `ACTIVE`

#### Scenario: Re-activating the already active challenge
- **GIVEN** challenge A has status `ACTIVE`
- **WHEN** an admin activates challenge A again
- **THEN** the request succeeds with `200`
- **AND** challenge A is returned unchanged with status `ACTIVE`

#### Scenario: Activating a completed challenge
- **GIVEN** challenge A has status `COMPLETED`
- **WHEN** an admin activates challenge A
- **THEN** the request is rejected with `400 Bad Request`
- **AND** challenge A still has status `COMPLETED`

#### Scenario: Setting status to ACTIVE through the generic update
- **GIVEN** challenge A has status `COMPLETED`
- **WHEN** an admin updates challenge A with `status: ACTIVE` via the generic update endpoint
- **THEN** the request is rejected with `400 Bad Request` exactly as a direct activation would be

#### Scenario: Only admins can activate
- **GIVEN** a participant is authenticated
- **WHEN** the participant activates any challenge
- **THEN** the request is rejected with `403 Forbidden`

### Requirement: Several challenges can be active at the same time
The system SHALL allow any number of challenges to have status `ACTIVE` concurrently. Activating a challenge MUST NOT change the status of any other challenge.

#### Scenario: Activating a second challenge
- **GIVEN** challenge A has status `ACTIVE`
- **AND** challenge B has status `DRAFT`
- **WHEN** an admin activates challenge B
- **THEN** the request succeeds with `200`
- **AND** both A and B have status `ACTIVE`

#### Scenario: Closing one active challenge keeps the others active
- **GIVEN** challenges A and B have status `ACTIVE`
- **WHEN** an admin closes challenge A
- **THEN** challenge A has status `COMPLETED`
- **AND** challenge B still has status `ACTIVE`

### Requirement: Active challenges can be listed
The system SHALL expose the list of all `ACTIVE` challenges to any authenticated user, ordered by start date descending, each including its participants and a boolean `isParticipant` that is true when the caller is a participant of that challenge.

#### Scenario: Two active challenges, caller in one of them
- **GIVEN** challenges A (start 2026-05-01) and B (start 2026-06-01) are `ACTIVE`
- **AND** the caller participates in A only
- **WHEN** the caller requests the active challenge list
- **THEN** the response is `[B, A]`
- **AND** B has `isParticipant: false` and A has `isParticipant: true`

#### Scenario: No active challenge in the list
- **GIVEN** no challenge has status `ACTIVE`
- **WHEN** an authenticated user requests the active challenge list
- **THEN** the response is an empty list

### Requirement: The default active challenge is resolved deterministically
The endpoint that returns "the active challenge" SHALL return, in this order of preference: the `ACTIVE` challenge the caller participates in with the latest start date; otherwise the `ACTIVE` challenge with the latest start date; otherwise `null`. Its response shape MUST remain `Challenge | null` for backward compatibility.

#### Scenario: Caller participates in the older active challenge
- **GIVEN** challenges A (start 2026-05-01) and B (start 2026-06-01) are `ACTIVE`
- **AND** the caller participates in A only
- **WHEN** the caller requests the active challenge
- **THEN** the response is challenge A

#### Scenario: Caller participates in none
- **GIVEN** challenges A (start 2026-05-01) and B (start 2026-06-01) are `ACTIVE`
- **AND** the caller participates in neither
- **WHEN** the caller requests the active challenge
- **THEN** the response is challenge B

#### Scenario: No active challenge as default
- **GIVEN** no challenge has status `ACTIVE`
- **WHEN** any authenticated user requests the active challenge
- **THEN** the response body is `null`
- **AND** participant pages show the existing "no active challenge" state

### Requirement: Participants work on a selected active challenge
The web app SHALL let a user pick which active challenge the dashboard, upload, results and admin participants pages operate on. When only one challenge is active the selection is implicit and no selector is shown. When two or more are active a selector MUST be visible in the header, the default selection MUST follow the same preference as the default active challenge, and the selection MUST persist in that browser across pages and reloads. If the selected challenge is no longer active the selection falls back to the default.

#### Scenario: Single active challenge
- **GIVEN** exactly one challenge is `ACTIVE`
- **WHEN** a user opens the dashboard
- **THEN** the dashboard shows that challenge
- **AND** no challenge selector is displayed

#### Scenario: Switching challenge
- **GIVEN** challenges A and B are `ACTIVE`
- **AND** the user has A selected
- **WHEN** the user picks B in the selector
- **THEN** the dashboard, upload and results pages show B's data (activities, ranking, dates, valid days)
- **AND** after reloading the browser B is still selected

#### Scenario: Selected challenge gets closed
- **GIVEN** the user has challenge B selected
- **WHEN** an admin closes challenge B and the user reloads
- **THEN** the selection falls back to the default active challenge
- **AND** if none is active the "no active challenge" state is shown

### Requirement: Activities are scoped per challenge
When a user participates in several active challenges, the system SHALL treat each challenge independently: one activity per day per challenge, validation per activity, and a ranking computed only from that challenge's activities.

#### Scenario: Same date in two challenges
- **GIVEN** challenges A and B are `ACTIVE` and both contain the date D as a valid day
- **AND** the user participates in both
- **WHEN** the user registers an activity for date D in A and another for date D in B
- **THEN** both requests succeed with `201`
- **AND** A's ranking counts only the activity registered in A
- **AND** B's ranking counts only the activity registered in B

#### Scenario: Duplicate date within the same challenge
- **GIVEN** the user already registered an activity for date D in challenge A
- **WHEN** the user registers another activity for date D in challenge A
- **THEN** the request is rejected with `409 Conflict`

### Requirement: Admin UI reports activation errors
The admin challenge list SHALL display the server's error message when an activation or close request fails, and SHALL refresh the list after a successful activation so the new status is visible.

#### Scenario: Activation rejected by the server
- **GIVEN** the admin challenge list is displayed
- **WHEN** the admin triggers "activate" on a challenge and the server rejects the request (for example `400` because it is `COMPLETED`)
- **THEN** the UI shows the server's error message
- **AND** the list keeps showing the challenge with its previous status

#### Scenario: Activation succeeds
- **GIVEN** the admin challenge list shows challenge B as `DRAFT`
- **WHEN** the admin triggers "activate" on B and the server accepts
- **THEN** the list shows B as `ACTIVE`
- **AND** any previous error message is cleared

### Requirement: Closed challenges stay viewable in the ranking
The web ranking page SHALL let any signed-in user open the final results of a `COMPLETED`
challenge. The page MUST offer the closed challenges ordered from the most recent end date,
and opening one MUST show its final ranking, its winners and the final prize per winner,
without labelling the prize as projected. Opening a closed challenge MUST NOT change the
active challenge selected in the header, and the page MUST offer a way back to the active
challenge's ranking. The results of a closed challenge MUST be reachable through a
shareable address. When there are no closed challenges, no closed-challenge control is
shown.

#### Scenario: Opening a closed challenge
- **GIVEN** challenge M is `COMPLETED` with an awarded winner
- **WHEN** a participant opens the ranking page and picks M among the closed challenges
- **THEN** the page shows M's ranking, the winners block and the final prize per winner
- **AND** the prize is not marked as projected

#### Scenario: Header selection is untouched
- **GIVEN** the user has active challenge A selected in the header
- **WHEN** the user opens closed challenge M in the ranking and then returns to the active ranking
- **THEN** the ranking shows A again
- **AND** the dashboard and upload pages still operate on A

#### Scenario: Shareable address
- **WHEN** a signed-in user opens `/dashboard/results?reto=<id of M>`
- **THEN** the page shows M's final results directly

#### Scenario: No active challenge
- **GIVEN** no challenge is `ACTIVE` and at least one is `COMPLETED`
- **WHEN** a user opens the ranking page
- **THEN** the page offers the closed challenges instead of only reporting that nothing is active

#### Scenario: Unknown or not closed challenge in the address
- **WHEN** the address names a challenge that does not exist or is not `COMPLETED`
- **THEN** the page shows the active ranking as usual and does not fail

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

### Requirement: Admins can preview what closing a challenge implies
`GET /api/challenges/:id/close-preview` SHALL be available only to admins and SHALL NOT modify
anything. For an `ACTIVE` challenge it SHALL return:
- the pending activities (exact count and up to 50 items with participant and date);
- the participants with a payment proof uploaded and no payment recorded;
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

### Requirement: Closing from the web shows a checklist first
Before "Cerrar reto" in the admin challenge list and before "Guardar premiación" on an active
challenge, the web SHALL show a dialog with the preview. If there are pending activities, the
confirm button MUST stay disabled until the admin ticks "Cerrar de todas formas: las actividades
pendientes no contarán". Unpaid participants and proofs to review SHALL be shown without blocking,
with the reminders that unpaid participants can still win and that payments cannot be recorded
after closing. Winners and payout SHALL be presented as a projection, and after a successful close
the page SHALL show the results computed by the server. The dialog SHALL show the server's error
message for any failed close or award, and offer to retry on 409.

#### Scenario: Pending activities block the button
- **GIVEN** an active challenge with one pending activity
- **WHEN** the admin opens "Cerrar reto"
- **THEN** the dialog says that one pending activity will not count and the confirm button is disabled until the checkbox is ticked

#### Scenario: Close from the dialog
- **GIVEN** the dialog of an active challenge with no pending activities
- **WHEN** the admin confirms
- **THEN** the challenge shows as closed in the list

#### Scenario: Award through the dialog
- **GIVEN** an active challenge in the results page
- **WHEN** the admin picks winners and presses "Guardar premiación"
- **THEN** the dialog opens listing those winners, and confirming saves the award and closes the challenge

#### Scenario: Unpaid participants do not block
- **GIVEN** two unpaid participants and no pending activities
- **WHEN** the admin opens the dialog
- **THEN** it lists them with "Pueden ganar igual; el pote es lo recaudado" and the confirm button is enabled

#### Scenario: Server error inside the dialog
- **WHEN** the close or the award answers 400 or 409
- **THEN** the dialog shows the server's message, and on 409 a "Reintentar" button
