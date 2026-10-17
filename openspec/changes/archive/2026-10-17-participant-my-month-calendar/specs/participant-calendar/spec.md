## ADDED Requirements

### Requirement: Participants read their own challenge calendar
`GET /activities/me/calendar?challengeId=<uuid>` SHALL return, for the authenticated caller only,
the challenge `challengeId`, `status`, `startDate`, `endDate` and `validDays`, a `days` array with
one entry per calendar day from `startDate` to `endDate` inclusive, in ascending order, and a
`summary`. Every date SHALL be a `YYYY-MM-DD` string. Each day SHALL carry `date`, `valid` and
`activity`: the caller's activity of that day in that challenge with exactly `id`, `status`,
`exerciseType`, `durationMinutes`, `distanceKm`, `heartRateMinutes`, `heartRateCompliant` and
`rejectionReason`, or `null`. `summary` SHALL carry `validDaysTotal` (days with `valid`),
`registered` (days with an activity), `validated`, `pending` and `rejected`, all counted over
`days`. The response MUST NOT contain any field that depends on the current date. `challengeId`
SHALL be required and a UUID (`400` otherwise); an unknown challenge SHALL return `404` "Reto no
encontrado"; a caller not enrolled in the challenge SHALL get `403` "No participas en este reto".
The endpoint SHALL answer for challenges in any status and SHALL NOT write anything.

#### Scenario: Calendar of an active challenge
- **GIVEN** an active challenge from 2025-10-01 to 2025-10-31 with `validDays = [1,2,3,4,5,6]`
- **AND** an enrolled participant with a validated activity on 2025-10-06 and a pending one on 2025-10-07
- **WHEN** the participant calls `GET /activities/me/calendar?challengeId=<id>`
- **THEN** `days` has 31 entries from `2025-10-01` to `2025-10-31`
- **AND** the entry of `2025-10-05` (a Sunday) has `valid: false` and `activity: null`
- **AND** the entry of `2025-10-06` has `valid: true` and an activity with `status: VALIDATED` and `heartRateCompliant`
- **AND** `summary` is `validDaysTotal: 27`, `registered: 2`, `validated: 1`, `pending: 1`, `rejected: 0`

#### Scenario: Rejected activity
- **GIVEN** the participant's activity of 2025-10-08 was rejected with a reason
- **WHEN** they read their calendar
- **THEN** that day's activity has `status: REJECTED` and the `rejectionReason`

#### Scenario: Not enrolled
- **WHEN** a participant who is not enrolled in the challenge reads its calendar
- **THEN** the response is `403` "No participas en este reto"

#### Scenario: Unknown or missing challenge
- **WHEN** a participant reads the calendar of a challenge id that does not exist
- **THEN** the response is `404`
- **AND** without `challengeId`, or with a value that is not a UUID, the response is `400`

#### Scenario: Closed challenge
- **GIVEN** a `COMPLETED` challenge where the participant has activities
- **WHEN** they read its calendar
- **THEN** the response is `200` with `status: COMPLETED` and the same days and activities as before closing

### Requirement: Calendar validity follows the registration rules
A day's `valid` SHALL be true exactly when `POST /activities` would accept that date for the
challenge on the period and weekday rules, and SHALL be computed by the same server functions that
registration uses. The web MUST NOT decide whether a day is valid from `validDays` or the period on
its own; it SHALL read `valid` from the calendar. An activity on a day whose `valid` is false (the
weekdays or the period were edited after it was registered, or it was imported) SHALL stay on its
day and be counted; an activity outside the current period SHALL be omitted from `days` and
`summary`.

#### Scenario: Valid day matches registration
- **GIVEN** a day with `valid: true` and no activity in an active challenge
- **WHEN** the participant registers a compliant activity for that date
- **THEN** the request is accepted with `201`

#### Scenario: Rest day matches registration
- **GIVEN** a day with `valid: false` inside the period
- **WHEN** the participant registers an activity for that date
- **THEN** the request is rejected with `400` "Ese día de la semana no es válido para este reto"

#### Scenario: Valid days edited after registering
- **GIVEN** a pending activity on a Saturday
- **AND** the admin then removes Saturday from `validDays`
- **WHEN** the participant reads the calendar
- **THEN** that Saturday has `valid: false` and still carries the activity
- **AND** `summary.registered` and `summary.pending` count it

### Requirement: The calendar only exposes the caller's own data
The calendar SHALL be built from the JWT subject only and SHALL NOT accept a user identifier. It
MUST NOT contain other participants' activities, names, emails, payment data, photos or the
validator's identity, for any role.

#### Scenario: Two participants on the same day
- **GIVEN** participants A and B are enrolled in the same challenge and both registered 2025-10-06
- **WHEN** A reads the calendar
- **THEN** the 2025-10-06 activity is A's own activity id
- **AND** no entry contains B's data

#### Scenario: Extra query parameter
- **WHEN** a participant calls the calendar with `userId=<another participant>` added to the query
- **THEN** the response is `400` and contains no calendar data

### Requirement: Dashboard shows today's duty
For the selected active challenge, when the caller is enrolled, the dashboard SHALL use the
calendar entry of the user's local calendar day and show: "Hoy ya está" with the activity status
when today has an activity; the banner "Hoy es día válido y aún no registraste tu actividad" with
a "Registrar hoy" link to the upload form prefilled with today when today is valid and open;
"Hoy es día de descanso" without a register link when today is not valid; "El reto empieza el
<día>" before the period and "El período del reto terminó" after it, without a register link. While
the calendar is loading or unavailable, the dashboard SHALL keep the previous behaviour. The
calendar SHALL refresh after the participant registers or withdraws an activity.

#### Scenario: Valid day without activity
- **GIVEN** today is a valid day of the selected challenge and the participant has not registered it
- **WHEN** they open the dashboard
- **THEN** the banner "Hoy es día válido y aún no registraste tu actividad" is visible
- **AND** "Registrar hoy" opens the upload form with today's date

#### Scenario: Rest day
- **GIVEN** today is not a valid day of the selected challenge
- **WHEN** the participant opens the dashboard
- **THEN** "Hoy es día de descanso" is shown and there is no "Registrar hoy" link

#### Scenario: Already registered
- **GIVEN** the participant registered today's activity and it is pending
- **WHEN** they open the dashboard
- **THEN** "Hoy ya está" is shown with the pending status and there is no banner

#### Scenario: Before the period
- **GIVEN** today is before the challenge's `startDate`
- **WHEN** the participant opens the dashboard
- **THEN** "El reto empieza el <día>" is shown without a register link

### Requirement: Upload form hints the chosen date
The upload form SHALL limit the date input to the period and to today (`min` = `startDate`,
`max` = the earlier of `endDate` and today), SHALL prefill the date from a `date` query parameter
when it is a day of the calendar (today otherwise), and SHALL show, from the calendar entry of the
chosen date, "Ese día es de descanso en este reto", "La fecha está fuera del período del reto" or
"Ya registraste una actividad para ese día", disabling the submit button while the hint is shown.
Without calendar data the form SHALL behave as before and the API SHALL keep validating every rule.

#### Scenario: Prefilled from the dashboard
- **WHEN** the participant opens `/dashboard/upload?date=2025-10-09` and that day is in the calendar
- **THEN** the date input shows 2025-10-09

#### Scenario: Rest day chosen
- **WHEN** the participant picks a day whose calendar entry has `valid: false`
- **THEN** "Ese día es de descanso en este reto" is shown under the date
- **AND** the submit button is disabled

#### Scenario: Day already registered
- **WHEN** the participant picks a day that already has their activity
- **THEN** "Ya registraste una actividad para ese día" is shown and the submit button is disabled

### Requirement: "Mi mes" grid shows each day's state
The dashboard SHALL show a "Mi mes" section for the selected active challenge when the caller is
enrolled: a grid of the challenge period in weeks starting on Monday, where each day of the period
shows one state derived from its calendar entry and the user's local day: validated, pending or
rejected (from its activity), rest (not valid), missed (valid, past, no activity), today open
(valid, today, no activity) or future (valid, after today, no activity). Each state SHALL be
conveyed by a glyph and a text besides its colour, and a legend SHALL list them. When the challenge
is `ACTIVE`, a missed or today-open day SHALL link to the upload form prefilled with that date and
a day with an activity SHALL link to its row in "Mis actividades"; rest and future days SHALL NOT be
interactive. The section SHALL show "X de Y días válidos registrados" from `summary`.

#### Scenario: States of a month
- **GIVEN** a challenge from 2025-10-01 to 2025-10-31, today is 2025-10-15 for the user
- **AND** the participant has a validated activity on 10-06, a pending one on 10-07, a rejected one on 10-08 and nothing on 10-09
- **WHEN** they open the dashboard
- **THEN** 10-06 is "Validado", 10-07 "Pendiente", 10-08 "Rechazado", 10-09 "Sin registro", 10-12 "Descanso", 10-15 "Hoy" and 10-16 a future day
- **AND** the legend lists every state

#### Scenario: Registering a missed day from the grid
- **WHEN** the participant activates the missed day 2025-10-09
- **THEN** the upload form opens with 2025-10-09 selected

#### Scenario: Day with an activity
- **WHEN** the participant activates the rejected day 2025-10-08
- **THEN** the page moves to that activity's row in "Mis actividades", which shows the rejection reason

### Requirement: Streak and counts are display-only
The "Mi mes" section SHALL show the current streak: walking back from the user's local day over
valid days, the number of consecutive days with a `PENDING` or `VALIDATED` activity, where today
without an activity does not end it, a rejected or missed valid day ends it, and rest days are
skipped. The streak and the counts MUST NOT be sent to or used by the API, the score, the ranking
or the winners.

#### Scenario: Streak across a rest day
- **GIVEN** validated activities on Friday and Saturday, Sunday is a rest day, a pending activity on Monday, and today is Tuesday without activity
- **WHEN** the participant opens the dashboard
- **THEN** the streak is 3

#### Scenario: Rejected day ends the streak
- **GIVEN** a rejected activity yesterday and validated activities before it
- **WHEN** the participant opens the dashboard
- **THEN** the streak counts only the days after the rejected one

### Requirement: The calendar works on phones and with assistive technology
The grid SHALL be a table with a caption and weekday column headers, each day SHALL have an
accessible name with its full date and state, today SHALL carry `aria-current="date"`, and its
links SHALL be reachable with the keyboard. At a 375 px wide viewport the grid SHALL fit without
horizontal page scroll, with day cells of at least 40 px, using the `web-theme` tokens in both the
light and dark themes.

#### Scenario: Phone width
- **GIVEN** a 375 px wide viewport
- **WHEN** the participant opens the dashboard
- **THEN** the seven columns are visible and the page has no horizontal scroll

#### Scenario: Screen reader name
- **WHEN** an assistive technology reads the cell of a validated Monday 6 October
- **THEN** its name includes "lunes 6 de octubre" and "validado"
