## Context

- **Users API** (`backend/src/users/`): `GET /users` (admin, safe fields, ordered by `createdAt`),
  `GET /users/:id`, `PATCH /users/me`, `PATCH /users/me/password` (5/min per IP, 200 with a new token
  pair), `PATCH /users/:id` (admin: `name`, `role`, `active`). After `effective-session-checks`
  (CON-1), `PATCH /users/:id` refuses self-deactivation and leaving no active admin, and every
  request uses the user's current role and active flag. `UsersService.resetPassword(id,
  newPassword)` exists, unused: it hashes whatever it receives.
- **Password rule** (`backend/src/auth/password-policy.ts`): `IsAccountPassword()`, 8 to 72
  characters with at least one letter and one digit; used by registration and `/me/password`.
- **Sessions** (`account-self-service`): the refresh token carries `pwv`, an HMAC of the password
  hash with `JWT_REFRESH_SECRET`; `/auth/refresh` rejects a token whose `pwv` does not match the
  current hash. Changing the hash therefore ends every refresh token issued before; live access
  tokens keep working until they expire (15 minutes).
- **Logs** (`platform-operations`): one JSON access line per request with `requestId`, `method`,
  `route` (the route **template** when a handler matched, e.g. `/api/users/:id/reset-password`),
  `status`, `ms` and `userId` of the caller; bodies are never logged; the exception filter logs the
  error name, never the body. `Cache-Control: no-store` is already set on the CSV export route.
- **Throttling:** global `ThrottlerGuard`, per IP; credential routes override it with 5 per minute.
- **Web:** admin pages live under `frontend/app/dashboard/admin/`; the navigation of
  `dashboard/layout.tsx` has 8 items for an admin (`09-header-layout.spec.ts`, TC-UI-10, checks it
  fits); accessible dialogs use `lib/use-modal-dialog.ts`; `/dashboard/account` is "Mi cuenta".
- **Model:** `User` has no field to force a password change (confirmed in `schema.prisma`), so
  forcing it would need a migration; owner decision D3 rules it out.

Checked against the approved proposal (ADM-2). Corrections and additions:

1. "Revoca las sesiones" with the `pwv` mechanism ends them **at their next refresh**, not at once;
   live access tokens survive up to 15 minutes, even after CON-1 (which checks `active` and `role`,
   not the password). The spec says so and the page tells the admin how to cut a session at once
   (deactivate) (D3).
2. The access log does not record the target of the reset (only the route template), so an explicit
   audit line is needed to know whose password was reset and by whom (D5).
3. The existing `resetPassword(id, newPassword)` is not reusable as is (no policy, password chosen by
   the caller); it is replaced (D2).

## Goals / Non-Goals

**Goals:** an admin issues a temporary password from the platform, seen once, never stored in clear
or logged, ending the user's other sessions; an admin manages state and role of users from a page,
under CON-1's protections.

**Non-Goals:** forced change at next login (D3 of the owner), instant end of access tokens, email
recovery, user creation or deletion from the page.

## Decisions

### D1. Contract

`POST /api/users/:id/reset-password`, `@Roles(ADMIN)`, no body (any property → 400 by the global
whitelist), `@HttpCode(200)`, `@Throttle({ default: { limit: 5, ttl: 60_000 } })`,
`@Header('Cache-Control', 'no-store')` and `@Header('Pragma', 'no-cache')`. Response:
`{ "temporaryPassword": "Kq7m-x3Pd-9Ztw" }` and nothing else (no user, no hash, no tokens). Errors:
404 "Usuario no encontrado"; 400 "Para cambiar tu propia contraseña usa Mi cuenta" when `:id` is the
caller (so an admin cannot end their own sessions by accident and the current-password check of Mi
cuenta is not bypassed); 403 for participants; 401 without a session; 429 beyond the limit. `POST`
because each call creates a new secret (not idempotent).

An inactive target can be reset (to hand over a password before reactivating the account); login
stays refused while it is inactive (`TC-AUTH-11`).

### D2. Generator

`generateTemporaryPassword()` in `password-policy.ts`, next to the rule it must satisfy:
- alphabet of 56 characters without look-alikes: uppercase letters minus `I` and `O`,
  lowercase letters minus `l` and `o`, digits `2` to `9`;
- 12 characters drawn with `crypto.randomInt` (uniform), grouped as `xxxx-xxxx-xxxx` (14 characters,
  about 69 bits of entropy), redrawn until it has at least one letter and one digit;
- unit test: 1 000 generated values all pass `IsAccountPassword` (class-validator `validate` on a
  small DTO) and match `^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){2}$`.

`UsersService.resetPasswordByAdmin(id, actorId)`: rejects self (400) before any lookup, loads the
target (404), hashes with argon2, `update` of `passwordHash` only, returns the clear password to the
controller. The old `resetPassword(id, newPassword)` is removed (no caller).

### D3. Sessions after a reset

- The hash changes, so every refresh token of the user stops matching `pwv`: each session ends at its
  next `/auth/refresh`, at most one access-token lifetime later (15 minutes), and the web sends it to
  `/login`. Same rule and same wording as a password change from Mi cuenta.
- Live access tokens are not cut (CON-1 checks `active` and `role`, not the password; see its P1).
  When the admin suspects a stolen session, the page's guidance is: deactivate the account (effective
  at the next request by CON-1), reset, then reactivate.
- The old password stops working for login at once.

### D4. No forced change (owner decision D3)

No flag, no migration. The web tells the admin "Compártela por un canal privado y pídele que la
cambie en Mi cuenta al entrar." The guide says the same to the participant. A forced change, if ever
wanted, is a separate change with a migration (a `mustChangePassword` column and a login answer the
web understands).

### D5. Never logged; what the audit records

- The temporary password exists only in the service's return value and the HTTP response body. It is
  not written to the database in clear, not put in an exception message, not passed to any logger.
  Nest's access line and the exception filter never log bodies (`platform-operations`), so nothing
  else can leak it.
- **Audit line:** after the update commits, `new Logger('Audit').log(JSON.stringify({ event:
  'admin_password_reset', requestId, actorId, targetId }))`. With the access line of the same
  `requestId` (route template, status, duration, `userId` of the admin) it answers who reset whose
  password and when. It is a separate logger context, so the "exactly one access-log line" rule of
  `platform-operations` is unchanged. Failed attempts (403, 404, 400, 429) leave only the access
  line (with the admin's id when authenticated), no audit line.
- **Limit:** 5 requests per minute per IP, counting every request whatever its outcome (the same rule
  as login and Mi cuenta): enough for an admin handing out a few passwords, and it caps what a stolen
  admin token can do per minute. The limit is per IP like the others (in memory, per process).
- **Caches:** `no-store` and `Pragma: no-cache` keep the response out of browser and proxy caches.
  The web reads the value from the mutation result into component state only; the mutation is reset
  and the state cleared when the dialog closes, and the value is never put in React Query's query
  cache, `localStorage` or the URL.

### D6. Users page (PR 2)

- Route `/dashboard/admin/users`, navigation item "Usuarios" for admins, after "Participantes".
  Re-run TC-UI-10 (9 admin items); if the header no longer fits, the item text stays and the existing
  horizontal scroll of the navigation applies (same rule used when "Mi cuenta" was added).
- Data: `GET /users` (already returns id, email, name, role, active, createdAt). Sorted by name
  (`localeCompare('es')`). Search box "Buscar por nombre o correo", case- and accent-insensitive
  (NFD normalisation), client side. Each row: name, email, "Admin"/"Participante",
  "Activo"/"Inactivo".
- Actions per row (not on the caller's own row, which shows "Tú" and a link "Cambiar mi contraseña"
  to Mi cuenta):
  - "Desactivar" / "Activar" → `PATCH /users/:id { active }`, confirmation "¿Desactivar a <nombre>?
    No podrá entrar ni usar su sesión actual." (activation needs no confirmation);
  - "Hacer admin" / "Quitar admin" → `PATCH /users/:id { role }`, confirmation "¿Dar permisos de
    administrador a <nombre>?" / "¿Quitar los permisos de administrador a <nombre>?";
  - "Reiniciar contraseña" → confirmation "Se generará una contraseña temporal para <nombre> y sus
    sesiones abiertas se cerrarán en unos minutos. ¿Continuar?" → `POST` → result dialog.
- Result dialog (modal, `useModalDialog`): title "Contraseña temporal de <nombre>", the value in a
  read-only `<input>` with a monospace font, "Copiar" (clipboard; on failure the text is selected),
  the text "Se muestra una sola vez. Compártela por un canal privado y pídele que la cambie en Mi
  cuenta al entrar.", and "Cerrar", which clears it. For an inactive target it adds "La cuenta está
  inactiva: actívala para que pueda entrar."
- Errors: the API's Spanish message in a `role="alert"` next to the list (CON-1's messages included:
  "No puedes desactivar al último administrador activo", etc.); 429 shows "Demasiados intentos.
  Espera un minuto e inténtalo de nuevo." (helper of `lib/account.ts`). After any successful change
  the `users` query is invalidated (the participants page shares it).
- The page does not try to pre-empt the last-admin rule (the API is authoritative and races are
  possible); it only hides actions on the caller's own row.
- A participant who opens the URL sees the same "solo administradores" notice the import page shows
  (`admin/import/page.tsx`) and no request to `/users` is sent; the API answers 403 anyway.
- Phone width (375 px): rows stack, actions wrap; covered by the Playwright journey.

### D7. Tests within the limits

- API e2e `backend/test/admin-users.e2e-spec.ts`, own app, users `e2e-reset-*` created with Prisma,
  2 logins (admin, participant) plus the logins that prove the new and old passwords; the five-reset
  budget per minute: success, self, unknown, and the sixth request for 429 run in a second describe
  with its own app if the budget does not fit.
- Playwright `e2e/tests/18-admin-users.spec.ts`, admin stored session, throwaway user registered by
  API (`reset-<timestamp>@e2e.local`): search, deactivate and reactivate, promote and demote,
  reset → dialog shows a value that matches the pattern and logs in by API (one login), dialog closed
  → value gone from the DOM; never a seed user.

## Risks / Trade-offs

- **Temporary password in transit** → HTTPS in production, `no-store`, shown once; the admin shares
  it by a private channel (written on the page).
- **Live access tokens after a reset** (≤ 15 min) → D3 guidance (deactivate first); CON-1 P1 is the
  follow-up if the owner wants it at once.
- **Admin header width** with a ninth item → TC-UI-10 re-run (D6).
- **A stolen admin token resets passwords** → limited per minute, audited, and the victim notices
  at the next refresh; the same token could already deactivate users today.
- **Users who never change the temporary password** → accepted by owner decision D3; it is as strong
  as a chosen one (69 bits).

## Migration Plan

- **No schema change, no data migration, no new environment variable, no new dependency.**
- PR 1 (API) can be deployed alone; PR 2 (web) needs PR 1 and `effective-session-checks`.
- **Rollback:** redeploy the previous API and web; passwords reset meanwhile stay valid (ordinary
  argon2 hashes).

## Open Questions

- **P1. Self-reset through this endpoint.** [NO BLOQUEANTE]
  Options: (a) refuse with 400 and point to Mi cuenta; (b) allow it. Recommendation: (a): Mi cuenta
  checks the current password and keeps the current session, this endpoint does neither. The spec
  uses (a).
- **P2. Resetting an inactive user.** [NO BLOQUEANTE]
  Options: (a) allow it, login stays refused until reactivation; (b) refuse it. Recommendation: (a),
  so the admin can prepare the reactivation in one visit. The spec uses (a).
- **P3. Where the audit line lives.** [NO BLOQUEANTE]
  Default: the application log (Seenode keeps it as any other line). A database table would need a
  migration and is out of scope.

None of the questions blocks the approval.
