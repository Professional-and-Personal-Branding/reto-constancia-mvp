## 1. Backend

- [x] 1.1 On `feature/assisted-challenge-close`, split the ranking step of `ResultsService.computeResults` so `previewSelection(id)` returns the unshuffled selection (`guaranteed`, `drawPool`, `drawSeats`) without changing `GET /results` (D2); unit tests for DRAW, partial TOTAL_KM and no draw
- [x] 1.2 `ChallengesService.closePreview(id)` and `GET :id/close-preview` with `@Roles(ADMIN)` and Swagger (D1): pending count and up to 50 items, proofs to review, unpaid and partial, projection and payout; 400 for `DRAFT`/`COMPLETED`, 404 missing; unit tests
- [x] 1.3 API e2e: content with pending, unpaid and proof to review; DRAW and partial TOTAL_KM projections; 400 for draft and closed; 403 for a participant; the preview changes nothing (no awards, status unchanged)

## 2. Web

- [x] 2.1 Types for the preview in `lib/types.ts`; `components/close-challenge-dialog.tsx` (D3, D4, D5) with the tokens of `web-theme`, currency formatting, required checkbox only when there are pending activities, projection label, error area with "Reintentar" on 409
- [x] 2.2 Admin challenge list: "Cerrar reto" opens the dialog in `close` mode instead of `confirm()`; the dialog calls the existing close mutation and closes on success
- [x] 2.3 Results page: "Guardar premiación" on an active challenge opens the dialog in `award` mode with the chosen winners; `awardMut` gains error handling shown in the dialog
- [x] 2.4 Lint, types, build green

## 3. Playwright and QA

- [x] 3.1 New `e2e/tests/12-assisted-close.spec.ts`: pending activity blocks until the checkbox; close from the dialog shows the challenge closed; award through the dialog saves and closes; a mocked 409 shows the message and "Reintentar"; unpaid participants listed without blocking
- [x] 3.2 Existing journeys that close or award from the web still pass (adjust only the click path through the dialog, not their assertions)
- [x] 3.3 QA catalog cases for the preview endpoint and the dialog; run the validator

## 4. Docs and verification

- [x] 4.1 Guide steps 6.3 and 6.4 (checklist, projection, pending acknowledgement) and a capture of the dialog in the guide capture suite
- [x] 4.2 `CHANGELOG.md` Sin publicar; reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs`; record in `docs/testing.md`
- [ ] 4.3 Open the PR to `develop` with the 3 CI jobs green; after merge, archive the change
