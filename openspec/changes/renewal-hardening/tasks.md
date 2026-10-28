## 0. Approval

- [x] 0.1 The owner approves this proposal (D1 to D6, the debt on the close dialog and the decisions P1 to P4 adopted after the review vote); no code before that
- [ ] 0.2 Work on `feature/renewal-hardening` from `develop`; **one PR** with backend, web, Playwright and catalog

## 1. Backend: deterministic bulk enrolment

- [ ] 1.1 Unit, `backend/src/challenges/enrollment.spec.ts`: the mock exposes `createManyAndReturn` (not `createMany`); replace "un usuario inscrito en paralelo queda como ya inscrito, nunca en las dos listas" with "cuenta como inscritos solo las filas que devolvió el insert; las omitidas por conflicto quedan como ya inscritas"; assert no read filters by `joinedAt` and no `joinedAt` is sent; check it fails for the expected reason
- [ ] 1.2 API e2e, `backend/test/challenge-renewal.e2e-spec.ts`, deterministic: "BULK: una inscripción hecha por otra transacción abierta queda como ya inscrita" (design D5: transaction A holds Z, B waits on the lock detected through `pg_stat_activity` with a deadline, commit A, B reports Y enrolled and Z already enrolled)
- [ ] 1.3 API e2e, same file, invariant: "BULK: dos inscripciones en bloque simultáneas dejan a cada usuario en una sola lista de cada respuesta y una sola vez en el roster" (one round, no timing assumption)
- [ ] 1.4 `backend/src/challenges/enrollment.ts`: `createManyAndReturn({ skipDuplicates: true, select: { userId: true } })` in place of `createMany` + `joinedAt` re-read (D1); update the header comment
- [ ] 1.5 1.1 to 1.3 green, running only those files during iteration

## 2. Web: renewal dialog

- [ ] 2.1 `frontend/lib/focus-trap.ts` with `nextFocusIndex(current, count, backwards)` and `frontend/lib/focus-trap.test.ts` (`node:test`): forward wrap, backward wrap, `current = -1` goes to the first (forward) or the last (backward), `count = 0`
- [ ] 2.2 `frontend/lib/renewal.ts`: roster label helper (0, 1, N; D4.7) with tests in `renewal.test.ts`
- [ ] 2.3 `frontend/lib/use-modal-dialog.ts`: portal target, `inert` + `aria-hidden` on the other children of `body` restored on unmount, `keydown` on `document` (capture) for the trap and `Escape`, refs for `isPending`/`onCancel`, focus to the dialog element when `isPending` turns true, initial focus, `returnFocusTo` on unmount (D4); no renewal-specific logic
- [ ] 2.4 `frontend/components/renew-challenge-dialog.tsx`: use the hook through `createPortal`, `tabIndex={-1}` on the dialog element, roster wording and `copyParticipants: false` without participants
- [ ] 2.5 `frontend/app/dashboard/admin/challenges/page.tsx`: keep a ref to the clicked "Renovar" button and pass it as `returnFocusTo`

## 3. Playwright (`e2e/tests/14-renewal.spec.ts`, deterministic: deferred `route.fulfill`, no fixed waits)

- [ ] 3.1 Extend W-a: exact N after "Seleccionar todos" and the financial summary counts the two new enrolments as unpaid
- [ ] 3.2 New W-b "lista como omitido a un candidato desactivado después de cargar la página" (one throwaway registration)
- [ ] 3.3 New W-c "el diálogo de renovar atrapa el foco, ignora Escape mientras crea y muestra el error del servidor" (trap, inert list, focus on the dialog while pending, `Escape` ignored, held `409`, `Tab` after the error, focus back on "Renovar")
- [ ] 3.4 New W-d "renovar un reto sin participantes activos crea el borrador con 0 inscritos" (source 7/<YEAR>, target 8/<YEAR>, both in `resetMonths`)
- [ ] 3.5 New W-e "con un solo participante activo la casilla habla en singular" (after W-d)
- [ ] 3.6 Update the header comment of the file (cases covered: TC-PART-09, TC-CHAL-24, TC-CHAL-25)

## 4. QA catalog and docs

- [ ] 4.1 `docs/qa/catalog.mjs`: TC-PART-08 (1.1 replaced, 1.2 and 1.3 added, one expected line), TC-PART-09 (W-b, finance and exact count), TC-CHAL-24 (W-c server error), new TC-CHAL-25 (design D6: W-c, W-d, W-e, `focus-trap.test.ts` and the label tests); no entry for the documentary scenarios of `activity-withdrawal`
- [ ] 4.2 Regenerate `docs/qa/test-cases.*`
- [ ] 4.3 `CHANGELOG.md` "Sin publicar": enrolment report under concurrency, dialog keyboard and empty roster, photo-release limit documented, and the known debt of the close dialog
- [ ] 4.4 `docs/testing.md` historical counts are not touched (release only)

## 5. Verification (once, at the end, before opening the PR)

- [ ] 5.1 `node scripts/run-tests.mjs` 13/13; reset the local database; `node scripts/validate-test-cases.mjs` ends with "Pruebas sin caso: 0"; `openspec validate --all --strict`
- [ ] 5.2 CI green on the three jobs (Backend, Frontend, E2E de UI); the owner merges

## 6. Release 1.12.1

- [ ] 6.1 `release/1.12.1` from `develop` (not `hotfix/*`); `openspec archive renewal-hardening -y` there, then the usual release steps of `CLAUDE.md`
