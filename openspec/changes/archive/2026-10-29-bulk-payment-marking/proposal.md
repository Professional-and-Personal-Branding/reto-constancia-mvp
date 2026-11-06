## Why

At the start of every month the admin records the standard fee for most participants, one by one:

- `frontend/app/dashboard/admin/participants/page.tsx` sends one
  `PATCH /challenges/:id/participants/:userId/payment` per person (`markPayment`), each with its own
  click and, for a custom amount, its own form. With a few dozen participants that is a few dozen
  round trips and clicks for the same action.
- There is no way to get the list of who still owes and how much, to send it to the group chat: the
  admin copies names and amounts by hand from the "Sin pagar" and "Parciales" filters.
- The logic to reuse already exists: `markPayment` (records the fee when no amount is given, under
  the challenge lock, rejected once the challenge is closed) and the payment states `paid`,
  `partial` and `unpaid` of `finance.service.ts`, already exposed by `GET /challenges/:id/finance`.

This is ADM-4 of `docs/propuestas-mejoras-2026-10-28.md`, approved by the owner on 2026-10-28 with
decision D2: the batch never overwrites a partial payment or an amount different from the fee.

## What Changes

- **New endpoint `PATCH /challenges/:id/participants/payments`** (admin only), body
  `{ userIds, paid: true }` with 1 to 200 UUIDs:
  - records the challenge fee as `amountPaid` and the current time as `paidAt` for every requested
    participant **without a recorded payment**, in one transaction, under the same challenge lock as
    `markPayment` (so it serializes with the close and is rejected once the challenge is closed);
  - leaves untouched, and reports apart, those with a partial payment or an amount different from
    the fee (D2), those already paid with the fee, and ids not enrolled;
  - answers `200` with four lists (`marked`, `alreadyPaid`, `excluded`, `skipped`); every distinct id
    appears in exactly one; repeating the request marks nobody new (idempotent);
  - rejects a challenge without a fee (nothing to mark) and a closed challenge with 400.
- **Web, "Participantes":**
  - a checkbox per enrolled row and "Seleccionar sin pagar" (selects the `unpaid` rows of the current
    filter), and the action **"Marcar seleccionados como pagados (N)"**, with a confirmation dialog
    that states the total ("Se registrará la cuota de 120 BOB a 5 personas: 600 BOB.") and lists
    apart the selected people who will not be touched (partial or different amount, already paid);
  - after the request, a status message built from the response lists, as the bulk enrolment does;
  - **"Copiar pendientes"**: copies to the clipboard one line per participant who still owes
    (`unpaid` and `partial`), with name and amount owed, and a total line; if the clipboard is not
    available, the text is shown selected in a read-only box.
- Backend unit and API e2e tests, web unit tests, one Playwright journey; QA catalog TC-PART-10 and
  TC-PART-11; guide step "Registrar los pagos"; `CHANGELOG.md`.
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- Marking a batch as unpaid, or with a custom amount (the single-person action stays for that).
- Overwriting partial payments or amounts different from the fee (owner decision D2).
- Payment proofs: the batch neither reads nor changes them (a proof under review of an unpaid
  participant stops being "por revisar" once the fee is recorded, exactly as with the single action).
- Sending the pending list anywhere (WhatsApp, email): the admin pastes it.
- Exporting the list as CSV (the challenge export already exists for closed challenges).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `challenge-finance`: adds bulk recording of the standard fee and the copyable list of pending
  payments to the payment management of a challenge.

## Impact

- **Backend:** `backend/src/challenges/dto/bulk-mark-payments.dto.ts` (new),
  `challenges.controller.ts` (new route, admin only), `challenges.service.ts` (`markPaymentsBulk`
  reusing `withChallengeLock`/`lockChallenge` in `share` mode and the payment states of
  `finance.service.ts`).
- **Frontend:** `frontend/app/dashboard/admin/participants/page.tsx` (selection of enrolled rows,
  bulk action, dialog, copy), `frontend/lib/payment.ts` (pure helpers: pending lines, confirmation
  summary, result summary) and `frontend/lib/payment.test.ts`, `frontend/lib/types.ts`.
- **Tests:** `challenges.service.spec.ts`, `backend/test/challenge-finance.e2e-spec.ts`,
  `frontend/lib/payment.test.ts`, new Playwright `e2e/tests/17-bulk-payments.spec.ts` (or the next
  free number) in month 8 of `E2E_YEAR`.
- **Docs:** guide, `docs/qa/catalog.mjs`, `CHANGELOG.md`.
- **API contract:** additive (one new route).
