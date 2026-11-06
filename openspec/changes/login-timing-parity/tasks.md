## 0. Approval

- [ ] 0.1 The owner approves these artifacts (proposal, design D1–D4 and the default of P1); no code before that
- [ ] 0.2 Branch `feature/login-timing-parity` from `develop` (one PR)

## 1. Tests first

- [ ] 1.1 Unit, `backend/src/auth/password-hash.spec.ts`: `hashPassword` produces an argon2id hash that `argon2.verify` accepts; the dummy hash of `AuthService` has the same `$argon2id$v=…$m=…,t=…,p=…$` prefix
- [ ] 1.2 Unit, `auth.service.spec.ts` (mock `argon2.verify`, real `hash`): unknown email → `verify` once with the dummy hash and `UnauthorizedException('Credenciales inválidas')`; inactive user with the right password → once with the dummy hash (not the user's) and the same exception; wrong password → once with the user's hash and the same exception; valid login → once with the user's hash and tokens
- [ ] 1.3 API e2e, `backend/test/app.e2e-spec.ts`: unknown email, inactive user (created and deactivated with Prisma, prefix `e2e-timing-`) and wrong password answer 401 with identical bodies; count the logins of the file against the 5/min limit
- [ ] 1.4 Run them and check they fail for the expected reason

## 2. Backend

- [ ] 2.1 `backend/src/auth/password-hash.ts` (`PASSWORD_HASH_OPTIONS`, `hashPassword`) and switch every `argon2.hash` call site (`auth.service.ts`, `import.service.ts`, `users.service.ts` ×2, `prisma/seed.ts`) to it
- [ ] 2.2 `AuthService.onModuleInit`: dummy hash from 32 random bytes; `login` per design D3
- [ ] 2.3 1.1 to 1.3 green; `grep -rn "argon2.hash" backend/src backend/prisma` only shows `password-hash.ts`

## 3. QA catalog and docs

- [ ] 3.1 `docs/qa/catalog.mjs`: `TC-AUTH-24` "El login falla igual con email inexistente, usuario inactivo o contraseña incorrecta" (links 1.1–1.3); add the unknown-email assertion to `TC-AUTH-05` if it is not linked yet
- [ ] 3.2 `docs/security-owasp.md`: control "verificación argon2 constante en el login"; under "Mejoras futuras", register enumeration (design P1)
- [ ] 3.3 Manual timing check (design D4) recorded in `docs/testing.md` §6; `CHANGELOG.md` `[Sin publicar]`

## 4. Verification and PR

- [ ] 4.1 `node scripts/run-tests.mjs` 13/13, reset the database, `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"), `openspec validate --all --strict`
- [ ] 4.2 PR to `develop` in Spanish; the owner merges after the 3 CI jobs are green
- [ ] 4.3 At archive time: if `session-validity` does not exist yet in `openspec/specs/` (this change archived before `effective-session-checks`), rewrite its generic Purpose
