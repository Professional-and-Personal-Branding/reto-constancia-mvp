## Why

Nobody can change their own password or name from the web:

- **The API already has `PATCH /api/users/me/password`**, but no screen calls it. In production
  Swagger is off (`platform-operations`), so the endpoint is reachable only with hand-made HTTP
  calls.
- **The runbook asks for something that cannot be done.** `docs/runbook-despliegue.md` §1.5 step 3
  says "Entra a la web con el administrador y cambia su contraseña", and §7 says the seed password
  "se cambia tras el primer login". Today the only ways are Swagger (off) or the database. The seed
  admin therefore keeps the password that lives in the service environment
  (`SEED_ADMIN_PASSWORD`).
- **Changing the password does not end other sessions.** A refresh token stays valid for 7 days
  (`JWT_REFRESH_EXPIRES_IN`) whatever happens to the password, so rotating a leaked password does
  not lock out whoever holds an old refresh token.
- **The endpoint has gaps of its own:** it accepts any 8-character string (the registration rule
  "una letra y un número", max 72, is not applied), it has no specific brute-force limit on the
  current password, and a wrong current password answers 401, which the web treats as an expired
  access token (it refreshes and repeats the request, so every wrong guess is verified twice).
- **A participant cannot fix their display name**, which other participants see in the ranking.
  Only an admin can, through `PATCH /api/users/:id` (API only).

This is increment 1 of item #10 of `docs/propuestas-features-2026-10-04.md` ("Mi perfil:
contraseña, nombre e historial"): it delivers the password rotation of the seed admin and the name
change; the history across challenges is left out.

## What Changes

- **New web page "Mi cuenta"** (`/dashboard/account`), last item of the header navigation for every
  role. It shows the email and role (read only) and two forms:
  - **Nombre:** edit and save; the header shows the new name at once.
  - **Contraseña:** current password, new password and confirmation. The confirmation is checked in
    the browser ("Las contraseñas no coinciden"); the rule is the registration rule.
- **New endpoint `PATCH /api/users/me`** with body `{ name }` only. Any other field (`role`,
  `active`, `email`) is refused with 400 by the existing whitelist. Name trimmed, 2 to 80
  characters.
- **`PATCH /api/users/me/password` is hardened** (contract change, flagged):
  - The new password follows the registration rule, extracted into one shared validator used by
    both DTOs; the new password must differ from the current one.
  - A wrong current password answers **400** "Contraseña actual incorrecta" instead of 401, so the
    web does not refresh and retry it.
  - Limited to **5 requests per minute per IP**, the same limit as login.
  - Success answers **200 with a new token pair** instead of 204, so the session that made the
    change continues.
- **Changing the password ends the other sessions** without a migration: refresh tokens carry a
  fingerprint of the password hash and `/auth/refresh` rejects a token whose fingerprint does not
  match the current hash. Other devices are sent to the login at their next refresh (at most
  `JWT_ACCESS_EXPIRES_IN`, 15 minutes). Access tokens already issued are not revoked.
- **The web never discards tokens that were replaced meanwhile:** a rejected refresh clears the
  stored session only if it still holds the refresh token that was rejected (protects the tab that
  just changed the password from another tab's late refresh).
- **Runbook:** §1.5 gets the explicit rotation step through "Mi cuenta", removing
  `SEED_ADMIN_PASSWORD` from the service afterwards; §1.6 gets the check; the recovery path for a
  lost admin password (temporary `SEED_ADMIN_PASSWORD` + seed) is documented; §2/§4 note the one-time
  re-login after the deploy.
- Guide (new step in section 1), QA catalog (TC-AUTH-15 to TC-AUTH-18) and `CHANGELOG.md`.
- **No schema change, no migration, no new dependency, no new environment variable.**
- **One-time effect of the deploy:** refresh tokens issued before the deploy have no fingerprint and
  are rejected, so every user logs in again once (design D6, P2).

## Non-goals

- Password recovery by email or "olvidé mi contraseña" (there is no email; discarded by the owner).
- Two-factor authentication.
- The history across challenges of item #10 (increment 2).
- Changing the email, deleting the account, uploading an avatar.
- A forced "change your password" flag for the seed admin (needs a column, so a migration); the
  runbook step replaces it.
- Revoking access tokens before they expire, a persisted `jti` or a revocation list (needs a
  migration; stays in "Mejoras futuras" of `docs/security-owasp.md`).
- Per-account lockout after N failures (P3).
- Admin user management from the web (reset, role, deactivation: item #11).
- Changing the registration form or its messages beyond the shared password validator.

## Capabilities

### New Capabilities
- `account-self-service`: an authenticated user changes their own name and password from the web,
  under the registration password rule, with a brute-force limit, and a password change ends the
  other sessions at their next refresh.

### Modified Capabilities
<!-- None: there is no auth capability spec yet; session behaviour introduced here is specified in
account-self-service. -->

## Impact

- **Backend:** `backend/src/users/` (controller: `PATCH me` declared before `PATCH :id`, throttle
  on `me/password`; service: `updateMyName`, `changePassword` returns tokens; new
  `dto/update-me.dto.ts`; `dto/change-password.dto.ts`), `backend/src/auth/` (shared password
  validator, fingerprint claim in `issueTokens`, check in `refresh`, `AuthService` exported for
  `UsersService` or a small token helper), `register.dto.ts` uses the shared validator.
- **Frontend:** `frontend/app/dashboard/account/page.tsx` (new), navigation in
  `frontend/app/dashboard/layout.tsx`, `frontend/lib/api.ts` (conditional clearing on a rejected
  refresh), `frontend/lib/auth-context.tsx` (update the user after a name change; same conditional
  clearing), a pure helper for API error messages with web unit tests.
- **Tests:** unit (`users.service.spec.ts`, `auth.service.spec.ts`), new API e2e file
  `backend/test/account.e2e-spec.ts`, one Playwright journey `e2e/tests/15-account.spec.ts`
  (or the next free number), re-run of `09-header-layout.spec.ts`.
- **Docs:** runbook §1.5, §1.6, §2/§4 notes and §7 row; guide; `docs/qa/catalog.mjs`;
  `docs/security-owasp.md` (refresh tokens now end on password change); `CHANGELOG.md` (Sin
  publicar).
- **API contract changes (flagged):** `PATCH /api/users/me/password` answers 200 `{ accessToken,
  refreshToken }` instead of 204, and 400 instead of 401 for a wrong current password. No client
  uses it today.
- **Data:** none. Rollback is redeploying the previous API and web together (design, Migration
  Plan).
