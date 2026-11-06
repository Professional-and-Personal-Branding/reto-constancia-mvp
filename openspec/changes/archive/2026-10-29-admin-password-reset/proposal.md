## Why

A participant who forgets their password cannot get back in, and the admin cannot help from the
platform:

- **`UsersService.resetPassword(id, newPassword)` exists but no route exposes it**
  (`backend/src/users/users.service.ts`). It also takes the password from the caller, applies no
  policy and does nothing about open sessions.
- Recovery by email was ruled out because the admin was to issue temporary passwords
  (`docs/propuestas-features-2026-10-04.md`, section 6 and roadmap item 14), and the archived
  `account-self-service` left "Admin user management from the web (reset, role, deactivation: item
  #11)" out of its scope. Today the only way out is editing the database or, for the seed admin,
  re-running the seed with a temporary `SEED_ADMIN_PASSWORD`.
- **There is no users screen:** activating, deactivating or changing a role is possible only with
  hand-made calls to `PATCH /api/users/:id` (Swagger is off in production).

This is ADM-2 of `docs/propuestas-mejoras-2026-10-28.md`, approved by the owner on 2026-10-28 with
decision D3 (do not force the change at the next login, so no migration). It depends on
`effective-session-checks` (CON-1), which protects the last admin and makes deactivation and role
changes effective at once.

## What Changes

- **PR 1, API: `POST /api/users/:id/reset-password`** (admin only, no body):
  - generates a temporary password of 14 characters (three groups of four letters and digits joined
    by "-", without look-alike characters) with `node:crypto`, always valid for the account password
    rule (`IsAccountPassword`: 8 to 72 characters, at least one letter and one digit);
  - stores its argon2 hash and answers **200 `{ temporaryPassword }` once**, with
    `Cache-Control: no-store` and `Pragma: no-cache`; the password is never stored in clear, never
    logged and cannot be read again;
  - ends the user's other sessions with the same mechanism as `/me/password`: the refresh tokens'
    password fingerprint (`pwv`) stops matching, so every session ends at its next refresh (at most
    the access-token lifetime, 15 minutes);
  - rejects the caller's own id (400 "Para cambiar tu propia contraseña usa Mi cuenta"), an unknown
    user (404) and non-admins (403); limited to 5 requests per minute per IP like the other
    credential endpoints;
  - writes one audit log line `admin_password_reset` with the request id, the admin's id and the
    target's id, never the password (the access log alone records only the route template, so it
    would not say whose password was reset).
  - The unused `resetPassword(id, newPassword)` is replaced by the generating version.
- **PR 2, web: page "Usuarios"** (`/dashboard/admin/users`, admin navigation):
  - list of users (name, email, role, state) sorted by name, with a search by name or email;
  - per row: "Desactivar"/"Activar", "Hacer admin"/"Quitar admin" and "Reiniciar contraseña", each
    with a confirmation; the caller's own row shows "Tú" and none of those actions (a link to "Mi
    cuenta" instead);
  - the temporary password is shown once in a dialog with "Copiar" and the indication "Compártela por
    un canal privado y pídele que la cambie en Mi cuenta al entrar."; it is discarded when the dialog
    closes;
  - the API's Spanish errors are shown as they come (the last-admin and self-deactivation rules of
    CON-1 stay in the API).
- QA catalog TC-AUTH-21, TC-AUTH-22 and TC-UI-12; runbook (recovering a participant's or another
  admin's password without the seed), `docs/security-owasp.md`, guide, `CHANGELOG.md`.
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- Forcing the user to change the temporary password at the next login (needs a column, so a
  migration; owner decision D3). If wanted, it is a separate change with its migration.
- Ending the user's live access tokens at once (see `effective-session-checks`, P1); until then the
  admin can deactivate the account (instant) while resetting.
- Password recovery by email, "olvidé mi contraseña", two-factor authentication.
- Creating users from the admin page, editing emails, deleting users, pagination or filters beyond
  the search.
- Showing or storing the temporary password anywhere after the dialog closes.

## Capabilities

### New Capabilities
<!-- None: user-administration is introduced by effective-session-checks, which ships first. -->

### Modified Capabilities
- `user-administration`: adds the admin password reset with a one-time temporary password and the
  admin users page.

## Impact

- **Backend (PR 1):** `backend/src/users/users.controller.ts` (new route, `@Roles(ADMIN)`,
  `@Throttle`, `@HttpCode(200)`, `@Header('Cache-Control', 'no-store')`, `@Header('Pragma',
  'no-cache')`), `backend/src/users/users.service.ts` (`resetPasswordByAdmin(id, actorId)`),
  `backend/src/auth/password-policy.ts` (`generateTemporaryPassword()` next to the shared rule).
- **Frontend (PR 2):** `frontend/app/dashboard/admin/users/page.tsx` (new), navigation in
  `frontend/app/dashboard/layout.tsx`, `frontend/lib/users.ts` (pure helpers: search, labels,
  allowed actions) with `frontend/lib/users.test.ts`, `frontend/lib/types.ts`.
- **Tests:** unit (`users.service.spec.ts`, `password-policy.spec.ts`), new API e2e
  `backend/test/admin-users.e2e-spec.ts`, new Playwright `e2e/tests/18-admin-users.spec.ts` (or the
  next free number), re-run of `09-header-layout.spec.ts`.
- **Docs:** `docs/runbook-despliegue.md`, `docs/security-owasp.md`, guide, `docs/qa/catalog.mjs`,
  `CHANGELOG.md`.
- **API contract:** additive (one new route).
