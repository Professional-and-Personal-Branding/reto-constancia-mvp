## Purpose

Defines the heart-rate data of a daily activity (`heartRateMinutes`), when an activity complies with its challenge's heart-rate rule (`minHeartRateMinutes`), how the rule is enforced when participants register activities and when admins validate them, and how compliance is exposed to clients and to the bulk import.

## ADDED Requirements

### Requirement: Activities record heart-rate minutes
An activity MAY carry `heartRateMinutes`, a positive integer with the minutes of heart-rate recording shown on the capture. When present it MUST NOT exceed `durationMinutes`. On registration, `hasHeartRateProof` SHALL be derived by the system: true when a `HEART_RATE` photo is attached, false otherwise, regardless of the value sent by the client.

#### Scenario: Heart-rate minutes above the session length
- **WHEN** a participant registers an activity with `durationMinutes = 30` and `heartRateMinutes = 45`
- **THEN** the request is rejected with `400`

#### Scenario: Proof flag derived from photos
- **WHEN** a participant registers an activity with `hasHeartRateProof = true` and only an `ACTIVITY` photo
- **THEN** the stored activity has `hasHeartRateProof = false`

### Requirement: Heart-rate compliance is defined per challenge
An activity SHALL be considered heart-rate compliant when the challenge's `minHeartRateMinutes` is `0`, or when all of the following hold: `heartRateMinutes` is present, `heartRateMinutes >= minHeartRateMinutes`, and `hasHeartRateProof` is true. The evaluation MUST use the challenge configuration in force when it is evaluated.

#### Scenario: Compliant activity
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has `heartRateMinutes = 25` and `hasHeartRateProof = true`
- **THEN** the activity is compliant

#### Scenario: Heart-rate minutes below the minimum
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has `durationMinutes = 40`, `heartRateMinutes = 15` and `hasHeartRateProof = true`
- **THEN** the activity is not compliant
- **AND** the reason states that at least 20 minutes of heart-rate recording are required

#### Scenario: Missing heart-rate minutes
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has no `heartRateMinutes`
- **THEN** the activity is not compliant
- **AND** the reason states that the heart-rate minutes are missing

#### Scenario: Missing heart-rate proof
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** an activity has `heartRateMinutes = 40` and `hasHeartRateProof = false`
- **THEN** the activity is not compliant
- **AND** the reason states that a heart-rate capture is required

#### Scenario: Rule disabled for the challenge
- **GIVEN** a challenge with `minHeartRateMinutes = 0`
- **WHEN** an activity has no `heartRateMinutes` and no heart-rate proof
- **THEN** the activity is compliant

### Requirement: Registration enforces compliance
When a participant registers an activity, the system SHALL reject a non-compliant activity with `400 Bad Request` and a message that includes the challenge's minimum minutes.

#### Scenario: Registering below the minimum
- **GIVEN** an active challenge with `minHeartRateMinutes = 30` and an enrolled participant
- **WHEN** the participant registers an activity with `heartRateMinutes = 20` and a `HEART_RATE` photo
- **THEN** the request is rejected with `400`
- **AND** the message mentions `30` minutes
- **AND** no activity is stored for that date

#### Scenario: Registering without heart-rate capture
- **GIVEN** an active challenge with `minHeartRateMinutes = 20` and an enrolled participant
- **WHEN** the participant registers an activity with `heartRateMinutes = 45` and only an `ACTIVITY` photo
- **THEN** the request is rejected with `400`

#### Scenario: Registering without heart-rate minutes
- **GIVEN** an active challenge with `minHeartRateMinutes = 20` and an enrolled participant
- **WHEN** the participant registers an activity with a `HEART_RATE` photo but no `heartRateMinutes`
- **THEN** the request is rejected with `400`

#### Scenario: Registering a compliant activity
- **GIVEN** an active challenge with `minHeartRateMinutes = 20` and an enrolled participant
- **WHEN** the participant registers an activity with `durationMinutes = 30`, `heartRateMinutes = 25`, an `ACTIVITY` photo and a `HEART_RATE` photo
- **THEN** the request succeeds with `201`
- **AND** the response has `heartRateMinutes: 25`, `hasHeartRateProof: true` and `heartRateCompliant: true`

### Requirement: Activity responses expose compliance
Every activity returned by the API (own activities, admin lists, pending list, detail, validation and rejection responses) SHALL include `heartRateMinutes` and a derived boolean `heartRateCompliant` computed with the rule above. `heartRateCompliant` MUST NOT be stored; it is computed from the activity and its challenge.

#### Scenario: Pending list for the admin
- **GIVEN** two pending activities in a challenge with `minHeartRateMinutes = 20`, one with `heartRateMinutes = 25` and proof and one with `heartRateMinutes = 10`
- **WHEN** the admin requests the pending activities
- **THEN** the first has `heartRateCompliant: true` and the second `heartRateCompliant: false`

### Requirement: Validating a non-compliant activity requires an explicit override
The system SHALL reject validation of a non-compliant activity with `400` unless the request carries `override: true` and a `note` of 5 to 300 characters. When overridden, the activity SHALL be validated and the note stored as `validationNote` and returned with the activity. Compliant activities SHALL validate without any body. Rejection is unaffected.

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

### Requirement: Import carries heart-rate minutes and reports compliance as warnings
The bulk import template SHALL include an optional `heartRateMinutes` column (integer >= 1, not greater than `durationMinutes`; violating either is a row error). The preview SHALL evaluate each valid row against its target challenge and list non-compliance as `warnings` on the row and as a `warnings` count in the summary, without marking the row invalid. The commit SHALL import such rows unchanged (status as given or default) including `heartRateMinutes`.

#### Scenario: Preview with a non-compliant row
- **GIVEN** a challenge with `minHeartRateMinutes = 20`
- **WHEN** the admin previews a file with one row of `durationMinutes = 40`, no `heartRateMinutes` and `hasHeartRateProof = false`
- **THEN** the row is valid
- **AND** the row has a warning that mentions the minimum
- **AND** the summary reports `warnings: 1`

#### Scenario: Invalid heart-rate minutes in a row
- **WHEN** the admin previews a row with `durationMinutes = 30` and `heartRateMinutes = 45`
- **THEN** the row is invalid with an error about `heartRateMinutes`

#### Scenario: Commit imports the row
- **GIVEN** a valid compliant row with `heartRateMinutes = 25`
- **WHEN** the admin commits the file
- **THEN** the activity is created with `heartRateMinutes = 25` and the given status

### Requirement: The rule can be disabled per challenge
Admins SHALL be able to set `minHeartRateMinutes` to `0` when creating or updating a challenge to disable the rule for that challenge.

#### Scenario: Creating a challenge without the rule
- **WHEN** an admin creates a challenge with `minHeartRateMinutes: 0`
- **THEN** the request succeeds with `201`
- **AND** registrations in that challenge are not rejected for heart-rate minutes or missing capture

### Requirement: Web app guides participants and admins
The upload form SHALL offer a "minutos con FC" input, prevent submission while the activity is non-compliant for the selected challenge, and explain what is missing. The validations page SHALL show the recorded heart-rate minutes and a compliance badge on each pending activity and, for non-compliant ones, SHALL ask for the override note before sending the validation. The import page SHALL show row warnings and their count.

#### Scenario: Upload form below the minimum
- **GIVEN** the selected challenge has `minHeartRateMinutes = 30`
- **WHEN** the participant enters `20` heart-rate minutes
- **THEN** the submit button is disabled
- **AND** the form explains that at least 30 minutes of heart-rate recording with a capture are required

#### Scenario: Upload form without capture
- **GIVEN** the selected challenge has `minHeartRateMinutes = 20`
- **WHEN** the participant enters `40` heart-rate minutes without attaching a heart-rate capture
- **THEN** the submit button is disabled until a capture is attached

#### Scenario: Admin validates a non-compliant activity from the UI
- **GIVEN** the validations page shows an activity flagged as non-compliant
- **WHEN** the admin clicks "Validar"
- **THEN** the UI asks for an override note
- **AND** the activity is validated only after the note is provided
