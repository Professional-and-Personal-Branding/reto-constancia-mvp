## ADDED Requirements

### Requirement: Import never writes into a closed challenge
For both the file import and the sheet import, the preview SHALL mark every row whose challenge is
`COMPLETED` as invalid with "El reto M/AAAA está cerrado; no se pueden importar actividades". The
commit SHALL re-check the status of each row under the challenge lock and report those rows in
`errors` without creating user accounts, participants or activities, and without counting them in
the summary.

#### Scenario: Preview with a closed challenge
- **GIVEN** three rows of a `COMPLETED` challenge and two rows of an `ACTIVE` one
- **WHEN** the admin previews the import
- **THEN** `summary.invalid = 3`, `summary.valid = 2` and each row of the closed challenge shows the message

#### Scenario: Update strategy against a closed challenge
- **GIVEN** an activity that already exists in a `COMPLETED` challenge
- **WHEN** the admin commits a row for it with `duplicateStrategy = update`
- **THEN** the activity is unchanged and the row is reported in `errors`

#### Scenario: Closed between preview and commit
- **GIVEN** a row previewed as valid
- **WHEN** its challenge closes before the commit
- **THEN** the commit reports it in `errors`

#### Scenario: No accounts for closed challenges
- **GIVEN** a row for a person without an account and a `COMPLETED` challenge
- **WHEN** the admin commits it
- **THEN** no account is created and `usersCreated` does not count it
