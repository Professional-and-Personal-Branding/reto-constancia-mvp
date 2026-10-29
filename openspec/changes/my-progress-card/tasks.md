## 0. Approval and branch

- [ ] 0.1 The owner approves these artifacts (proposal, design D1 to D6, the exact texts of the spec and the defaults of P1 and P2). The idea (PAR-1, wording per D4) was approved on 2026-10-28; the artifacts are still pending. No code before that
- [ ] 0.2 Branch `feature/my-progress-card` from `develop` (independent of the other 1.13 changes)

## 1. Tests first

- [ ] 1.1 `backend/src/challenges/qualification-parity.json` with the cases of design D5; Jest test in `scoring.spec.ts` "la tabla de paridad coincide con isQualified"
- [ ] 1.2 `frontend/lib/progress.test.ts` (node:test), exact titles:
  - "Mi avance: la tabla de paridad coincide con la regla del servidor"
  - "Mi avance: con la fila calificada el estado es QUALIFIED y el texto se confirma al cierre"
  - "Mi avance: alcanzable con pendientes y días abiertos, en singular y plural"
  - "Mi avance: un día rechazado cuenta como abierto y uno pendiente no"
  - "Mi avance: fuera de alcance cuando faltan más días que pendientes y abiertos"
  - "Mi avance: con mínimo 0 la meta es 1 día validado"
  - "Mi avance: días alcanzados con puntaje 0 dan NO_SCORE"
  - "Mi avance: el porcentaje no supera 100"
- [ ] 1.3 Run them and check they fail for the expected reason

## 2. Web

- [ ] 2.1 `frontend/lib/progress.ts`: `qualifyProgress`, `qualifiesLike` and the message builder with the exact texts of the spec (design D4); no React, no dates
- [ ] 2.2 `frontend/app/dashboard/page.tsx`: render "Mi avance" below the stats under the conditions of design D1, with the progress bar attributes and the optional "Tu puntaje" line; no new query
- [ ] 2.3 Lint, types (`rtk proxy npx tsc --noEmit -p .` locally) and `npm test` of the web green

## 3. Playwright

- [ ] 3.1 `e2e/tests/16-my-progress.spec.ts` (next free number), test "Mi avance muestra lo que falta para el mínimo y luego que ya se alcanza" per design D6 (month 6 of `E2E_YEAR`, seed participant's stored session, no new login, `afterAll` closes the challenge)

## 4. QA catalog (`docs/qa/catalog.mjs`)

- [ ] 4.1 New TC-ACT-25 "Mi avance: cuánto falta para el mínimo" (Alta, UI, guide 4.1):
  - pre: active challenge with `minValidatedDaysToQualify = 3`; enrolled participant with 1 validated and 1 pending activity
  - data: then 2 more validated
  - steps: open Mi reto with the challenge selected; validate the rest; reload
  - expected: "Validados: 1 de 3", "Te faltan 2 días validados para el mínimo; aún puedes llegar." and the detail line; after the validations "Ya alcanzas el mínimo; se confirma al cierre."; no card for a non-enrolled admin
  - auto: F tests of 1.2 (states and texts), W test of 3.1
- [ ] 4.2 New TC-SCORE-08 "La regla de calificación de la web coincide con la del servidor" (Media, Regresión, guide 6.1):
  - pre: none
  - data: `qualification-parity.json`
  - steps: run the backend unit tests and the web unit tests
  - expected: both rules give the `qualified` value of every case
  - auto: U "la tabla de paridad coincide con isQualified", F "Mi avance: la tabla de paridad coincide con la regla del servidor"
- [ ] 4.3 Before adding them, re-check that TC-ACT-25 and TC-SCORE-08 are still free (other 1.13 changes add cases in other modules)

## 5. Docs and verification

- [ ] 5.1 Guide `docs/guia-plataforma.html`, step "Leer el panel Mi reto": describe "Mi avance" and that the result is confirmed at the close; capture only if the guide suite already captures that step
- [ ] 5.2 `CHANGELOG.md` "Sin publicar": "Mi reto muestra Mi avance: cuántos días validados faltan para el mínimo y si los días que quedan alcanzan"
- [ ] 5.3 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"); `openspec validate --all --strict`
- [ ] 5.4 PR to `develop` in Spanish with the 3 CI jobs green; the owner merges; archive at the 1.13.0 release
