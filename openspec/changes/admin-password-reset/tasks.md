## 0. Approval, dependency and branches

- [x] 0.1 The owner approves these artifacts (proposal, design D1 to D7, the texts of the spec and the defaults of P1 to P3). The idea (ADM-2, with decision D3: no forced change, no migration) was approved on 2026-10-28; the artifacts are still pending. No code before that
- [x] 0.2 `effective-session-checks` is merged in `develop` (dependency)
- [x] 0.3 PR 1 (API) on `feature/admin-password-reset` from `develop`; PR 2 (web) on `feature/admin-users-page` from `develop` after PR 1 is merged

## PR 1 — API

### 1. Tests first

- [x] 1.1 Unit, `backend/src/auth/password-policy.spec.ts`: "la contraseña temporal cumple la regla de cuenta y no tiene caracteres confundibles" (1 000 values, pattern of design D2)
- [x] 1.2 Unit, `backend/src/users/users.service.spec.ts`:
  - "resetPasswordByAdmin rechaza el propio id con 400 sin buscar ni escribir"
  - "resetPasswordByAdmin responde 404 si el usuario no existe"
  - "resetPasswordByAdmin guarda solo el hash nuevo y devuelve la contraseña temporal"
  - "resetPasswordByAdmin escribe la línea de auditoría sin la contraseña"
- [x] 1.3 API e2e, new `backend/test/admin-users.e2e-spec.ts` (design D7), exact titles:
  - "RESET: el admin recibe una contraseña temporal una sola vez, sin caché, y la vieja deja de servir"
  - "RESET: el refresh token emitido antes del reinicio se rechaza"
  - "RESET: un participante recibe 403 y la contraseña no cambia"
  - "RESET: el admin no puede reiniciar su propia contraseña"
  - "RESET: un usuario inexistente responde 404 y un cuerpo con propiedades 400"
  - "RESET: el sexto reinicio en un minuto responde 429"
- [x] 1.4 Run them and check they fail for the expected reason

### 2. Backend

- [x] 2.1 `generateTemporaryPassword()` in `backend/src/auth/password-policy.ts` (design D2)
- [x] 2.2 `UsersService.resetPasswordByAdmin(id, actorId, requestId)`; remove the unused `resetPassword(id, newPassword)`; audit line of design D5 after the update
- [x] 2.3 Route `POST :id/reset-password` with `@Roles(ADMIN)`, `@Throttle` 5/min, `@HttpCode(200)`, `@Header('Cache-Control', 'no-store')`, `@Header('Pragma', 'no-cache')`; Swagger summary "Reiniciar la contraseña de un usuario (admin)" with the response schema `{ temporaryPassword }`
- [x] 2.4 1.1 to 1.3 green; `account.e2e-spec.ts` and `session-checks.e2e-spec.ts` still green

### 3. QA catalog and docs of PR 1

- [x] 3.1 New TC-AUTH-21 "El admin reinicia la contraseña de un usuario" (Alta, Seguridad, guide: new step of section 3):
  - pre: admin session; participant Ana with an open session (refresh token)
  - data: `POST /api/users/<Ana>/reset-password`
  - steps: reset; log in as Ana with the temporary and with the old password; refresh Ana's previous session
  - expected: 200 with only `temporaryPassword` (`xxxx-xxxx-xxxx`), `Cache-Control: no-store`; temporary login 200, old 401 "Credenciales inválidas"; previous refresh 401; one `admin_password_reset` log line without the password
  - auto: U tests of 1.1 and 1.2, A tests "RESET: el admin recibe…" and "RESET: el refresh token…"
- [x] 3.2 New TC-AUTH-22 "Reinicio de contraseña: permisos, propio id y límite" (Alta, Seguridad, guide 1.3):
  - pre: admin and participant sessions
  - data: participant as caller; the admin's own id; an unknown id; a body `{ password }`; six requests in a minute
  - expected: 403; 400 "Para cambiar tu propia contraseña usa Mi cuenta"; 404 "Usuario no encontrado"; 400; the sixth 429; the password never changes in these cases
  - auto: A tests "RESET: un participante…", "RESET: el admin no puede…", "RESET: un usuario inexistente…", "RESET: el sexto reinicio…"
- [x] 3.3 `docs/security-owasp.md`: controls (temporary password once, `no-store`, never logged, audit line, 5/min); "Mejoras futuras" keeps the instant end of access tokens and adds the optional forced change (needs a migration)
- [x] 3.4 `docs/runbook-despliegue.md` §1.5 step 4 and §6: another admin can issue a temporary password from "Usuarios" (after PR 2; until then by API); the seed path stays for when no admin can log in; §6 tells how to find an `admin_password_reset` line by `requestId`
- [x] 3.5 `CHANGELOG.md` "Sin publicar": "El admin puede reiniciar la contraseña de un usuario: recibe una temporal una sola vez y las sesiones del usuario se cierran en minutos"
- [ ] 3.6 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs`; `openspec validate --all --strict`; PR 1 in Spanish with the 3 CI jobs green; the owner merges

## PR 2 — Web

### 4. Tests first

- [x] 4.1 `frontend/lib/users.test.ts` (node:test), exact titles:
  - "Usuarios: la búsqueda ignora mayúsculas y tildes en nombre y correo"
  - "Usuarios: la lista se ordena por nombre"
  - "Usuarios: la propia fila no ofrece desactivar, cambiar rol ni reiniciar"
  - "Usuarios: las etiquetas de rol, estado y acción siguen al usuario"

### 5. Web

- [x] 5.1 `frontend/lib/users.ts` (pure helpers of 4.1) and types
- [x] 5.2 `frontend/app/dashboard/admin/users/page.tsx` per design D6 (list, search, confirmations, result dialog with `useModalDialog`, clearing on close, errors with the helper of `lib/account.ts`, notice for non-admins)
- [x] 5.3 "Usuarios" in the admin navigation of `frontend/app/dashboard/layout.tsx`, after "Participantes"
- [x] 5.4 Lint, types and web tests green

### 6. Playwright

- [x] 6.1 `e2e/tests/18-admin-users.spec.ts` (next free number), test "el admin busca, desactiva, cambia el rol y reinicia la contraseña de un usuario" per design D7 (admin stored session, throwaway user, one login to prove the temporary password, also at 375 px)
- [x] 6.2 Re-run `09-header-layout.spec.ts` (TC-UI-10) with the ninth admin item; adjust only if it no longer fits

### 7. QA catalog and docs of PR 2

- [x] 7.1 New TC-UI-12 "Página Usuarios del admin" (Alta, UI, guide: new step of section 3):
  - pre: admin session; throwaway participant
  - data: search "jose" (accent-insensitive); deactivate, activate, promote, demote; reset
  - expected: filtered list; each change reflected in the row after confirmation; the temporary password shown once with the indication and gone after closing; own row with "Tú" and no actions; API errors in Spanish; a participant sees no data
  - auto: F tests of 4.1, W test of 6.1
- [x] 7.2 TC-UI-10: note the "Usuarios" item; TC-AUTH-21: add the W test of 6.1; before adding the cases re-check that TC-AUTH-21, TC-AUTH-22 and TC-UI-12 are still free
- [x] 7.3 Guide `docs/guia-plataforma.html`: new step "Administrar usuarios" in section 3 (search, activate/deactivate, role, temporary password and what to tell the participant) and a line in "Reconocer las secciones de cada rol"
- [x] 7.4 `CHANGELOG.md` "Sin publicar": "Nueva página Usuarios para el admin: buscar, activar o desactivar, cambiar el rol y reiniciar la contraseña"
- [ ] 7.5 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"); `openspec validate --all --strict`; PR 2 in Spanish with the 3 CI jobs green; the owner merges; archive at the release
