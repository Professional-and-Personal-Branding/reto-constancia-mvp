## 0. Approval

- [ ] 0.1 The owner approves this proposal (D1 to D9, defaults of P1 and P2); no code before that
- [ ] 0.2 `effective-session-checks` and `admin-password-reset` are merged (both are; archive them first in the release that ships this change)
- [ ] 0.3 Work on `feature/instant-token-revocation` from `develop`; **one PR** with backend, web, tests, catalog and docs

## 1. Backend

- [ ] 1.1 Unit first: `backend/src/auth/password-fingerprint.spec.ts` (D8) failing for the expected reason
- [ ] 1.2 `backend/src/auth/password-fingerprint.ts`: `passwordFingerprint(hash, secret)` and `matchesFingerprint(claim, hash, secret)` (D1); `AuthService` uses it and drops its private methods
- [ ] 1.3 `auth.service.ts`: `JwtPayload.pwv?: string`; `issueTokens` computes `pwv` once and puts it in both payloads; update `auth.service.spec.ts` ("el access token y el refresh token llevan la misma pwv")
- [ ] 1.4 `strategies/jwt.strategy.ts`: read `JWT_REFRESH_SECRET` in the constructor, add `passwordHash` to the `select`, reject a missing or non-matching `pwv` with 401 "Sesión no válida" after the active check, return `{ sub, email, role }` only (D2); update `jwt.strategy.spec.ts` (select, matching `pwv` in valid payloads, the three new tests of D8)
- [ ] 1.5 API e2e `backend/test/account.e2e-spec.ts`: the two tests of D8 (old access token 401 / new 200 after the change; forged token without `pwv` 401 then refresh 200), no extra login
- [ ] 1.6 API e2e `backend/test/admin-users.e2e-spec.ts`: keep Ana's access token from the existing login; "RESET: el access token emitido antes del reinicio responde 401 al instante"; the admin's token still answers 200
- [ ] 1.7 Run only the touched unit and e2e files during iteration

## 2. Web and Playwright

- [ ] 2.1 `frontend/app/dashboard/account/page.tsx`: success text "Contraseña actualizada. Se cerraron las sesiones abiertas en otros dispositivos." (D7, P1)
- [ ] 2.2 `e2e/tests/15-account.spec.ts`: expected text
- [ ] 2.3 Only if `admin-password-reset` PR 2 is merged: the reset confirmation of the users page drops "en unos minutos" (D7, P2)

## 3. QA catalog and docs

- [ ] 3.1 Re-check that `TC-AUTH-23` is free; add it (D9) with the unit and e2e tests of D8; update `TC-AUTH-16` (text) and `TC-AUTH-21` (sessions end at their next request, new A test)
- [ ] 3.2 Regenerate `docs/qa/test-cases.*`
- [ ] 3.3 `docs/guia-plataforma.html` (note of "Mi cuenta"), `docs/security-owasp.md` (§ tokens: access tokens carry `pwv`; remove the item from "Mejoras futuras"; note on `JWT_REFRESH_SECRET` rotation)
- [ ] 3.4 `CHANGELOG.md` "Sin publicar": instant revocation; deploy effect (one transparent refresh, no re-login; hand-made clients refresh once); rollback

## 4. Verification (once, at the end, before opening the PR)

- [ ] 4.1 `node scripts/run-tests.mjs` 13/13; reset the local database; `node scripts/validate-test-cases.mjs` ends with "Pruebas sin caso: 0"; `openspec validate --all --strict`
