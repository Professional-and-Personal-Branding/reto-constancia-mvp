## Why

`renewal-hardening` (1.12.1) made the renewal dialog a proper modal through the shared hook
`useModalDialog` (`frontend/lib/use-modal-dialog.ts`, design D4 of that change) and left the close
dialog as **explicit debt**. `frontend/components/close-challenge-dialog.tsx` still:

- registers its `Escape` listener once when it opens (`useEffect` on `[open]`, lines 62-73), so the
  handler reads the `isPending` of the first render: `Escape` closes the dialog while the close or the
  award is being saved, and the page loses the error or the result it was waiting for;
- declares `aria-modal="true"` without trapping focus: `Tab` reaches the page behind it, which is
  neither `inert` nor hidden from assistive technology;
- does not return focus to the button that opened it ("Cerrar reto" in the admin list, "Guardar
  premiación" in the results page) and, while saving, leaves focus on the disabled "Cancelar".

The two other dialogs of the web (`renew-challenge-dialog.tsx`, `bulk-payment-dialog.tsx`) already
use the hook; this is the last one.

## What Changes

- `CloseChallengeDialog` adopts `useModalDialog`, rendered with `createPortal`, exactly like the
  renewal dialog: rest of the page `inert` and `aria-hidden` while open, `Tab`/`Shift+Tab` cycle
  inside the dialog (also after the focused control was disabled), focus moves to the dialog while
  the close or the award is pending, `Escape` closes only when nothing is pending, initial focus on
  "Cancelar", and focus returns to the opener when the dialog closes.
- The admin challenge list keeps the clicked "Cerrar reto" button in a ref and passes it as
  `returnFocusTo`; the results page does the same with "Guardar premiación" (the award panel hands
  the clicked button to the page).
- The stale `useEffect` goes away; the "Cerrar de todas formas" checkbox starts unticked because the
  dialog is mounted fresh every time it opens (the callers already mount it conditionally).
- One Playwright journey in `e2e/tests/12-assisted-close.spec.ts` and a new QA case `TC-CHAL-26`.
- **No API change, no schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- Changing the hook (`useModalDialog`) or the pure helper `focus-trap.ts`: they are reused as they
  are.
- A fallback focus target when the opener disappears after a successful close or award (the row
  becomes `COMPLETED` and loses "Cerrar reto"; the award panel is hidden on a closed challenge). The
  hook only returns focus to an opener that is still in the document (design D3).
- The native `confirm()` of "Quitar del reto" in the participants page: the browser already makes it
  modal; replacing it is a UX change, not this debt.
- Any change to the preview, the checklist wording or the close/award API.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-lifecycle`: the close/award checklist dialog behaves as a modal (focus trap, inert
  background, `Escape` inactive while saving, focus return), with the same rule as the renewal
  dialog.

## Impact

- **Frontend:** `frontend/components/close-challenge-dialog.tsx`,
  `frontend/app/dashboard/admin/challenges/page.tsx` (ref of the "Cerrar reto" trigger),
  `frontend/app/dashboard/results/page.tsx` (ref of the "Guardar premiación" trigger through
  `AwardPanel`).
- **E2E:** one new journey in `e2e/tests/12-assisted-close.spec.ts` (deferred `route.fulfill`, no
  data written, no extra login).
- **Docs:** `docs/qa/catalog.mjs` (new `TC-CHAL-26`) and the regenerated `docs/qa/test-cases.*`;
  `CHANGELOG.md` ("Sin publicar": the debt recorded in 1.12.1 is paid).
- **Data:** none. Rollback is redeploying the previous web.
- **Delivery:** one PR from `fix/close-dialog-modal` (from `develop`) to `develop`.
