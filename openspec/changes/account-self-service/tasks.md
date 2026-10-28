## 0. Approval

- [x] 0.1 The owner approves this proposal (scope D1 to D10 and the defaults of P1 to P4, including the 204→200 and 401→400 contract change and the one-time re-login after the deploy); no code before that
- [x] 0.2 Branch `feature/account-self-service` from `develop`

## 1. Tests first (backend)

- [x] 1.1 Unit, `backend/src/auth/auth.service.spec.ts`: the refresh token carries `pwv` and the access token does not; `refresh` accepts a token whose `pwv` matches the current hash; rejects (401 "Refresh token inválido") a token without `pwv` and one whose hash changed; the fingerprint never equals or contains the hash
- [x] 1.2 Unit, `backend/src/users/users.service.spec.ts` (new if missing): `updateMe` trims and saves only `name` and returns no `passwordHash`; `changePassword`: missing or inactive user → 401; equal inputs → 400 "La nueva contraseña debe ser distinta de la actual" without calling argon2; wrong current → 400 "Contraseña actual incorrecta" and no update; success → new hash saved and a token pair returned
- [x] 1.3 Unit for the shared password validator (`password-policy.spec.ts` or inside the DTO tests): "soloLetras", "corta1", "12345678" and a 73-character password fail with the Spanish messages; "Passw0rd1" passes
- [x] 1.4 API e2e, new `backend/test/account.e2e-spec.ts` with its own app (fresh throttle buckets; budget: 2 registrations, 2 logins, 1 refresh pair, 6 password requests):
  - register user U (tokens A); `PATCH /users/me` renames (200, trimmed, no `passwordHash`); `{ name, role: 'ADMIN' }` → 400 and role unchanged; `"A"` → 400; without token → 401
  - password sequence with A, in this order: weak new (400), equal inputs (400), wrong current (400 "Contraseña actual incorrecta"), success (200 with tokens C); refresh with A's refresh token → 401, with C's → 200; login with the old password → 401, with the new → 200; two more password requests so the sixth answers 429
  - register a second user V and check `register` with "corta1" answers 400 "La contraseña debe tener al menos 8 caracteres" (counts as the second registration)
- [x] 1.5 Run them and check they fail for the expected reason

## 2. Backend

- [x] 2.1 `backend/src/auth/password-policy.ts`: composed decorator (D3); use it in `RegisterDto.password` and `ChangePasswordDto.newPassword`; `currentPassword` non-empty, max 256
- [x] 2.2 Fingerprint helper (HMAC-SHA256 with `JWT_REFRESH_SECRET`, base64url, 22 characters) and constant-time comparison; `issueTokens` adds `pwv` only to the refresh token; `refresh` checks it (D6); expose token issuing to `UsersModule` without a module cycle
- [x] 2.3 `UpdateMeDto` and `PATCH /users/me` declared before `PATCH :id`, no `@Roles`, Swagger summary "Cambiar mi nombre" (D2)
- [x] 2.4 `PATCH /users/me/password`: `@Throttle` 5/min, `HttpCode(200)`, order of checks of D4, returns the new token pair; Swagger summary and responses updated
- [x] 2.5 1.1 to 1.4 green; existing `app.e2e-spec.ts` and `platform-rules.e2e-spec.ts` still green (registration messages)

## 3. Web

- [x] 3.1 `frontend/lib/account.ts` (pure helpers) with `node:test` tests: API error to Spanish message (string or first of the array, 429 text, fallback "No se pudo guardar. Inténtalo de nuevo."), confirmation check
- [x] 3.2 `frontend/app/dashboard/account/page.tsx`: "Tus datos", "Nombre" and "Contraseña" forms (D1), messages of the spec, `autocomplete` attributes, fields cleared after a successful change, tokens stored with `setTokens`
- [x] 3.3 `auth-context.tsx`: update the user after a rename (no page reload)
- [x] 3.4 `api.ts` and the 401 path of `auth-context.tsx`: clear tokens on a rejected refresh only if the stored refresh token is still the rejected one (D7); add a `node:test` or Playwright check of that rule
- [x] 3.5 "Mi cuenta" as the last navigation item in `frontend/app/dashboard/layout.tsx` for every role

## 4. Playwright (bounded: one new journey, no extra login)

- [x] 4.1 `e2e/tests/15-account.spec.ts` (next free number), test "cambia su nombre y su contraseña desde Mi cuenta": register a throwaway user `account-<timestamp>@e2e.local` by API, inject its tokens into `localStorage`, open `/dashboard`, follow "Mi cuenta"; rename and see "Nombre actualizado." and the new name in the header; mismatched confirmation shows "Las contraseñas no coinciden" with no request to `/users/me/password`; wrong current shows "Contraseña actual incorrecta" with no request to `/auth/refresh` and the page stays; right current saves, shows the success message, the fields are empty, the stored refresh token changed and a reload stays on the page. Two password requests and one registration in total; never a seed user (D10)
- [x] 4.2 Re-run `09-header-layout.spec.ts` (TC-UI-10) for admin and participant; adjust it only if the extra item breaks the fit
- [x] 4.3 Guide capture of the new step only if the guide suite already captures every section-1 step; otherwise none

## 5. QA catalog (`docs/qa/catalog.mjs`)

- [x] 5.1 New TC-AUTH-15 "Cambiar el nombre desde Mi cuenta" (Media, Funcional, guide: new step of section 1):
  - pre: participant with a session
  - data: name "  Ana María "; then `{ name, role: 'ADMIN' }`; then "A"
  - steps: open Mi cuenta and save the name; by API send the body with `role`; send "A"
  - expected: 200 with the trimmed name, "Nombre actualizado." and the header updated; 400 and role unchanged; 400 "El nombre debe tener entre 2 y 80 caracteres"
  - auto: unit `updateMe` of 1.2, A tests of 1.4 (rename), W test of 4.1
- [x] 5.2 New TC-AUTH-16 "Cambiar la contraseña desde Mi cuenta" (Alta, Funcional):
  - pre: user with a session; a second session of the same user
  - data: current password, new "Nuev0Pass2" twice; then a different confirmation
  - steps: change the password; refresh the second session; log in with the old and the new password; try a different confirmation in the web
  - expected: 200 with a new token pair and the success message; the second session's refresh answers 401; old password 401 "Credenciales inválidas", new 200; mismatch shows "Las contraseñas no coinciden" without a request
  - auto: unit tests of 1.1 and 1.2 (success, `pwv`), A tests of 1.4 (sequence and refresh), W test of 4.1
- [x] 5.3 New TC-AUTH-17 "Contraseña actual incorrecta y política de la nueva" (Alta, Seguridad):
  - data: wrong current; new "soloLetras", "corta1", "12345678"; new equal to current
  - expected: 400 "Contraseña actual incorrecta" without refresh nor logout in the web; 400 with each Spanish message; 400 "La nueva contraseña debe ser distinta de la actual"; the password never changes
  - auto: unit tests of 1.2 and 1.3, A tests of 1.4, W test of 4.1
- [x] 5.4 New TC-AUTH-18 "Límite de intentos de cambio de contraseña" (Alta, Seguridad):
  - pre: same IP, one minute
  - steps: 6 password change requests
  - expected: the sixth answers 429 and the password does not change
  - auto: A test of 1.4 (429)
- [x] 5.5 TC-AUTH-02: add "La contraseña debe tener al menos 8 caracteres" to the expected messages and the A test of 1.4 (registration "corta1"); TC-AUTH-12: add "o emitido antes del último cambio de contraseña" and the unit tests of 1.1; TC-AUTH-10/14: add the D7 check of 3.4 if automated; TC-UI-10: note the "Mi cuenta" item

## 6. Docs and verification

- [x] 6.1 Runbook: §1.5 step 3 (rotate in Mi cuenta, delete `SEED_ADMIN_PASSWORD`), §1.6 check (old seed password answers "Credenciales inválidas"), recovery of a lost admin password (D8), §2/§4 note "tras desplegar esta versión cada usuario vuelve a iniciar sesión una vez" and rollback without migration, §7 row of `SEED_ADMIN_*`
- [x] 6.2 Guide `docs/guia-plataforma.html`: new step "Mi cuenta: nombre y contraseña" in section 1 (who, route, what happens to other sessions)
- [x] 6.3 `docs/security-owasp.md`: refresh tokens end on a password change (fingerprint); keep `jti`/revocation list and lockout in "Mejoras futuras"
- [x] 6.4 `CHANGELOG.md` Sin publicar: "Mi cuenta: cambiar el nombre y la contraseña desde la web; cambiar la contraseña cierra las otras sesiones; tras desplegar, todos inician sesión de nuevo una vez"
- [x] 6.5 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"); `openspec validate --all --strict`
- [ ] 6.6 PR to `develop` in Spanish with the 3 CI jobs green; the owner merges; archive at the next release
