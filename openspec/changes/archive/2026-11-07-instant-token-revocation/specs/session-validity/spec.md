## ADDED Requirements

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
