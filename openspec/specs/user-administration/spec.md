# user-administration Specification

## Purpose
Defines admin-side user management rules: the platform always keeps an active admin, admins cannot deactivate themselves, admins reset passwords with a one-time temporary password that ends other sessions, and the web offers a Users page.

## Requirements

### Requirement: The platform always keeps an active admin
`PATCH /api/users/:id` SHALL reject with 400 any change that would leave no active user with role
`ADMIN`: deactivating the last active admin answers "No puedes desactivar al último administrador
activo", and changing the role of the last active admin to another role answers "No puedes quitar el
rol de administrador al último administrador activo" (when both are requested, the deactivation
message). A rejected request MUST NOT change any field of the user. The check and the update SHALL
run in one transaction that locks the active admin rows, so concurrent requests can never leave the
platform without an active admin. Changes that do not remove an active admin (names, promotions,
reactivations, changes to participants or to inactive admins) SHALL keep working as before.

#### Scenario: Two admins deactivate each other at the same time
- **GIVEN** A and B are the only active admins
- **WHEN** A deactivates B and B deactivates A in concurrent requests
- **THEN** exactly one request answers 200 and the other is rejected: 400 with "No puedes desactivar al último administrador activo" when its session was checked before the first change committed, or 401 when its session was checked after the first change committed
- **AND** exactly one active admin remains

#### Scenario: Reactivating and promoting are not restricted
- **GIVEN** admin A is the only active admin
- **WHEN** A reactivates an inactive admin or promotes a participant to `ADMIN`
- **THEN** the response is 200

#### Scenario: Demoting the last active admin
- **GIVEN** admin A is the only active admin
- **WHEN** A sends `PATCH /api/users/<id of A>` with `{ "role": "PARTICIPANT" }`
- **THEN** the response is 400 with "No puedes quitar el rol de administrador al último administrador activo" and A is still `ADMIN`

#### Scenario: Demoting one of two active admins
- **GIVEN** two active admins A and B
- **WHEN** A sends `PATCH /api/users/<id of B>` with `{ "role": "PARTICIPANT" }`
- **THEN** the response is 200 and B is a participant

#### Scenario: Two admins demote each other at the same time
- **GIVEN** A and B are the only active admins
- **WHEN** A demotes B and B demotes A in concurrent requests
- **THEN** exactly one request answers 200 and the other is rejected: 400 with "No puedes quitar el rol de administrador al último administrador activo" when its session was checked before the first change committed, or 403 when its session was checked after the first change committed
- **AND** exactly one active admin remains

#### Scenario: Changing the name of the last admin
- **GIVEN** admin A is the only active admin
- **WHEN** A sends `PATCH /api/users/<id of A>` with `{ "name": "Admin Principal" }`
- **THEN** the response is 200 with the new name

### Requirement: An admin cannot deactivate their own account
`PATCH /api/users/:id` SHALL reject with 400 "No puedes desactivar tu propia cuenta" a request whose
target is the caller and whose body sets `active` to `false`, before any other rule and whatever the
number of active admins. The user MUST stay unchanged.

#### Scenario: Self-deactivation with other admins
- **GIVEN** two active admins A and B
- **WHEN** A sends `PATCH /api/users/<id of A>` with `{ "active": false }`
- **THEN** the response is 400 with "No puedes desactivar tu propia cuenta" and A stays active

#### Scenario: Self-deactivation of the last admin
- **GIVEN** admin A is the only active admin
- **WHEN** A sends `PATCH /api/users/<id of A>` with `{ "active": false }`
- **THEN** the response is 400 with "No puedes desactivar tu propia cuenta"

### Requirement: Admins reset a user's password with a one-time temporary password
`POST /api/users/:id/reset-password` SHALL be available only to admins and SHALL take no body. It
SHALL generate a temporary password of the form `xxxx-xxxx-xxxx`, drawn with a cryptographic random
source from letters and digits without look-alike characters (`I`, `O`, `l`, `o`, `0`, `1`), that
always satisfies the account password rule (8 to 72 characters with at least one letter and one
digit); store only its argon2 hash as the user's password; and answer 200 with exactly
`{ temporaryPassword }`. The response MUST carry `Cache-Control: no-store` and `Pragma: no-cache`.
The temporary password MUST NOT be stored in clear, returned by any other request or written to any
log. When `:id` is the caller the response SHALL be 400 "Para cambiar tu propia contraseña usa Mi
cuenta"; an unknown user SHALL answer 404 "Usuario no encontrado"; a participant 403; a request
without a session 401. In every rejected case the password MUST NOT change. An inactive user's
password MAY be reset; logging in stays refused while the account is inactive. No schema change
SHALL be required, and the user SHALL NOT be forced to change the password at the next login.

#### Scenario: Admin resets a participant's password
- **GIVEN** an admin and a participant Ana
- **WHEN** the admin sends `POST /api/users/<id of Ana>/reset-password`
- **THEN** the response is 200 with only `temporaryPassword`, matching `xxxx-xxxx-xxxx`, with `Cache-Control: no-store`
- **AND** Ana logs in with the temporary password, and her old password answers 401 "Credenciales inválidas"

#### Scenario: The temporary password follows the account rule
- **WHEN** the generator produces many temporary passwords
- **THEN** every one passes the account password rule and contains no look-alike character

#### Scenario: Participant calls the endpoint
- **WHEN** a participant sends `POST /api/users/<id of another user>/reset-password`
- **THEN** the response is 403 and that user's password does not change

#### Scenario: Admin targets themselves
- **WHEN** an admin sends the request with their own id
- **THEN** the response is 400 "Para cambiar tu propia contraseña usa Mi cuenta" and their password does not change

#### Scenario: Unknown user
- **WHEN** an admin sends the request with an id that matches no user
- **THEN** the response is 404 "Usuario no encontrado"

#### Scenario: A body is sent
- **WHEN** an admin sends the request with `{ "password": "Elegida123" }`
- **THEN** the response is 400 and the password does not change

### Requirement: A reset ends the user's other sessions
A successful reset SHALL end every session of the user at its next token refresh, using the password
fingerprint of the refresh tokens: `POST /api/auth/refresh` with a refresh token issued before the
reset MUST answer 401 "Refresh token inválido". Access tokens issued before the reset remain valid
until they expire unless the account is deactivated.

#### Scenario: Session opened before the reset
- **GIVEN** Ana logged in before the admin reset her password
- **WHEN** Ana's web refreshes its tokens after the reset
- **THEN** the refresh answers 401 and the web goes to `/login`

### Requirement: Password resets are rate limited and audited without the password
`POST /api/users/:id/reset-password` MUST be limited to 5 requests per minute per client IP,
counting every request whatever its outcome; beyond the limit the response SHALL be 429. Each
successful reset SHALL write one audit log line with `event` `admin_password_reset`, the request id,
the admin's id and the target user's id, and MUST NOT include the temporary password, its hash or
any token. Rejected requests SHALL leave only the usual access-log line.

#### Scenario: Sixth reset in a minute
- **GIVEN** 5 reset requests from the same IP within one minute
- **WHEN** a sixth one arrives within that minute
- **THEN** the response is 429 and the target's password does not change

#### Scenario: Audit line
- **WHEN** an admin resets Ana's password
- **THEN** the log has one `admin_password_reset` line with the request id, the admin's id and Ana's id
- **AND** no log line contains the temporary password

### Requirement: The web offers a users page to admins
The web SHALL show "Usuarios" in the admin navigation, leading to `/dashboard/admin/users`, available
only to admins. The page SHALL list every user with name, email, role ("Admin" or "Participante")
and state ("Activo" or "Inactivo"), sorted by name, with a search "Buscar por nombre o correo" that
ignores case and accents. Each row other than the caller's SHALL offer "Desactivar" or "Activar",
"Hacer admin" or "Quitar admin", and "Reiniciar contraseña"; deactivating, changing the role and
resetting SHALL ask for confirmation first. The caller's own row SHALL show "Tú" and a link to "Mi
cuenta" instead of those actions. After a reset the page SHALL show the temporary password once, in
a dialog with "Copiar" and the text "Se muestra una sola vez. Compártela por un canal privado y
pídele que la cambie en Mi cuenta al entrar.", and SHALL discard it when the dialog closes; it MUST
NOT keep it in storage, in the URL or in any cache. Errors from the API SHALL be shown in Spanish as
they come, including the protections of the last active admin and of the caller's own account.

#### Scenario: Search and deactivate
- **GIVEN** an admin on "Usuarios" and an active participant "José Pérez"
- **WHEN** the admin searches "jose" and confirms "Desactivar" on that row
- **THEN** the row shows "Inactivo" and the action becomes "Activar"

#### Scenario: Reset from the page
- **WHEN** the admin confirms "Reiniciar contraseña" on a participant's row
- **THEN** a dialog shows the temporary password once with "Copiar" and the indication to change it in Mi cuenta
- **AND** after "Cerrar" the password is no longer in the page

#### Scenario: Own row
- **WHEN** the admin looks at their own row
- **THEN** it shows "Tú" and a link to Mi cuenta, and no deactivate, role or reset action

#### Scenario: Last admin protection shown
- **GIVEN** the API answers 400 "No puedes quitar el rol de administrador al último administrador activo" to a role change
- **WHEN** the admin confirms that change
- **THEN** the page shows that message and the row keeps its role

#### Scenario: Participant opens the page
- **WHEN** a participant opens `/dashboard/admin/users`
- **THEN** no user data is shown and the navigation has no "Usuarios" item
