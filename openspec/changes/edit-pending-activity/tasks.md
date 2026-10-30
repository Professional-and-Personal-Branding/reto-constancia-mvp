## 0. Approval and sequencing gate

- [ ] 0.1 The owner approves these artifacts (proposal, design D1–D7, spec deltas and the defaults); approval does not lift the gate below
- [ ] 0.2 **Gate (owner P1 a): do not start until increment 2 of the rejected-activity resubmission has its own change and that change is archived** (or the owner records here that increment 2 is dropped; design P1)
- [ ] 0.3 Re-read the archived increment 2 change and update these artifacts where they overlap (row lock, shared field check, row actions, migration status, catalog IDs) with `openspec-update-change`; `openspec validate --all --strict` clean; the owner confirms the updated artifacts if anything material changed

## PR 1 — API (`feature/edit-pending-activity-api`)

### 1. Tests first

- [ ] 1.1 Unit, `activities.service.spec.ts` (`update`): owner fixes `durationMinutes` (200, stays `PENDING`, photos untouched, no `deleteAssetsLater`); `null` clears `distanceKm`; HR below the current minimum → 400 with the `assessHeartRate` reason; `heartRateMinutes > durationMinutes` → 400; `VALIDATED`/`REJECTED` → 403; other participant and admin → 403; `COMPLETED` → 400 before ownership; challenge not `ACTIVE` → 400; status and challenge taken from the re-read under the lock (stale `PENDING` outside, `VALIDATED` inside → 403)
- [ ] 1.2 Unit: `lockOpenActivity` issues the challenge lock, then the activity `FOR UPDATE`, then the read, for `validate`, `reject`, `remove` and `update`
- [ ] 1.3 Unit: `checkActivityFields` (pure) shared by `create` and `update`; existing `create` tests stay green
- [ ] 1.4 API e2e, `backend/test/platform-rules.e2e-spec.ts` (prefix `EDIT:`): correction round-trip; `date`/`photos`/`status` in the body → 400; `{}` → 400; validated → 403; other participant → 403; closed challenge → 400
- [ ] 1.5 API e2e race: edit and validate of the same activity sent in parallel (`Promise.all`, repeated 10 times on fresh activities): every run ends either "edit 200 + validation on edited values" or "validation 200 + edit 403", never both applied on stale data and never 500; withdrawal and validation in parallel never answer 500
- [ ] 1.6 Run them and check they fail for the expected reason

### 2. Backend

- [ ] 2.1 `UpdateActivityDto` (D1) and `PATCH /activities/:id` with Swagger summary
- [ ] 2.2 Row lock in `lockOpenActivity` (D3); `checkActivityFields` extracted from `create`
- [ ] 2.3 `ActivitiesService.update` per D2; 1.1 to 1.5 green
- [ ] 2.4 Catalog: `TC-ACT-27` "Corregir una actividad pendiente (API)" (links 1.1, 1.3, 1.4) and `TC-ACT-28` "Edición y validación simultáneas: gana una sola" (links 1.2, 1.5); re-check both IDs are free
- [ ] 2.5 `docs/architecture.md` endpoint table; `CHANGELOG.md` `[Sin publicar]` (no migration)
- [ ] 2.6 Battery 13/13, reset the database, catalog validator, `openspec validate --all --strict`; PR in Spanish, owner merges after 3 green jobs

## PR 2 — Web (`feature/edit-pending-activity-web`, after PR 1 is merged)

### 3. Web

- [ ] 3.1 `frontend/lib/activity-form.ts` with the client checks extracted from the upload form, and `frontend/lib/activity-form.test.ts`; the upload form uses it (no behaviour change)
- [ ] 3.2 `ActivityRow`: "Editar" on `PENDING` rows of an `ACTIVE` challenge; inline form (D5); success and error handling; invalidate `['activities']` and `['results']`
- [ ] 3.3 Validations page: badge "Modificada" when `updatedAt !== createdAt` (D4)

### 4. Playwright and docs

- [ ] 4.1 One journey, `e2e/tests/19-edit-activity.spec.ts` (or the next free number): participant edits a pending activity at phone width and sees "Actividad corregida."; the admin sees "Modificada" and validates it
- [ ] 4.2 Catalog `TC-UI-14` "Editar una actividad pendiente desde Mis actividades" (links 3.1, 4.1); add the journey to the guide suite if step 4.5 gets a capture
- [ ] 4.3 Guide step 4.5 (`docs/guia-plataforma.html`): "Corregir una actividad pendiente" before "Retirar"; `CHANGELOG.md`
- [ ] 4.4 Battery 13/13, reset the database, catalog validator, `openspec validate --all --strict`; PR in Spanish, owner merges after 3 green jobs
