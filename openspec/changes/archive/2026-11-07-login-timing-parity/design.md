## Context

Verified against `develop` (3da134a):

- `AuthService.login` (`backend/src/auth/auth.service.ts`, lines 58–66): `findUnique` by email,
  then `if (!user || !user.active) throw` **before** `argon2.verify`. The proposal cited lines
  60–62; the throw is on line 60 and the verify on line 62, so the claim holds.
- Every password hash is created with `argon2.hash(plain)` and no options: `auth.service.ts`
  (`register`), `import.service.ts` (temporary passwords), `users.service.ts` (own password change
  and admin reset) and `prisma/seed.ts`. `argon2@0.41` defaults are argon2id, `m=65536`, `t=3`,
  `p=4`, encoded in the hash (`$argon2id$v=19$m=65536,t=3,p=4$...`). `argon2.verify` reads the
  parameters from the hash it receives, so a dummy hash with the same parameters costs the same.
- `POST /auth/login` and `POST /auth/register` are public and limited to 5 requests per minute per
  IP (`@Throttle`). The web offers self-registration (`auth-context.tsx` calls `/auth/register`).
- `effective-session-checks` (open change) changes `JwtStrategy` and the role guard; it reads the
  user on authenticated requests only. It does not touch `login`, so both changes are independent
  in code.

### Corrections to the cycle 2 proposal (CON-3)

- "Un evaluador votó en contra porque la plataforma es cerrada y el admin da de alta a los
  usuarios": not accurate. Self-registration is public (`POST /auth/register`, used by the web
  register page and by several e2e journeys), and it answers 409 "Email ya registrado" for an
  existing email. That is a cheaper enumeration oracle than timing, and this change does not close
  it (P1). The timing fix is still worth doing: it also covers **deactivated** accounts, which
  register cannot reveal as such, and it is the precondition for closing enumeration at all.

## Goals / Non-Goals

**Goals:** the three failure cases (unknown email, inactive user, wrong password) do the same
argon2 work and return byte-identical responses; the success path and the stored hashes do not
change.

**Non-Goals:** register enumeration, per-account lockout, parameter changes.

## Decisions

### D1. Dummy hash computed once at startup

`AuthService` implements `OnModuleInit` and stores
`this.dummyHash = hashPassword(randomBytes(32).toString('base64url'))` (a promise, awaited by
`login`). The random secret never leaves memory and no password can match it in practice. Computing
it at startup (about one verification of CPU, once) keeps the first failed login from paying an
extra hash. A literal hash committed to the repository was rejected: it would silently drift if
the parameters changed and it trips the secret scanner's heuristics for nothing.

### D2. One hashing helper so the parameters cannot drift

`backend/src/auth/password-hash.ts` exports `hashPassword(plain)` (calls `argon2.hash` with the
exported `PASSWORD_HASH_OPTIONS`, today `{}`, that is, the library defaults). All backend call
sites and the seed use it. A unit test asserts that the dummy hash and a hash from
`hashPassword('x')` share the same parameter prefix (`$argon2id$v=19$m=…,t=…,p=…$`). Changing the
options later changes both at once.

### D3. Login flow

```ts
const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
const usable = !!user && user.active;
const ok = await argon2.verify(usable ? user.passwordHash : await this.dummyHash, dto.password);
if (!usable || !ok) throw new UnauthorizedException('Credenciales inválidas');
```

`verify` always runs exactly once; the decision is taken after it. An inactive user with the right
password still gets 401 (as today). The inactive case uses the dummy (approved proposal) rather
than the user's own hash, so a stored hash with older parameters cannot make it differ.

### D4. Tests that do not measure milliseconds

- **Unit** (`auth.service.spec.ts`, with `jest.mock('argon2', …)` keeping the real `hash`):
  `verify` is called exactly once for an unknown email (with the dummy hash), for an inactive user
  (with the dummy hash, not the user's) and for a wrong password (with the user's hash); all three
  throw `UnauthorizedException` with the same message; a valid login calls it once with the user's
  hash and returns tokens.
- **Unit** (`password-hash.spec.ts`): the parameter prefix of the dummy equals that of
  `hashPassword`.
- **API e2e** (`app.e2e-spec.ts`): unknown email, inactive user and wrong password answer 401 with
  identical bodies (ignoring the request id header). Three logins, within the 5/min limit of the
  file; the existing login tests of the file are counted so the file stays under the limit or uses
  its own IP header pattern if one exists.
- No assertion on elapsed time in CI (it would be flaky on shared runners). A one-off manual
  measurement (20 attempts per case against a local build, medians within 15 %) is recorded in
  `docs/testing.md` §6 when the PR is verified.

## Risks / Trade-offs

- **CPU per failed login grows** to one argon2 verification (about the cost of a wrong password
  today) → bounded by the 5/min/IP limit.
- **Startup a few tens of milliseconds slower** → negligible; readiness is not affected.
- **Register still enumerates** → documented as P1, out of scope.
- **Seed change** → only the call changes (`hashPassword`), same parameters; seeded users keep
  logging in.

## Migration Plan

No schema change, no data migration, no re-hash. Rollback: revert the PR.

## Open Questions

- **P1. Account enumeration through `POST /auth/register`.** [NO BLOQUEANTE]
  Options: (a) leave it (self-registration is a product feature and the 409 helps real users);
  (b) a follow-up change that answers registration of an existing email with the same generic
  response as a new one (needs an email channel to tell the real owner, which the platform does
  not have); (c) a follow-up that disables public registration when the admin onboards everyone.
  Recommendation: (a) for now and record it in `docs/security-owasp.md` under "Mejoras futuras":
  without email delivery, (b) breaks the sign-up flow, and (c) is a product decision for the owner.
