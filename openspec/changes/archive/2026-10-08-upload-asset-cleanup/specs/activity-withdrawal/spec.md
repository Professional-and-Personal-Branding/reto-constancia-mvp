## ADDED Requirements

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
