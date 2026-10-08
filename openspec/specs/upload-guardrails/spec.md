# upload-guardrails Specification

## Purpose
Keeps file uploads tied to a challenge, a participant and a purpose, so that only participants
spend the storage quota, only allowed formats are stored, and evidence always points to the
participant's own uploads.

## Requirements

### Requirement: Upload signatures are bound to challenge, participant and purpose
`POST /api/upload/sign` SHALL accept only `challengeId` (UUID) and `purpose` (`activity` or
`payment-proof`). The folder MUST be derived by the server as
`<base>/<challengeId>/<authenticated user id>/<purpose>` and the signature MUST cover
`allowed_formats`, `folder` and `timestamp`. The response SHALL include the folder,
`allowedFormats` and `maxBytes`. A body with any other field, such as `folder` or
`resourceType`, MUST be rejected with 400.

#### Scenario: Activity signature
- **GIVEN** a participant of an `ACTIVE` challenge
- **WHEN** they request a signature with purpose `activity`
- **THEN** the response is 201 with their own folder, `allowedFormats` `heic,jpg,png,webp` and `maxBytes` 10485760

#### Scenario: Payment proof signature
- **GIVEN** a participant of a challenge that is not `COMPLETED`
- **WHEN** they request a signature with purpose `payment-proof`
- **THEN** `allowedFormats` is `heic,jpg,pdf,png,webp` and the folder ends with `/<their id>/payment-proof`

#### Scenario: Client-chosen folder
- **WHEN** the request body includes `folder` or `resourceType`
- **THEN** the response is 400

#### Scenario: Invalid purpose or challenge id
- **WHEN** `purpose` is not one of the two values or `challengeId` is not a UUID
- **THEN** the response is 400

### Requirement: Only participants can obtain a signature
A signature SHALL be issued only to a participant of the challenge. For `activity` the challenge
MUST be `ACTIVE`; for `payment-proof` it MUST NOT be `COMPLETED`. A non-participant, admins
included, MUST receive 403 "No participas en este reto"; an unknown challenge 404.

#### Scenario: Not a participant
- **WHEN** an authenticated user who is not enrolled requests a signature
- **THEN** the response is 403 "No participas en este reto"

#### Scenario: Activity on an inactive challenge
- **WHEN** a participant requests an `activity` signature for a challenge that is not `ACTIVE`
- **THEN** the response is 400 "El reto no está activo"

#### Scenario: Proof on a closed challenge
- **GIVEN** a `COMPLETED` challenge
- **WHEN** a participant requests a `payment-proof` signature
- **THEN** the response is 400 "No se puede modificar un reto cerrado"

### Requirement: Signature requests are rate limited
The signature endpoint SHALL accept at most `UPLOAD_SIGN_LIMIT` requests per minute per client,
30 by default; beyond that it MUST answer 429.

#### Scenario: Burst of signatures
- **GIVEN** the default limit
- **WHEN** a client requests a 31st signature within one minute
- **THEN** the response is 429

### Requirement: Activity evidence must be the participant's own upload
Every photo of a new activity, whatever its type (activity, heart rate or metrics), SHALL be
accepted only if its id starts with the participant's `activity` folder for that challenge and its
URL is exactly the storage URL of that id with an allowed extension. Otherwise the activity MUST NOT
be created and the response MUST be 400 "La foto debe subirse desde la plataforma". Activities
created by the admin import are not subject to this rule.

#### Scenario: External URL
- **WHEN** a participant creates an activity with a photo hosted outside the platform storage
- **THEN** the response is 400 "La foto debe subirse desde la plataforma" and nothing is created

#### Scenario: Another participant's photo
- **WHEN** a participant creates an activity using the id of a photo uploaded by someone else in the same challenge
- **THEN** the response is 400 and nothing is created

#### Scenario: Heart-rate capture from the own folder
- **WHEN** a participant creates an activity with an activity photo and a heart-rate capture, both uploaded to their own `activity` folder
- **THEN** the activity is created

#### Scenario: Format not allowed for activities
- **WHEN** a photo id points to a `.pdf` in the activity folder
- **THEN** the response is 400

#### Scenario: Imported activities
- **WHEN** the admin imports activities whose photos are external URLs
- **THEN** the import keeps working

### Requirement: The local upload simulator applies the same rules
In development, `POST /api/upload/local` SHALL accept only a folder derived for the caller (400
"Carpeta de subida no válida" for any other pattern, 403 when the folder belongs to another user),
apply the participation rule of the folder's purpose, and accept only that purpose's formats (400
"Formato no permitido. Usa JPG, PNG, WEBP o HEIC (PDF solo para comprobantes)"). It SHALL stay
disabled in production.

#### Scenario: Someone else's folder
- **WHEN** a participant uploads to a folder derived for another user
- **THEN** the response is 403

#### Scenario: Format not allowed
- **WHEN** a participant uploads a `.gif` to their activity folder
- **THEN** the response is 400 with the format message

### Requirement: The web uploads within the participant's challenge
The web SHALL request signatures with the selected challenge and the purpose, forward
`allowed_formats` exactly as signed, refuse files larger than `maxBytes` before uploading, offer
only the allowed formats in the file pickers, and show Spanish messages for format and size
errors.

#### Scenario: File too large
- **WHEN** a participant picks a file larger than `maxBytes`
- **THEN** the web shows "El archivo supera el tamaño máximo (10 MB)" and does not upload it

#### Scenario: Format rejected
- **WHEN** the storage or the simulator rejects the format
- **THEN** the web shows "Formato no permitido. Usa JPG, PNG, WEBP o HEIC (PDF solo para comprobantes)"

### Requirement: Stored files are deleted with an explicit outcome
Deleting a stored file SHALL report `deleted` when the file existed and was removed, `not_found`
when it did not exist, and SHALL fail for any other outcome. In local mode it SHALL remove the
file saved for that id, whatever its extension, and MUST NOT touch anything outside the uploads
directory.

#### Scenario: Existing file
- **WHEN** a stored file is deleted
- **THEN** the outcome is `deleted` and the file no longer exists

#### Scenario: Missing file
- **WHEN** a file that does not exist is deleted
- **THEN** the outcome is `not_found` and nothing fails

#### Scenario: Path outside the uploads directory
- **WHEN** a deletion is requested for an id that resolves outside the uploads directory
- **THEN** nothing is deleted

### Requirement: Cleanup never blocks and never deletes a file in use
Releasing files SHALL happen after the database change is committed and SHALL NOT change the
user's response. It SHALL only consider ids under the configured base folder, never imported
ones, and SHALL skip any id still referenced by an activity photo or a payment proof. Storage
failures MUST be logged with the file id and no personal data.

#### Scenario: Storage down
- **GIVEN** storage deletion fails
- **WHEN** a file is released
- **THEN** a warning with the id is logged and the user's request is unaffected

#### Scenario: Shared file
- **GIVEN** the same file id is attached to two activities
- **WHEN** one of them is deleted
- **THEN** the file is kept

#### Scenario: Imported photo
- **WHEN** an activity created by the import (id `import/...`) is deleted
- **THEN** no storage call is made

### Requirement: Orphan files can be reported
`node scripts/cloudinary-orphans.mjs` SHALL list every file under the base folder that no
activity photo or payment proof references, with id, size, date and category (`activity`,
`payment-proof` or `legacy`), and the total size. It SHALL print the storage usage in Cloudinary
mode, SHALL delete nothing and SHALL exit 0. Without Cloudinary credentials and outside local
mode it MUST exit 1 with a clear message.

#### Scenario: Local report
- **GIVEN** local mode with one referenced file and one unreferenced file
- **WHEN** the script runs
- **THEN** it lists only the unreferenced file, with its category, and exits 0 without deleting it
