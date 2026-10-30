## Context

Verified against `develop` (3da134a):

- `ActivitiesService.create` checks, in order: active participant, own uploads, period, valid
  weekday, `heartRateMinutes ≤ durationMinutes`, `assessHeartRate(challenge, { heartRateMinutes,
  hasHeartRateProof })` with the proof **derived from the photos**, then creates the row inside
  `withChallengeLock` after re-reading `status = ACTIVE`. The unique index
  `@@unique([challengeId, userId, date])` answers 409 "Ya registraste una actividad para ese día".
- `lockOpenActivity(tx, id, challengeId)` calls `lockChallenge(tx, challengeId)` (default mode
  **`share`**, `SELECT … FOR SHARE`), answers 400 "El reto está cerrado; sus actividades son
  definitivas" for `COMPLETED`, and re-reads the activity with a plain `findUnique`. `validate`,
  `reject` and `remove` use it. `challenge-lock.ts` says it explicitly: writers take `FOR SHARE`
  and **do not block each other**; only the close takes `FOR UPDATE`.
- `validate` and `reject` update the row unconditionally after that read; `remove` deletes it.
- `import.service.ts` with the "update" strategy rewrites the same fields (and the status) of an
  existing activity under the challenge lock.
- `DailyActivity` has `createdAt` and `updatedAt @updatedAt`. A `PENDING` activity is only
  updated by an import "update" (and, after this change, by an edit); validation and rejection
  move it out of `PENDING`.
- `CreateActivityDto` holds the field validators (`IsEnum(ExerciseType)`, `IsInt Min(1)` minutes,
  `IsNumber` km, `IsInt Min(30)` average heart rate, `IsInt Min(1)` heart-rate minutes, notes
  `MaxLength`). The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`.
- Increment 2 of `resubmit-rejected-activity` exists only as archived design D7 (a future
  `PUT /activities/:id/resubmission` for `REJECTED` activities, same body as `create` without the
  date, photo replacement, **with a migration**). There is no change for it yet.

### Corrections to the cycle 2 proposal (PAR-1)

- **"Carrera con la validación del admin: hay que usar `lockOpenActivity`" is not enough.** That
  helper takes the challenge lock in `FOR SHARE` mode, which two writers can hold at the same time.
  An edit and a validation could both read `PENDING`; the validation would then store `VALIDATED`
  with the compliance assessed on the old values while the edit stores the new ones: the activity
  ends up validated with data the admin never saw. The approved scenario ("gana una sola de las dos
  operaciones") needs a **row lock on the activity** (D3).
- The same gap exists today between `remove` and `validate`/`reject`: if the deletion commits after
  the validation's read, the validation's `update` hits a missing row (Prisma `P2025`), which the
  archived design of `resubmit-rejected-activity` describes as a 404 but is not mapped to one. D3
  fixes it as a side effect (the second operation re-reads after the first commits and answers 404
  "Actividad no encontrada").
- **"La regla de duplicados por día debe volver a evaluarse":** not needed. The date is not
  editable (P2 a), so an edit can never collide with the unique index; no 409 path exists for
  `PATCH`.
- **"Puede solaparse con el reenvío (incremento 2)":** they act on disjoint statuses (edit:
  `PENDING`; resubmission: `REJECTED`), but they share the field rules and the locking. That is why
  the owner chose to sequence them (D7).

## Goals / Non-Goals

**Goals:** fix a typo of a pending activity in one step, keeping its photos; apply exactly the
registration rules to the new values; never let an edit and a review of the same activity both
succeed on stale data.

**Non-Goals:** date or photo changes, editing validated or rejected activities, admin edits,
history.

## Decisions

### D1. Endpoint and body

`PATCH /api/activities/:id`, any authenticated user (the service decides), body
`UpdateActivityDto`: `PartialType(PickType(CreateActivityDto, ['exerciseType',
'durationMinutes', 'distanceKm', 'avgHeartRate', 'heartRateMinutes', 'notes']))`, where
`exerciseType` and `durationMinutes` reject `null` and the other four accept `null` to clear.
`date`, `photos`, `challengeId`, `status` and any other field answer 400 through
`forbidNonWhitelisted`. An empty body answers 400 "Indica al menos un dato para corregir". The
response is 200 with the activity and its compliance fields (same shape as `create`).

### D2. Order of checks (all under the locks)

1. `lockOpenActivity` (D3): challenge `COMPLETED` → 400 closed message; activity missing → 404.
2. Challenge status re-read under the lock is not `ACTIVE` → 400 "El reto no está activo".
3. Not the owner (admins included) → 403 "No puedes editar esta actividad".
4. Status re-read under the lock is not `PENDING` → 403 "Solo se pueden editar actividades
   pendientes".
5. Merge the body over the fresh row. `heartRateMinutes > durationMinutes` → 400 "Los minutos con
   FC no pueden superar la duración de la actividad".
6. `assessHeartRate(fresh.challenge, { heartRateMinutes: merged, hasHeartRateProof:
   fresh.hasHeartRateProof })`; non-compliant → 400 with the reasons joined, as `create`. The rule
   is the challenge's **current** one (it may have changed since the registration); if the
   activity cannot comply without a heart-rate photo, the answer tells the participant what is
   missing and withdrawing remains the way out.
7. `update` the six fields only; status, photos, date and review fields are untouched.

The closed check keeps its precedence over ownership and status, as in `remove`. The extracted
field rules (5 and 6) live in a pure function `checkActivityFields(challenge, values,
hasHeartRateProof)` used by `create` and `update`, so both paths cannot drift; increment 2 would
reuse it.

### D3. Row lock: edit and review are serialized

`lockOpenActivity` becomes: `lockChallenge(tx, challengeId)` (share, unchanged), then
`SELECT id FROM "DailyActivity" WHERE id = $1 FOR UPDATE`, then the existing `findUnique`. Every
caller (`validate`, `reject`, `remove`, `update`) takes the locks in the same order (challenge,
then activity), and the close only takes the challenge in `FOR UPDATE`, so no deadlock cycle is
possible. The import keeps its implicit row lock (its `update` locks the row) after the challenge
lock, the same order. Effects:

- Edit then validation: the validation waits, re-reads the new values and assesses compliance on
  them.
- Validation then edit: the edit waits, re-reads `VALIDATED` and answers 403.
- Deletion then validation (existing race): the validation waits, re-reads nothing and answers 404.
- The lock is held for the few milliseconds of the transaction; the 5 s `lock_timeout` of
  `WRITER_TX` applies to it too and still maps to the 409 "El reto se está cerrando…" message only
  if the timeout fires, which needs a transaction stuck for seconds.

The SQL uses the table name `"DailyActivity"` (no `@@map`), like `challenge-lock.ts` does for
`"Challenge"`; the API e2e exercise it.

### D4. What the admin sees

A card in "Validar" whose `updatedAt` differs from `createdAt` shows the badge "Modificada" (tooltip
"Los datos cambiaron después del registro"). For a `PENDING` activity this means an edit or an
import "update"; the neutral word covers both. If the admin was looking at a card while the
participant edited it, the photos, which are the evidence, did not change, and the validation
re-checks the heart-rate rule on the stored values (D3); the page refreshes after each action and
on focus. No `If-Match`/version check is added (accepted risk, below).

### D5. Web, "Mis actividades"

- `ActivityRow` offers "Editar" next to "Retirar" on `PENDING` rows when the selected challenge is
  `ACTIVE`. The inline form shows the six fields prefilled (same inputs and units as the upload
  form), with the date and the photos shown read-only.
- Client checks reuse the upload form's logic, extracted to `frontend/lib/activity-form.ts`
  (minutes ≤ duration, heart-rate minimum when the challenge has one and the activity has the
  heart-rate photo); "Guardar" is disabled while the form is invalid or unchanged.
- On success: "Actividad corregida.", the row shows the new values; invalidate `['activities']`
  and `['results']` (the calendar and "Mi avance" live under those prefixes).
- On error the API message is shown in the row (403 when it was validated or rejected meanwhile,
  400 for a closed challenge) and the list is refreshed, like the withdrawal handler.

### D6. Interaction with the one-activity-per-day rule and the withdrawal

- The date is immutable, so `PATCH` never touches the unique index and never answers 409.
- Withdrawing and editing the same activity at the same time are serialized by D3: if the
  withdrawal commits first the edit answers 404; if the edit commits first the withdrawal deletes
  the edited row.

### D7. Sequencing with increment 2 (owner P1 a)

This change is implemented only after increment 2 is proposed, approved, implemented and
archived. Before coding, the implementer re-reads that archived change and updates this one
(`openspec-update-change`) where they overlap:

- if increment 2 already introduced the row lock or the shared field check, reuse them and drop
  the duplicated tasks;
- if increment 2 added a migration (`ActivityRejection`, `resubmissionCount`), confirm this change
  still needs none;
- re-check the catalog IDs and the web row actions ("Editar", "Retirar", "Reenviar").

If the owner later drops increment 2 instead of building it, the gate is lifted by an explicit
owner decision recorded in this file.

## Risks / Trade-offs

- **The row lock changes `validate`, `reject` and `remove`** → behaviour is the same except under
  a real race, where it becomes correct; covered by unit tests of the order of calls and an API e2e
  that runs edit and validate in parallel.
- **Admin validates numbers they did not see** → bounded: the edit can only change self-reported
  numbers, not the photos; the badge "Modificada" flags it and the heart-rate rule is re-checked on
  the stored values.
- **A stricter rule applied on edit** (the challenge's minimum raised after registration) can
  reject an edit of an activity that was accepted at registration → intended ("regla vigente"),
  the message says what is missing.
- **Delay of the feature** because of the gate → accepted by the owner (P1 a).

## Migration Plan

No schema change and no data migration (`updatedAt` already exists). PR 1 (API) can be deployed
alone: nothing calls `PATCH` until PR 2. Rollback: revert PR 2, then PR 1; the row lock removal
only reopens the races described above.

## Open Questions

- **P1. When is the sequencing gate lifted?** [BLOQUEANTE for implementation, not for approving
  these artifacts]
  Increment 2 has no change and no release plan: the archived decision (P4 of
  `resubmit-rejected-activity`) was to decide it "after real use of increment 1". Options: (a) keep
  the gate until increment 2 is archived (as decided); (b) lift it if the owner decides not to build
  increment 2; (c) set a date to decide on increment 2. Recommendation: (a) plus (c): the owner
  decides on increment 2 at the next roadmap review, so this change does not wait indefinitely.
- **Defaults kept in this spec:** 403 (not 409) for a non-pending activity, consistent with the
  withdrawal; the badge text "Modificada".
