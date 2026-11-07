## Why

A password change from "Mi cuenta" (`account-self-service`) and an admin reset
(`admin-password-reset`) end the user's other sessions through the fingerprint claim `pwv`, but only
**at their next refresh**: `pwv` is in the refresh token only, so an access token issued before the
change keeps working until it expires (`JWT_ACCESS_EXPIRES_IN`, 15 minutes by default). The case that
matters is a stolen session: after the owner of the account (or an admin) changes the password, the
thief keeps full access for up to 15 minutes. Today the only way to cut it at once is to deactivate
the account and reactivate it after the reset (guidance written into `admin-password-reset` D3).

`effective-session-checks` (merged, release pending) made `JwtStrategy.validate` read the user by
primary key on every authenticated request. Its open question P1 recorded this follow-up as cheap
once that read exists, and `docs/security-owasp.md` lists it under "Mejoras futuras".

## What Changes

- The **access token** carries the same `pwv` fingerprint as the refresh token (HMAC-SHA256 of the
  password hash with `JWT_REFRESH_SECRET`, 22 base64url characters). The computation moves to one
  pure helper shared by `AuthService` and `JwtStrategy`.
- `JwtStrategy.validate` adds `passwordHash` to the primary-key `select` it already runs and compares
  the claim in constant time; a missing or non-matching claim answers **401 "Sesión no válida"**, the
  same answer as an inactive user. The hash never leaves `validate` (`req.user` keeps
  `{ sub, email, role }`).
- Effect: after a password change, an admin reset or a reset through the seed, every access token of
  the user issued before it is rejected at its next request. The session that changed the password
  keeps working with the pair it received.
- **Deploy effect:** access tokens issued by the previous version carry no `pwv` and get one 401; the
  web refreshes them transparently (refresh tokens already carry `pwv` since 1.12.0), so users do
  **not** log in again. Hand-made API clients holding an old access token must refresh once.
- Web text: the success message of "Mi cuenta" says the other sessions were closed (no longer "se
  cerrarán en unos minutos"); same for the guide, `docs/security-owasp.md` and, if already merged,
  the reset confirmation of the users page.
- **No schema change, no migration, no new environment variable, no new dependency.** The API
  contract changes only in that a 401 can now come from a password change.

## Non-goals

- A `passwordVersion`/`tokenVersion` column or a `jti` revocation list ("cerrar esta sesión", "salir
  de todos los dispositivos" without changing the password): they need a migration (design D3).
- Caching the user lookup (it would reopen the window).
- Forced password change after an admin reset (owner decision D3 of `admin-password-reset`).
- Any change to token lifetimes, secrets or the refresh flow of the web.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `session-validity`: an access token is honoured only while the user's password hash matches its
  fingerprint.
- `account-self-service`: a password change ends the other sessions at their next request (not at
  their next refresh); access tokens carry the fingerprint; the "Mi cuenta" success message changes.
- `user-administration`: an admin reset ends the user's sessions at their next request, access
  tokens included.

## Impact

- **Backend:** new `backend/src/auth/password-fingerprint.ts` (+ unit tests);
  `backend/src/auth/auth.service.ts` (`issueTokens` adds `pwv` to the access payload; `JwtPayload`
  gains an optional `pwv`); `backend/src/auth/strategies/jwt.strategy.ts` (select and comparison);
  unit tests `jwt.strategy.spec.ts`, `auth.service.spec.ts`; API e2e `account.e2e-spec.ts` and
  `admin-users.e2e-spec.ts`.
- **Frontend:** `frontend/app/dashboard/account/page.tsx` (success text only); the users page
  confirmation text if `admin-password-reset` PR 2 is already merged.
- **E2E:** `e2e/tests/15-account.spec.ts` (expected text).
- **Docs:** `docs/qa/catalog.mjs` (new `TC-AUTH-23`; `TC-AUTH-16`, `TC-AUTH-21` updated),
  regenerated `docs/qa/test-cases.*`, `docs/guia-plataforma.html` (note of "Mi cuenta"),
  `docs/security-owasp.md`, `CHANGELOG.md` ("Sin publicar", with the deploy effect).
- **Data:** none. Rollback is redeploying the previous API (tokens with the extra claim stay valid
  there) and web.
- **Delivery:** one PR from `feature/instant-token-revocation` (from `develop`) to `develop`, after
  `effective-session-checks` and `admin-password-reset` are archived or at least merged (it modifies
  their requirements).
