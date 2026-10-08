# activity-withdrawal Specification

## Purpose
Lets participants take back an activity they registered by mistake while it still awaits
validation, without asking an admin to delete it through the API.

## Requirements

### Requirement: Only pending activities can be withdrawn by their owner
A participant SHALL be able to delete their own activity only while it is `PENDING` and its
challenge is not `COMPLETED`. Deleting another participant's activity, or one's own `VALIDATED` or
`REJECTED` activity, MUST be rejected with 403. An admin MAY delete any activity of a challenge
that is not `COMPLETED`. Deleting any activity of a `COMPLETED` challenge, by anyone, MUST be
rejected with 400 "El reto está cerrado; sus actividades son definitivas"; this check takes
precedence over the ownership checks.

#### Scenario: Own pending activity
- **GIVEN** a participant has a `PENDING` activity
- **WHEN** they delete it
- **THEN** the activity is removed and the response is 204

#### Scenario: Validated activity
- **GIVEN** a participant has a `VALIDATED` activity
- **WHEN** they try to delete it
- **THEN** the response is 403 and the activity remains

#### Scenario: Someone else's activity
- **WHEN** a participant tries to delete another participant's activity
- **THEN** the response is 403

#### Scenario: Admin deletes in a closed challenge
- **GIVEN** an activity of a `COMPLETED` challenge
- **WHEN** an admin deletes it
- **THEN** the response is 400 and the activity remains

#### Scenario: Owner withdraws a pending activity of a closed challenge
- **GIVEN** a participant's `PENDING` activity of a `COMPLETED` challenge
- **WHEN** they delete it
- **THEN** the response is 400 and the activity remains

#### Scenario: Admin deletes in an active challenge
- **WHEN** an admin deletes an activity of an `ACTIVE` challenge
- **THEN** the response is 204

### Requirement: The web offers withdrawing pending activities
"Mis actividades" SHALL show a "Retirar" action on each of the participant's `PENDING`
activities and no action on validated or rejected ones. Withdrawing MUST ask for an in-page
confirmation before deleting, and the list, the pending count and the day's upload button MUST
update after the activity is removed.

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

### Requirement: Deleting an activity releases its uploaded photos
After an activity is deleted (withdrawn by its owner while `PENDING`, or deleted by an admin, in
a challenge that is not closed), the system SHALL release each of its photo files that is no
longer referenced. The 204 response and the web's withdraw flow SHALL NOT change, even if storage
fails. If the deletion itself fails, no file SHALL be released.

#### Scenario: Withdrawn activity
- **GIVEN** a participant's `PENDING` activity with two uploaded photos
- **WHEN** they withdraw it
- **THEN** the response is 204 and both files are released

#### Scenario: Storage fails
- **GIVEN** storage deletion fails
- **WHEN** the owner withdraws a pending activity
- **THEN** the response is 204, the activity disappears from "Mis actividades" and a warning is logged

#### Scenario: Deletion rejected
- **WHEN** a deletion is rejected (for example, the challenge is closed)
- **THEN** no file is released
