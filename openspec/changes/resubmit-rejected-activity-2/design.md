## Context

Verified against `develop` (35560b4, release 1.14.0):

- `DailyActivity` has `rejectionReason`, `validationNote`, `validatedById`, `validatedAt`,
  `createdAt`, `updatedAt` and `@@unique([challengeId, userId, date])`; photos live in
  `ActivityPhoto` (`url`, `cloudinaryId`, `type`). Last migration: `20261003065550_
  challenge_budget_automatic` (1.4.0); every release since then had no migration.
- `create` checks: active participant (`assertActiveParticipant`, outside the lock), no duplicated
  photo id, `assertOwnedAsset` per photo, period, weekday, `heartRateMinutes ≤ durationMinutes`,
  `assessHeartRate` with the proof derived from the photos; then it creates under
  `withChallengeLock` after re-reading `ACTIVE`.
- `lockOpenActivity` takes the challenge lock in `FOR SHARE` mode (writers do not block each
  other), answers 400 `CLOSED_ACTIVITIES_MESSAGE` for `COMPLETED` and re-reads the activity with a
  plain `findUnique`. `validate` accepts `PENDING` and `REJECTED` (clears `rejectionReason`);
  `reject` has no status check (it can reject a `VALIDATED` activity or re-reject a `REJECTED` one,
  overwriting the reason); `remove` lets the owner delete `PENDING`/`REJECTED`.
- `deleteAssetsLater` releases a file only if no `ActivityPhoto` (nor payment proof) still
  references it, after the commit, without blocking.
- The import "update" rewrites the fields, `status` and sets `rejectionReason = null` on an
  existing row under the challenge lock; it never touches photos.
- The calendar exposes `rejectionReason` per day; the ranking counts only `VALIDATED`; the close
  preview lists `PENDING` activities; the CSV record counts days per status.
- `edit-pending-activity` (open, gated): `PATCH /activities/:id` for `PENDING`, no photos, row lock
  in `lockOpenActivity` (its D3), shared `checkActivityFields` (its D2); catalog `TC-ACT-27`,
  `TC-ACT-28`, `TC-UI-14`; gate lifted only when this increment is archived (its D7, P1).

## Goals / Non-Goals

**Goals:** fix a rejected activity in one step keeping the photos that were fine; never lose a
rejection reason while the activity exists; apply exactly the registration rules again; never let a
resubmission and a review of the same activity both succeed on stale data; leave
`edit-pending-activity` a smaller change.

**Non-Goals:** see the proposal (date change, limits, notifications, import history, removing the
withdrawal).

## Decisions

### D1. Options evaluated and the choice

| Option | What it is | Cost | Risk | Migration |
|---|---|---|---|---|
| A | `PUT /activities/:id/resubmission`: correct the same row, back to `PENDING`, keep photos | Medium: endpoint, photo diff, web mode | Low with the row lock (D4) | Needed only for the history |
| B | History table `ActivityRejection` written by `reject` | Low | Very low (additive) | Yes, additive |
| C | Keep withdraw + register; add a minimal day-keyed rejection log that survives the deletion | Low-medium | Log keyed by `(challenge, user, date)` with no FK; photos still lost | Yes |
| D1 | A without a table: keep the last reason in `rejectionReason` while `PENDING` | Low | Overloads the field (calendar and web read it as "rejected now"); only one level of history; no counter | No |
| D2 | One `PATCH` for `PENDING` (edit) and `REJECTED` (resubmit) | Medium | Contradicts the owner's P2 a of `edit-pending-activity` (no photos in an edit) and mixes two statuses in one contract | Yes, for history |

**Chosen: A built on B's table** (the archived D7 shape). A alone cannot keep a history without
storage, and B alone does not save the photos nor the re-upload, which is half of the problem. C
keeps the photo loss and needs a key without referential integrity. D1 avoids the migration at the
price of changing what `rejectionReason` means in three consumers (calendar, row, admin card) and
still cannot count resubmissions. D2 reopens an owner decision. The migration is small, additive
and the previous version runs on top of it (Migration Plan), so its risk is low.

### D2. Endpoint, body and response

`PUT /api/activities/:id/resubmission`, any authenticated user (the service decides), body
`ResubmitActivityDto = OmitType(CreateActivityDto, ['challengeId', 'date', 'hasHeartRateProof'])`
(same validators, `photos` with `ArrayMinSize(1)`). `PUT` because the body is the full new state of
the correctable data, not a patch; the web sends the whole form. `challengeId`, `date`, `status` or
any unknown field answer 400 through `forbidNonWhitelisted`. Response 200 with the activity, its
compliance fields and `rejections`, same shape as `GET /activities/me` items.

### D3. Data model and migration

```prisma
model ActivityRejection {
  id           String        @id @default(uuid())
  activityId   String
  reason       String
  rejectedById String?
  rejectedAt   DateTime      @default(now())
  activity     DailyActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  rejectedBy   User?         @relation("RejectedBy", fields: [rejectedById], references: [id], onDelete: SetNull)
  @@index([activityId, rejectedAt])
}
// DailyActivity: resubmissionCount Int @default(0); rejections ActivityRejection[]
// User: rejectionsMade ActivityRejection[] @relation("RejectedBy")
```

- `onDelete: Cascade` from the activity: withdrawing or deleting an activity deletes its history
  (consistent with today's deletion; no orphan personal data).
- `rejectedById` nullable with `SetNull`: never blocks deleting a user and lets the backfill keep
  rows whose `validatedById` is missing.
- `resubmissionCount` drives the "Reenviada" badge precisely (history alone would also flag an
  import "update" of a rejected row to `PENDING`) and would support a limit if the owner wants one.
- Backfill in the same migration, in SQL (PostgreSQL 16 has `gen_random_uuid()`):

```sql
INSERT INTO "ActivityRejection" ("id", "activityId", "reason", "rejectedById", "rejectedAt")
SELECT gen_random_uuid()::text, "id", "rejectionReason", "validatedById",
       COALESCE("validatedAt", "updatedAt")
FROM "DailyActivity"
WHERE "status" = 'REJECTED' AND "rejectionReason" IS NOT NULL;
```

  Rejections already reversed or withdrawn before the migration are not recoverable (their reason
  was overwritten or deleted); the history starts with the current ones.
- Manual down script (documented in the runbook, not a Prisma migration, which are forward only):
  `DROP TABLE "ActivityRejection"; ALTER TABLE "DailyActivity" DROP COLUMN "resubmissionCount";`
  plus deleting the migration row from `_prisma_migrations`. Not needed for a rollback (see
  Migration Plan).

### D4. Row lock in `lockOpenActivity` (taken over from `edit-pending-activity` D3)

`lockOpenActivity` becomes: `lockChallenge(tx, challengeId)` (share, unchanged) → closed check →
`SELECT id FROM "DailyActivity" WHERE id = $1 FOR UPDATE` → the existing `findUnique` (404 if
gone). Callers: `validate`, `reject`, `remove`, `resubmit`. Lock order is always challenge, then
activity; the close only takes the challenge `FOR UPDATE`; the import locks the row implicitly
after the challenge. No deadlock cycle.

Races this decides (today, under `FOR SHARE` only, both writers can read `REJECTED`):

- Resubmit vs validate of the same `REJECTED` activity: whoever locks first commits; the second
  re-reads. Validate first → resubmission 403 "Solo se pueden reenviar actividades rechazadas",
  activity `VALIDATED` with the data the admin saw. Resubmit first → the validation sees `PENDING`
  with the new data and assesses the heart-rate rule on it (it may then need the override). Without
  the lock the activity could end `VALIDATED` with photos and numbers nobody reviewed.
- Resubmit vs reject: either the resubmission answers 403 (rejected again first, new history row)
  or the rejection applies to the resubmitted data (accepted, same as `edit-pending-activity`; the
  participant can resubmit again).
- Resubmit vs withdraw (two tabs of the owner): the second answers 404.
- Withdraw vs validate (existing): the validation answers 404 instead of a Prisma `P2025` 500,
  which makes the archived scenario "Owner withdraws first" of `activity-withdrawal` true.

### D5. Order of checks of `resubmit` and what it writes

Outside the lock: `findOne(id)` → 404 "Actividad no encontrada". Inside `withChallengeLock`:

1. `lockOpenActivity` (D4): `COMPLETED` → 400 "El reto está cerrado; sus actividades son
   definitivas" (before any role, ownership or status check, as `challenge-lifecycle` requires).
2. Challenge status under the lock not `ACTIVE` → 400 "El reto no está activo".
3. Not the owner (admins included) → 403 "No puedes reenviar esta actividad".
4. Status under the lock not `REJECTED` → 403 "Solo se pueden reenviar actividades rechazadas"
   (also covers a double click: the second request sees `PENDING`).
5. Enrollment (`assertEnrolled`) → 403 "No participas en este reto", as registering.
6. Photos (D7) → 400 "La misma foto no puede adjuntarse dos veces" or the `assertOwnedAsset` error.
7. Stored date within the period and on a valid weekday of the **current** rules → 400 with the
   registration messages ("La fecha está fuera del período del reto", "Ese día de la semana no es
   válido para este reto"). The day may have stopped being valid after the rejection; withdrawing
   stays possible.
8. `checkActivityFields(challenge, values, hasHeartRateProof)` (pure, extracted from `create`):
   `heartRateMinutes ≤ durationMinutes`, then `assessHeartRate` with the current rule → 400 with
   the same messages as `create`.
9. Write: update the six data fields, `hasHeartRateProof` (derived), `status = PENDING`,
   `rejectionReason = null`, `validatedById = null`, `validatedAt = null`, `validationNote = null`,
   `resubmissionCount = resubmissionCount + 1`; delete the dropped `ActivityPhoto` rows and create
   the new ones. The history rows are not touched.

After the commit: `void deleteAssetsLater(droppedIds)`. If anything fails, nothing is written and
nothing is released. The date never changes, so the unique index is never hit and there is no 409.

`reject` (also under D4) writes, in the same transaction as today's update, one
`ActivityRejection { activityId, reason, rejectedById: validatorId, rejectedAt: now }`. `validate`
keeps clearing `rejectionReason` and does not touch the history (an admin reversal leaves its
trace). The import is unchanged.

### D6. No resubmission limit

The withdrawal of a `REJECTED` activity stays (archived D2/D4: unlimited). Any limit on
resubmissions would be bypassed by withdrawing and registering the day again (a new row with
`resubmissionCount = 0` and no history), so it would only push participants to the path that loses
the history. The admin's review stays the control, now with better information ("Reenviada ×3"
and the reasons). `resubmissionCount` keeps a limit cheap if the owner later also restricts the
withdrawal of rejected activities (P1).

### D7. Photos

- The body lists the **final** photos. A body photo whose `cloudinaryId` **and** `url` equal a
  stored photo of this activity is **kept**: its file is not re-checked with `assertOwnedAsset`
  (it was accepted when registered, and imported photos with `import/...` ids would not pass the
  check), and its `type` is taken from the body (a capture mis-tagged as activity photo can be
  re-tagged as heart-rate proof).
- Any other photo is **new** and MUST pass `assertOwnedAsset` for this challenge, this user and
  purpose `activity`, exactly as in `create`.
- Stored photos absent from the body are **dropped**: their rows are deleted in the transaction and
  their files released after the commit with `deleteAssetsLater`, which skips files still
  referenced elsewhere.
- `hasHeartRateProof` is derived from the final list, as in `create`.

### D8. History visibility and privacy

- `rejections` (`[{ reason, rejectedAt }]`, oldest first) is included in the activity items of
  `GET /activities/me` (owner), and of `GET /activities`, `GET /activities/pending` and
  `GET /activities/:id` (admin, and owner for the detail). The admin's identity is not exposed
  (`rejectedById` stays internal): the participant does not see it today either (only the reason),
  and the admins work as one team.
- Not exposed by the calendar, the ranking, the results, the close preview or the CSV record. The
  reasons are written by admins about one participant's activity; the existing rule "activity
  detail is visible only to its owner or an admin" applies.
- Withdrawing deletes the history (cascade). The participant controls their own data; the admin
  loses the trace of that day, as today with increment 1.

### D9. Web

- **"Mis actividades", rejected row:** current reason (as today), hint "Puedes corregirla y
  reenviarla, o retirarla y registrar ese día de nuevo.", actions "Corregir y reenviar" (primary,
  only when the selected challenge is `ACTIVE`) and "Retirar" (unchanged confirmation).
- **Resubmission mode of the upload form** (`/dashboard/upload?reenviar=<id>`): reuses the form,
  its client checks and its upload widgets instead of a second inline form with uploads (heavy on a
  phone). It loads the activity from `GET /activities/:id`; if it is not the participant's
  `REJECTED` activity of an active challenge it shows "Esta actividad ya no se puede reenviar." and
  a link back. Date shown read-only; current photos listed with "Quitar"; new ones added as today;
  title "Corregir y reenviar", button "Reenviar". On success it returns to the dashboard with
  "Actividad reenviada. Queda pendiente de validación." and invalidates `['activities']` and
  `['results']` (calendar and "Mi avance" live there). On an API error it shows the message.
- **History in the row:** any activity with earlier rejections shows a collapsed "Rechazos
  anteriores (n)" listing date and reason, excluding the current one when it is `REJECTED`.
- **"Validar":** card badge "Reenviada" when `resubmissionCount > 0` ("Reenviada ×n" when n ≥ 2)
  and the list of earlier rejections. The menu badge already counts the activity again (it is
  `PENDING`).
- **"Mi mes":** unchanged. A rejected cell links to its row; after resubmitting the day shows
  pending.

### D10. Score, calendar and the close window

- `REJECTED` and `PENDING` both score 0: resubmitting never changes the ranking until an admin
  validates; the calendar moves one day from `rejected` to `pending` (`registered` unchanged); the
  streak and "Mi avance" recompute as for any pending day.
- Only `ACTIVE` challenges: as registering, a past valid day can be resubmitted until the close,
  even after the period's end date. Racing the close: either the resubmission commits first (the
  activity is `PENDING` at close and appears in the close preview's pending list, as a late
  registration does) or it answers 400. Nothing changes after the close.

### D11. Lifting the `edit-pending-activity` gate

That change's gate (its tasks 0.2, design D7/P1 a) is satisfied when **this change is archived**
in its release branch. Then its 0.3 update applies, with these overlaps already known:

- Row lock: delivered here (D4). Its tasks 1.2 and the row-lock part of 2.2 become "reuse"; its
  requirement "Editing and reviewing the same activity are serialized" is folded into this
  change's "Changes to one activity are serialized" by adding editing to the list.
- `checkActivityFields`: extracted here; its 1.3 becomes "reuse".
- Its `challenge-lifecycle` delta modifies the same two requirements as this one: it MUST be
  rebased on the archived text (keep "resubmitting" and add "editing").
- Badge "Modificada" (`updatedAt ≠ createdAt`): every resubmitted activity also satisfies it; the
  card SHALL show "Reenviada" instead when `resubmissionCount > 0`, and "Modificada" only otherwise.
- Row actions: `PENDING` "Editar" + "Retirar"; `REJECTED` "Corregir y reenviar" + "Retirar";
  `VALIDATED` none. Catalog: it keeps `TC-ACT-27`, `TC-ACT-28`, `TC-UI-14`; this change uses
  `TC-ACT-29..31` and `TC-UI-15`; its journey takes the next free number after
  `19-resubmit-activity.spec.ts`.
- Migration status: it still needs none.

## Risks / Trade-offs

- **First migration since 1.4.0** → additive, backfill idempotent within the migration, verified
  backup (runbook §5.1) mandatory before deploying; the previous version runs on the new schema.
- **Row lock changes `validate`, `reject` and `remove`** → same behaviour except under a real race,
  where it becomes correct; unit tests of the call order and API e2e of parallel requests.
- **Admin rejects on a stale view** (rejection applies to resubmitted data) → accepted; the
  participant can resubmit again and the history shows both reasons.
- **A stricter current rule** (minimum raised, weekday removed after the rejection) refuses a
  resubmission → intended ("regla vigente", as `edit-pending-activity`); the message says why and
  withdrawing remains possible.
- **Resubmissions right before the close** add pending work → bounded; the close preview already
  lists pending activities.
- **History lost on withdrawal** → accepted (participant's choice, P2); the resubmission path is
  now the recommended one in the web.
- **Dropped photo still referenced elsewhere** → `deleteAssetsLater` keeps it.

## Migration Plan

1. PR 1 adds the migration; `prisma migrate deploy` applies it at API start (runbook §2). The
   release notes and `CHANGELOG.md` list it, so the verified backup of §5.1 runs before deploying.
2. **Going back to 1.14.0 without restoring:** redeploy API and web 1.14.0 and leave the schema as
   is. The old Prisma client selects explicit columns (ignores `resubmissionCount`), never reads
   the new table, and its deletions cascade through the new FK at the database level. Effects
   while rolled back: rejections are not recorded in the history and resubmitted counters stop
   growing; nothing breaks. Redeploying the new version later is a no-op migration.
3. **Full schema removal** (only if wanted): the manual down script of D3, after rolling back the
   code. Restoring the §5.1 backup is not needed for a rollback and would lose data written since.
4. The runbook §4 gets the revert line for the release that ships this change.

## Open Questions

Defaults already written into the spec; none blocks approving the artifacts.

- **P1. Resubmission limit.** [NO BLOQUEANTE] (a) no limit; (b) a fixed limit (for example 3 per
  activity) together with forbidding the withdrawal of rejected activities, which reverses archived
  D2/D4. Recommendation: (a) (D6): a limit without (b)'s second half is bypassed by withdrawing.
- **P2. Keep the withdrawal of rejected activities.** [NO BLOQUEANTE] (a) keep both paths, web
  puts "Corregir y reenviar" first; (b) remove the withdrawal for `REJECTED`. Recommendation: (a),
  as archived D7 said; withdrawing is the only way out when the day stopped being valid or the date
  was wrong.
- **P3. Admin identity in the history.** [NO BLOQUEANTE] (a) reason and time only, for everyone;
  (b) admins also see who rejected. Recommendation: (a), the participant never saw the admin's
  identity and the admins work as one team; `rejectedById` is stored, so (b) is a later read-only
  change.
- **P4. Release and gate.** [BLOQUEANTE for planning, not for approval] (a) ship this change alone
  in the next minor (1.15.0, release with a migration) and start `edit-pending-activity` after it
  is archived (D11); (b) wait and ship both in the same release, which the gate forbids unless the
  owner changes it. Recommendation: (a).
