## MODIFIED Requirements

### Requirement: A reset ends the user's other sessions
A successful reset SHALL end every session of the user at its next request, using the password
fingerprint carried by both tokens: every route protected by the JWT guard MUST answer 401 "Sesión no
válida" to an access token issued before the reset, and `POST /api/auth/refresh` with a refresh token
issued before the reset MUST answer 401 "Refresh token inválido". The admin's own session is not
affected.

#### Scenario: Session opened before the reset
- **GIVEN** Ana logged in before the admin reset her password
- **WHEN** Ana's web refreshes its tokens after the reset
- **THEN** the refresh answers 401 and the web goes to `/login`

#### Scenario: Live access token after the reset
- **GIVEN** Ana holds an access token issued before the reset that has not expired
- **WHEN** Ana calls `GET /api/auth/me` with it right after the reset
- **THEN** the response is 401 with "Sesión no válida"

#### Scenario: The admin keeps working
- **WHEN** the admin who made the reset calls `GET /api/users` with the access token they used for it
- **THEN** the response is 200
