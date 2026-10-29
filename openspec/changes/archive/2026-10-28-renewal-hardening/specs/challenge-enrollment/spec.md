## MODIFIED Requirements

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

A user SHALL be reported in `enrolled` only by the request whose insert created that enrolment,
decided from the rows that insert actually created and never from timestamps. When several requests
enrol the same user at the same time, the user SHALL be enrolled once and SHALL appear in `enrolled`
of exactly one response and in `alreadyEnrolled` of the others.

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

#### Scenario: Two bulk requests at the same time
- **GIVEN** an `ACTIVE` challenge where Bea, Carla and Diego are active and not enrolled
- **WHEN** two admins send Bea, Carla and Diego to the bulk endpoint at the same time
- **THEN** each of them is enrolled once
- **AND** each of them appears in `enrolled` of exactly one response and in `alreadyEnrolled` of the
  other, even if both inserts happen in the same millisecond
