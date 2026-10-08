## ADDED Requirements

### Requirement: A closed challenge can be exported as a CSV record
The system SHALL let an admin download a CSV record of a `COMPLETED` challenge with one row per
participant, in ranking order. Each row SHALL carry the challenge name, period, currency, fee and
pot, the participant's position, name and email, validated, pending and rejected days, km, score,
whether they qualified, payment state, amount paid and payment date, whether they won, the award
note and the prize amount. Winners SHALL be the participants with a stored award. The export
MUST NOT change any data, and MUST NOT include payment proof links.

#### Scenario: Closed challenge
- **GIVEN** a `COMPLETED` challenge with three participants, one of them awarded by the
  automatic draw
- **WHEN** an admin requests `GET /api/challenges/:id/export?format=csv`
- **THEN** the response is `200` with `text/csv; charset=utf-8`
- **AND** the file has a header and three rows in ranking order
- **AND** only the awarded participant has `ganador` set to `si`, with the award note and the
  prize amount

#### Scenario: Payment columns
- **GIVEN** a participant who paid in full, one who paid part of the fee and one who did not pay
- **WHEN** the challenge is exported
- **THEN** their payment states are `pagado`, `parcial` and `pendiente`
- **AND** the amounts and payment dates match the finance panel

#### Scenario: Empty challenge
- **GIVEN** a `COMPLETED` challenge without participants
- **WHEN** an admin exports it
- **THEN** the file contains only the header line

### Requirement: Only admins can export, and only closed challenges
The export SHALL require an admin. A participant SHALL receive `403`. A challenge that is
`DRAFT` or `ACTIVE` SHALL be rejected with `400`, a missing one with `404`, and any `format`
other than `csv` with `400`.

#### Scenario: Participant
- **WHEN** a participant requests the export
- **THEN** the response is `403`

#### Scenario: Active challenge
- **GIVEN** an `ACTIVE` challenge
- **WHEN** an admin requests the export
- **THEN** the response is `400` and no file is returned

### Requirement: The file is safe to open in a spreadsheet
The file SHALL be UTF-8 with a byte order mark, comma separated, with `CRLF` line ends, and SHALL
quote cells that contain commas, quotes or line breaks. A text cell that starts with `=`, `+`,
`-`, `@`, a tab or a carriage return SHALL be neutralised so a spreadsheet cannot run it as a
formula. The download name SHALL be `acta-reto-YYYY-MM.csv` and MUST NOT come from user-provided
text.

#### Scenario: Name that looks like a formula
- **GIVEN** a participant registered with a name that starts with `=`
- **WHEN** the challenge is exported
- **THEN** that cell starts with an apostrophe and is quoted, so it is read as text

#### Scenario: Accents and commas
- **GIVEN** a participant named `Pérez, José`
- **WHEN** the challenge is exported
- **THEN** the name is quoted, keeps its accents and opens correctly in a spreadsheet

### Requirement: The web offers the export to admins on closed challenges
The ranking page SHALL show a "Descargar acta (CSV)" action only to an admin who selected a
closed challenge. Participants and active challenges SHALL NOT see it. A failed download SHALL
show the error next to the action.

#### Scenario: Admin on a closed challenge
- **WHEN** an admin selects a closed challenge in the ranking
- **THEN** the button is visible and downloads `acta-reto-YYYY-MM.csv`

#### Scenario: Participant
- **WHEN** a participant opens the ranking of a closed challenge
- **THEN** there is no export action
