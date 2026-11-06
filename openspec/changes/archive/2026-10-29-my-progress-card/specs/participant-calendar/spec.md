## ADDED Requirements

### Requirement: Dashboard shows the progress toward the minimum
For the selected `ACTIVE` challenge, when the caller is enrolled and both their own ranking row and
their calendar are loaded, the dashboard SHALL show a card "Mi avance". It SHALL be computed in the
web, without any new API call, from the caller's ranking row (`validatedDays`, `pendingDays`,
`score`, `qualified`), the challenge's `minValidatedDaysToQualify` and the caller's calendar. With
`target` the greater of the minimum and 1, `missing` the days of `target` not yet validated,
`pending` the row's pending days and `open` the calendar days with `valid` true and no activity or a
rejected one, the card SHALL show "Validados: <validated> de <target>", a progress bar with those
values, and exactly one message, chosen in this order:

- when the row is `qualified`: "Ya alcanzas el mínimo; se confirma al cierre.";
- when the validated days reach `target` but the row is not qualified: "Alcanzas el mínimo de días,
  pero tu puntaje todavía es 0; se confirma al cierre.";
- when `missing` is at most `pending + open`: "Te faltan <missing> días validados para el mínimo;
  aún puedes llegar." followed by "Tienes <pending> pendientes de validar y <open> días válidos sin
  registrar en el período.";
- otherwise: "Con los días que quedan no alcanzarías el mínimo de <target> días validados. Cada
  actividad sigue sumando puntos."

Counts of 1 SHALL use the singular ("1 día validado", "1 pendiente", "1 día válido"). When the
challenge does not use the default scoring the card SHALL also show "Tu puntaje: <score> pts". The
card MUST NOT state that the caller qualifies or wins before the close. When the challenge is not
`ACTIVE`, the caller is not enrolled, or the row or the calendar is not available, the card SHALL
not be shown and the rest of the dashboard SHALL behave as before.

#### Scenario: Minimum reached
- **GIVEN** an active challenge with `minValidatedDaysToQualify = 3` and the participant's row with 3 validated days and `qualified: true`
- **WHEN** they open "Mi reto"
- **THEN** "Mi avance" shows "Validados: 3 de 3" and "Ya alcanzas el mínimo; se confirma al cierre."

#### Scenario: Still reachable
- **GIVEN** a minimum of 12, the row with 8 validated days and 1 pending, and 9 valid days without activity in the calendar
- **WHEN** the participant opens "Mi reto"
- **THEN** the card shows "Validados: 8 de 12", "Te faltan 4 días validados para el mínimo; aún puedes llegar." and "Tienes 1 pendiente de validar y 9 días válidos sin registrar en el período."

#### Scenario: A rejected day still counts as open
- **GIVEN** a minimum of 3, 1 validated day, no pending activity, 1 valid day without activity and 1 valid day with a rejected activity
- **WHEN** the participant opens "Mi reto"
- **THEN** the card shows "Te faltan 2 días validados para el mínimo; aún puedes llegar."

#### Scenario: Out of reach
- **GIVEN** a minimum of 12, the row with 5 validated days and none pending, and 3 valid days without activity
- **WHEN** the participant opens "Mi reto"
- **THEN** the card shows "Con los días que quedan no alcanzarías el mínimo de 12 días validados. Cada actividad sigue sumando puntos."

#### Scenario: Default minimum of zero
- **GIVEN** a challenge with `minValidatedDaysToQualify = 0` and a participant with no validated activity
- **WHEN** they open "Mi reto"
- **THEN** the card shows "Validados: 0 de 1" and "Te falta 1 día validado para el mínimo; aún puedes llegar." while valid days remain open

#### Scenario: Days reached with a score of zero
- **GIVEN** a challenge with 0 points per validated day, 1 point per km and a minimum of 2, and a participant with 2 validated activities without kilometres
- **WHEN** they open "Mi reto"
- **THEN** the card shows "Alcanzas el mínimo de días, pero tu puntaje todavía es 0; se confirma al cierre." and "Tu puntaje: 0 pts"

#### Scenario: Not enrolled or no row
- **GIVEN** an admin who is not enrolled in the selected challenge, or results that failed to load
- **WHEN** they open "Mi reto"
- **THEN** no "Mi avance" card is shown and the rest of the dashboard is unchanged

### Requirement: The web qualification rule matches the server
The rule the web uses to tell whether a number of validated days and a score qualify SHALL be the
same as the server's (`validatedDays >= minValidatedDaysToQualify` and `score > 0`). One table of
cases SHALL be checked by both the server unit tests against the server rule and the web unit tests
against the web rule, so that changing one rule without the other fails the tests.

#### Scenario: Parity table
- **GIVEN** the shared table with cases for minimum 0, minimum 10 with 9, 10 and 11 validated days, and a reached minimum with score 0
- **WHEN** the server and the web unit tests run
- **THEN** both rules give the `qualified` value of every case
