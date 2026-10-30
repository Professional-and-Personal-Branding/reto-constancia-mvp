## Context

- **The hook** (`frontend/lib/use-modal-dialog.ts`, `renewal-hardening` D4): portal target in
  `document.body`, `inert` + `aria-hidden` on the other children of `body` (restored exactly on
  unmount), one capture `keydown` listener on `document` for the trap and `Escape`, `isPending` and
  `onCancel` read through refs (never stale), focus to the dialog element when `isPending` turns true,
  `initialFocusRef` on mount, `returnFocusTo` on unmount if still in the document. It acts **on
  mount**, so a component that uses it must be mounted only while the dialog is open.
- **Callers of the close dialog:** `admin/challenges/page.tsx` mounts it as
  `{closingId && <CloseChallengeDialog open … />}`; `results/page.tsx` as
  `{challenge && pendingAward && results && <CloseChallengeDialog open mode="award" … />}`. Both
  already satisfy the mount-while-open rule, like the renew and bulk-payment dialogs.
- **Other dialogs of the web** (grep of `role="dialog"`, `aria-modal`, `fixed inset-0`, `Escape`,
  `confirm(` under `frontend/app` and `frontend/components`): `renew-challenge-dialog.tsx` and
  `bulk-payment-dialog.tsx` already use the hook; `admin/participants/page.tsx:365` uses the native
  `confirm()` (browser-modal, not the same pattern). **No other dialog has the stale pattern**, so
  nothing else is included.

## Goals / Non-Goals

**Goals:** the close/award dialog meets the same modal rule as the renewal dialog, with the hook
unchanged and the existing Playwright locators (`getByRole('dialog')`) still valid.

**Non-Goals:** see the proposal (no hook change, no fallback focus target, no change to `confirm()`).

## Decisions

### D1. Adopt the hook as the renewal dialog does

- `useModalDialog({ isPending, onCancel, initialFocusRef: cancelRef, returnFocusTo })`, render
  `if (!open || !container) return null;` then `createPortal(…, container)`; the element with
  `role="dialog"` gets `ref={dialogRef}`, `tabIndex={-1}` and `outline-none`.
- The `useEffect` on `[open]` (initial focus, `Escape` on `window`, checkbox reset) is removed: the
  hook covers focus and `Escape`; `useState(false)` covers the checkbox because each opening is a
  fresh mount.
- The `open` prop stays (no caller change beyond `returnFocusTo`); the component's header comment
  states that it must be mounted only while open (hook rule).
- `closeErrorFrom` and the `CloseError` type stay exported from the same module (the renew dialog
  and both pages import them).

### D2. Triggers for the focus return

- **Admin list:** `const closeTriggerRef = useRef<HTMLElement | null>(null)`; the "Cerrar reto"
  button sets `closeTriggerRef.current = e.currentTarget` in its `onClick` (same as
  `renewTriggerRef`). Passed as `returnFocusTo`.
- **Results page:** `AwardPanel`'s `onAward(userIds, notes)` gains a third argument, the clicked
  button (`e.currentTarget`), which the page stores in `awardTriggerRef`. Using `e.currentTarget`
  and not `document.activeElement` because Safari does not focus a clicked button.

### D3. Focus after a success

Cancel and `Escape` always find their opener. After a **successful** close the admin list unmounts
the dialog before the refetch, so focus goes back to "Cerrar reto", which disappears when the row
turns `COMPLETED`; after a successful award the award panel is hidden on the now closed challenge.
In both cases focus ends on `body`, as the hook allows ("if it is still in the document"). Accepted:
the page re-renders with the result the spec requires, and the spec scenario only promises the
return after cancel and `Escape`. A fallback target would need a hook change and is left out.

### D4. Tests

- **`node:test`:** no new pure helper; the trap arithmetic is `nextFocusIndex`, already covered by
  `frontend/lib/focus-trap.test.ts` (5 tests, linked to `TC-CHAL-25`). They are also linked to the
  new case.
- **Playwright, one journey** in `e2e/tests/12-assisted-close.spec.ts`, using the close challenge of
  the file (month 4, one pending activity), placed **before** the test that really closes it:
  "el diálogo de cierre atrapa el foco, ignora Escape mientras cierra y devuelve el foco". Steps:
  1. `page.route('**/api/challenges/*/close', …)` that holds the request until a promise is
     resolved by the test (deferred `route.fulfill`, no fixed waits).
  2. Open "Cerrar reto" in the row: "Cancelar" is focused; the challenge list (the `body` child that
     holds the page) has `inert` and `aria-hidden="true"`.
  3. With the confirm button still disabled, "Cancelar" is the last enabled control in DOM order
     ("Ir a validar", the checkbox, "Cancelar"; `flex-col-reverse` does not change the order): `Tab`
     from "Cancelar" wraps to "Ir a validar" and `Shift+Tab` from there wraps back to "Cancelar";
     focus never leaves the dialog.
  4. Tick "Cerrar de todas formas" and confirm: the button reads "Cerrando…", the dialog is focused,
     `Escape` leaves the dialog open.
  5. Release the request with a `409`: the dialog shows the message and "Reintentar"; `Tab` moves to
     the first enabled control of the dialog.
  6. `Escape` closes the dialog, focus is on the row's "Cerrar reto", the list is no longer inert;
     `page.unroute`.
  The challenge stays `ACTIVE` (the close never reached the API), so the following tests of the file
  are unaffected. No new login (shared admin storage state).
- The award trigger's focus return is covered by the same hook code path; it is not walked
  separately (one journey keeps the suite short). Typing and build checks cover the `AwardPanel`
  signature change.

### D5. QA case

New **`TC-CHAL-26`** "Diálogo de cierre: teclado, Escape mientras cierra y retorno del foco" (Alta,
UI, guide 6.3 like `TC-CHAL-20`). `TC-CHAL-20` keeps its content (checklist and 409); the keyboard
behaviour goes to its own case, as `TC-CHAL-25` did for the renewal dialog. Free at the time of
writing: the highest `TC-CHAL` in the catalog is 25 and no open change reserves 26; re-check before
adding it.

## Risks / Trade-offs

- **Focus ends on `body` after a successful close or award** (D3) → accepted and documented; the
  result is visible on the page and the next `Tab` starts from the top.
- **A future caller that mounts the dialog with `open={false}`** would make the page inert while the
  dialog is hidden (hook acts on mount) → stated in the component comment; all current callers mount
  it conditionally.
- **Playwright locator of the trap step depends on the number of enabled controls** (the "Ir a
  validar" link, the checkbox, the two buttons) → the journey asserts "focus stays inside the
  dialog", not a fixed count, except for first/last wrap.

## Migration Plan

No schema change, no migration, no new environment variable, no new dependency, no API contract
change. One PR to `develop`, one battery run and one catalog validator run before opening it.
Ships with the next release; rollback is redeploying the previous web.

## Open Questions

None blocking. Default adopted: no fallback focus target after a success (D3); if the owner wants
one, it is a small hook extension in a later change.
