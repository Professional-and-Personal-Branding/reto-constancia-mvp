## ADDED Requirements

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
