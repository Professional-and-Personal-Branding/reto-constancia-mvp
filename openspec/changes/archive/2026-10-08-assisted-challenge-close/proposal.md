## Why

Since 1.6.0 a closed challenge is final: its activities can no longer be validated, rejected or
deleted, it takes no more payments, and a tie is drawn once and stored. That makes the moment of
closing decisive, but the web still closes with a browser `confirm()` ("¿Cerrar este reto y
calcular ganadores?") that shows nothing about the challenge:

- pending activities that will never count;
- payment proofs uploaded but not yet recorded, which can no longer be recorded after closing;
- who has not paid (they can still win, but the admin should know before handing out the prize);
- whether a draw will happen and for how many seats.

"Guardar premiación" closes an active challenge too, with no confirmation at all. Its errors are
not shown either: the award mutation has no error handling, so a 400 or a 409 is silent.

## What Changes

- **Pre-close summary endpoint** `GET /api/challenges/:id/close-preview` (admin only, read-only),
  only for an `ACTIVE` challenge. It returns:
  - pending activities (count and up to 50 items with participant and date);
  - payment proofs to review (proof uploaded, payment not recorded);
  - participants unpaid or partially paid;
  - the projected outcome: winners without draw, draw candidates and seats, and the projected
    payout.
- **Checklist dialog** before both ways of closing from the web:
  - "Cerrar reto" in the admin challenge list replaces the `confirm()`;
  - "Guardar premiación" on an active challenge opens it with the chosen winners.
- **Pending activities block the confirm button** until the admin ticks "Cerrar de todas formas:
  las actividades pendientes no contarán". Unpaid participants and proofs to review only inform.
- The dialog says that winners and payout are a projection and that closing computes them again.
  After closing, the page shows the real results returned by the server.
- API errors (400, 409) are shown inside the dialog, also for "Guardar premiación". 409 offers to
  retry.
- No change to the closing rules: the dialog only calls the existing `POST /close` and
  `POST /awards`. No migration, no new packages.

## Non-goals

- Blocking the close because of unpaid participants: they can still win (settled decision).
- Recording payments or validating activities from the dialog. It links to the screens that do it.
- A fingerprint between preview and close, or holding a lock while the dialog is open: the close
  always recomputes under its own lock, and the dialog presents the preview as a projection.
- Notifications to participants, scheduled automatic closing.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-lifecycle`: a read-only pre-close summary for admins, and a checklist dialog before
  closing or awarding from the web, which shows the server's errors.

## Impact

- Backend:
  - `ChallengesService.closePreview` and `GET :id/close-preview` in `challenges.controller.ts`;
  - `ResultsService` exposes the internal winner selection for the preview, with no change to
    `GET /results`.
- Web:
  - new `components/close-challenge-dialog.tsx`;
  - `app/dashboard/admin/challenges/page.tsx`, where "Cerrar reto" opens the dialog;
  - `app/dashboard/results/page.tsx`, where "Guardar premiación" opens the dialog and gains error
    handling;
  - types in `lib/types.ts`.
- Tests: unit tests for the preview, API e2e (content, roles, states), Playwright (blocking
  checkbox, close from the dialog, award through the dialog, error inside the dialog), QA catalog.
- Docs: guide steps 6.3 and 6.4 with a capture of the dialog, CHANGELOG.
