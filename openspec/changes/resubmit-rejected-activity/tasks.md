## 0. Approval

- [x] 0.1 The owner approves this proposal (scope D1 and the defaults of P1 to P4); no code before that
- [x] 0.2 Branch `feature/resubmit-rejected-activity` from `develop`

## 1. Tests first (backend)

- [x] 1.1 Unit, `activities.service.spec.ts` (`remove`): owner deletes own `REJECTED` activity (deletes the row, calls `deleteAssetsLater` with its photo ids after the commit); own `VALIDATED` answers 403 "Solo se pueden eliminar actividades pendientes o rechazadas" and releases nothing; another participant's `REJECTED` answers 403; `REJECTED` of a `COMPLETED` challenge answers 400 before the ownership check; the status used is the one re-read under the lock (stale `REJECTED` outside, `VALIDATED` under the lock: 403)
- [x] 1.2 API e2e, `backend/test/platform-rules.e2e-spec.ts`: reject an activity, the owner deletes it (204), registers the same date again (201, `PENDING`), the calendar of that day shows the new activity; another participant cannot delete a rejected activity (403); a validated one answers 403 with the new message (the existing regex still matches); a rejected activity of a closed challenge answers 400
- [x] 1.3 API e2e, `backend/test/asset-cleanup.e2e-spec.ts`: withdrawing a rejected activity uploaded through the simulator removes its files from disk
- [x] 1.4 Run them and check they fail for the expected reason

## 2. Backend

- [x] 2.1 `ActivitiesService.remove`: accept `PENDING` or `REJECTED` for non-admins (D2) and change the 403 message; nothing else changes (lock, closed precedence, cleanup after the commit)
- [x] 2.2 Swagger description of `DELETE /activities/:id` if it mentions "pendientes"; 1.1 to 1.3 green

## 3. Web

- [x] 3.1 `ActivityRow` (`frontend/app/dashboard/page.tsx`): "Retirar" on `PENDING` and `REJECTED`; hint "Puedes retirarla y registrar ese día de nuevo." under the reason; rejected confirmation text (D6); pending text unchanged
- [x] 3.2 After withdrawing a rejected activity: "Actividad retirada." and, when the calendar entry of that date is `valid` and the challenge `ACTIVE`, the "Registrar ese día" link to `/dashboard/upload?date=<YYYY-MM-DD>`; invalidate activities, results and calendar queries
- [x] 3.3 Refused withdrawal shows the API message and refreshes the list (existing handler, check the 403 case)
- [x] 3.4 Web unit test only if the visibility/link decision is extracted to a pure helper (for example `canRegisterAgain(day, challengeStatus)`), otherwise covered by 4.1

## 4. Playwright (bounded: one journey added, one renamed)

- [x] 4.1 `e2e/tests/10-api-only-actions.spec.ts`, new test "corrige un día rechazado: lo retira y lo registra de nuevo": create an activity on a past valid day, reject it by API with a reason, open the dashboard, see the reason and the hint, press "Retirar", check the rejected confirmation, confirm, see "Actividad retirada." and follow "Registrar ese día" to the upload form with that date and submit enabled (the submission itself is already covered by 02-activity-upload)
- [x] 4.2 Rename "las actividades validadas o rechazadas no ofrecen retirar" to "las actividades validadas no ofrecen retirar" (same body: a validated activity has no "Retirar") and update its catalog reference
- [x] 4.3 No new guide capture; the existing capture of step 4.5 stays valid

## 5. QA catalog (`docs/qa/catalog.mjs`)

- [x] 5.1 TC-ACT-12 "Retirar una actividad": expected "Las validadas no ofrecen Retirar; las pendientes y las rechazadas sí"; API step adds "borrar la propia rechazada (204)"; references to the renamed W test and to the new unit tests
- [x] 5.2 New TC-ACT-24 "Corregir un día rechazado" (Alta, Funcional, guide 4.5):
  - pre: participant enrolled in an active challenge with a rejected activity of a past valid day (with reason) and a validated one; a second participant
  - data: Web: Mis actividades > Retirar on the rejected row; API: `DELETE /api/activities/:id`, `POST /api/activities`
  - steps: read the rejected row; activate the rejected day in Mi mes; Retirar and confirm; follow "Registrar ese día"; register the date again; by API try to delete the other participant's rejected activity and one of a closed challenge
  - expected: the row shows reason, hint and Retirar; Mi mes leads to the row; the specific confirmation appears; after confirming the row disappears, "Actividad retirada." and the link appear and the day shows "Sin registro"; the form opens with the date and no "ya registraste" hint; the new activity is created `PENDING`; another participant's answers 403 and a closed challenge's 400; the ranking does not change
  - auto: unit tests of 1.1, A tests of 1.2, W test of 4.1
- [x] 5.3 TC-UP-07: add the A test of 1.3 (withdrawn rejected activity releases its files)

## 6. Docs and verification

- [x] 6.1 Guide step 4.5: title "Retirar una actividad pendiente o rechazada", the hint and the "Registrar ese día" link; the summary bullet of line 283 and the note of step 4.5 ("las validadas no muestran el botón")
- [x] 6.2 `CHANGELOG.md` Sin publicar: "Una actividad rechazada se puede retirar desde Mis actividades para registrar ese día de nuevo"
- [x] 6.3 Reset the DB; `node scripts/run-tests.mjs` (13/13); reset the DB; `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"); `openspec validate --all --strict`
- [ ] 6.4 PR to `develop` in Spanish with the 3 CI jobs green; the owner merges; archive at the next release
