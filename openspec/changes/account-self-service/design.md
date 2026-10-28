## Context

- **Auth today** (`backend/src/auth/`): `login` and `register` return `{ user, tokens }`;
  `issueTokens` signs the same payload `{ sub, email, role }` twice, the access token with
  `JWT_SECRET` (`JWT_ACCESS_EXPIRES_IN`, 15m) and the refresh token with `JWT_REFRESH_SECRET`
  (`JWT_REFRESH_EXPIRES_IN`, 7d). `refresh` verifies the token, re-reads the user (rejects missing
  or inactive) and issues a new pair. There is no `jti`, no revocation list and no column that
  changes when the password changes other than `updatedAt` (which also changes with the name or
  the role). `JwtStrategy.validate` does not touch the database.
- **Throttling:** global `ThrottlerGuard` (`THROTTLE_LIMIT`/`THROTTLE_TTL_MS`); `register` and
  `login` override it with 5 per minute, `refresh` with 20. The tracker is the client IP
  (`TRUST_PROXY`). Buckets are per route, in memory, per process.
- **Users** (`backend/src/users/`): `PATCH /users/me/password` (`ChangePasswordDto`:
  `currentPassword`, `newPassword` with `MinLength(8)` only) verifies with argon2, answers 401
  "Contraseña actual incorrecta" on mismatch and 204 on success. `PATCH /users/:id` is admin only.
  `UsersService.resetPassword` exists but no route uses it. `ValidationPipe` runs with
  `whitelist` and `forbidNonWhitelisted`.
- **Registration rule** (`RegisterDto.password`): string, `MinLength(8)`, `MaxLength(72)`,
  `Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)` with "La contraseña debe incluir al menos una letra y un
  número". `name`: string, `MinLength(2)`.
- **Web** (`frontend/lib/api.ts`): on a 401 with a refresh token it calls `/auth/refresh` and
  repeats the request; a 400/401/403 from the refresh clears the stored tokens and goes to
  `/login`. Tokens live in `localStorage` (`reto.tokens`), shared by all tabs.
  `auth-context.tsx` loads the user from `/auth/me`. The header (`dashboard/layout.tsx`) shows the
  user's name and role and the sections; `09-header-layout.spec.ts` (TC-UI-10) checks it fits.
- **Seed** (`backend/prisma/seed.ts`): upserts the admin; on an existing admin it overwrites
  `name` and `passwordHash` with `SEED_ADMIN_*`. In production it fails without
  `SEED_ADMIN_PASSWORD`.
- **E2E:** Playwright reuses stored sessions of the seed admin and a seed participant
  (`e2e/fixtures/auth.setup.ts`, `STATE`), with every worker sharing them.

## Goals / Non-Goals

**Goals:**
- The seed admin, and any user, rotates their password from the web after the first login.
- A password change ends every other session within one access-token lifetime, without a
  migration.
- The current password cannot be brute-forced faster than the login itself.
- A user fixes their own display name without an admin.

**Non-Goals:**
- Email recovery, 2FA, history, email change, account deletion, forced-change flag, `jti`,
  per-account lockout, admin user management (see proposal).

## Decisions

### D1. One page, "Mi cuenta", for every role

`/dashboard/account`, inside the dashboard layout (session required), added as the **last item of
the header navigation** for participants and admins (label "Mi cuenta"). Content:

1. "Tus datos": email and role, read only (from the auth context, no new request).
2. "Nombre": one field prefilled with the current name and "Guardar nombre".
3. "Contraseña": "Contraseña actual", "Nueva contraseña", "Repite la nueva contraseña" and
   "Cambiar contraseña", with `autocomplete` `current-password` / `new-password`, and the hint
   "Mínimo 8 caracteres, con al menos una letra y un número."

The forms are independent: each has its own pending state and message, and saving one does not
clear the other. The navigation item is preferred over a link on the name because the name block
is hidden on narrow screens (`hidden sm:block`); see P1.

### D2. Name: `PATCH /api/users/me` with only `{ name }`

- New `UpdateMeDto` with a single property `name`: trimmed (`Transform`), `IsString`, 2 to 80
  characters after trimming; message "El nombre debe tener entre 2 y 80 caracteres". Any other
  property (`role`, `active`, `email`, `passwordHash`) is refused by `forbidNonWhitelisted` with
  400, so the route cannot escalate privileges.
- The route is declared **before** `PATCH :id` so `me` is not taken as an id; it has no `@Roles`
  (any authenticated user) and acts on `user.sub` only.
- Answers 200 with the safe user (`SAFE_USER_SELECT`, never `passwordHash`).
- The web updates the user in the auth context from the response (new `updateUser` or a reload of
  `/auth/me`), so the header and the page show the new name without reloading.
- **The name is read live everywhere**, including the results and the CSV record of closed
  challenges (no snapshot exists). The email stays the stable identifier of the record. This is
  accepted: it is the same thing that happens today when an admin renames a user.
- The global throttle is enough; renaming has no security value to attack.

### D3. Password rule: one shared validator

A composed decorator (for example `IsAccountPassword()` in `backend/src/auth/password-policy.ts`)
applies `IsString`, `MinLength(8)`, `MaxLength(72)` and the letter-and-digit `Matches`, with
Spanish messages:

- "La contraseña debe tener al menos 8 caracteres"
- "La contraseña no puede superar 72 caracteres"
- "La contraseña debe incluir al menos una letra y un número" (unchanged)

`RegisterDto.password` and `ChangePasswordDto.newPassword` both use it. The only visible change to
registration is that the length messages are now in Spanish. `currentPassword` is only
`IsString`, not empty, `MaxLength(256)`: it must match whatever the stored hash was made from (the
seed password is not bound by the rule), and the cap avoids hashing huge inputs.

If `newPassword` equals `currentPassword` the API answers 400 "La nueva contraseña debe ser
distinta de la actual". The check compares the two inputs before any hashing, so it reveals
nothing about the stored password.

### D4. Wrong current password answers 400, not 401

The web retries any 401 after refreshing the token (`api.ts`). A wrong current password is not an
expired session: answering 401 makes the web refresh, repeat the attempt (a second argon2
verification and a second hit on the limit) and fail again. The API therefore answers **400
"Contraseña actual incorrecta"** (same text as today). 401 stays reserved for "no valid session":
a missing or inactive user behind a still-valid access token answers 401 (the web refresh then
fails and sends the user to the login).

Order inside `changePassword`: load user (401 if missing or inactive) → equal inputs (400) →
verify current (400) → hash and save → issue the new token pair.

### D5. Brute force: 5 attempts per minute per IP

`PATCH /users/me/password` gets `@Throttle({ default: { limit: 5, ttl: 60_000 } })`, exactly like
`login`. Only someone who already holds a valid access token can call it, so this route never
makes guessing easier than `/auth/login`, which already allows 5 per minute per IP with nothing
but the email. The throttler runs before validation, so invalid bodies count too; 429 uses the
existing message and the web shows "Demasiados intentos. Espera un minuto e inténtalo de nuevo."

Keying the limit by user instead of IP needs a route-level guard after `JwtAuthGuard` (the global
throttler runs before authentication); it is not needed while login itself is per IP (P3).

### D6. Session after a password change: the change ends the other sessions, no migration

- **Fingerprint claim.** `issueTokens` adds to the **refresh** token payload a claim `pwv` =
  first 22 characters of base64url(HMAC-SHA256(`JWT_REFRESH_SECRET`, `passwordHash`)). The argon2
  hash has a random salt, so every password change (and every seed or admin reset) produces a new
  hash and a new fingerprint. The access token payload does not change.
- **Check.** `refresh` already loads the user; it recomputes the fingerprint from the current hash
  and compares it in constant time with the claim. Mismatch or missing claim → 401 "Refresh token
  inválido" (same answer as any invalid refresh token).
- **The session that made the change continues:** `PATCH /users/me/password` answers **200
  `{ accessToken, refreshToken }`** issued from the new hash; the web stores them. Because the
  tokens are in `localStorage`, other tabs of the same browser keep working too.
- **Other devices:** their access token keeps working until it expires (at most
  `JWT_ACCESS_EXPIRES_IN`, 15 minutes by default); their next refresh answers 401 and the web sends
  them to `/login`. This residual window is accepted: closing it needs a database read in
  `JwtStrategy` on every request (item #11 of the roadmap) or a persisted `jti`.
- **No migration, no new variable:** the secret is the existing `JWT_REFRESH_SECRET`; the hash is
  the existing column. The HMAC means the claim discloses nothing usable about the hash. A
  persisted `jti` or a revocation list would allow ending one specific session ("cerrar esta
  sesión") and needs a table: it stays in "Mejoras futuras" of `docs/security-owasp.md`.
- **Deploy effect:** refresh tokens issued by the previous version have no `pwv` and are rejected,
  so every user logs in again once, at their first refresh after the deploy. Accepting tokens
  without the claim would keep a stolen pre-deploy token alive for up to 7 days after a rotation,
  which is exactly the case of the seed admin; see P2.

### D7. The web keeps tokens that were replaced meanwhile

With the session shared by all tabs, a refresh started in tab B before tab A changed the password
returns 401 after the change, and today B would erase the new tokens A just stored (logging out
both). Rule: when a refresh is rejected, `api.ts` (and the 401 path of `auth-context.tsx`) clears
the stored tokens **only if the stored refresh token is still the one that was rejected**;
otherwise it retries once with the stored tokens. Every other behaviour of TC-AUTH-10, TC-AUTH-13
and TC-AUTH-14 stays as is.

### D8. The seed admin: rotation through "Mi cuenta", recovery through the seed

No code change to the seed. The runbook makes the rotation explicit and closes the two traps:

- **§1.5 step 3 (first deploy):** log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, open "Mi
  cuenta", change the password to a new one stored in the team's secret manager, then **delete
  `SEED_ADMIN_PASSWORD` from the API service** (redeploy not needed for the running app). Reason:
  the seed overwrites an existing admin's password, so a later accidental `npx prisma db seed` would
  revert the rotation; without the variable it fails in production instead.
- **§1.6 check:** "Mi cuenta" shows the admin; logging in with the old seed password answers
  "Credenciales inválidas".
- **Recovery of a lost admin password** (there is no email): set a new temporary
  `SEED_ADMIN_PASSWORD`, run the seed from the API shell, log in, rotate it in "Mi cuenta" and
  delete the variable again. The reset changes the hash, so it also ends the old admin sessions
  (D6).
- §7 row of `SEED_ADMIN_*`: "Solo para el primer seed o para recuperar el acceso; se borra tras
  cambiar la contraseña en Mi cuenta".

### D9. Privacy and logging

The page shows only the user's own data from `/auth/me`. No response includes `passwordHash` or the
fingerprint. The access log already omits bodies and tokens; nothing new is logged (no "password
changed" line with personal data). Error messages never say whether the stored password had a
given property beyond "Contraseña actual incorrecta".

### D10. Tests within the login limit

- **API e2e:** a new file `backend/test/account.e2e-spec.ts` with its own Nest app, so its
  throttle buckets start empty and do not interfere with `platform-rules.e2e-spec.ts` (which
  exhausts the login bucket on purpose). It registers its own users (the registration answer
  brings tokens, so no extra login): at most 2 registrations, 2 logins (old password rejected, new
  accepted) and one sequence of 6 password requests whose sixth is the 429.
- **Playwright:** one journey with a throwaway user created by `POST /auth/register` (tokens
  injected into `localStorage`, no login), because changing a seed user's password would revoke the
  sessions every other worker shares (D6). It makes 2 password requests (wrong current, success)
  and no login; the new password at the login is covered by the API e2e.
- The header journey (TC-UI-10) is re-run because the navigation gets one item more.

## Risks / Trade-offs

- **Up to 15 minutes of access after a rotation on other devices** → accepted (D6); documented in
  the guide and `docs/security-owasp.md`. Lowering `JWT_ACCESS_EXPIRES_IN` shortens it without code.
- **Everybody logs in once after the deploy** → small user base, announced in the CHANGELOG and the
  runbook; users behind the same IP share the 5/min login limit, so in the worst case someone waits
  a minute. See P2.
- **Contract change of `PATCH /users/me/password` (204→200, 401→400)** → no client uses it; a
  hand-made client that expected 204 still sees a 2xx.
- **IP-based limit can be bypassed by rotating IPs** → the same is true of login today; the token
  requirement and argon2 cost bound it. P3.
- **Header width** with one more item → the navigation already scrolls horizontally; TC-UI-10 is
  re-run and adjusted if the admin header no longer fits on one row.
- **Renaming changes closed-challenge records** (D2) → accepted, the email is the stable key.
- **Seed re-run after rotation** → closed by deleting `SEED_ADMIN_PASSWORD` (D8).

## Migration Plan

- **No schema change, no data migration, no new environment variable, no new dependency.**
- Deploy API and web together (the web page expects the 200 with tokens). After the deploy each
  user logs in again once (D6).
- First deploy only: follow the new §1.5 step 3 and remove `SEED_ADMIN_PASSWORD`.
- **Rollback:** redeploy the previous API and web together. Refresh tokens issued by the new
  version carry an extra claim the old version ignores, so sessions survive the rollback; the
  passwords changed meanwhile stay changed (they are ordinary argon2 hashes).

## Open Questions

- **P1. Where the page is reached.** [NO BLOQUEANTE]
  Options: (a) "Mi cuenta" as the last navigation item; (b) the name block in the header becomes the
  link; (c) both. Recommendation: (a), because the name block is hidden on phones and the
  navigation already scrolls; (b) would leave phones without access. The spec uses (a).
- **P2. Refresh tokens issued before the deploy.** [NO BLOQUEANTE]
  Options: (a) reject them (one re-login for everybody after the deploy); (b) accept tokens without
  `pwv` until they expire (7 days), then reject. Recommendation: (a), because (b) keeps a leaked
  pre-deploy token alive for a week after the seed admin rotates, which is the main purpose of the
  change. The spec uses (a).
- **P3. Per-account lockout or per-user limit.** [NO BLOQUEANTE]
  Options: (a) 5 per minute per IP, like login; (b) also a per-user limit through a route guard;
  (c) temporary lockout after N failures (needs a counter, so a column or an in-memory map that a
  restart clears). Recommendation: (a) now; (c) belongs with login in a future change ("Bloqueo
  temporal de cuenta" in `docs/security-owasp.md`). The spec uses (a).
- **P4. Name length.** [NO BLOQUEANTE]
  Options: (a) 2 to 80 characters, trimmed, only for "Mi cuenta"; (b) the registration rule as is
  (2 or more, no maximum, not trimmed); (c) (a) and apply it to registration too.
  Recommendation: (a): a maximum keeps the ranking and the CSV readable, and changing registration
  is outside this change. The spec uses (a).

None of the questions blocks the approval: each has a recommended default written into the spec.
