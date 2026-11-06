## Context

- **Tokens today** (`backend/src/auth/auth.service.ts`): `issueTokens` signs `{ sub, email, role }`
  as the access token (`JWT_SECRET`, 15m) and the same payload plus `pwv` as the refresh token
  (`JWT_REFRESH_SECRET`, 7d). `pwv` = first 22 characters of base64url(HMAC-SHA256(
  `JWT_REFRESH_SECRET`, `passwordHash`)) (`account-self-service` D6). `refresh` re-reads the user and
  compares `pwv` in constant time.
- **Per-request check** (`effective-session-checks`, merged in #90, not archived yet):
  `JwtStrategy.validate` runs `user.findUnique({ where: { id }, select: { id, email, role, active } })`
  after passport verified signature and expiry, and answers 401 "Sesión no válida" for a missing or
  inactive user. The global `ThrottlerGuard` runs before it.
- **Writers of `passwordHash`:** register, `PATCH /users/me/password` (returns a new pair issued from
  the new hash), `POST /users/:id/reset-password` (admin, never the caller's own id), the seed (seed
  admin). Every write produces a new argon2 hash (random salt), hence a new fingerprint.
- **Web** (`frontend/lib/api.ts`): a 401 triggers one refresh with the **stored** tokens; a rejected
  refresh clears the session only if the stored refresh token is still the rejected one
  (`account-self-service` D7). `auth-context.tsx` follows the same path for `/auth/me`.

Checked against the premise of the request: (1) the window and the base proposal are as described;
(2) **the deploy does not force a re-login** (unlike `account-self-service`): refresh tokens already
carry `pwv`, so an old access token gets one 401 and the web refreshes it transparently; (3) no
migration is needed.

## Goals / Non-Goals

**Goals:** after any change of a user's password hash, every access token issued before it is
rejected at its next request; the session that made the change continues; no migration.

**Non-Goals:** see the proposal.

## Decisions

### D1. One fingerprint, in both tokens

- New pure module `backend/src/auth/password-fingerprint.ts`:
  `passwordFingerprint(hash: string, secret: string): string` and
  `matchesFingerprint(claim: unknown, hash: string, secret: string): boolean` (type check, equal
  length, `timingSafeEqual`). `AuthService` and `JwtStrategy` both use it; the private methods of
  `AuthService` go away.
- `issueTokens` builds `pwv` once and puts it in **both** payloads. `JwtPayload` gains
  `pwv?: string`; `RefreshPayload` stays as an alias for compatibility of the existing tests.
- Same secret (`JWT_REFRESH_SECRET`) and same value in both tokens: one helper, one rule. The claim is
  already readable inside the refresh token; putting it in the access token discloses nothing new (an
  HMAC with a server secret reveals nothing usable about the hash, and the secret does not sign the
  access token). A second fingerprint keyed with `JWT_SECRET` was considered and rejected: two values
  to keep in sync for no security gain.

### D2. The check in `JwtStrategy.validate`

- `select` becomes `{ id, email, role, active, passwordHash }`.
- Order: missing or inactive → 401 "Sesión no válida" (unchanged); then
  `!matchesFingerprint(payload.pwv, user.passwordHash, refreshSecret)` → 401 "Sesión no válida".
  Same message for both (P2 of `effective-session-checks`): the web does not show it, and a distinct
  text would tell a token holder that the password was changed.
- Return value unchanged: `{ sub, email, role }` from the row. `passwordHash` never reaches
  `req.user`, logs or responses.
- The strategy reads `JWT_REFRESH_SECRET` with `config.getOrThrow` in its constructor (existing
  variable, already required to issue tokens; no new variable).

### D3. Cost, and why no column

- **Same query, one more column:** the row is already read by primary key; `passwordHash` is an
  argon2id encoded string of about 97 bytes. No extra round trip, no index change.
- **CPU:** one HMAC-SHA256 over ~100 bytes per authenticated request, on the order of a microsecond;
  negligible next to the database round trip. No argon2 work per request (the hash is only HMAC'd,
  never verified).
- **Alternatives evaluated:**
  - `passwordVersion Int` (or `tokenVersion`) column incremented on every hash write: compares an
    integer instead of an HMAC, and would allow "salir de todos los dispositivos" without a password
    change. Needs a **migration** and a bump in every writer (register, change, admin reset, seed);
    forgetting one silently breaks revocation. The CPU gain is irrelevant. Rejected for now; it
    becomes worth it only together with a "cerrar sesiones" feature.
  - `passwordChangedAt` compared with the token's `iat`: **migration**, and `iat` has one-second
    resolution, so a token issued in the same second as the change is ambiguous (the new pair of the
    session that made the change would collide). Rejected.
  - Truncated raw hash in the token: exposes salt and part of the hash in a readable claim. Rejected;
    the HMAC exists for this.
  - In-memory cache of the fingerprint: reopens the window and is not shared across processes.
    Rejected (same reasoning as `effective-session-checks` D2).

### D4. Tokens issued before the deploy

- An access token without `pwv` is rejected (401). The web refreshes with its refresh token, which
  carries `pwv` since `account-self-service` (1.12.0); if that refresh token is valid the user does
  not notice anything. A refresh token from before 1.12.0 would already be rejected today.
- Accepting access tokens without `pwv` until they expire was considered: it buys nothing for the web
  (the refresh is transparent) and would let a stolen pre-deploy access token survive a password
  change for 15 more minutes. Rejected; no owner question needed, the default is stated in Open
  Questions.
- Rollback to the previous API: tokens with the extra claim are accepted there (extra claims are
  ignored). No data to revert.

### D5. The session that changed the password, and requests in flight

- `PATCH /users/me/password` already returns a pair issued from the new hash; the web stores it. Its
  **old** access token now dies too. A request sent with it that reaches the API after the hash
  update gets 401 from the guard **before the handler runs** (so a retried `POST` is never executed
  twice), and `api.ts` refreshes with the stored (new) refresh token, or retries with the stored pair
  if it was replaced meanwhile (D7 of `account-self-service`). No web change.
- Other tabs of the same browser share `localStorage` and pick up the new pair the same way.
- Other devices: their next request gets 401, their refresh gets 401, and the web sends them to
  `/login`.
- Admin reset: the admin's own session is untouched (resetting one's own id is refused); the target's
  sessions end at their next request. The users page guidance "deactivate, reset, reactivate" becomes
  unnecessary for this purpose.
- Seed reset of `SEED_ADMIN_PASSWORD`: every live session of the seed admin ends at its next request.

### D6. Impact on existing tests (grep over `backend/test`, `backend/src`, `e2e/tests`, `scripts/`)

- **Must change:**
  - `jwt.strategy.spec.ts`: the `select` assertion gains `passwordHash`; the payloads used in the
    valid cases must carry a matching `pwv` (computed with the helper and the mocked secret).
  - `auth.service.spec.ts` "el refresh token lleva pwv y el access token no" becomes "el access token
    y el refresh token llevan la misma pwv".
  - `e2e/tests/15-account.spec.ts`: expected success text (D7).
- **Unaffected (checked):**
  - `account.e2e-spec.ts`: after the change it only uses the new pair (`tokensC`); the old access
    token `tokensA.accessToken` is not used again. The deactivation and 429 tests use `tokensC`.
  - `admin-users.e2e-spec.ts`: after resetting Ana it only uses her old refresh token (expects 401)
    and the admin's and Bruno's tokens, whose passwords do not change.
  - `session-checks.e2e-spec.ts`, `scripts/parallel-session-test.mjs`: no password writes.
  - Playwright storage states are created after the seed and no journey changes a seed user's
    password (`15-account` uses a throwaway user).
- **No test forges an access token today**; the new deploy-compatibility test does it on purpose with
  the app's `JwtService` (D8).

### D7. Web wording

The success message of "Mi cuenta" becomes **"Contraseña actualizada. Se cerraron las sesiones
abiertas en otros dispositivos."** (default; P1). The guide note of "Mi cuenta"
(`docs/guia-plataforma.html`) and `docs/security-owasp.md` drop the "hasta 15 minutos". If
`admin-password-reset` PR 2 (users page) is merged before this change, its reset confirmation changes
"sus sesiones abiertas se cerrarán en unos minutos" to "sus sesiones abiertas se cerrarán"; if it is
not merged yet, that PR uses the new text directly (coordination, P2).

### D8. Tests

- **Unit** `backend/src/auth/password-fingerprint.spec.ts`: 22 base64url characters; differs from
  the hash; changes when the hash changes; `matchesFingerprint` false for `undefined`, a number, a
  shorter string and another hash's fingerprint, true for its own.
- **Unit** `jwt.strategy.spec.ts`: new "validate: pwv que no coincide con el hash actual responde 401
  'Sesión no válida'", "validate: access token sin pwv responde 401", and "validate no devuelve
  passwordHash".
- **Unit** `auth.service.spec.ts`: the access and refresh payloads carry the same `pwv`.
- **API e2e** `account.e2e-spec.ts` (inside the existing change test, no extra login):
  "ACCOUNT: tras el cambio el access token anterior responde 401 y el nuevo sigue sirviendo"
  (`GET /api/auth/me` with `tokensA.accessToken` → 401 "Sesión no válida"; with `tokensC.accessToken`
  → 200). Plus "ACCOUNT: un access token sin pwv (anterior al despliegue) responde 401 y el refresh lo
  repone" (sign `{ sub, email, role }` with the app's `JwtService`, expect 401; then refresh with the
  current refresh token → 200).
- **API e2e** `admin-users.e2e-spec.ts`: keep Ana's access token from the existing login and add
  "RESET: el access token emitido antes del reinicio responde 401 al instante" (`GET /api/auth/me`).
- No new Playwright journey: the web behaviour on 401 is unchanged and covered by `TC-AUTH-10`,
  `TC-AUTH-13`, `TC-AUTH-14`; only the expected text of `15-account` changes. No extra logins anywhere
  (the login limit is untouched).

### D9. QA cases

- New **`TC-AUTH-23`** "Un cambio de contraseña corta al instante los access tokens anteriores"
  (Alta, Seguridad, guide 1.5): change from Mi cuenta, admin reset and pre-deploy token; auto: the
  e2e tests of D8 and the new unit tests. Free at the time of writing (highest `TC-AUTH` is 22; no
  open change reserves 23); re-check before adding it, since the users page work runs in parallel.
- `TC-AUTH-16`: expected text of the success message; `TC-AUTH-21`: "las sesiones abiertas se cortan
  en su próxima petición" instead of "en su próxima renovación".

## Risks / Trade-offs

- **`JWT_REFRESH_SECRET` rotation now also ends access tokens at once** (before, only at refresh) →
  same outcome for the user (log in again), a few minutes earlier. Documented in the runbook note of
  `docs/security-owasp.md`.
- **One 401 + refresh for every open session right after the deploy** → a burst of `/auth/refresh`
  calls, one per active tab; refresh allows 20 per minute per IP (`auth.controller.ts`), far above
  the tabs of one person or office, and the platform has a handful of users. Accepted.
- **Database down** → unchanged from `effective-session-checks` (authenticated routes fail).
- **Hand-made API clients** (curl, scripts with a pasted access token) get 401 once after the deploy
  or after any password change → stated in the CHANGELOG.
- **Ordering with open changes:** this change modifies requirements that `effective-session-checks`
  (`session-validity`) and `admin-password-reset` (`user-administration`) add. Both must be archived
  before this one (release order); the deltas were written against their current text.

## Migration Plan

- **No schema change, no data migration, no new environment variable, no new dependency.**
- Deploy API and web together (the web change is one text). Live sessions get one transparent
  refresh; nobody logs in again.
- **Rollback:** redeploy the previous API and web; tokens issued meanwhile stay valid there.

## Open Questions

- **P1. Success text of "Mi cuenta".** [NO BLOQUEANTE] Default: "Contraseña actualizada. Se
  cerraron las sesiones abiertas en otros dispositivos." Alternative: keep today's text (now
  inaccurate). Recommendation: the default. The spec uses it.
- **P2. Order with the users page (`admin-password-reset` PR 2).** [NO BLOQUEANTE] Options: (a) this
  change lands after PR 2 and updates its confirmation text; (b) PR 2 adopts the new text now.
  Recommendation: (a), so PR 2 is not blocked; the task is conditional.
- Default without a question: access tokens without `pwv` are rejected after the deploy (D4).
