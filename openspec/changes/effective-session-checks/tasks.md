## 0. Approval and branch

- [x] 0.1 The owner approves these artifacts (proposal, design D1 to D7, specs and the defaults of P1 and P2). The idea (CON-1) was approved on 2026-10-28; the artifacts are still pending. No code before that
- [x] 0.2 The owner states whether production is deployed before 1.13.0 (design D6): yes → branch `hotfix/effective-session-checks` from `main` and release 1.12.2 with this change only; no → branch `fix/effective-session-checks` from `develop` for 1.13.0

## 1. Tests first

- [x] 1.1 Unit, new `backend/src/auth/jwt.strategy.spec.ts` (Prisma mocked): `validate` returns `{ sub, email, role }` read from the database (a token with role `ADMIN` for a user now `PARTICIPANT` returns `PARTICIPANT`); missing user → 401 "Sesión no válida"; inactive user → 401 "Sesión no válida"; the lookup is by `id` with `select` of `id`, `email`, `role`, `active` only
- [x] 1.2 Unit, `backend/src/users/users.service.spec.ts`: `update` with `active: false` on the caller → 400 "No puedes desactivar tu propia cuenta" and no write; deactivating the only active admin (other than the caller, as the loser of a race) → 400 "No puedes desactivar al último administrador activo"; demoting the only active admin → 400 "No puedes quitar el rol de administrador al último administrador activo"; with two active admins the demotion runs inside the transaction after the `FOR UPDATE` query; a name change, a promotion and a reactivation do not open the locked transaction
- [x] 1.3 API e2e, new `backend/test/session-checks.e2e-spec.ts` with its own app (design D7: users `e2e-session-*`, at most 4 logins; `beforeAll` deactivates the other active admins and records their ids, `afterAll` reactivates exactly those in a `finally` and deletes the `e2e-session-` users). Tests, with these exact titles:
  - "SESSION: un usuario desactivado con access token vivo recibe 401 en cualquier ruta y no puede renovar"
  - "SESSION: un usuario reactivado vuelve a usar su access token"
  - "SESSION: un admin degradado con access token vivo recibe 403 en rutas de admin y el ranking sin emails"
  - "SESSION: un participante promovido usa rutas de admin sin volver a iniciar sesión"
  - "ADMINS: nadie puede desactivar su propia cuenta"
  - "ADMINS: el último admin activo no puede quitarse el rol"
  - "ADMINS: con dos admins activos se puede degradar a uno"
  - "ADMINS: dos admins que se degradan a la vez dejan exactamente un admin activo"
  - "ADMINS: dos admins que se desactivan a la vez dejan exactamente un admin activo"
- [x] 1.4 Run them and check they fail for the expected reason

## 2. Backend

- [x] 2.1 `JwtStrategy`: inject `PrismaService`, `async validate` per design D1; keep `JwtPayload` as the returned shape
- [x] 2.2 `UsersService.update(id, dto, actorId)` per design D4 (order of checks, `FOR UPDATE` on the active admin rows through `$queryRaw` inside `$transaction` with the `WRITER_TX` limits); `setActive` and `setRole` pass an actor or are removed if still unused
- [x] 2.3 `UsersController.update` passes `@CurrentUser()`; Swagger description lists the three 400 answers
- [x] 2.4 1.1 to 1.3 green; `account.e2e-spec.ts`, `platform-rules.e2e-spec.ts` and `challenge-renewal.e2e-spec.ts` still green without changes (design D5)

## 3. QA catalog (`docs/qa/catalog.mjs`)

- [x] 3.1 New TC-AUTH-19 "Un usuario desactivado pierde el acceso en su siguiente petición" (Alta, Seguridad, guide 1.2):
  - pre: participant with a live access token and refresh token
  - data: the admin sets `active: false`; later `active: true`
  - steps: call `GET /api/challenges/active/list` and `POST /api/auth/refresh`; reactivate and call again
  - expected: 401 "Sesión no válida" on any route and 401 on refresh; after the reactivation the same access token works
  - auto: unit tests of 1.1 (inactive, missing), A tests "SESSION: un usuario desactivado…" and "SESSION: un usuario reactivado…"
- [x] 3.2 New TC-AUTH-20 "El rol vigente de la base manda sobre el del token" (Alta, Seguridad, guide 1.3):
  - pre: two active admins; one participant
  - data: demote admin A; promote the participant
  - steps: A calls `GET /api/users` and the results of a challenge where A is enrolled; the promoted user calls `GET /api/users`
  - expected: 403 "No tienes permiso para esta acción" and ranking without `email`/`paid` for A; 200 for the promoted user without a new login
  - auto: unit test of 1.1 (role from the database), A tests "SESSION: un admin degradado…" and "SESSION: un participante promovido…"
- [x] 3.3 New TC-SEC-14 "Siempre queda un administrador activo y nadie se desactiva a sí mismo" (Alta, Seguridad, guide 1.3):
  - pre: clean database with one or two active admins
  - data: `{ active: false }` on oneself; `{ role: "PARTICIPANT" }` on the last admin; cross demotions and deactivations in parallel
  - steps: send each `PATCH /api/users/:id`
  - expected: the three Spanish 400 messages; with two admins a demotion succeeds; in a race exactly one request succeeds and one active admin remains
  - auto: unit tests of 1.2, A tests "ADMINS: …" of 1.3
- [x] 3.4 TC-AUTH-17: keep its A test (`account.e2e-spec.ts`, deactivated user → 401); add to `expected` that the 401 now comes for every route (reference TC-AUTH-19)

## 4. Docs and verification

- [x] 4.1 `docs/security-owasp.md`: "Controles implementados" gains "cada petición autenticada comprueba que el usuario exista y esté activo y usa su rol vigente"; "Mejoras futuras" keeps only the instant end of sessions after a password change (P1)
- [x] 4.2 `CHANGELOG.md`: under "Sin publicar" (or `## [1.12.2]` per 0.2): "Desactivar o degradar a un usuario surte efecto en su siguiente petición; no se puede desactivar la propia cuenta ni dejar la plataforma sin administrador activo"
- [x] 4.3 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"); `openspec validate --all --strict`
- [ ] 4.4 PR in Spanish (to `develop`, or to `main` for the hotfix plus the back-merge PR to `develop`) with the 3 CI jobs green; the owner merges; archive at the release
