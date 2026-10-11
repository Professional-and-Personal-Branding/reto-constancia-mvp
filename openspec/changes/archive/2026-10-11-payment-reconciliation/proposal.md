## Why

Reconciling payments is still manual work for the admin. A participant uploads a payment proof,
but nothing tells the admin which proofs are waiting: the participants page only shows a
"Ver comprobante de pago" link on each row, mixed with the rows already confirmed, and the only
place that lists "proofs to review" is the pre-close dialog (`GET /challenges/:id/close-preview`),
which appears at the very end of the month.

The participant does not get a clear answer either. The dashboard says "Estado: pagado" or
"pendiente de validación", so:

- someone who never uploaded a proof reads "pendiente de validación", as if the admin had it;
- someone who uploaded a proof cannot tell that it is waiting for the admin;
- someone who paid part of the fee sees "pagado" and does not know how much is still owed.

Everything needed already exists: `paid`, `amountPaid`, `paidAt`, `paymentProofUrl` and
`paymentProofUploadedAt` on `ChallengeParticipant` (`schema.prisma:92-97`), the payment state of
`challenge-finance` (`paid` / `partial` / `unpaid`) and the caller's own `me` object of
`participant-data-privacy`. This change only derives one more fact from them, "proof to review",
and shows it to the two people who should see it: the admin, as a queue, and each participant, for
their own enrolment only.

## What Changes

- **One shared rule, derived, no migration.** A participant has a *proof to review* when the
  challenge charges a fee and they have a payment proof that no payment record covers yet: their
  payment is not recorded, or it is partial and the proof was uploaded after the last recorded
  payment. It is a pure function next to `paymentState` in `finance.service.ts`.
- **Admin, API.** `GET /challenges/:id/finance` adds `proofsToReview` (count) and, on each
  participant row, `proofToReview` and `proofUploadedAt`. `close-preview` uses the same rule, so
  the dialog and the participants page always agree.
- **Admin, web.** The participants page shows a "Por revisar" card with the count, a filter over
  the enrolled list (Todos / Por revisar / Sin pagar / Parciales / Pagados, each with its count),
  and a "Comprobante por revisar" badge with the upload date on each row in the queue, next to the
  existing "Ver comprobante de pago" link and payment form. Recording the payment (existing flow)
  takes the row out of the queue.
- **Participant, API.** `me` adds `paymentStatus`: `pending`, `in_review`, `partial` or `paid`,
  computed on the server with the same rule. Only the caller's own enrolment carries it.
- **Participant, web.** The dashboard payment block says, for their own enrolment only:
  "pendiente de pago" with a prompt to upload the proof, "comprobante en revisión" with the upload
  date, "pago parcial" with paid and owed amounts, or "pagado". A free challenge says it has no fee
  and hides the upload button.
- No change to who confirms a payment (only the admin), to what counts as collected (only recorded
  payments), to the pot, or to the closed-challenge rules. No new package, no environment variable.

## Non-goals

- **Any schema change or migration.** No "reviewed" or "rejected" flag on a proof: the admin cannot
  dismiss a proof without recording a payment in this change (see Open Questions P2).
- Rejecting a proof with a reason, notifying participants, emails or in-app notifications.
- Admins attaching, replacing or clearing proofs (settled: proofs are the participant's own upload).
- A queue across challenges or a counter in the navigation; the queue is per selected challenge.
- Payment history (several proofs or payments per enrolment), refunds, payment methods, receipts.
- Changing the CSV record (`challenge-export`), the results or the `payout`.
- Showing anyone another participant's payment status.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-finance`: a derived "proof to review" fact, a proofs-to-review queue for admins in
  the financial summary and the participants page, and a clear own payment status for each
  participant.
- `challenge-lifecycle`: `me` carries `paymentStatus`; the close preview uses the shared
  proof-to-review rule.

## Impact

- Backend:
  - `finance.service.ts`: `proofToReview(...)` and `participantPaymentStatus(...)` (pure), new
    fields in `ChallengeFinance` and `ParticipantFinance`, `getFinance` reads the proof columns;
  - `privacy.ts`: `myParticipation` adds `paymentStatus` (needs the challenge fee);
  - `challenges.service.ts`: `closePreview` filters with `proofToReview`;
  - Swagger summaries of `finance` and the challenge reads.
- Web:
  - `lib/types.ts` (`ChallengeFinance`, `ParticipantFinance`, `MyParticipation`);
  - `app/dashboard/admin/participants/page.tsx` (card, filter, badge);
  - `app/dashboard/page.tsx` (payment block).
- Tests: unit (`finance.service.spec.ts`, `privacy.spec.ts`, close preview), API e2e in
  `challenge-finance.e2e-spec.ts` and `platform-rules.e2e-spec.ts`, Playwright in
  `04-finance.spec.ts` and `11-privacy.spec.ts`, QA catalog (new TC-FIN-08, TC-FIN-09, TC-PART-07;
  updated TC-SEC-07 and TC-PART-05).
- Docs: guide steps 3.3 and 4.2 with captures, `CHANGELOG.md`.
- Deploy: **no migration**, no new dependency, no new environment variable. API and web ship
  together in the next minor release.
