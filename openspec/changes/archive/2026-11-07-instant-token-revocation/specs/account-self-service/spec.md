## MODIFIED Requirements

### Requirement: A password change keeps the current session and ends the others
A successful password change SHALL answer 200 with a new `{ accessToken, refreshToken }` pair. Every
refresh token and every access token MUST carry a fingerprint of the user's password hash, computed as
an HMAC with the refresh secret. `POST /api/auth/refresh` MUST reject with 401 "Refresh token
inválido" any refresh token whose fingerprint is missing or does not match the user's current hash,
and every route protected by the JWT guard MUST reject with 401 "Sesión no válida" any access token
whose fingerprint is missing or does not match. The other sessions of the user therefore end at their
next request. The fingerprint MUST NOT appear in any response body other than inside the signed
tokens, and the hash itself MUST never be exposed. No schema change SHALL be required.

#### Scenario: Current session continues
- **GIVEN** a user logged in on device A
- **WHEN** they change their password from device A
- **THEN** the response is 200 with a new token pair, and refreshing with the new refresh token answers 200

#### Scenario: Other sessions end at their next refresh
- **GIVEN** the same user also logged in on device B before the change
- **WHEN** device B refreshes its tokens after the change
- **THEN** the response is 401 and the web on device B goes to `/login`

#### Scenario: Other sessions end at their next request
- **GIVEN** the same user also logged in on device B before the change, with a live access token
- **WHEN** device B calls any protected route with that access token after the change
- **THEN** the response is 401 "Sesión no válida", the web tries to refresh, the refresh answers 401 and the web goes to `/login`

#### Scenario: New password works and the old one does not
- **WHEN** the user logs in after the change
- **THEN** the new password succeeds and the old one answers 401 "Credenciales inválidas"

#### Scenario: Refresh token from before the deploy
- **GIVEN** a refresh token issued before this change was deployed (no fingerprint)
- **WHEN** it is sent to `POST /api/auth/refresh`
- **THEN** the response is 401

#### Scenario: Password reset by the seed
- **GIVEN** the seed admin's password reset by running the seed with a new `SEED_ADMIN_PASSWORD`
- **WHEN** an access token or a refresh token issued before the reset is used
- **THEN** the response is 401

### Requirement: The web offers a "Mi cuenta" page
The web SHALL show "Mi cuenta" as the last item of the header navigation for every role, leading to
`/dashboard/account`, which requires a session. The page SHALL show the user's email and role as
read-only data and two independent forms:

- **Nombre:** prefilled with the current name; on success it shows "Nombre actualizado." and the
  header shows the new name without reloading the page.
- **Contraseña:** "Contraseña actual", "Nueva contraseña" and "Repite la nueva contraseña", with the
  hint "Mínimo 8 caracteres, con al menos una letra y un número." If the new password and its
  confirmation differ the page MUST show "Las contraseñas no coinciden" and MUST NOT call the API.
  On success it MUST store the returned tokens, clear the three fields and show "Contraseña
  actualizada. Se cerraron las sesiones abiertas en otros dispositivos."

Errors from the API SHALL be shown in Spanish next to the form that caused them (the API message,
or "Demasiados intentos. Espera un minuto e inténtalo de nuevo." for 429), and MUST NOT end the
session.

#### Scenario: Change the name from the web
- **GIVEN** a logged-in participant on "Mi cuenta"
- **WHEN** they save a new valid name
- **THEN** "Nombre actualizado." appears and the header shows the new name

#### Scenario: Confirmation mismatch
- **WHEN** the new password and its confirmation differ and the user presses "Cambiar contraseña"
- **THEN** "Las contraseñas no coinciden" appears and no request is sent

#### Scenario: Wrong current password in the web
- **WHEN** the user submits a wrong current password
- **THEN** "Contraseña actual incorrecta" appears, no token refresh is triggered and the user stays logged in on the page

#### Scenario: Successful change in the web
- **WHEN** the user submits the right current password and a valid new one twice
- **THEN** "Contraseña actualizada. Se cerraron las sesiones abiertas en otros dispositivos." appears, the fields are cleared, the stored tokens are the new ones and reloading the page keeps the session
