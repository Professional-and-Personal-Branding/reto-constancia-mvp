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
