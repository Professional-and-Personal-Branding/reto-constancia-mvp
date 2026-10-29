## MODIFIED Requirements

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
