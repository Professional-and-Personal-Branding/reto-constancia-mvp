## 0. Approval

- [ ] 0.1 The owner approves these artifacts (proposal, design D1–D11, spec deltas, the migration and the defaults of P1–P4). No code before this box is ticked
- [ ] 0.2 Re-check before coding that `TC-ACT-29`, `TC-ACT-30`, `TC-ACT-31`, `TC-UI-15` and `e2e/tests/19-*.spec.ts` are still free on `develop` and on open branches

## PR 1 — Migration + API (`feature/resubmit-rejected-activity-2-api`)

### 1. Tests first

- [ ] 1.1 Unit, `activities.service.spec.ts` (`resubmit`): owner fixes HR data (200, `PENDING`, same id/date, review fields and `rejectionReason` cleared, `resubmissionCount` +1); kept/new/dropped photos (only new ones go through `assertOwnedAsset`, dropped ids passed to `deleteAssetsLater` after the transaction, nothing released on error); re-tag of a kept photo derives `hasHeartRateProof`; duplicated id → 400; period/weekday/HR rules with the current config → 400 with the `create` messages; `PENDING`/`VALIDATED` → 403; other participant and admin → 403; not enrolled → 403; `COMPLETED` → 400 before ownership; challenge not `ACTIVE` → 400; decisions taken on the re-read under the lock (stale `REJECTED` outside, `VALIDATED` inside → 403)
- [ ] 1.2 Unit: `lockOpenActivity` issues challenge lock, closed check, activity `FOR UPDATE`, read — for `validate`, `reject`, `remove`, `resubmit`; a missing row after the lock → 404
- [ ] 1.3 Unit: `reject` writes one `ActivityRejection` in the same transaction (reason, admin, time); `validate` of a `REJECTED` activity keeps the history; `checkActivityFields` (pure) shared by `create` and `resubmit`, existing `create` tests green
- [ ] 1.4 API e2e, `backend/test/platform-rules.e2e-spec.ts` (prefix `RESUB:`): full round trip reject → resubmit → reject → `GET /activities/me` shows two entries and `resubmissionCount` 1; body with `date`/`challengeId`/`status` → 400; other participant → 403; closed challenge → 400; detail of another participant's activity → 403 with no reasons; `/activities/pending` items carry `rejections` without admin id; ranking and calendar unchanged/with no history; withdrawal deletes the history (count rows)
- [ ] 1.5 API e2e, `backend/test/asset-cleanup.e2e-spec.ts`: dropped photo released, kept one not, dropped file still referenced elsewhere kept
- [ ] 1.6 API e2e race (`Promise.all`, 10 fresh activities each): resubmit vs validate ends either "validate 200 + resubmit 403" or "resubmit 200 + validation on new data (200 or 400 HR rule)", never both on stale data, never 500; withdraw vs validate never 500 (404 when the withdrawal wins)
- [ ] 1.7 Run them and check they fail for the expected reason

### 2. Schema and backend

- [ ] 2.1 **Migration** `<timestamp>_add_activity_rejection_history` (design D3): table, index, FKs (`Cascade` activity, `SetNull` user), `resubmissionCount Int @default(0)`, SQL backfill; `npx prisma migrate dev --create-only` against the local database only, review the SQL by hand
- [ ] 2.2 Manual backfill check on a local database: one `REJECTED` (with reason) and one `PENDING` activity created on the 1.14.0 schema, apply the migration, one history row exists; note the result in the PR
- [ ] 2.3 Row lock in `lockOpenActivity` (D4); `checkActivityFields` extracted from `create`; `reject` writes history; `findAll`/`findOne` include `rejections` (`select: { reason, rejectedAt }`, `orderBy rejectedAt asc`) and `resubmissionCount`
- [ ] 2.4 `ResubmitActivityDto` (D2), `PUT /activities/:id/resubmission` with Swagger summary, `ActivitiesService.resubmit` per D5/D7; 1.1 to 1.6 green
- [ ] 2.5 Catalog `docs/qa/catalog.mjs`:
  - `TC-ACT-29` "Corregir y reenviar una actividad rechazada (API)", Alta, Funcional, guide 4.6. Pre: participante inscrito en un reto activo con regla de FC 20 min y una actividad rechazada ("Falta la captura de FC") con una foto; un segundo participante; un reto cerrado con una rechazada. Data: `PUT /api/activities/:id/resubmission`. Steps: reenviar con la misma foto + captura de FC nueva y 25 min de FC; reenviar otra vez; reenviar con `date`; reenviar la del otro participante; reenviar la del reto cerrado; reenviar con 40 min de FC y 30 de duración. Expected: 200 `PENDING`, mismo id y fecha, `resubmissionCount` 1, sin motivo vigente; 403 "Solo se pueden reenviar actividades rechazadas"; 400; 403 "No puedes reenviar esta actividad"; 400 reto cerrado; 400 minutos de FC. Auto: 1.1, 1.3 (`checkActivityFields`), 1.4, 1.5
  - `TC-ACT-30` "Historial de rechazos: se guarda, solo lo ven el dueño y el admin, y se borra al retirar", Alta, Seguridad, guide 4.6. Steps: rechazar, reenviar, rechazar; leer `/activities/me`, `/activities/pending`, el detalle como otro participante, el ranking y el calendario; validar (revertir) una rechazada; retirar una rechazada con historial. Expected: dos entradas en orden sin identidad del admin; 403 sin motivos para el otro; ranking y calendario sin historial; la validación conserva el historial; el retiro lo borra. Auto: 1.3, 1.4
  - `TC-ACT-31` "Reenvío y revisión simultáneos: gana una sola", Alta, Integración. Auto: 1.2, 1.6
- [ ] 2.6 `docs/architecture.md`: endpoint table, ER (`ActivityRejection`), state diagram (`REJECTED --> PENDING: participante corrige y reenvía`); `docs/challenge-rules.md` participant actions; `docs/security-owasp.md` "Controles implementados": one line (owner-only resubmission, new photos must be own uploads, history without admin identity); `CHANGELOG.md` `[Sin publicar]` **with the migration** and how to go back (design Migration Plan)
- [ ] 2.7 Battery 13/13, reset the database, catalog validator ("Pruebas sin caso: 0"), `openspec validate --all --strict`; PR in Spanish, owner merges after the 3 green jobs

## PR 2 — Web (`feature/resubmit-rejected-activity-2-web`, after PR 1 is merged)

### 3. Web

- [ ] 3.1 `frontend/lib/types.ts`: `rejections`, `resubmissionCount`; a pure helper `frontend/lib/resubmission.ts` (+ `.test.ts`) that builds the PUT body from kept and new photos and decides `earlierRejections(activity)` (excludes the current one when `REJECTED`)
- [ ] 3.2 Upload form resubmission mode (`?reenviar=<id>`, D9): load, guard message "Esta actividad ya no se puede reenviar.", fixed date, current photos with "Quitar", "Reenviar", success notice on the dashboard, invalidate `['activities']` and `['results']`, API errors shown
- [ ] 3.3 `ActivityRow`: "Corregir y reenviar" on `REJECTED` rows of an `ACTIVE` challenge, new hint, collapsed "Rechazos anteriores (n)"; withdrawal confirmation unchanged
- [ ] 3.4 Validations page: badge "Reenviada" / "Reenviada ×n" and earlier rejections on the card

### 4. Playwright and docs

- [ ] 4.1 Journey `e2e/tests/19-resubmit-activity.spec.ts` at phone width: rejected activity → "Corregir y reenviar" → keep photo, add HR capture → "Actividad reenviada. Queda pendiente de validación." → row "Pendiente" + "Rechazos anteriores (1)"; admin sees "Reenviada" and the reason, validates; stale link shows the guard message
- [ ] 4.2 Update the existing journey of `TC-ACT-24` for the new hint text; catalog `TC-UI-15` "Corregir y reenviar una rechazada desde Mis actividades", Alta, UI, guide 4.6 (links 3.1, 4.1); update `TC-ACT-24` expected text
- [ ] 4.3 Guide `docs/guia-plataforma.html`: new step 4.6 "Corregir y reenviar una actividad rechazada", hint updated in 4.5; `CHANGELOG.md`
- [ ] 4.4 Battery 13/13, reset the database, catalog validator, `openspec validate --all --strict`; PR in Spanish, owner merges after the 3 green jobs

## 5. Release and gate hand-off (in the release branch)

- [ ] 5.1 Runbook `docs/runbook-despliegue.md` §4: revert line for the release with this migration (redeploy the previous API and web, keep the schema; optional manual down script of design D3); release notes say the §5.1 verified backup is mandatory
- [ ] 5.2 After `openspec archive resubmit-rejected-activity-2 -y`: tick `edit-pending-activity` task 0.2 and run its 0.3 with the overlaps of design D11 (row lock and `checkActivityFields` reused, `challenge-lifecycle` delta rebased, "Reenviada" before "Modificada", next journey number)
