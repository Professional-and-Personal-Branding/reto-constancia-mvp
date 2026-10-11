## Context

- `ChallengeParticipant` already stores `paid`, `paidAt`, `amountPaid`, `paymentProofUrl`,
  `paymentProofCloudinaryId` and `paymentProofUploadedAt` (`schema.prisma:92-97`).
- `markPayment` sets `paidAt = now` every time it records a payment and clears `paidAt` and
  `amountPaid` when it unmarks one; it never touches the proof. `uploadPaymentProof` sets
  `paymentProofUploadedAt = now` on every upload or replacement; a replaced proof file is kept by
  default (`upload-asset-cleanup`). Both writes go through `writeWhileOpen` and are rejected on a
  `COMPLETED` challenge.
- `finance.service.ts` holds the pure money rules: `paymentState(fee, paid, amountPaid)` gives
  `paid` / `partial` / `unpaid`, and `collectedTotal` only adds recorded payments.
- `closePreview` builds `proofsToReview` with `!p.paid && p.paymentProofUrl`.
- `privacy.ts` builds `me` with a whitelist of six own fields (`OWN_FIELDS`); the challenge
  objects it projects carry `feePerParticipant`.
- Web: the admin participants page combines `GET /participants` (rows with the proof URL) and
  `GET /finance` (state per row, totals). The participant dashboard shows
  `me.paid ? 'pagado' : 'pendiente de validación'`.

## Goals / Non-Goals

**Goals:** the admin sees at a glance how many proofs wait for them and can list only those; each
participant knows exactly where their own payment stands; one rule for the queue, the close dialog
and the participant; no schema change.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - "Proof to review" is derived, never stored.**
   - `proofToReview(fee, paid, amountPaid, paidAt, proofUrl, proofUploadedAt)` is true when all
     hold:
     - `fee > 0` (a free challenge is always `paid` and has nothing to reconcile);
     - `proofUrl` is not null;
     - the proof is not covered by a recorded payment: `paid` is false, **or** the state is
       `partial` and `proofUploadedAt` is later than `paidAt`.
   - Consequences, all from existing writes and with no new column:
     - recording a payment sets `paidAt = now`, so the proof leaves the queue;
     - a participant who paid part and uploads a new proof for the rest enters the queue again;
     - unmarking a payment with a proof stored puts it back in the queue (the proof is unreviewed
       again);
     - a proof uploaded after a full payment does not enter the queue: nothing is owed.
   - It lives in `finance.service.ts` next to `paymentState`, the only place money rules live.
2. **D2 - Participant status is one enum computed on the server.**
   - `participantPaymentStatus(...)` returns:
     - `paid` when `paymentState` is `paid` (includes a free challenge);
     - `in_review` when `proofToReview` is true (also for a partial payment with a newer proof);
     - `partial` when the state is `partial` and nothing is in review;
     - `pending` otherwise (unpaid, no proof).
   - Computed on the server rather than in the web, so the participant and the admin queue can
     never disagree, and no money rule is duplicated in the client.
   - The amount still owed is shown by the web as `fee - amountPaid`, the same display arithmetic
     the admin participants page already does.
3. **D3 - `me` gains exactly one derived key, `paymentStatus`.**
   - `myParticipation(participants, userId, fee)` keeps the six raw own fields and adds
     `paymentStatus`. It still never includes `paymentProofCloudinaryId`.
   - Only `me` carries it, so it describes the caller only. For a PARTICIPANT the `participants`
     key stays removed; for an ADMIN the full rows stay as today (they already carry the raw
     columns) and `me` gets the same extra key.
   - Additive, so not a breaking change for the web; the "exactly six keys" requirement and its
     key-set tests are updated to seven.
4. **D4 - The admin queue lives in the financial summary.**
   - `GET /finance` adds `proofsToReview` (count) and, per participant row, `proofToReview` and
     `proofUploadedAt`. The endpoint stays admin-only. Every existing field keeps its value.
   - No new endpoint and no query parameter: the list is small (one group per challenge) and the
     page already loads both datasets.
   - `closePreview` replaces its inline filter with `proofToReview`, keeping its response shape
     (`{ userId, name, paymentProofUploadedAt }`). The only behaviour change is that a partial
     payment with a newer proof now appears there too, which is what the dialog is meant to warn
     about.
5. **D5 - Admin web: card, filter, badge.**
   - A fifth finance card "Por revisar" shows the count, with the warning tone when it is above 0;
     clicking it selects the filter.
   - Filter chips over "Inscritos": Todos, Por revisar, Sin pagar, Parciales, Pagados, each with
     its count from `/finance`. Client-side filter, default "Todos", not persisted. "Por revisar"
     lists the oldest upload first.
   - A row in the queue shows "Comprobante por revisar · subido el <fecha>" next to the existing
     "Ver comprobante de pago" link and payment form. No new action: the admin records the payment
     with the existing form (full or partial amount).
   - The page invalidates `finance` after a payment as it does today, so the counter updates at
     once.
6. **D6 - Participant web: four clear states.**
   - "Estado: pendiente de pago" and "Sube tu comprobante para que el administrador lo revise".
   - "Estado: comprobante en revisión · subido el <fecha>"; if a partial payment is recorded, also
     "Registrado X de Y <moneda>".
   - "Estado: pago parcial · pagaste X de Y <moneda>, faltan Z".
   - "Estado: pagado" (unchanged text, so existing journeys keep their assertion).
   - Fee 0: "Este reto no tiene cuota" and no upload button. The API still accepts a proof; only
     the button goes away.
   - The upload button keeps "Subir comprobante" / "Reemplazar comprobante".

## Risks / Trade-offs

- An invalid proof (blurry, wrong amount) stays in the queue until the participant replaces it or
  the admin records a payment -> accepted for this change, no migration; the admin contacts the
  participant as today. A "dismiss" action is P2.
- Comparing `paymentProofUploadedAt` with `paidAt` -> both are set by the same server with
  `new Date()` inside serialized writes, so the order is reliable; equal timestamps count as
  covered.
- `me` grows by one key -> privacy key-set tests and TC-SEC-07 are updated on purpose; the
  whitelist stays explicit, so no raw column leaks by omission.
- The close dialog may show one more entry than before (partial with a newer proof) -> intended,
  and covered by an updated scenario.
- Playwright login budget (5 per minute) -> the new steps reuse the admin and participant sessions
  of `04-finance.spec.ts` and `11-privacy.spec.ts`; the proof is uploaded through the local
  simulator, the payment recorded by API.

## Migration Plan

**No migration, no schema change, no new dependency, no new environment variable.** Every value is
derived from existing columns. Existing rows behave correctly at once: seed participants who paid
have a proof uploaded at the same time as the payment, so they are not in the queue.

Release: API and web together in the next minor release (the web reads the new fields). Rollback:
redeploy the previous release of both; there is no data to undo.

## Open Questions

1. **P1 - A partial payment with a newer proof goes back to the queue?** [NO BLOQUEANTE]
   - (a) Yes, when the proof is later than the last recorded payment (written into the spec).
   - (b) No, only unrecorded payments are in the queue, as `close-preview` does today.
   - Recommendation: (a). Paying the rest in a second transfer is the normal partial case, and
     with (b) that proof would never be flagged.
2. **P2 - Can the admin dismiss an invalid proof without recording a payment?** [NO BLOQUEANTE]
   - (a) Not in this change: the row stays in the queue until the participant replaces the proof
     or the admin records a payment (written into the spec).
   - (b) A "Descartar" action backed by a new `paymentProofReviewedAt` column: **requires a
     migration**; a later change.
   - (c) Let the admin clear the proof: contradicts "admins do not attach or touch proofs" and the
     retention of financial evidence; discarded.
   - Recommendation: (a) now; revisit (b) if invalid proofs turn out to be frequent after the
     first real months.
3. **P3 - Show the counter outside the participants page?** [NO BLOQUEANTE]
   - (a) Only on the participants page, plus the close dialog that already lists them (written
     into the spec).
   - (b) Also a badge on the "Participantes" navigation link, which costs a `/finance` request on
     every admin page.
   - Recommendation: (a); the admin opens that page to record payments anyway.
4. **P4 - Free challenge: hide the upload button?** [NO BLOQUEANTE]
   - (a) Yes, say "Este reto no tiene cuota" (written into the spec).
   - (b) Keep the block as today ("Cuota: 0").
   - Recommendation: (a); a proof for a free challenge only creates noise and storage.
