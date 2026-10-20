## Why

A participant whose activity was rejected is stuck on that day:

- **There is at most one activity per day and challenge** (`@@unique([challengeId, userId, date])`).
  The rejected activity keeps the day taken, so `POST /activities` answers 409 "Ya registraste una
  actividad para ese día" and the upload form disables the submit button for that date.
- **The owner cannot take it back.** `activity-withdrawal` only lets the owner delete a `PENDING`
  activity; a `REJECTED` one answers 403 "Solo se pueden eliminar actividades pendientes".
- **The only way out is an admin deleting it through the API (Swagger)**, which is the manual
  workaround the roadmap wants to remove (item #8 of `docs/propuestas-features-2026-10-04.md`:
  "Corregir y reenviar una actividad rechazada: más justo y evita borrados por Swagger").

The result is unfair for honest mistakes (wrong photo, missing heart-rate capture, a typo in the
minutes): a rejected valid day can never be fixed while the challenge is still open, even though
the participant could have registered it correctly from the start.

The roadmap already split the work: increment 1 (letting the owner delete a `REJECTED` activity)
is cheap; increment 2 (correcting and resubmitting the same activity) needs a migration and
builds on `upload-guardrails`. This change delivers increment 1 and records increment 2 as future
work.

## What Changes

- **The owner can withdraw their own `REJECTED` activity**, with exactly the same rules as a
  pending one: only while its challenge is not `COMPLETED`, under the challenge lock, with the
  status re-read under the lock, and releasing its photos after the commit
  (`deleteAssetsLater`). `VALIDATED` activities stay protected (403). Admin deletion does not
  change.
- **The day becomes free again**, so the participant registers a new activity for it through the
  normal `POST /activities`, which applies every rule again (active challenge, period, valid
  weekday, heart-rate rule, own uploads, one per day). The new activity is `PENDING` and is
  reviewed like any other.
- **The 403 message for a validated activity changes** to "Solo se pueden eliminar actividades
  pendientes o rechazadas".
- **Web, "Mis actividades":** rejected rows show the rejection reason (as today), the hint "Puedes
  retirarla y registrar ese día de nuevo." and the "Retirar" action with a specific in-page
  confirmation. After withdrawing a rejected activity whose day can still be registered, the list
  shows "Actividad retirada." with a "Registrar ese día" link to the upload form prefilled with that
  date.
- **"Mi mes"** needs no code change: a rejected day already links to its row in "Mis actividades"
  (where the action now appears), and after withdrawing, the calendar refreshes and the day turns
  into "Sin registro" or "Hoy", which already link to the upload form with that date.
- Guide step 4.5 and the QA catalog (TC-ACT-12, TC-UP-07, new TC-ACT-24) are updated.
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- **Increment 2, correcting and resubmitting the same activity** (editing fields and photos of a
  `REJECTED` activity and sending it back to `PENDING` with the rejection kept as history). It
  needs a migration and a new endpoint; see design D7. It is left as a future change.
- Keeping the rejection reason after the activity is withdrawn: it is deleted with the row (D5).
- A limit on how many times a day can be withdrawn and registered again (D4).
- Withdrawing `VALIDATED` activities, or any activity of a closed challenge.
- Notifying the admin of a new registration for a previously rejected day.
- Changing the admin validation screen, the score, the ranking or the close checklist.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `activity-withdrawal`: the owner can also withdraw their `REJECTED` activities (API and web),
  the day becomes registrable again, and withdrawing a rejected activity releases its photos.

## Impact

- **Backend:** `ActivitiesService.remove` (status check and message). No controller, DTO or
  schema change.
- **Frontend:** `ActivityRow` in `frontend/app/dashboard/page.tsx` (action for rejected rows,
  hint, confirmation text, post-withdraw notice with the "Registrar ese día" link).
- **Tests:** unit tests of `remove`; API e2e in `backend/test/platform-rules.e2e-spec.ts` and
  `asset-cleanup.e2e-spec.ts`; Playwright `e2e/tests/10-api-only-actions.spec.ts` (one journey
  added, one renamed).
- **Docs:** guide step 4.5, `docs/qa/catalog.mjs`, `CHANGELOG.md` (Sin publicar).
- **Data:** none. Rollback is reverting the code; activities deleted while the change was live
  are gone, exactly as withdrawn pending ones.
