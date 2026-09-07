## Purpose

Defines when a daily activity complies with its challenge's heart-rate rule (`minHeartRateMinutes`), how the rule is enforced when participants register activities and when admins validate them, and how compliance is exposed to clients and to the bulk import.

## ADDED Requirements

### Requirement: Heart-rate compliance is defined per challenge
An activity SHALL be considered heart-rate compliant when the challenge's `minHeartRateMinutes` is `0`, or when both conditions hold: `durationMinutes` is greater than or equal to `minHeartRateMinutes`, and the activity carries heart-rate proof (`hasHeartRateProof` is true and at least one photo of type `HEART_RATE` is attached). The evaluation MUST use the challenge configuration in force when it is evaluated.

#### Scenario: Compliant activity
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has `durationMinutes = 25`, `hasHeartRateProof = true` and a `HEART_RATE` photo
- **THEN** the activity is compliant

#### Scenario: Duration below the minimum
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has `durationMinutes = 15` with heart-rate proof
- **THEN** the activity is not compliant
- **AND** the reason states that at least 20 minutes are required

#### Scenario: Missing heart-rate capture
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has `durationMinutes = 40` but no `HEART_RATE` photo
- **THEN** the activity is not compliant
- **AND** the reason states that a heart-rate capture is required

#### Scenario: Rule disabled for the challenge
- **GIVEN** a challenge with `minHeartRateMinutes = 0`
- **WHEN** an activity has `durationMinutes = 5` and no heart-rate proof
- **THEN** the activity is compliant

### Requirement: Registration enforces compliance
When a participant registers an activity, the system SHALL reject a non-compliant activity with `400 Bad Request` and a message that includes the challenge's minimum minutes. The system SHALL also reject an activity that declares `hasHeartRateProof = true` without a `HEART_RATE` photo.

#### Scenario: Registering below the minimum
- **GIVEN** an active challenge with `minHeartRateMinutes = 30` and an enrolled participant
- **WHEN** the participant registers an activity with `durationMinutes = 20` and a heart-rate capture
- **THEN** the request is rejected with `400`
- **AND** the message mentions `30` minutes
- **AND** no activity is stored for that date

#### Scenario: Registering without heart-rate capture
- **GIVEN** an active challenge with `minHeartRateMinutes = 20` and an enrolled participant
- **WHEN** the participant registers an activity with `durationMinutes = 45` and only an `ACTIVITY` photo
- **THEN** the request is rejected with `400`

#### Scenario: Inconsistent proof flag
- **GIVEN** an active challenge with `minHeartRateMinutes = 20`
- **WHEN** the participant registers an activity with `hasHeartRateProof = true` and no `HEART_RATE` photo
- **THEN** the request is rejected with `400`

#### Scenario: Registering a compliant activity
- **GIVEN** an active challenge with `minHeartRateMinutes = 20` and an enrolled participant
- **WHEN** the participant registers an activity with `durationMinutes = 30`, `hasHeartRateProof = true`, an `ACTIVITY` photo and a `HEART_RATE` photo
- **THEN** the request succeeds with `201`
- **AND** the response has `heartRateCompliant: true`

### Requirement: Activity responses expose compliance
Every activity returned by the API (own activities, admin lists, pending list, detail, validation and rejection responses) SHALL include a derived boolean `heartRateCompliant` computed with the rule above. The value MUST NOT be stored; it is computed from the activity and its challenge.

#### Scenario: Pending list for the admin
- **GIVEN** two pending activities in a challenge with `minHeartRateMinutes = 20`, one with 25 minutes and proof and one with 10 minutes
- **WHEN** the admin requests the pending activities
- **THEN** the first has `heartRateCompliant: true` and the second `heartRateCompliant: false`

### Requirement: Validating a non-compliant activity requires an explicit override
The system SHALL reject validation of a non-compliant activity with `400` unless the request carries `override: true` and a non-empty `note` (5 to 300 characters). When overridden, the activity SHALL be validated and the note stored as `validationNote` and returned with the activity. Compliant activities SHALL validate without any body. Rejection is unaffected.

#### Scenario: Validating without override
- **GIVEN** a pending non-compliant activity
- **WHEN** the admin validates it with no body
- **THEN** the request is rejected with `400`
- **AND** the activity remains `PENDING`

#### Scenario: Validating with override and note
- **GIVEN** a pending non-compliant activity
- **WHEN** the admin validates it with `{ "override": true, "note": "Registro histórico verificado en persona" }`
- **THEN** the request succeeds
- **AND** the activity is `VALIDATED` with `validationNote` equal to the note
- **AND** `heartRateCompliant` is still `false`

#### Scenario: Override without note
- **GIVEN** a pending non-compliant activity
- **WHEN** the admin validates it with `{ "override": true }`
- **THEN** the request is rejected with `400`

#### Scenario: Validating a compliant activity
- **GIVEN** a pending compliant activity
- **WHEN** the admin validates it with no body
- **THEN** the activity is `VALIDATED` and `validationNote` is `null`

### Requirement: Import reports compliance as warnings
The bulk import preview SHALL evaluate each valid row against its target challenge and list non-compliance as `warnings` on the row and as a `warnings` count in the summary, without marking the row invalid. The commit SHALL import such rows unchanged (status as given or default).

#### Scenario: Preview with a non-compliant row
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** the admin previews a file with one row of 15 minutes and `hasHeartRateProof = false`
- **THEN** the row is valid
- **AND** the row has a warning that mentions the minimum and the missing capture
- **AND** the summary reports `warnings: 1`

#### Scenario: Commit imports the row
- **GIVEN** the preview above
- **WHEN** the admin commits the file
- **THEN** the activity is created with the given status
- **AND** its `heartRateCompliant` is `false`

### Requirement: The rule can be disabled per challenge
Admins SHALL be able to set `minHeartRateMinutes` to `0` when creating or updating a challenge to disable the rule for that challenge.

#### Scenario: Creating a challenge without the rule
- **WHEN** an admin creates a challenge with `minHeartRateMinutes: 0`
- **THEN** the request succeeds with `201`
- **AND** registrations in that challenge are not rejected for duration or missing capture

### Requirement: Web app guides participants and admins
The upload form SHALL prevent submission while the activity is non-compliant for the selected challenge and explain what is missing. The validations page SHALL show a compliance badge on each pending activity and, for non-compliant ones, SHALL ask for the override note before sending the validation.

#### Scenario: Upload form below the minimum
- **GIVEN** the selected challenge has `minHeartRateMinutes = 30`
- **WHEN** the participant enters `20` minutes
- **THEN** the submit button is disabled
- **AND** the form explains that at least 30 minutes with a heart-rate capture are required

#### Scenario: Upload form without capture
- **GIVEN** the selected challenge has `minHeartRateMinutes = 20`
- **WHEN** the participant enters `40` minutes without attaching a heart-rate capture
- **THEN** the submit button is disabled until a capture is attached

#### Scenario: Admin validates a non-compliant activity from the UI
- **GIVEN** the validations page shows an activity flagged as non-compliant
- **WHEN** the admin clicks "Validar"
- **THEN** the UI asks for an override note
- **AND** the activity is validated only after the note is provided
