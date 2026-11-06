## 0. Approval

- [x] 0.1 The owner approves this proposal (D1 to D5); no code before that
- [x] 0.2 Work on `fix/close-dialog-modal` from `develop`; **one PR** with web, Playwright and catalog

## 1. Web

- [x] 1.1 `frontend/components/close-challenge-dialog.tsx`: use `useModalDialog` (`isPending`, `onCancel`, `initialFocusRef: cancelRef`, `returnFocusTo`), render through `createPortal(…, container)`, `ref={dialogRef}` + `tabIndex={-1}` + `outline-none` on the `role="dialog"` element, new optional prop `returnFocusTo`; remove the `useEffect` on `[open]`; header comment: mount only while open (D1)
- [x] 1.2 `frontend/app/dashboard/admin/challenges/page.tsx`: `closeTriggerRef` set from `e.currentTarget` in "Cerrar reto" and passed as `returnFocusTo` (D2)
- [x] 1.3 `frontend/app/dashboard/results/page.tsx`: `AwardPanel` passes the clicked "Guardar premiación" button as third argument of `onAward`; the page keeps it in `awardTriggerRef` and passes it as `returnFocusTo` (D2)
- [x] 1.4 Lint, types and build of the web green (only the web during iteration)

## 2. Playwright (`e2e/tests/12-assisted-close.spec.ts`, deterministic: deferred `route.fulfill`, no fixed waits)

- [x] 2.1 New journey "el diálogo de cierre atrapa el foco, ignora Escape mientras cierra y devuelve el foco", placed before the test that really closes the month-4 challenge (D4 steps 1-6); the challenge stays `ACTIVE`
- [x] 2.2 In the same journey, after closing with `Escape`, reopen and assert the checkbox is unticked and the confirm button disabled (scenario "Reopening starts clean")
- [x] 2.3 Update the header comment of the file (cases covered: TC-CHAL-20, TC-CHAL-26)

## 3. QA catalog and docs

- [x] 3.1 Re-check that `TC-CHAL-26` is still free; add it to `docs/qa/catalog.mjs` (D5): pre "Sesión de admin; un reto activo con una actividad pendiente", steps (Tab/Shift+Tab, confirm with a slow server, Escape, 409, Tab, Escape, reopen), expected (focus never leaves the dialog and the list is inert; Escape does nothing while "Cerrando…"; Tab after the 409 goes to the first control; Escape closes and focus is on "Cerrar reto"; reopening shows the checkbox unticked), auto: the W journey of 2.1 and the five `focus-trap.test.ts` tests
- [ ] 3.2 Regenerate `docs/qa/test-cases.*`
- [x] 3.3 `CHANGELOG.md` "Sin publicar": the close dialog is now a proper modal (debt of 1.12.1 paid)

## 4. Verification (once, at the end, before opening the PR)

- [ ] 4.1 `node scripts/run-tests.mjs` 13/13; reset the local database; `node scripts/validate-test-cases.mjs` ends with "Pruebas sin caso: 0"; `openspec validate --all --strict`
