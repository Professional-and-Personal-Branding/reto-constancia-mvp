# challenge-renewal Specification

## Purpose
Let an admin preview and create next month's challenge from an existing one, copying only its rules (and optionally its active participants) and never payments, proofs, activities or awards.

## Requirements

### Requirement: Admins preview the renewal of a challenge
`GET /challenges/:id/renewal-preview` SHALL be available only to admins and SHALL NOT modify
anything. For an `ACTIVE` or `COMPLETED` challenge it SHALL return:
- `source`: `id`, `name`, `month`, `year` and `status` of the challenge;
- `target`: the month after the source (December of year Y is followed by January of Y+1), its year,
  the suggested name "Reto <Mes> <AAAA>" with the Spanish month name, and `startDate` and `endDate`
  as `YYYY-MM-DD`: the first and the last calendar day of the target month;
- `rules`: the rules that a renewal copies (see "Renewal copies only the rules") plus `budgetMode`
  (`auto` when `budgetTotal` is `null`, otherwise `manual`);
- `participants`: `toCopy`, the source's participants whose user is active, with `userId`, `name`
  and `email`; and `skipped`, the source's participants whose user is inactive, with the same fields
  plus `reason` `INACTIVE` and `message` "El usuario está inactivo";
- `existing`: `id`, `name` and `status` of the challenge that already has the target month and year,
  or `null`.

A `DRAFT` challenge MUST answer `400` "Solo se puede renovar un reto activo o cerrado", an unknown
challenge `404` "Reto no encontrado" and a participant `403`.

#### Scenario: Preview of an active challenge
- **GIVEN** challenge "Reto Octubre 2026" (10/2026) is `ACTIVE` with Ana and Bea active and Luis
  inactive, and no challenge exists for 11/2026
- **WHEN** an admin requests its renewal preview
- **THEN** `target` is month 11, year 2026, name "Reto Noviembre 2026", from "2026-11-01" to
  "2026-11-30"
- **AND** `participants.toCopy` lists Ana and Bea, `participants.skipped` lists Luis with
  `INACTIVE`, and `existing` is `null`

#### Scenario: December rolls over to January
- **WHEN** an admin requests the renewal preview of the 12/2026 challenge
- **THEN** `target` is month 1 of 2027, from "2027-01-01" to "2027-01-31"

#### Scenario: Leap February
- **WHEN** an admin requests the renewal preview of the 1/2028 challenge
- **THEN** `target.endDate` is "2028-02-29"

#### Scenario: Target month already taken
- **GIVEN** a challenge already exists for 11/2026 in `DRAFT`
- **WHEN** an admin requests the renewal preview of the 10/2026 challenge
- **THEN** `existing` names that challenge with status `DRAFT`

#### Scenario: Draft source
- **WHEN** an admin requests the renewal preview of a `DRAFT` challenge
- **THEN** the response is `400` "Solo se puede renovar un reto activo o cerrado"

#### Scenario: Read-only
- **WHEN** an admin requests the renewal preview twice
- **THEN** no challenge and no enrolment is created and the source is unchanged

### Requirement: Renewal creates next month's challenge as a draft
`POST /challenges/:id/renew` SHALL be available only to admins and SHALL accept an optional `name`
(a non-blank string, stored trimmed) and an optional boolean `copyParticipants` (default `false`);
unknown keys MUST be rejected with `400`. For an `ACTIVE` or `COMPLETED` source it SHALL create one
challenge for the target month defined by the renewal preview, with status `DRAFT`, the given name or
the suggested one, the computed `startDate` and `endDate`, and the source's rules. It SHALL answer
`201` with `challenge` (the created challenge) and `participants` with `enrolled` and `skipped` (both
empty when `copyParticipants` is not true). The source challenge MUST NOT change. The new challenge
SHALL become `ACTIVE` only through the existing activation rule. A `DRAFT` source MUST answer `400`
"Solo se puede renovar un reto activo o cerrado", an unknown source `404` "Reto no encontrado" and a
participant `403`, with nothing created.

#### Scenario: Renewing without copying participants
- **GIVEN** the 10/2026 challenge is `ACTIVE` and no challenge exists for 11/2026
- **WHEN** an admin renews it with `{}`
- **THEN** the response is `201` with a `DRAFT` challenge for 11/2026 named "Reto Noviembre 2026",
  from 2026-11-01 to 2026-11-30
- **AND** it has no participants and `participants.enrolled` is empty
- **AND** the 10/2026 challenge keeps its status, rules and roster

#### Scenario: Renewing a closed challenge with a custom name
- **GIVEN** the 9/2026 challenge is `COMPLETED` and no challenge exists for 10/2026
- **WHEN** an admin renews it with `{ "name": "  Reto Primavera  " }`
- **THEN** the created challenge is named "Reto Primavera" and is `DRAFT`
- **AND** the 9/2026 challenge stays `COMPLETED` with its results and awards unchanged

#### Scenario: Activating the renewed challenge
- **GIVEN** a challenge created by a renewal
- **WHEN** an admin activates it
- **THEN** it becomes `ACTIVE` under the same rules as any other activation

#### Scenario: Blank name
- **WHEN** an admin renews a challenge with `{ "name": "   " }`
- **THEN** the response is `400` and nothing is created

#### Scenario: Participant tries to renew
- **WHEN** a participant calls `POST /challenges/:id/renew`
- **THEN** the response is `403` and nothing is created

### Requirement: Renewal copies only the rules
The renewed challenge SHALL take from the source exactly `validDays`, `minHeartRateMinutes`,
`feePerParticipant`, `budgetTotal` (a `null`, automatic budget stays automatic; a manual amount is
copied as is), `currency`, `prizeDescription`, `pointsPerValidatedDay`, `pointsPerKm`,
`minValidatedDaysToQualify`, `maxWinners` and `tiebreakRule`. It MUST NOT take the source's status,
activities, imported rows, awards, results, payments or payment proofs.

#### Scenario: Rules are copied
- **GIVEN** a source with valid days Monday to Friday, 25 heart-rate minutes, a fee of 150 USD, an
  automatic budget, prize "Zapatillas", 2 points per validated day, 0.5 points per km, 10 days to
  qualify, 3 winners and `TOTAL_KM`
- **WHEN** an admin renews it
- **THEN** the new challenge has exactly those rules and an automatic budget

#### Scenario: Nothing else is copied
- **GIVEN** a `COMPLETED` source with validated activities, stored awards and paid participants
- **WHEN** an admin renews it with `copyParticipants: true`
- **THEN** the new challenge has no activities and no awards
- **AND** its financial summary reports nothing collected

### Requirement: Renewal can copy the active roster with a clean payment state
When `copyParticipants` is true, the renewal SHALL enrol in the new challenge every participant of
the source whose user is active, following the enrolment rule of `challenge-enrollment`, each with
no payment recorded (`paid = false`, no `paidAt`, no `amountPaid`) and no payment proof. Participants
whose user is inactive SHALL NOT be enrolled and SHALL be reported in `participants.skipped` with
`reason` `INACTIVE` and `message` "El usuario está inactivo"; the enrolled ones SHALL be reported in
`participants.enrolled` with `userId`, `name` and `email`.

#### Scenario: Copying the roster
- **GIVEN** a source where Ana paid 120, Bea uploaded a proof and Luis is inactive
- **WHEN** an admin renews it with `copyParticipants: true`
- **THEN** Ana and Bea are enrolled in the new challenge, both unpaid and without a proof
- **AND** Luis is reported in `participants.skipped` with `INACTIVE` and is not enrolled
- **AND** the source still shows Ana's payment and Bea's proof

### Requirement: Renewal is atomic and never duplicates a month
The renewal SHALL create the challenge and its copied enrolments in one transaction: either both are
committed or nothing is. If a challenge already exists for the target month and year, or another
renewal or creation commits it first, the request MUST answer `409` with `message` "Ya existe un reto
para M/AAAA" and `existingChallengeId`, the id of the challenge that has that month, and MUST NOT
create a challenge or enrol anyone, in the new or in the existing challenge. The constraint of one
challenge per month and year SHALL remain.

#### Scenario: Renewing twice
- **GIVEN** an admin renewed the 10/2026 challenge and the 11/2026 draft exists
- **WHEN** the admin renews the 10/2026 challenge again with `copyParticipants: true`
- **THEN** the response is `409` "Ya existe un reto para 11/2026" with `existingChallengeId` of the
  11/2026 challenge
- **AND** there is still one 11/2026 challenge and its roster is unchanged

#### Scenario: Two renewals at the same time
- **WHEN** two admins renew the 10/2026 challenge at the same time
- **THEN** exactly one 11/2026 challenge exists
- **AND** one request answers `201` and the other `409` with `existingChallengeId`

#### Scenario: Failure while copying the roster
- **WHEN** the enrolment copy fails inside the renewal transaction
- **THEN** no 11/2026 challenge exists and nobody is enrolled

### Requirement: Admins renew a challenge from the web after a preview
The admin challenge list SHALL offer "Renovar" on `ACTIVE` and `COMPLETED` challenges and not on
`DRAFT` ones. "Renovar" SHALL open a dialog built from the renewal preview that shows the target
month and period, a summary of the copied rules (marking a manual budget as "ajustado" with its
amount), a name field prefilled with the suggested name, a checkbox "Inscribir a los N participantes
activos de <reto>" that starts checked and lists the people to copy and the inactive ones that will
not be copied, and the note "No se copian pagos, comprobantes, actividades ni premiaciones. El reto
nace en borrador: revísalo y actívalo cuando corresponda." When the target month is already taken the
dialog SHALL say "Ya existe un reto para <Mes AAAA>" with its status and the confirm button MUST be
disabled. Confirming SHALL send the name and the checkbox value; on success the dialog closes, the
list shows the new challenge as a draft and a status message says "<nombre> creado en borrador con
N inscritos". Any failed request SHALL show the API message inside the dialog.

#### Scenario: Renew from the list
- **GIVEN** the 10/2026 challenge is `ACTIVE` with two active participants and 11/2026 is free
- **WHEN** the admin presses "Renovar", keeps the suggested name and the checkbox, and confirms
- **THEN** the list shows "Reto Noviembre 2026" as a draft with 2 participants
- **AND** the page says "Reto Noviembre 2026 creado en borrador con 2 inscritos"

#### Scenario: Month already taken
- **GIVEN** a challenge already exists for 11/2026
- **WHEN** the admin presses "Renovar" on the 10/2026 challenge
- **THEN** the dialog says "Ya existe un reto para Noviembre 2026" and the confirm button is disabled

#### Scenario: Draft row
- **WHEN** the admin opens the challenge list
- **THEN** a `DRAFT` challenge offers no "Renovar"

#### Scenario: Server error
- **WHEN** confirming answers `409` or `400`
- **THEN** the dialog shows the API message and nothing is added to the list
