## Context

- **Auth today** (`backend/src/auth/`): `issueTokens` signs `{ sub, email, role }` as the access
  token (`JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, 15m) and the same payload plus the password
  fingerprint `pwv` as the refresh token (`JWT_REFRESH_SECRET`, 7d). `refresh` re-reads the user and
  rejects a missing or inactive one or a fingerprint that does not match. `JwtStrategy.validate`
  returns the payload as is: nothing reads the database between two refreshes.
- **Who reads `req.user`:** `RolesGuard` (`user.role`), `@CurrentUser()` in every controller
  (`user.sub`, and `user.role` in `activities.controller.ts` for `findOneForViewer` and `remove`),
  `isAdmin()` in `challenges/privacy.ts` (projections of the challenge, the active list and the
  results) and the access log (`common/request-log.ts`, `userId` only).
- **Guards order:** `ThrottlerGuard` is an `APP_GUARD` (global), so it runs before the
  controller-level `JwtAuthGuard`/`RolesGuard`. Passport verifies signature and expiry before calling
  `validate`.
- **Users** (`backend/src/users/`): `PATCH /users/:id` (admin) takes `UpdateUserDto`
  (`name`, `role`, `active`) and writes it without conditions. `User` has `role` and `active`; the
  table is `"User"` (no `@@map`).
- **Web:** `lib/api.ts` answers a 401 by refreshing; a rejected refresh clears the session and goes
  to `/login`. `auth-context.tsx` loads the user from `/auth/me` (`getProfile`, database), so the
  header already shows the database role after a reload.

Checked against the approved proposal (CON-1): the gap and the 15-minute window are as described.
Two points the proposal did not mention and this design adds: the stale role also leaks the admin
data projection (`privacy.ts`), and the last-admin check needs a lock to be correct under concurrency
(D4).

## Goals / Non-Goals

**Goals:** a deactivated user loses access on their next request; authorization and data projection
use the current role; the platform can never be left without an active admin through the API; an
admin cannot lock themselves out by deactivating their own account.

**Non-Goals:** instant revocation after a password change (P1), caching, any web change, any schema
change.

## Decisions

### D1. `JwtStrategy.validate` reads the user by primary key

`validate(payload)` becomes `async` and runs
`prisma.user.findUnique({ where: { id: payload.sub }, select: { id, email, role, active } })`.
Missing or `active: false` → `throw new UnauthorizedException('Sesión no válida')` (the message
`changePassword` already uses). Otherwise it returns `{ sub: user.id, email: user.email, role:
user.role }`, the same `JwtPayload` shape, so no consumer changes. The token's `email` and `role`
claims are ignored for authorization from then on (they stay in the token for compatibility).

`UsersService.changePassword` keeps its own active check (defence in depth; its unit test stays).

### D2. Cost of one query per request

- The query is a primary-key lookup of four columns; on the local Postgres it is well under a
  millisecond, and on Seenode it adds one round trip to the database per authenticated request
  (the web makes a handful per page).
- It runs **only after a valid signature**: unsigned, malformed or expired tokens are rejected by
  passport first, and requests over the limit are rejected by the global `ThrottlerGuard` before the
  JWT guard, so neither path reaches the database. The throttle counters are not affected (an
  inactive user's request still counts, as today).
- `POST /auth/refresh` is not behind `JwtAuthGuard` and keeps its own lookup: no double query.
- No cache: an in-memory cache with a TTL would reopen the window this change closes and would not
  be shared between processes. Rejected.
- Prisma's connection pool is unchanged; no new environment variable.

### D3. Role changes take effect at the next request

A demoted admin gets 403 "No tienes permiso para esta acción" on admin routes and the participant
projection (no emails, no payments of others) on shared routes from their next request. A promoted
participant gets admin access at once, without logging in again. The web shows the new navigation
after its next `/auth/me` (reload or new tab); a stale admin page that calls an admin route shows the
403 like any other error. Accepted: no web change.

### D4. Last-admin and self-deactivation rules, under a lock

`UsersService.update(id, dto, actorId)`:

1. Load the target (`404 "Usuario no encontrado"` as today).
2. If `dto.active === false` and `id === actorId` → 400 "No puedes desactivar tu propia cuenta".
   Checked first, so an admin who is also the last one gets this message.
3. If the change removes an active admin — the target is `ADMIN` and `active` and the DTO sets
   `active: false` or a `role` other than `ADMIN` — then, in an interactive transaction:
   `SELECT id FROM "User" WHERE role = 'ADMIN' AND active = true FOR UPDATE`; if no row other than
   the target remains → 400 "No puedes desactivar al último administrador activo" (deactivation) or
   "No puedes quitar el rol de administrador al último administrador activo" (demotion; if both are
   sent, the deactivation message). Otherwise the update runs in the same transaction.
4. Any other change (name, promotion, reactivation, changes to participants or inactive admins)
   runs as today, without the lock.

Why the lock: two admins A and B demoting each other at the same time would both count two active
admins and both succeed. With `FOR UPDATE` on the active admin rows the second transaction waits for
the first; under `READ COMMITTED` Postgres re-checks the `WHERE` of the locked rows after the wait,
so the row demoted by the first transaction drops out and the second sees only itself → 400. The
lock is short (one small `SELECT` and one `UPDATE`) and only taken for changes that remove an admin.
Transaction options follow `WRITER_TX` of `challenge-lock.ts` (lock wait 5 s, timeout 10 s).

Reachability: the caller of `PATCH /users/:id` is always an active admin (D1), so outside a race
the last active admin can only be targeted by themselves. Self-deactivation hits rule 2; the
"último administrador" messages therefore show up for a lone admin demoting themselves and for the
loser of two concurrent cross requests (A deactivates or demotes B while B does the same to A). Both
are specified and tested.

Self-demotion while other active admins remain is allowed (owner's approved scope protects the last
admin and self-deactivation only); with D1 the caller loses admin access at their next request.

### D5. Impact on existing tests

Checked with grep over `backend/test`, `e2e/tests` and `scripts/`:

- No test forges a JWT for a user that does not exist (tokens always come from `login`/`register`).
- `account.e2e-spec.ts` deactivates its own user and expects 401 on `/me/password` with the live
  token: still 401, now from the strategy. The global throttler runs before the JWT guard, so the
  request still counts as the fifth password change and the following one is still the 429.
- `e2e/tests/14-renewal.spec.ts` deactivates a throwaway user through the admin; the throwaway's
  token is never used afterwards. Unaffected.
- No suite demotes or deactivates the seed admin or the seed participants; Playwright's shared
  storage states stay valid.
- `scripts/parallel-session-test.mjs` only reads roles from `/auth/me`. Unaffected.

### D6. Release rule (owner decision D1)

- When implementation starts, the owner states whether production will be deployed before 1.13.0.
- **Yes:** branch `hotfix/effective-session-checks` from `main` (`v1.12.1`), PR to `main` as
  release **1.12.2** with only this change (version bump, CHANGELOG `## [1.12.2]`, verification as
  any release), tag `v1.12.2`, then the same branch back to `develop` (`docs/gitflow.md`, hotfix row).
  Cutting from `main` keeps any 1.13 feature already merged in `develop` out of the patch.
- **No:** branch `fix/effective-session-checks` from `develop`, ships in 1.13.0.
- Either way it is merged before `admin-password-reset`, which depends on it.

### D7. Tests within the login limit

New `backend/test/session-checks.e2e-spec.ts` with its own app (fresh throttle buckets). Users are
created with Prisma (prefix `e2e-session-`), tokens obtained with at most 4 logins. The last-admin
cases need the test's admins to be the only active ones: `beforeAll` records the ids of every other
active admin (the seed admin included), deactivates them, and `afterAll` reactivates exactly those
ids in a `finally`, then deletes the `e2e-session-` users. The API e2e suite runs `--runInBand` and
before Playwright, so nothing else uses the seed admin meanwhile.

## Risks / Trade-offs

- **One more query per request** → bounded by D2; if latency ever matters, an index-only lookup is
  already what a primary key gives. No mitigation needed now.
- **Database down** → authenticated routes now fail (500 through the generic error filter) instead of
  passing auth and failing later in the handler. Equivalent for the user; `/health/ready` already
  reports it.
- **The e2e file deactivates the seed admin temporarily** → restored in `finally`; local runs reset
  the database between the battery and the validator anyway. A crash between the two would leave the
  seed admin inactive in the local database only: rerun `npx prisma migrate reset` (documented in
  the test header).
- **Self-demotion locks an admin out of admin pages at once** → allowed by scope; the web page of
  `admin-password-reset` hides that action on the caller's own row.
- **Window after a password change stays** (≤ 15 min of access token) → P1.

## Migration Plan

- **No schema change, no data migration, no new environment variable, no new dependency.**
- Deploy the API only (the web is unchanged). Sessions survive the deploy: tokens are not re-issued
  and active users pass the new check.
- **Rollback:** redeploy the previous API image; nothing to undo in the data.

## Open Questions

- **P1. End access tokens at once after a password change or an admin reset.** [NO BLOQUEANTE]
  Options: (a) keep today's rule (other sessions end at their next refresh, ≤ 15 min);
  (b) add `pwv` to the access token too and compare it in `JwtStrategy` (the row is already read
  here; needs `passwordHash` in the `select` and one HMAC per request; one-time effect: access tokens
  issued before the deploy fail once and the web refreshes them transparently).
  Recommendation: (a) in this change, to keep CON-1 as approved and the contract of
  `account-self-service` ("Access tokens already issued remain valid until they expire"); (b) is
  cheap after this change and is the natural follow-up if the owner wants an admin reset to cut a
  stolen session at once. Until then the admin can deactivate the account (instant with this change)
  and reactivate it after the reset. The spec uses (a).
- **P2. Message of the 401.** [NO BLOQUEANTE]
  Default: "Sesión no válida", the text `changePassword` already returns. The web does not show it
  (it refreshes and then goes to `/login`). The spec uses it.

None of the questions blocks the approval.
