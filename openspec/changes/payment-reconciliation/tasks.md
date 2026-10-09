## 1. Shared rule (tests first)

- [ ] 1.1 On `feature/payment-reconciliation`, unit tests in `finance.service.spec.ts` for `proofToReview` and `participantPaymentStatus` (D1, D2): proof without payment, payment recorded clears it, partial with a newer proof, partial with an older proof, proof after a full payment, unmarked payment with a proof, equal timestamps count as covered, free challenge, no proof; then implement both as pure functions next to `paymentState`
- [ ] 1.2 Unit tests for `computeFinance` (D4): `proofsToReview` count, `proofToReview` and `proofUploadedAt` per row, and every existing field unchanged for the "Mixed payments" fixture; then extend `ChallengeFinance`, `ParticipantFinance` and the `getFinance` read (proof columns)
- [ ] 1.3 Unit tests in `privacy.spec.ts` (D3): `me` has the six raw keys plus `paymentStatus` and never `paymentProofCloudinaryId`; a new participant column still does not leak; a participant projection carries no other participant's `paymentStatus`; enrolled admin gets it in `me`; then pass the fee to `myParticipation`
- [ ] 1.4 Unit test for `closePreview`: a partial payment with a newer proof appears in `proofsToReview`; then replace the inline filter with `proofToReview`, keeping the item shape

## 2. API e2e

- [ ] 2.1 `challenge-finance.e2e-spec.ts`: a proof uploaded through the local simulator enters the queue; recording 120 clears it; recording 60 then uploading a new proof brings it back as partial; unmarking with a proof brings it back; `collectedTotal` never counts a proof; 403 for a participant
- [ ] 2.2 `platform-rules.e2e-spec.ts`: `me.paymentStatus` for `pending`, `in_review`, `partial` and `paid` with the participant token; no other participant's status in the active list, challenge detail or ranking; close preview and finance list the same participants
- [ ] 2.3 Swagger summaries of `GET /finance` and the challenge reads mention the new fields

## 3. Web

- [ ] 3.1 `lib/types.ts`: `ChallengeFinance.proofsToReview`, `ParticipantFinance.proofToReview` and `proofUploadedAt`, `MyParticipation.paymentStatus`
- [ ] 3.2 Admin participants page (D5): "Por revisar" card (warning tone above 0, selects the filter), filter chips with counts, "Por revisar" ordered by oldest upload, row badge "Comprobante por revisar · subido el <fecha>"; tokens of `web-theme`; no new action
- [ ] 3.3 Participant dashboard (D6): the four states with amounts in the challenge currency, "Estado: pagado" unchanged, free challenge without upload button
- [ ] 3.4 Lint, types and build green

## 4. Playwright and QA

- [ ] 4.1 `04-finance.spec.ts` (reuse its sessions, no extra logins): the participant uploads a proof, the admin sees "Por revisar 1", filters, records the payment and the counter drops to 0; a partial payment moves the row to "Parciales"
- [ ] 4.2 `11-privacy.spec.ts`: the dashboard shows "pendiente de pago", "comprobante en revisión", "pago parcial" and "pagado" for the participant's own enrolment; the existing "Estado: pagado" assertion still passes
- [ ] 4.3 QA catalog: new TC-FIN-08 (rule and summary by API), TC-FIN-09 (admin queue on the web), TC-PART-07 (own payment status on the dashboard); update TC-SEC-07 (seven keys in `me`), TC-PART-05 (the proof enters the queue and the dashboard says "en revisión") and the close-preview case (partial with a newer proof); run `node scripts/validate-test-cases.mjs`

## 5. Docs and verification

- [ ] 5.1 Guide steps 3.3 (queue, filter) and 4.2 (participant states) with captures in the guide capture suite
- [ ] 5.2 `CHANGELOG.md` Sin publicar (no migration, no new variables); reset the DB; `node scripts/run-tests.mjs` and the catalog validator once before the PR; record in `docs/testing.md`
- [ ] 5.3 Open the PR to `develop` with the 3 CI jobs green; after merge, archive the change
