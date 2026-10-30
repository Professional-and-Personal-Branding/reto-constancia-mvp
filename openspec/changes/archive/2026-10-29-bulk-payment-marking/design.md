## Context

- **Single payment** (`ChallengesService.markPayment`): `openForPayments` (404 "Reto no encontrado",
  400 "No se puede modificar un reto cerrado"), then `writeWhileOpen` (interactive transaction,
  `lockChallenge(tx, id, 'share')`, re-check `COMPLETED`) and one `update` of the enrolment:
  `paid`, `paidAt = now` and `amountPaid = dto.amountPaid ?? feePerParticipant` (or `null` when
  unpaid). The proof fields are never touched. Closing takes the challenge lock `FOR UPDATE`, so
  every payment write is serialized with the close (`challenge-lifecycle`, "Payments close with the
  challenge" in `challenge-finance`).
- **Payment state** (`finance.service.ts`): `paymentState(fee, paid, amountPaid)` → `paid` when
  `fee <= 0` or `amountPaid >= fee`, `partial` when paid with less, `unpaid` when not paid;
  `amountPaid` is `Decimal(10,2)` and `toMoney(null) = 0`. `GET /challenges/:id/finance` returns per
  participant `state`, `amountPaid`, `proofToReview`, plus `feePerParticipant` and `currency`.
- **Bulk enrolment** (`POST /challenges/:id/participants/bulk`, `renewal-hardening`): 1 to 200 UUIDs,
  exact per-request report (`enrolled`, `alreadyEnrolled`, `skipped`), every id in exactly one list;
  the web sends batches of 200 (`BULK_BATCH_SIZE`, `chunk`, `mergeBulkResults` in `lib/renewal.ts`)
  and shows `bulkSummary` in a `role="status"` message.
- **Participants page** (`frontend/app/dashboard/admin/participants/page.tsx`): only `ACTIVE`
  challenges (selector over `GET /challenges/active/list`); checkboxes exist only in "Agregar
  participante" (candidates, labels "Seleccionar a <nombre>"); each enrolled row has "Pagado"/"Pago
  parcial"/"Desmarcar" controls; the filters "Todos / Por revisar / Sin pagar / Parciales / Pagados"
  come from `/finance`; `amountOwed(fee, amountPaid)` already exists in `lib/payment.ts`; the renewal
  dialog uses `lib/use-modal-dialog.ts` (accessible modal).

Checked against the approved proposal (ADM-4). Corrections and additions:

1. "Monto distinto de la cuota" has two cases in the data: a partial payment (`paid` with less than
   the fee) and an overpayment (`paid` with more, which `paymentState` already calls `paid`). Both are
   excluded per D2; only an enrolment with **no recorded payment** (`paid: false`) is marked (D2).
2. Payment proofs do exist (`payment-reconciliation`): the batch does not touch them, like the single
   action; an unpaid participant's proof "por revisar" stops being so once the fee is recorded.
3. The report must be exact under concurrency (lesson of `renewal-hardening`): the batch locks the
   enrolment rows it reads (D3).
4. A free challenge (`feePerParticipant <= 0`) has nothing to mark (every row is already `paid` by
   `paymentState`); the batch rejects it instead of writing zero amounts (D4).
5. The route does not clash with existing ones: `PATCH :id/participants/payments` has one segment
   less than `PATCH :id/participants/:userId/payment` and `PATCH :id/participants/me/payment-proof`.

## Goals / Non-Goals

**Goals:** record the standard fee for many participants in one request and one transaction, never
overwriting a different amount, exactly reported, frozen with the close; a pending list the admin can
paste.

**Non-Goals:** bulk unmarking, custom amounts in bulk, proofs, sending messages, CSV.

## Decisions

### D1. Contract

`PATCH /challenges/:id/participants/payments`, `@Roles(ADMIN)`, body `BulkMarkPaymentsDto`:
`userIds` (array, 1 to 200, UUID v4 each, same decorators as `BulkAddParticipantsDto`) and
`paid` (`@Equals(true)`; `false` or missing → 400). Unknown keys → 400 (global whitelist). Repeated
ids count once. Response `200`:

```json
{
  "feePerParticipant": 120, "currency": "BOB",
  "marked":      [{ "userId": "…", "name": "Ana", "email": "…", "amountPaid": 120 }],
  "alreadyPaid": [{ "userId": "…", "name": "Bea", "email": "…", "amountPaid": 120 }],
  "excluded":    [{ "userId": "…", "name": "Carla", "email": "…", "reason": "PARTIAL", "amountPaid": 60 }],
  "skipped":     [{ "userId": "…", "reason": "NOT_ENROLLED", "message": "No está inscrito en este reto" }]
}
```

`reason` of `excluded` is `PARTIAL` (paid less than the fee) or `DIFFERENT_AMOUNT` (paid more).
Errors: 404 "Reto no encontrado"; 400 "No se puede modificar un reto cerrado"; 400 "Este reto no
cobra cuota" (D4); 403 for non-admins. `PATCH` because it updates existing enrolments, like the
single route.

### D2. Which enrolments are marked (owner decision D2)

Amounts are compared in cents (`round2`). For each distinct id, in this order:

| Enrolment | List | Write |
|---|---|---|
| none in this challenge | `skipped` / `NOT_ENROLLED` | none |
| `paid: false` | `marked` | `paid: true`, `paidAt: now`, `amountPaid: fee` |
| `paid: true`, amount = fee | `alreadyPaid` | none |
| `paid: true`, amount < fee (or `null`) | `excluded` / `PARTIAL` | none |
| `paid: true`, amount > fee | `excluded` / `DIFFERENT_AMOUNT` | none |

An inactive user who is enrolled is treated like any enrolment (payments are about the enrolment, not
the account). Repeating the request moves the marked ones to `alreadyPaid` and writes nothing:
idempotent.

### D3. Atomic, serialized with the close and exact

One `withChallengeLock(prisma, tx => …)` (the `WRITER_TX` limits), the same path as `markPayment`:

1. `lockChallenge(tx, id, 'share')`; `COMPLETED` → 400 "No se puede modificar un reto cerrado";
   `fee <= 0` → 400 "Este reto no cobra cuota".
2. `SELECT … FROM "ChallengeParticipant" WHERE "challengeId" = $1 AND "userId" = ANY($2) FOR UPDATE`
   (with the users' `name` and `email` from a join or a second read): locks the rows to be
   classified, so a concurrent single `markPayment` on one of them either commits before (and the
   batch sees its amount) or waits for the batch.
3. Classify (D2); one `updateMany` with `id IN (eligible)` writing the same `paidAt` for the batch.
4. Commit; the response is built from the classification, which is exactly what was written.

All or nothing: any error rolls back every write. Two identical batches at the same time: the second
waits on the row locks and finds the rows paid → `alreadyPaid`; every id is in `marked` of exactly one
response. The challenge lock is `FOR SHARE`, so batches and single payments do not block each other at
the challenge level, and the close (`FOR UPDATE`) waits for them or makes them fail with the closed
message.

### D4. Free challenge

`feePerParticipant <= 0` → 400 "Este reto no cobra cuota" and nothing written. The web hides the
bulk action and "Copiar pendientes" for free challenges (it already shows no "Debe" for them).

### D5. Web: selection, confirmation and result

- A checkbox per visible enrolled row, labelled "Seleccionar el pago de <nombre>" (distinct from the
  enrolment checkboxes "Seleccionar a <nombre>"), kept in its own state; the selection keeps only ids
  still enrolled and is cleared when the challenge or the filter changes.
- "Seleccionar sin pagar" selects the visible rows whose finance `state` is `unpaid`.
- "Marcar seleccionados como pagados (N)" (disabled with 0) opens a modal built with
  `useModalDialog`, computed by a pure helper from `/finance`:
  - "Se registrará la cuota de {fee} {moneda} a {k} {persona/personas}: {k × fee} {moneda}." for the
    selected `unpaid` rows;
  - when there are others among the selected: "No se tocan:" and one line per person, "{nombre}: pago
    parcial de {monto} {moneda}", "{nombre}: pagó {monto} {moneda}" (different amount) or
    "{nombre}: ya pagado";
  - buttons "Confirmar" and "Cancelar"; with k = 0, "Confirmar" is disabled and the text says
    "Ninguna de las personas seleccionadas está sin pagar.".
- On confirm: batches of 200 (reuse `chunk`/`BULK_BATCH_SIZE`); then a `role="status"` message from
  the merged response: "{n} {pago registrado/pagos registrados}", plus "{n} ya {estaba pagado/estaban
  pagados}", "{n} sin tocar (pago parcial o monto distinto): nombres" and "{n} {omitido/omitidos}
  (no inscrito)" when not empty; the selection is cleared and `participants`, `finance` and `results`
  are invalidated. API errors show in Spanish in a `role="alert"`.
- The response, not the dialog, is the truth: if someone paid meanwhile, the message says so.

### D6. "Copiar pendientes"

- Pure helper `pendingPaymentsText(finance)` over `/finance`: rows with `state` `unpaid` or
  `partial`, sorted by name (`localeCompare('es')`), one line each:
  `{nombre}: {adeudado} {moneda}` with `adeudado = amountOwed(fee, amountPaid)` (`fee` for unpaid),
  suffix " (comprobante por revisar)" when `proofToReview`; last line
  `Total adeudado: {suma} {moneda}` (the sum of the lines; named differently from the "Pendiente" card, which is expected minus collected and nets overpayments). Names only, never emails (the text leaves the platform). With
  nobody pending the button is disabled and reads "Nadie debe".
- The button "Copiar pendientes" writes with `navigator.clipboard.writeText` and shows "Lista copiada
  ({n} {persona/personas})." in a `role="status"`; when the clipboard API is missing or rejects, it
  shows the same text in a read-only `<textarea>` already selected, with "Cópiala con Ctrl+C".
- Amounts with the same formatting as the row ("Debe 120 BOB"): the number as returned by the API
  rounded to 2 decimals, no thousands separator.

### D7. Tests

- Unit (`challenges.service.spec.ts`, Prisma mocked): classification of D2 (each row of the table,
  cents comparison, `null` amount), closed and free challenge, unknown challenge, repeated ids.
- API e2e (`backend/test/challenge-finance.e2e-spec.ts`, own users and challenge, no new login beyond
  what the file already does): mixed batch (1 unpaid, 1 partial, 1 overpaid, 1 already paid, 1 not
  enrolled) → exact lists and only the unpaid one written with the fee; repeat → `marked` empty;
  `paid: false` → 400; 201 ids → 400; participant → 403; closed challenge → 400 and nothing written;
  free challenge → 400; two identical batches in parallel → every id in `marked` of exactly one
  response.
- Web unit (`frontend/lib/payment.test.ts`): `pendingPaymentsText`, confirmation summary, result
  summary (singular/plural).
- Playwright `e2e/tests/17-bulk-payments.spec.ts` (next free number), admin stored session, month 8 of
  `E2E_YEAR`, fee 120: three throwaway users enrolled by API, one with a partial payment of 60;
  "Seleccionar sin pagar" + "Marcar seleccionados como pagados (2)" → the dialog shows "Se registrará
  la cuota de 120 BOB a 2 personas: 240 BOB."; select also the partial row → "No se tocan:" lists it;
  confirm → status message and "Pagados" count +2; "Copiar pendientes" with clipboard permission
  granted → clipboard text has the partial row with 60 and the total line. `afterAll` closes the
  challenge.

## Risks / Trade-offs

- **Overwriting a payment** → impossible by D2 (only `paid: false` rows are written) and D3 (rows
  locked while classified).
- **Lock waits** with a single `markPayment` on the same row → bounded by `WRITER_TX` (5 s lock wait);
  the losing request gets the generic error and can be retried; acceptable for an admin action.
- **Clipboard blocked** (non-secure context, permissions) → read-only textarea fallback (D6).
- **Names in the pending list leave the platform** → names only, never emails; the admin already
  shares them in the group.
- **Batch with 200 ids makes one `updateMany`** → small; no pagination needed.

## Migration Plan

- **No schema change, no data migration, no new environment variable, no new dependency.**
- Deploy API and web together (the web calls the new route). **Rollback:** redeploy both previous
  versions; payments recorded by the batch are ordinary payments.

## Open Questions

- **P1. Format of the pending list.** [NO BLOQUEANTE]
  Default: `Nombre: 120 BOB` per line, sorted by name, " (comprobante por revisar)" when applicable,
  and `Total adeudado: N BOB` at the end. Alternative: a header with the challenge name. The spec
  uses the default; the header can be added later without touching the API.
- **P2. Overpayments in the batch.** [NO BLOQUEANTE]
  Options: (a) excluded as `DIFFERENT_AMOUNT` (literal reading of owner decision D2); (b) reported as
  `alreadyPaid`, since they are already `paid`. Recommendation: (a), because it keeps the rule "the
  batch only touches the untouched" and shows the admin an unusual amount. Nothing is written in
  either case. The spec uses (a).

None of the questions blocks the approval.
