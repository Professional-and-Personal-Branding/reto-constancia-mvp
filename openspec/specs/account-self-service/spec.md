# account-self-service Specification

## Purpose
Lets any signed-in user manage their own account ("Mi cuenta"): change their display name and their password, the latter returning fresh tokens and ending the other sessions.

## Requirements

### Requirement: Users change their own name
`PATCH /api/users/me` SHALL let any authenticated user change their own `name` and nothing else.
The body MUST accept only `name`; any other property (such as `role`, `active` or `email`) MUST be
rejected with 400. The name SHALL be trimmed and MUST have between 2 and 80 characters after
trimming, otherwise the response is 400 with "El nombre debe tener entre 2 y 80 caracteres". The
response SHALL be 200 with the user's safe profile and MUST NOT include `passwordHash`. The route
MUST act only on the authenticated user and MUST NOT be shadowed by the admin route
`PATCH /api/users/:id`.

#### Scenario: Participant renames themselves
- **GIVEN** an authenticated participant named "Ana"
- **WHEN** they send `PATCH /api/users/me` with `{ "name": "  Ana María " }`
- **THEN** the response is 200 with `name` "Ana María", their own id and role `PARTICIPANT`, and no `passwordHash`

#### Scenario: Privilege escalation attempt
- **WHEN** a participant sends `PATCH /api/users/me` with `{ "name": "Ana", "role": "ADMIN" }`
- **THEN** the response is 400 and their role is still `PARTICIPANT`

#### Scenario: Invalid name
- **WHEN** the name is "   " or "A" or longer than 80 characters
- **THEN** the response is 400 with "El nombre debe tener entre 2 y 80 caracteres" and the name does not change

#### Scenario: No session
- **WHEN** `PATCH /api/users/me` is sent without a valid access token
- **THEN** the response is 401

### Requirement: Password changes follow the registration rule
`PATCH /api/users/me/password` SHALL take `currentPassword` and `newPassword`. `newPassword` MUST
follow the same rule as registration, defined once and shared by both: 8 to 72 characters with at
least one letter and one digit, with the messages "La contraseña debe tener al menos 8
caracteres", "La contraseña no puede superar 72 caracteres" and "La contraseña debe incluir al
menos una letra y un número". `currentPassword` MUST be a non-empty string of at most 256
characters. If `newPassword` equals `currentPassword` the response MUST be 400 with "La nueva
contraseña debe ser distinta de la actual".

#### Scenario: Weak new password
- **WHEN** the new password is "soloLetras", "corta1" or "12345678"
- **THEN** the response is 400 with the corresponding message and the password does not change

#### Scenario: Same password
- **WHEN** the new password equals the current one
- **THEN** the response is 400 with "La nueva contraseña debe ser distinta de la actual"

#### Scenario: Registration uses the same rule
- **WHEN** someone registers with the password "corta1"
- **THEN** the response is 400 with "La contraseña debe tener al menos 8 caracteres"

### Requirement: A wrong current password is a form error, not a session error
When `currentPassword` does not match the stored password, `PATCH /api/users/me/password` MUST
answer 400 with "Contraseña actual incorrecta" and MUST NOT change the password. 401 SHALL be used
only when there is no valid session, including an access token whose user no longer exists or is
inactive.

#### Scenario: Wrong current password
- **GIVEN** an authenticated user
- **WHEN** they send a wrong `currentPassword` and a valid `newPassword`
- **THEN** the response is 400 with "Contraseña actual incorrecta" and logging in with the old password still works

#### Scenario: Inactive user with a live access token
- **GIVEN** a user deactivated after their access token was issued
- **WHEN** they call `PATCH /api/users/me/password` with that token
- **THEN** the response is 401

### Requirement: Password change attempts are rate limited
`PATCH /api/users/me/password` MUST be limited to 5 requests per minute per client IP, the same
limit as login, counting every request whatever its outcome. Beyond the limit the response SHALL be
429.

#### Scenario: Sixth attempt in a minute
- **GIVEN** 5 password change requests from the same IP within one minute
- **WHEN** a sixth one arrives within that minute
- **THEN** the response is 429 and the password does not change

### Requirement: A password change keeps the current session and ends the others
A successful password change SHALL answer 200 with a new `{ accessToken, refreshToken }` pair. Every
refresh token MUST carry a fingerprint of the user's password hash, computed as an HMAC with the
refresh secret, and `POST /api/auth/refresh` MUST reject with 401 "Refresh token inválido" any
refresh token whose fingerprint is missing or does not match the user's current hash. The
fingerprint MUST NOT appear in any response body other than inside the signed token, and the hash
itself MUST never be exposed. Access tokens already issued remain valid until they expire. No schema
change SHALL be required.

#### Scenario: Current session continues
- **GIVEN** a user logged in on device A
- **WHEN** they change their password from device A
- **THEN** the response is 200 with a new token pair, and refreshing with the new refresh token answers 200

#### Scenario: Other sessions end at their next refresh
- **GIVEN** the same user also logged in on device B before the change
- **WHEN** device B refreshes its tokens after the change
- **THEN** the response is 401 and the web on device B goes to `/login`

#### Scenario: New password works and the old one does not
- **WHEN** the user logs in after the change
- **THEN** the new password succeeds and the old one answers 401 "Credenciales inválidas"

#### Scenario: Refresh token from before the deploy
- **GIVEN** a refresh token issued before this change was deployed (no fingerprint)
- **WHEN** it is sent to `POST /api/auth/refresh`
- **THEN** the response is 401

#### Scenario: Password reset by the seed
- **GIVEN** the seed admin's password reset by running the seed with a new `SEED_ADMIN_PASSWORD`
- **WHEN** a refresh token issued before the reset is used
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
  actualizada. Las sesiones abiertas en otros dispositivos se cerrarán en unos minutos."

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
- **THEN** the success message appears, the fields are cleared, the stored tokens are the new ones and reloading the page keeps the session

### Requirement: A rejected refresh does not discard newer tokens
When `POST /api/auth/refresh` rejects a refresh token, the web MUST clear the stored session only
if the stored refresh token is still the one that was rejected. If the stored tokens were replaced
meanwhile (for example by a password change in another tab), the web SHALL keep them and continue
with them.

#### Scenario: Late refresh from another tab
- **GIVEN** tab B sent a refresh with the old refresh token and tab A then stored the tokens returned by a password change
- **WHEN** tab B receives the 401 of its refresh
- **THEN** the stored tokens are still the new ones and neither tab is sent to `/login`

### Requirement: The deployment runbook rotates the seed admin password
`docs/runbook-despliegue.md` SHALL include, in the first deployment, the explicit step of logging in
as the seed admin, changing the password from "Mi cuenta" and then deleting `SEED_ADMIN_PASSWORD`
from the API service, and a verification that the old seed password no longer logs in. It SHALL
document the recovery of a lost admin password with a temporary `SEED_ADMIN_PASSWORD`, the seed and
a new rotation, and that every user logs in again once after deploying this change.

#### Scenario: First deployment checklist
- **WHEN** the operator follows §1.5 and §1.6 of the runbook
- **THEN** the admin password differs from `SEED_ADMIN_PASSWORD` and the variable is no longer defined in the API service
