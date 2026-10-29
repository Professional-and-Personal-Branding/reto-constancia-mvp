## Why

An access token keeps working after the account it belongs to changes:

- **`JwtStrategy.validate` returns the token payload without reading the database**
  (`backend/src/auth/strategies/jwt.strategy.ts`). A user deactivated by an admin keeps full access,
  admin routes included, until the access token expires (`JWT_ACCESS_EXPIRES_IN`, 15 minutes). Only
  the next `POST /auth/refresh` notices, because `AuthService.refresh` re-reads the user.
- **The role comes from the token, not from the database.** An admin demoted to participant keeps
  passing `RolesGuard` until the token expires, and keeps receiving the admin projection of the data:
  `isAdmin()` in `backend/src/challenges/privacy.ts` also reads `req.user.role`, so a demoted admin
  still sees every participant's email and payment state in the ranking and the active list
  (finding not in the original proposal).
- **`PATCH /users/:id` has no guard rails** (`UsersService.update`): the last active admin can be
  deactivated or demoted, which leaves the platform without anyone able to administer it (recovery
  then needs the seed with a temporary `SEED_ADMIN_PASSWORD`), and an admin can deactivate their
  own account.
- The roadmap of 2026-10-04 (item 14) asked for this check, and `docs/security-owasp.md` lists
  "leer la base en `JwtStrategy`" under "Mejoras futuras". The only scenario that covers it today,
  "Inactive user with a live access token" of `account-self-service`, applies to
  `/me/password` alone.

This is CON-1 of `docs/propuestas-mejoras-2026-10-28.md`, approved by the owner on 2026-10-28 with
decision D1. It is a prerequisite of `admin-password-reset` (ADM-2).

## What Changes

- **Every authenticated request reads the user by primary key** (`id`, `email`, `role`, `active`)
  in `JwtStrategy.validate`, after passport has verified the signature and expiry:
  - missing or inactive user → **401** "Sesión no válida";
  - otherwise `req.user` is `{ sub, email, role }` with the **current** email and role from the
    database, so `RolesGuard` and the privacy projections apply the current role.
- **`PATCH /users/:id` protects the administration** (400, messages in Spanish):
  - "No puedes desactivar tu propia cuenta" when the target is the caller and `active: false`;
  - "No puedes desactivar al último administrador activo" when the change would leave no active
    admin;
  - "No puedes quitar el rol de administrador al último administrador activo" likewise for a
    demotion.
  The check and the update run in one transaction that locks the active admin rows, so two admins
  demoting each other at the same time cannot leave zero admins.
- Unit tests and one new API e2e file; QA catalog TC-AUTH-19, TC-AUTH-20 and TC-SEC-14.
- `docs/security-owasp.md` (control implemented; the instant end of sessions after a password change
  stays in "Mejoras futuras"), `CHANGELOG.md`.
- **Release rule (D1):** if the owner deploys to production before 1.13.0 is ready, this change ships
  alone as **1.12.2** from a `hotfix/` branch cut from `main`; otherwise it ships in 1.13.0 from a
  `fix/` branch cut from `develop` (design D6).
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- Ending access tokens at once after a password change or an admin reset. Access tokens do not carry
  the password fingerprint (`pwv`); the other sessions keep ending at their next refresh, as
  specified in `account-self-service` (see design P1).
- Caching the user lookup (a cache would reopen the window this change closes).
- A revocation list, a persisted `jti` or per-session logout.
- Forbidding an admin from demoting themselves while other admins remain (allowed; only the last
  active admin is protected).
- Any web change: the web already reloads the profile from `/auth/me` (database role) and treats a
  rejected refresh as the end of the session. The admin users page is `admin-password-reset`.

## Capabilities

### New Capabilities
- `session-validity`: an access token is honoured only while its user exists and is active, and
  authorization uses the user's current role.
- `user-administration`: rules for the admin user-management endpoints, starting with the
  protection of the last active admin and of the caller's own account.

### Modified Capabilities
<!-- None. account-self-service keeps its requirements; its "Inactive user with a live access token"
scenario becomes a particular case of session-validity. -->

## Impact

- **Backend:** `backend/src/auth/strategies/jwt.strategy.ts` (inject `PrismaService`, async
  `validate`), `backend/src/auth/auth.module.ts` (provider wiring if needed),
  `backend/src/users/users.service.ts` (`update(id, dto, actorId)` with the guarded transaction),
  `backend/src/users/users.controller.ts` (pass `@CurrentUser()` to `update`). `setActive` and
  `setRole` (unused helpers) follow the same path.
- **Performance:** one primary-key `SELECT` per authenticated request, only after a valid signature;
  throttled and unsigned requests never reach it (design D2).
- **Tests:** `backend/src/auth/jwt.strategy.spec.ts` (new), `backend/src/users/users.service.spec.ts`,
  new `backend/test/session-checks.e2e-spec.ts`. Existing suites keep passing unchanged (design D5).
- **Docs:** `docs/security-owasp.md`, `docs/qa/catalog.mjs`, `CHANGELOG.md`. No runbook or guide
  change.
- **API contract:** a token of a deactivated or deleted user now answers 401 on every route instead
  of working until it expires; a demoted admin gets 403 on admin routes at once. `PATCH /users/:id`
  gains three 400 answers.
