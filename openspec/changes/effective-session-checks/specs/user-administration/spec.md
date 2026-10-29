## ADDED Requirements

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
