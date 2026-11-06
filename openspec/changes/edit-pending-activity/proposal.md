> **Sequencing gate (owner decision P1 a, 2026-10-29):** this change is specified now but **SHALL
> NOT be implemented until increment 2 of the rejected-activity resubmission exists as its own
> change and has been archived.** Before coding, its design is re-checked against that archived
> change (see `tasks.md` §0).

## Why

A typo in the minutes, the kilometres or the heart-rate data of a `PENDING` activity can only be
fixed today by withdrawing the activity and registering the day again:

- `ActivitiesController` exposes `POST /activities`, the reads, `validate`, `reject` and
  `DELETE /activities/:id`; nothing updates an activity's data from the participant side.
- Withdrawing deletes the photos (`deleteAssetsLater`), so the participant has to find and upload
  the captures again from the phone. Close to the end of a challenge that can cost the day.
- `activity-withdrawal` covers only deleting; no spec covers editing.

Source: PAR-1 of `docs/propuestas-mejoras-ciclo2-2026-10-29.md`, approved by the owner on
2026-10-29 with P1 (a), after increment 2 of the resubmission, and P2 (a), the editable fields
below without date or photos.

## What Changes

- **New `PATCH /api/activities/:id`** for the **owner** of a `PENDING` activity of an `ACTIVE`
  challenge. Editable fields: `exerciseType`, `durationMinutes`, `distanceKm`, `avgHeartRate`,
  `heartRateMinutes`, `notes` (the optional ones accept `null` to clear them). The date, the photos,
  the status and the challenge cannot change (400). The body needs at least one field.
- **Same rules as registering**, evaluated on the merged values under the challenge lock:
  `heartRateMinutes ≤ durationMinutes` and the challenge's **current** heart-rate rule
  (`assessHeartRate`, the proof still derived from the unchanged photos). The activity stays
  `PENDING` with the same photos and answers 200 with the compliance fields, like `create`.
- **Refusals:** closed challenge 400 (before any other check, like withdrawal); challenge not
  active 400; not the owner (admins included) 403; not `PENDING` 403 "Solo se pueden editar
  actividades pendientes".
- **One of edit and review wins.** The shared `lockOpenActivity` step also takes a row lock on the
  activity (`SELECT … FOR UPDATE`) before re-reading it, so an edit and a validation, rejection or
  deletion of the same activity run one after the other and the second sees the result of the
  first. Today's challenge lock is `FOR SHARE` and does **not** serialize those writes (design D3).
- **Web, "Mis actividades":** pending rows get "Editar", an inline form prefilled with the current
  values and the same client checks as the upload form; "Guardar" / "Cancelar"; after saving,
  "Actividad corregida." **Web, "Validar":** a pending card modified after it was registered shows
  the badge "Modificada".
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- Editing the date (withdraw and register again; P2 a) or the photos.
- Editing `VALIDATED` or `REJECTED` activities (rejected ones are increment 2's job).
- Admin editing of a participant's activity (the import with "update" and the override already
  cover the admin side).
- An edit history or notifying the admin.

## Capabilities

### New Capabilities
- `activity-editing`: the owner corrects the data of a pending activity without losing its photos;
  editing and reviewing the same activity are serialized.

### Modified Capabilities
- `challenge-lifecycle`: editing an activity is one of the writes serialized with closing, and
  activities of a closed challenge cannot be edited.

## Impact

- **Backend:** `ActivitiesController` (`PATCH :id`), `ActivitiesService.update` and
  `lockOpenActivity` (row lock, also used by `validate`, `reject` and `remove`), new
  `UpdateActivityDto`.
- **Web:** `frontend/app/dashboard/page.tsx` (`ActivityRow`), `frontend/app/dashboard/admin/
  validations/page.tsx` (badge), a pure helper shared with the upload form for the client checks.
- **Tests and QA:** unit and API e2e (including the race), one Playwright journey; new catalog cases
  `TC-ACT-27`, `TC-ACT-28` and `TC-UI-14` (re-check they are still free when implementing).
- **Docs:** guide 4.5 (correct or withdraw), `docs/challenge-rules.md` if it lists participant
  actions, `docs/architecture.md` (endpoint table), `CHANGELOG.md`.
- **Delivery:** 2 PRs: PR 1 API (`feature/edit-pending-activity-api`), PR 2 web
  (`feature/edit-pending-activity-web`), PR 2 after PR 1 is merged.
