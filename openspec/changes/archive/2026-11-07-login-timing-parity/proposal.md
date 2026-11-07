## Why

`AuthService.login` answers 401 "Credenciales inválidas" in three cases, but does not do the same
work in all of them:

```ts
const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
if (!user || !user.active) throw new UnauthorizedException('Credenciales inválidas');
const ok = await argon2.verify(user.passwordHash, dto.password);
```

An unknown or deactivated email returns right after one indexed query; a registered, active email
pays an argon2id verification (64 MiB, 3 passes, tens of milliseconds). The body is identical, but
the latency tells an attacker which emails have an active account. The login limit is 5 attempts
per minute **per IP**, which slows the probing but does not hide the signal.

Source: CON-3 of `docs/propuestas-mejoras-ciclo2-2026-10-29.md`, approved by the owner on
2026-10-29.

## What Changes

- When the email does not exist or the user is inactive, `login` SHALL still run
  `argon2.verify`, against a **dummy argon2 hash computed once at startup with the same function and
  parameters as real password hashes**, and then answer the same 401 "Credenciales inválidas".
- The parameters are shared by construction: a small `hashPassword()` helper becomes the only way
  the backend hashes passwords (registration, import, password change, admin reset and the dummy).
  It keeps today's argon2 defaults, so **existing hashes stay valid and nothing is re-hashed**.
- A successful login, the response shapes and the rate limit do not change.
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- `POST /auth/register` still answers 409 "Email ya registrado" for an existing email, which
  reveals the account without any timing analysis (design P1).
- A per-email failure counter or lockout (left as a separate follow-up by the proposal).
- Changing `JwtStrategy`, refresh or the session checks of `effective-session-checks`: they run
  after a token exists and do not touch the login path.
- Changing the argon2 parameters or re-hashing stored passwords.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `session-validity` (introduced by the open change `effective-session-checks`): adds the
  requirement that a failed login takes the same work whatever the reason. If this change is
  archived before `effective-session-checks`, the archive creates the capability and its Purpose
  must be written then.

## Impact

- **Backend:** `backend/src/auth/auth.service.ts` (`login`, dummy hash on module init), new
  `backend/src/auth/password-hash.ts` (`hashPassword`), call sites in `auth.service.ts`
  (`register`), `import/import.service.ts`, `users/users.service.ts` (2) and
  `backend/prisma/seed.ts`.
- **Tests and QA:** unit tests in `auth.service.spec.ts` and `password-hash.spec.ts`, API e2e in
  `backend/test/app.e2e-spec.ts`; new catalog case `TC-AUTH-24`; `TC-AUTH-05` gains the inactive
  and unknown cases.
- **Docs:** `docs/security-owasp.md` (controls implemented), `CHANGELOG.md` (`[Sin publicar]`).
- **Delivery:** one PR (`feature/login-timing-parity`).
