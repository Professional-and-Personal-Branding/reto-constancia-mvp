## Purpose

Defines how an admin imports daily activities directly from a Google Sheet: how the backend authenticates with a service account, how the connection status is reported, and how sheet rows are previewed and committed with the same rules as the file import.

## ADDED Requirements

### Requirement: Integration is configured server-side and optional
The system SHALL read Google Sheets with a service account configured through environment variables (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`). When they are missing, every sheet endpoint SHALL respond `503 Service Unavailable` with a message that the integration is not configured, and the file import SHALL keep working unchanged.

#### Scenario: Not configured
- **GIVEN** the service account variables are not set
- **WHEN** an admin calls any sheet endpoint
- **THEN** the response is `503` with a message naming the missing configuration

#### Scenario: File import unaffected
- **GIVEN** the service account variables are not set
- **WHEN** an admin previews a CSV file
- **THEN** the request succeeds as before

### Requirement: Connection status
The system SHALL expose `GET /import/sheet/status` to admins returning `configured` (boolean) and, when `spreadsheetId` is given and the integration is configured, whether the spreadsheet is `readable`, its `title`, its sheet names and the number of data rows in the resolved range; an unreadable or unknown spreadsheet SHALL be reported as `readable: false` with the reason (not shared, not found) instead of an error.

#### Scenario: Configured and shared
- **GIVEN** the integration is configured and the sheet is shared with the service account
- **WHEN** the admin requests the status with the spreadsheet id
- **THEN** the response has `configured: true`, `readable: true`, the title, the sheet names and the row count

#### Scenario: Not shared
- **GIVEN** the integration is configured and the sheet is not shared with the service account
- **WHEN** the admin requests the status with the spreadsheet id
- **THEN** the response has `configured: true`, `readable: false` and a reason mentioning access

#### Scenario: Only admins
- **WHEN** a participant requests the status
- **THEN** the request is rejected with `403`

### Requirement: Sheet rows use the import template
The first row of the resolved range SHALL be treated as the header and MUST contain the template headers (`email`, `name`, `challengeMonth`, `challengeYear`, `date`, `exerciseType`, `durationMinutes` at least; optional columns as in the template). Header matching SHALL be case-insensitive and ignore surrounding spaces. Missing required headers SHALL be reported as `400` naming them. Empty rows SHALL be ignored. Cell values SHALL be treated as text exactly like CSV cells (dates `YYYY-MM-DD` or `DD/MM/YYYY`).

#### Scenario: Valid header
- **GIVEN** a sheet whose first row is the template header
- **WHEN** the admin previews it
- **THEN** rows are validated with the same rules as the file import

#### Scenario: Missing required header
- **GIVEN** a sheet without the `date` column
- **WHEN** the admin previews it
- **THEN** the response is `400` and the message names `date`

#### Scenario: Blank rows ignored
- **GIVEN** a sheet with two data rows separated by an empty row
- **WHEN** the admin previews it
- **THEN** the preview reports `total: 2`

### Requirement: Preview and commit from a sheet behave like the file import
`POST /import/sheet/preview` SHALL return the same `PreviewResult` shape as the file preview (summary with `total/valid/invalid/warnings`, rows with errors and warnings). `POST /import/sheet/commit` SHALL accept the same options (`defaultStatus`, `duplicateStrategy`, `defaultPassword`) and return the same `CommitResult`, applying the same skip/update idempotency per `(challenge, user, date)`.

#### Scenario: Preview mirrors the file preview
- **GIVEN** a sheet with one valid compliant row, one valid non-compliant row and one invalid row
- **WHEN** the admin previews it
- **THEN** the summary is `{ total: 3, valid: 2, invalid: 1, warnings: 1 }`

#### Scenario: Commit is idempotent
- **GIVEN** a sheet with one valid row already imported for the same challenge, user and date
- **WHEN** the admin commits with `duplicateStrategy = skip`
- **THEN** the result reports `skipped: 1` and `created: 0`
- **AND** committing again with `duplicateStrategy = update` reports `updated: 1`

#### Scenario: Range selection
- **GIVEN** a spreadsheet with sheets `mayo` and `junio`
- **WHEN** the admin previews with `range = junio`
- **THEN** only the rows of `junio` are read

### Requirement: Sheet read failures are reported clearly
When the spreadsheet cannot be read (not shared, not found, invalid range, API error) preview and commit SHALL fail with `400` and a message describing the cause, without partial commits.

#### Scenario: Not shared at commit time
- **GIVEN** a sheet that is not shared with the service account
- **WHEN** the admin commits it
- **THEN** the response is `400` mentioning access
- **AND** no rows are imported

### Requirement: Web offers the sheet import
The import page SHALL show a "Desde Google Sheets" section with spreadsheet id and sheet/range inputs, a status check, preview and commit actions reusing the existing result tables and options; when the backend reports `configured: false` the section SHALL explain that the integration is not configured and keep the file import available.

#### Scenario: Not configured in the UI
- **GIVEN** the backend reports `configured: false`
- **WHEN** the admin opens the import page
- **THEN** the sheet section shows an explanation and disabled actions
- **AND** the file import works

#### Scenario: Preview from the UI
- **GIVEN** the backend is configured and the sheet is readable
- **WHEN** the admin enters the spreadsheet id and clicks preview
- **THEN** the same preview table as the file flow is shown with warnings and errors
