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

### Requirement: An access token is honoured only while the user's password is unchanged
Every access token SHALL carry the same password fingerprint (`pwv`) as the refresh token issued with
it: an HMAC-SHA256 of the user's current password hash keyed with the refresh secret, truncated to 22
base64url characters. On every route protected by the JWT guard, after the user lookup of the
previous requirement, the API MUST compare the token's fingerprint in constant time with the
fingerprint of the user's current hash and MUST answer 401 "Sesión no válida" when the claim is
missing or does not match. The password hash MUST NOT be attached to the request, logged or returned.
No additional query and no schema change SHALL be required.

#### Scenario: Access token issued before a password change
- **GIVEN** a user logged in on devices A and B, both with live access tokens
- **WHEN** the user changes their password from device A and device B then calls `GET /api/auth/me` with its access token
- **THEN** the response is 401 with "Sesión no válida"

#### Scenario: The session that changed the password continues
- **GIVEN** the user changed their password from device A and received a new token pair
- **WHEN** device A calls `GET /api/auth/me` with the new access token
- **THEN** the response is 200
- **AND** the access token device A held before the change answers 401

#### Scenario: Access token issued before an admin reset
- **GIVEN** Ana holds a live access token
- **WHEN** an admin resets Ana's password and Ana calls any protected route with that token
- **THEN** the response is 401 with "Sesión no válida"

#### Scenario: Access token without fingerprint
- **GIVEN** a validly signed, unexpired access token with no `pwv` claim, as issued before this change was deployed
- **WHEN** it is used on a protected route
- **THEN** the response is 401
- **AND** `POST /api/auth/refresh` with a current refresh token of the same user answers 200 with a new pair

#### Scenario: Unchanged password
- **GIVEN** a user whose password has not changed since their access token was issued
- **WHEN** they call any protected route with that token
- **THEN** the request is served as before this change

### Requirement: A failed login does the same work whatever the reason
`POST /api/auth/login` SHALL run exactly one argon2 password verification for every request that
reaches the service. When the email does not exist or its user is inactive, the verification MUST
run against a dummy argon2 hash computed at startup with the same hashing function and parameters
as stored passwords. An unknown email, an inactive user (with any password) and a wrong password
MUST all answer 401 with the same body, "Credenciales inválidas". A correct password of an active
user SHALL keep answering 200 with the user and the tokens. Stored hashes SHALL NOT be changed or
re-hashed, and no schema change SHALL be required.

#### Scenario: Unknown email
- **WHEN** someone logs in with an email that has no account
- **THEN** the password is verified once against the dummy hash
- **AND** the response is 401 "Credenciales inválidas"

#### Scenario: Inactive user, even with the right password
- **GIVEN** a deactivated user
- **WHEN** they log in with their correct password
- **THEN** the password is verified once against the dummy hash, not against their stored hash
- **AND** the response is 401 "Credenciales inválidas"

#### Scenario: Wrong password
- **GIVEN** an active user
- **WHEN** they log in with a wrong password
- **THEN** the password is verified once against their stored hash and the response is 401 "Credenciales inválidas"

#### Scenario: Same response for the three failures
- **WHEN** the three failed logins above are sent
- **THEN** their status codes and bodies are identical

#### Scenario: Valid login unchanged
- **GIVEN** an active user
- **WHEN** they log in with the correct password
- **THEN** the response is 200 with the user and an access and a refresh token, as before

#### Scenario: Dummy hash shares the real parameters
- **WHEN** the dummy hash and a newly hashed password are compared
- **THEN** both use the same algorithm, version, memory, iterations and parallelism

#### Scenario: Rate limit unchanged
- **WHEN** a sixth login is sent from the same IP within a minute
- **THEN** the response is 429 and no password is verified
