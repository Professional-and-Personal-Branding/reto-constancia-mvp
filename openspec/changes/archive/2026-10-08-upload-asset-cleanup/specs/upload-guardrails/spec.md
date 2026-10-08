## ADDED Requirements

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
