## ADDED Requirements

### Requirement: Only existing, active users are enrolled, once per challenge
Enrolling a user in a challenge, by the single enrolment endpoint, the bulk enrolment endpoint or a
renewal, SHALL only be possible for a user that exists and has `active = true`, and a user SHALL be
enrolled at most once per challenge. Only admins MAY enrol users. The single
`POST /challenges/:id/participants` SHALL answer, in this order: `404` "Reto no encontrado" for an
unknown challenge, `404` "Usuario no encontrado" for an unknown user, `400` "El usuario está
inactivo" for an inactive user, `400` "No se puede modificar un reto cerrado" for a `COMPLETED`
challenge, and `409` "El usuario ya participa en este reto" when the user is already enrolled. A
rejected enrolment MUST NOT change the roster.

#### Scenario: Enrolling an inactive user
- **GIVEN** a `DRAFT` or `ACTIVE` challenge and a user with `active = false`
- **WHEN** an admin enrols that user with `POST /challenges/:id/participants`
- **THEN** the response is `400` "El usuario está inactivo"
- **AND** the user is not enrolled

#### Scenario: Enrolling an active user
- **GIVEN** an `ACTIVE` challenge and an active user not enrolled
- **WHEN** an admin enrols that user
- **THEN** the response is `201` and the user appears in the roster with no payment recorded

#### Scenario: Enrolling twice
- **GIVEN** a user already enrolled in the challenge
- **WHEN** an admin enrols that user again
- **THEN** the response is `409` "El usuario ya participa en este reto"

#### Scenario: Participant tries to enrol someone
- **WHEN** a participant calls `POST /challenges/:id/participants`
- **THEN** the response is `403`

### Requirement: Admins enrol several users in one request
`POST /challenges/:id/participants/bulk` SHALL be available only to admins and SHALL accept
`{ userIds }`, an array of 1 to 200 UUIDs; an empty array, more than 200 ids, an id that is not a
UUID or an unknown key MUST be rejected with `400` and nothing enrolled. Repeated ids SHALL be
treated as one. The endpoint SHALL answer `200` with exactly `enrolled`, `alreadyEnrolled` and
`skipped`:
- `enrolled` and `alreadyEnrolled` list `{ userId, name, email }` of the users enrolled by this
  request and of those that were already enrolled;
- `skipped` lists `{ userId, reason, message }` with `reason` `NOT_FOUND` and `message` "Usuario no
  encontrado" for an unknown user, or `reason` `INACTIVE` and `message` "El usuario está inactivo"
  for an inactive user.

Every distinct requested id SHALL appear in exactly one of the three lists. A skipped or already
enrolled user MUST NOT prevent the others from being enrolled, and every enrolled user SHALL start
with no payment recorded and no payment proof. Repeating the same request SHALL enrol nobody new and
report those users as `alreadyEnrolled`. An unknown challenge SHALL answer `404` "Reto no
encontrado".

#### Scenario: Mixed list
- **GIVEN** an `ACTIVE` challenge where Ana is already enrolled, Bea and Carla are active and not
  enrolled, Luis is inactive, and an id that matches no user
- **WHEN** an admin sends those five ids to the bulk endpoint
- **THEN** the response is `200` with Bea and Carla in `enrolled`, Ana in `alreadyEnrolled`, Luis in
  `skipped` with `INACTIVE` and the unknown id in `skipped` with `NOT_FOUND`
- **AND** the roster has Ana, Bea and Carla, with Bea and Carla unpaid and without a proof

#### Scenario: Repeating the request
- **GIVEN** the previous bulk request succeeded
- **WHEN** the admin sends the same request again
- **THEN** `enrolled` is empty, Ana, Bea and Carla are in `alreadyEnrolled` and the roster is unchanged

#### Scenario: Repeated ids in one request
- **WHEN** an admin sends the id of Bea twice
- **THEN** Bea appears once in `enrolled` and is enrolled once

#### Scenario: Invalid request
- **WHEN** an admin sends an empty `userIds`, 201 ids, or an id that is not a UUID
- **THEN** the response is `400` and nobody is enrolled

#### Scenario: Participant calls the bulk endpoint
- **WHEN** a participant calls `POST /challenges/:id/participants/bulk`
- **THEN** the response is `403` and nobody is enrolled

### Requirement: Bulk enrolment is serialized with closing
The bulk enrolment SHALL run in one transaction that first locks the challenge row as every other
enrolment does and re-reads its status. If the status read under the lock is `COMPLETED`, the whole
request MUST answer `400` "No se puede modificar un reto cerrado" and enrol nobody. A request that
waits more than 5 seconds for the lock MUST answer `409` "El reto se está cerrando; vuelve a
intentarlo en unos segundos" and enrol nobody. Enrolling in a `DRAFT` or `ACTIVE` challenge SHALL be
allowed.

#### Scenario: Closed challenge
- **GIVEN** a `COMPLETED` challenge
- **WHEN** an admin sends three active users to the bulk endpoint
- **THEN** the response is `400` "No se puede modificar un reto cerrado" and the roster is unchanged

#### Scenario: Bulk enrolment racing the close
- **WHEN** a bulk enrolment and a close of the same challenge run at the same time
- **THEN** either the enrolments are committed before the close or the request answers `400`
- **AND** no enrolment is ever committed after the close

#### Scenario: Draft challenge
- **GIVEN** a `DRAFT` challenge
- **WHEN** an admin sends two active users to the bulk endpoint
- **THEN** both are enrolled

### Requirement: Admins select several candidates in the participants page
The "Agregar participante" card of the admin participants page SHALL list the same candidates as
before (active participants not enrolled in the selected challenge) with a checkbox each, labelled
with the person's name, a "Seleccionar todos" control and an "Inscribir seleccionados (N)" button
that is disabled when nothing is selected or while the request is pending. Pressing it SHALL send the
selected users in one bulk request and then show a status message with the outcome: the number of
users enrolled, the number already enrolled and each skipped user with the reason ("usuario
inactivo" or "usuario no encontrado"). After the request the selection SHALL be cleared, the roster
and the financial summary SHALL be refreshed, and an API error SHALL be shown with its message. The
per-row "+ Inscribir" action SHALL keep enrolling one user.

#### Scenario: Enrol three people at once
- **GIVEN** the participants page of an active challenge with four candidates
- **WHEN** the admin ticks three of them and presses "Inscribir seleccionados (3)"
- **THEN** the page says "3 inscritos"
- **AND** the three appear under "Inscritos" and are no longer candidates
- **AND** the financial summary counts them as unpaid

#### Scenario: Select all
- **WHEN** the admin presses "Seleccionar todos"
- **THEN** every candidate is ticked and the button reads "Inscribir seleccionados (N)" with N the
  number of candidates

#### Scenario: Nothing selected
- **WHEN** no candidate is ticked
- **THEN** "Inscribir seleccionados" is disabled

#### Scenario: Someone was deactivated meanwhile
- **GIVEN** the admin ticked Luis, who was deactivated after the page loaded
- **WHEN** the admin presses the button
- **THEN** the status message lists Luis as omitted with "usuario inactivo" and the others as enrolled
