# session-validity Specification

## Purpose
Defines how the API treats an access token against the user's current state: a deactivated user is rejected and the current role, not the one in the token, drives authorization, so deactivating or demoting takes effect on the next request.

## Requirements

### Requirement: An access token is honoured only while its user is active
Every route protected by the JWT guard SHALL, after verifying the access token's signature and
expiry, read the token's user by primary key. When the user does not exist or is inactive the
response MUST be 401 with "Sesión no válida", whatever route was called. The lookup MUST NOT be
cached, and it MUST NOT run for requests rejected earlier by the rate limiter or by an invalid,
malformed or expired token. No schema change SHALL be required.

#### Scenario: Deactivated user with a live access token
- **GIVEN** a participant logged in, with an access token that has not expired
- **WHEN** an admin deactivates the participant and the participant then calls `GET /api/challenges/active/list` with that token
- **THEN** the response is 401 with "Sesión no válida"
- **AND** `POST /api/auth/refresh` with the participant's refresh token answers 401

#### Scenario: Deactivated admin with a live access token
- **GIVEN** an admin with a live access token and another active admin
- **WHEN** the other admin deactivates them and they call `GET /api/users`
- **THEN** the response is 401

#### Scenario: Reactivated user
- **GIVEN** a user deactivated and then reactivated while their access token was still live
- **WHEN** they call any protected route with that token
- **THEN** the request is served as before the deactivation

#### Scenario: Throttled or unsigned requests do not query the user
- **WHEN** a request carries a token with an invalid signature, or exceeds the rate limit
- **THEN** it is rejected with 401 or 429 respectively without reading the user from the database

### Requirement: Authorization uses the user's current role
The authenticated user attached to the request SHALL carry the identifier, email and role read from
the database, not those of the token. Role checks and every role-dependent projection of data (such
as the admin view of the ranking, the active challenges and the challenge detail) SHALL use that
current role.

#### Scenario: Demoted admin with a live access token
- **GIVEN** two active admins A and B, and A holds a live access token
- **WHEN** B changes A's role to `PARTICIPANT` and A calls `GET /api/users` with that token
- **THEN** the response is 403 with "No tienes permiso para esta acción"

#### Scenario: Demoted admin no longer sees other participants' data
- **GIVEN** A was demoted as above and is enrolled in an active challenge
- **WHEN** A calls `GET /api/challenges/:id/results` with the same token
- **THEN** the ranking rows carry no `email` and no `paid`, as for any participant

#### Scenario: Promoted participant
- **GIVEN** a participant with a live access token
- **WHEN** an admin promotes them to `ADMIN` and they call `GET /api/users` with that token
- **THEN** the response is 200 without logging in again
