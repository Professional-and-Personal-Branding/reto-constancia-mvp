> **Status:** proposal for the owner's review. Nothing here is approved yet (`tasks.md` 0.1).
> **Schema change: YES.** One additive, reversible migration (new table `ActivityRejection`, new
> column `DailyActivity.resubmissionCount`, backfill of the current rejection reasons). No new
> dependency, no new environment variable, `@@unique([challengeId, userId, date])` is untouched.

## Why

Increment 1 (`2026-10-20-resubmit-rejected-activity`, released in 1.11.0) unblocked a rejected day
by letting the owner withdraw the `REJECTED` activity and register the day again. It left three
costs, recorded then as increment 2 (archived design D7, P4 a):

- **The rejection reason is lost.** Withdrawing deletes the row and its `rejectionReason`
  (archived D5). The admin who reviews the new registration does not know it was already rejected
  nor why; the participant loses the explanation as soon as they act on it.
- **The photos are lost.** Withdrawing releases every file (`deleteAssetsLater`), so a participant
  whose only problem was a missing heart-rate capture or a typo in the minutes has to upload again
  the captures that were fine.
- **No trace of repeated rejections.** Each new registration starts clean, so a day rejected three
  times looks like a first submission.

`edit-pending-activity` (PAR-1) is specified but gated by the owner (its P1 a): it SHALL NOT be
implemented until this increment exists and is archived. This change is that increment; it also
delivers the row lock that `edit-pending-activity` needs (its D3), so the gate can be lifted
without duplicated work (design D9).

## What Changes

- **New `PUT /api/activities/:id/resubmission`** for the **owner** of a `REJECTED` activity of an
  `ACTIVE` challenge in which they are enrolled. Body: the same fields as `POST /activities` except
  `challengeId` and `date` (which cannot change): `exerciseType`, `durationMinutes`, `distanceKm`,
  `avgHeartRate`, `heartRateMinutes`, `notes`, `photos` (the full final list, at least one). Every
  registration rule is applied again with the challenge's **current** rules: own uploads for new
  photos, period and valid weekday of the (unchanged) date, `heartRateMinutes ≤ durationMinutes`
  and the heart-rate rule with the proof derived from the final photos. On success: 200, status
  back to `PENDING`, review fields cleared, `resubmissionCount + 1`, photos kept or replaced; the
  photos dropped from the activity are released after the commit.
- **Refusals:** closed challenge 400 (first, as every activity write); challenge not active 400;
  not the owner (admins included) 403 "No puedes reenviar esta actividad"; not `REJECTED` 403
  "Solo se pueden reenviar actividades rechazadas"; not enrolled 403 (same as registering); rule
  violations 400 with the registration messages. Never 409: the date and the unique index are
  untouched.
- **Only pending activities can be rejected** (coordinator decision, design D12): rejecting a
  `REJECTED` or `VALIDATED` activity answers 409 "Solo se pueden rechazar actividades pendientes"
  without changes (closed challenge keeps its 400 first). No web flow or existing test re-rejects;
  a mistaken validation is fixed by deleting the activity.
- **Rejection history.** Every `POST /activities/:id/reject` also writes an `ActivityRejection`
  row (reason, admin, time) in the same transaction. The migration backfills one row per current
  `REJECTED` activity with a reason. `rejectionReason` keeps meaning "reason of the current
  rejection" (cleared by validating and by resubmitting). Withdrawing an activity deletes its
  history with it (cascade), as it deletes the activity today.
- **Who sees the history:** the owner (`GET /activities/me`) and admins (`GET /activities`,
  `/activities/pending`, `/activities/:id`), as `rejections: [{ reason, rejectedAt }]`, oldest
  first, without the admin's identity. It is never part of the calendar, the ranking, the results,
  the close preview or the CSV record.
- **Row lock for every change of one activity.** `lockOpenActivity` also takes
  `SELECT … FOR UPDATE` on the activity row after the challenge lock, so resubmitting, validating,
  rejecting and deleting the same activity run one after the other on fresh data. Today the
  challenge lock is `FOR SHARE` and does not serialize them (finding of `edit-pending-activity` D3;
  it also makes the archived "Owner withdraws first → 404" scenario true, today it can be a 500).
  For `validate` and `remove` the only visible change is that 404 instead of 500. A row-lock
  timeout answers its own 409 "La actividad se está modificando; vuelve a intentarlo en unos
  segundos" instead of the misleading "El reto se está cerrando…".
- **Shared field rules.** The registration checks are extracted to a pure
  `checkActivityFields(challenge, values, hasHeartRateProof)` used by `create` and the
  resubmission (the helper `edit-pending-activity` D2 already names).
- **Web, participant:** a rejected row in "Mis actividades" offers "Corregir y reenviar" (primary)
  and "Retirar"; the hint becomes "Puedes corregirla y reenviarla, o retirarla y registrar ese día
  de nuevo.". "Corregir y reenviar" opens the upload form in resubmission mode
  (`/dashboard/upload?reenviar=<id>`), bound to the activity's own challenge (not the selector):
  fields prefilled, date fixed, the two photo slots prefilled with the stored photos as remote
  previews ("Quitar", replace, move between slots to re-tag), extra stored photos under "Otras
  fotos (n)", only new files uploaded. After sending: "Actividad reenviada. Queda pendiente de
  validación." in a focused status region. Any row with earlier rejections shows a `<details>`
  "Rechazos anteriores (n)".
- **Web, admin "Validar":** a resubmitted card shows the badge "Reenviada" ("Reenviada ×n" from the
  second time) and the list of earlier rejections. The pending badge in the menu already counts it
  again; no other notification channel is added.

## Non-goals

- Changing the date of an activity (withdraw and register again).
- Removing the withdrawal of rejected activities: both paths coexist (archived D7; design P2).
- A resubmission limit (design D6 and P1).
- Editing `PENDING` activities (`edit-pending-activity`) or `VALIDATED` ones.
- E-mail, push or any new notification channel to the admin.
- History for imports: an import "update" keeps rewriting `status`/`rejectionReason` as today and
  writes no history row; its rows have no reason to keep.
- Showing the history in "Mi mes", the ranking, the results, the close preview or the CSV export.

## Capabilities

### New Capabilities
- `activity-resubmission`: the owner corrects and resubmits a rejected activity keeping its
  photos; every rejection is kept as history visible to the owner and admins; changes to one
  activity are serialized by a row lock; web flows for the participant and the admin.

### Modified Capabilities
- `activity-withdrawal`: withdrawing a rejected activity also deletes its rejection history; the
  rejected row offers "Corregir y reenviar" next to "Retirar" and a new hint.
- `challenge-lifecycle`: resubmitting is one of the writes serialized with closing, and
  activities of a closed challenge cannot be resubmitted.

## Impact

- **Schema / migration (highlighted):** `prisma/schema.prisma` (`ActivityRejection`,
  `DailyActivity.resubmissionCount`, relations), one migration
  `<timestamp>_add_activity_rejection_history` with an idempotent SQL backfill (also kept as
  `backend/prisma/sql/backfill-activity-rejections.sql`, the catch-up step after a rollback and
  redeploy). Additive; the previous version runs on the new schema (design D3, Migration Plan).
  Shipped alone in `release/1.15.0`; the verified backup of runbook §5.1 is mandatory before
  deploying.
- **Backend:** `ActivitiesController` (`PUT :id/resubmission`), new `ResubmitActivityDto`,
  `ActivitiesService.resubmit`, `reject` (writes history), `lockOpenActivity` (row lock, used by
  `validate`, `reject`, `remove`, `resubmit`), `checkActivityFields` extracted from `create`,
  `findAll`/`findOne` include `rejections`.
- **Web:** `frontend/app/dashboard/page.tsx` (`ActivityRow`), `frontend/app/dashboard/upload/
  page.tsx` (resubmission mode), `frontend/app/dashboard/admin/validations/page.tsx` (badge and
  history), `frontend/lib/types.ts`.
- **Tests and QA:** unit, API e2e (including the races), one Playwright journey
  (`e2e/tests/19-resubmit-activity.spec.ts`); new catalog cases `TC-ACT-29`, `TC-ACT-30`,
  `TC-ACT-31`, `TC-UI-15` (verified free on `develop` and on every unmerged branch;
  `TC-ACT-27`, `TC-ACT-28` and `TC-UI-14` stay reserved by `edit-pending-activity`).
- **Docs:** guide new step 4.6 and hint in 4.5, `docs/architecture.md` (endpoint table, ER and
  state diagrams: `REJECTED --> PENDING`), `docs/challenge-rules.md` (participant actions),
  `docs/runbook-despliegue.md` §4 (revert line for the release with this migration),
  `docs/security-owasp.md` (one line: owner-only resubmission, history without admin identity),
  `CHANGELOG.md` (migration and how to go back).
- **Delivery:** 2 PRs — PR 1 migration + API (`feature/resubmit-rejected-activity-2-api`, with
  the runbook §4 revert text and the CHANGELOG entry), PR 2 web
  (`feature/resubmit-rejected-activity-2-web`) after PR 1 is merged. PR 1 is deployable alone.
  Release `release/1.15.0` from `develop`.
