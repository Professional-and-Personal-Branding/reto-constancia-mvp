## 0. Approval and branch

- [x] 0.1 The owner approves these artifacts (proposal, design D1 to D7, the texts of the spec and the defaults of P1 and P2). The idea (ADM-4, with decision D2: never overwrite partial payments or different amounts) was approved on 2026-10-28; the artifacts are still pending. No code before that
- [x] 0.2 Branch `feature/bulk-payment-marking` from `develop` (independent of the other changes); one PR with API and web

## 1. Tests first (backend)

- [x] 1.1 Unit, `backend/src/challenges/challenges.service.spec.ts`, exact titles:
  - "markPaymentsBulk marca solo a quien no tiene pago y reporta cada id en una sola lista"
  - "markPaymentsBulk compara en centavos y trata un monto nulo como parcial"
  - "markPaymentsBulk rechaza un reto cerrado sin escribir"
  - "markPaymentsBulk rechaza un reto sin cuota"
  - "markPaymentsBulk responde 404 si el reto no existe"
- [x] 1.2 API e2e, `backend/test/challenge-finance.e2e-spec.ts` (own users and challenge), exact titles:
  - "BULK-PAY: un lote mixto marca solo a quien no tenía pago y reporta el resto aparte"
  - "BULK-PAY: repetir el lote no marca a nadie"
  - "BULK-PAY: dos lotes iguales a la vez registran un solo pago por persona"
  - "BULK-PAY: un reto cerrado rechaza el lote y el pozo no cambia"
  - "BULK-PAY: un reto sin cuota rechaza el lote"
  - "BULK-PAY: lote vacío, de 201 ids, con un id inválido o con paid false responde 400"
  - "BULK-PAY: un participante recibe 403"
- [x] 1.3 Run them and check they fail for the expected reason

## 2. Backend

- [x] 2.1 `dto/bulk-mark-payments.dto.ts` (design D1)
- [x] 2.2 `ChallengesService.markPaymentsBulk` (design D2, D3, D4): `withChallengeLock` + `lockChallenge('share')`, row lock `FOR UPDATE` on the requested enrolments, classification in cents, one `updateMany`, response from the classification
- [x] 2.3 Route `PATCH :id/participants/payments` with `@Roles(ADMIN)`, `HttpCode(200)` and Swagger summary "Registrar la cuota de varios participantes"
- [x] 2.4 1.1 and 1.2 green; the existing finance and lifecycle e2e tests still green

## 3. Web

- [x] 3.1 `frontend/lib/payment.ts` pure helpers with tests in `payment.test.ts`, exact titles:
  - "Pagos en lote: el resumen de confirmación cuenta solo a quien no tiene pago y lista aparte al resto"
  - "Pagos en lote: el mensaje del resultado usa singular y plural"
  - "Pendientes: una línea por persona sin pago o con pago parcial, ordenada por nombre y sin emails"
  - "Pendientes: marca el comprobante por revisar y suma el total adeudado"
- [x] 3.2 `participants/page.tsx`: payment selection, "Seleccionar sin pagar", button with count, modal with `useModalDialog`, batches of 200, status and alert messages, invalidations (design D5); "Copiar pendientes" with clipboard and textarea fallback (design D6); none of it for a free challenge
- [x] 3.3 Types in `frontend/lib/types.ts` (`BulkPaymentResult`); lint, types and web tests green

## 4. Playwright

- [x] 4.1 `e2e/tests/17-bulk-payments.spec.ts` (next free number), test "marca pagos en lote con confirmación y copia la lista de pendientes" per design D7 (month 8 of `E2E_YEAR`, admin stored session, three throwaway users, clipboard permission granted in the context, `afterAll` closes the challenge)
- [x] 4.2 Re-run `04-finance.spec.ts` and `14-renewal.spec.ts` (the page gains checkboxes; labels differ from the enrolment ones)

## 5. QA catalog (`docs/qa/catalog.mjs`)

- [x] 5.1 New TC-PART-10 "Registrar la cuota de varios participantes (API)" (Alta, Funcional, guide 3.3):
  - pre: active challenge with fee 120 BOB; Ana without payment, Bea paid 120, Carla 60, Diego 150; Luis not enrolled
  - data: the five ids with `paid: true`; then the same batch again; then the batch on a closed challenge and on a free one
  - steps: `PATCH /api/challenges/:id/participants/payments` each time; two identical batches in parallel
  - expected: the four lists of the spec, only Ana written with 120; repeat marks nobody; closed → 400 "No se puede modificar un reto cerrado"; free → 400 "Este reto no cobra cuota"; in parallel each person is marked once
  - auto: U tests of 1.1, A tests of 1.2
- [x] 5.2 New TC-PART-11 "Pagos en lote y lista de pendientes desde Participantes" (Alta, UI, guide 3.3):
  - pre: admin session; challenge with fee 120 BOB, two unpaid participants and one with 60
  - data: "Seleccionar sin pagar", then also the partial one
  - steps: open the confirmation, confirm, press "Copiar pendientes"
  - expected: "Se registrará la cuota de 120 BOB a 2 personas: 240 BOB."; the partial one under "No se tocan:"; status message and "Pagados" +2; the clipboard text with one line per debtor and "Total adeudado"
  - auto: F tests of 3.1, W test of 4.1
- [x] 5.3 TC-PART-04: add a note pointing to TC-PART-10 for the bulk path; before adding the new cases re-check that TC-PART-10 and TC-PART-11 are still free

## 6. Docs and verification

- [x] 6.1 Guide `docs/guia-plataforma.html`, step "Registrar los pagos": bulk action, what it never overwrites, and "Copiar pendientes"
- [x] 6.2 `CHANGELOG.md` "Sin publicar": "Participantes: marcar la cuota de varios a la vez (sin tocar pagos parciales ni montos distintos) y copiar la lista de quienes deben"
- [x] 6.3 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"); `openspec validate --all --strict`
- [x] 6.4 PR to `develop` in Spanish with the 3 CI jobs green; the owner merges; archive at the release
