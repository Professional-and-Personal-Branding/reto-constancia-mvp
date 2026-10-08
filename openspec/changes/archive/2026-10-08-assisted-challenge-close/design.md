## Context

- Closing goes through `ChallengesService.closeTx` (1.6.0): exclusive row lock, `ACTIVE` only,
  results computed inside the transaction, draw stored once. `POST /close` and `POST /awards` are
  the web entry points.
- `ResultsService.computeResults` returns the public `ChallengeResults`. `selectWinners` already
  returns internal `guaranteed`, `drawPool` and `drawSeats`, which are not exposed today.
- `FinanceService.getFinance` gives each participant a payment `state` (`paid`, `partial`,
  `unpaid`) and the collected total. `ChallengeParticipant` stores `paymentProofUrl` and
  `paymentProofUploadedAt`.
- The admin list closes with `confirm()`; its error banner (`showError`) already reads
  `body.message`. The results page `awardMut` has no `onError`.

## Goals / Non-Goals

**Goals:** the admin sees what will be lost or decided before closing; pending activities need an
explicit acknowledgement; server errors are visible; no change to closing rules.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - Read-only preview without locks.**
   - `closePreview(id)`:
     - 404 if the challenge is missing;
     - 400 "Solo se puede cerrar un reto activo" for a `DRAFT`, "El reto ya está cerrado" for a
       `COMPLETED`.
   - Then it reads in parallel:
     - pending activities: count and the first 50 by date, with the participant name;
     - proofs to review: participants with a `paymentProofUrl` whose payment is not recorded,
       `paid = false`;
     - unpaid and partial participants, from `getFinance`;
     - the winner selection.
   - Response shape:
     `{ challengeId, challengeName, currency, feePerParticipant, pendingActivities: { count, items },
     proofsToReview, unpaid, drawNeeded, guaranteedWinners, drawCandidates, drawSeats, payout }`.
2. **D2 - Internal selection, public results unchanged.**
   - `ResultsService.previewSelection(id)` reuses the same ranking code. To avoid duplication, the
     body of `computeResults` is split into a shared internal step.
   - It returns the unshuffled selection: `guaranteed`, `drawPool`, `drawSeats`.
   - `payout` is projected with `computePayout(collected, guaranteed + drawSeats, fee)`.
   - `GET /results` keeps its exact contract.
3. **D3 - One dialog for both entry points** (`CloseChallengeDialog`).
   - Props: `challengeId`, `open`, `mode: 'close' | 'award'`, `selectedWinners?`, `onConfirm`,
     `onCancel`, `isPending`, `error`.
   - It loads the preview when it opens.
   - In `award` mode it shows the admin's chosen winners instead of the draw projection, and
     labels the button "Guardar premiación y cerrar".
   - Pending activities show the count, a list and a required checkbox.
   - Proofs to review and unpaid participants are informative. The text says that payments cannot
     be recorded after closing and that unpaid participants can still win.
   - Every amount is formatted in the challenge currency.
4. **D4 - Projection vs. outcome.**
   - The dialog states "Proyección: al cerrar se vuelve a calcular" next to winners and payout.
   - On success it invalidates `challenges`, `challenge`, `results` and `close-preview`, and the
     page shows the results the server computed.
   - No fingerprint check: the close already serializes with every write.
5. **D5 - Errors inside the dialog.**
   - The dialog keeps showing the server's message for 400 and 409, which preserves "Admin UI
     reports activation errors" for closing.
   - 409 adds "Reintentar".
   - `awardMut` gains the same error handling.
   - The admin list banner keeps working for activation.

## Risks / Trade-offs

- The preview can be stale by the time the admin confirms -> it is labelled a projection, and the
  real results are shown after closing.
- An extra request when opening the dialog -> a single admin-only read; fine at MVP volumes.
- Up to 50 pending items listed -> the count is always exact, and a link sends the admin to
  "Validar" for the rest.
- Playwright needs data with pending activities and proofs -> built by API in the spec, with the
  existing fixtures and owned evidence.

## Migration Plan

No migration. Ships in the next minor release; backend and web together, since the web calls the
new endpoint.

## Open Questions

None.
