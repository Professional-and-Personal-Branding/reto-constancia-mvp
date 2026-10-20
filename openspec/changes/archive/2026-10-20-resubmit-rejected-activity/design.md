## Context

- `DailyActivity` has `@@unique([challengeId, userId, date])`: one activity per participant, day
  and challenge. `POST /activities` maps the violation to 409 "Ya registraste una actividad para
  ese día"; the upload form shows the same text and disables submit from the calendar entry.
- `ActivitiesService.remove(id, userId, role)` runs inside `withChallengeLock`:
  `lockOpenActivity` locks the challenge, answers 400 "El reto está cerrado; sus actividades son
  definitivas" when it is `COMPLETED` (before any other check), and re-reads the activity under the
  lock. A non-admin must own the activity and it must be `PENDING` (403 otherwise). After the
  commit, `deleteAssetsLater(photoIds)` releases the files no other record references.
- `validate` and `reject` also run under the lock and re-read the activity. `validate` accepts a
  `REJECTED` activity (an admin can reverse a rejection) and clears `rejectionReason`.
- The calendar (`participant-calendar`) exposes `status` and `rejectionReason` per day, "Mi mes"
  links a day with an activity to `#actividad-<id>` in "Mis actividades", and the dashboard
  refreshes the calendar after registering or withdrawing.
- `create` allows any past valid day of the period while the challenge is `ACTIVE`; there is no
  registration deadline other than the close.
- The ranking only counts `VALIDATED` activities, so a `REJECTED` activity never adds points.

## Goals / Non-Goals

**Goals:**
- A participant can fix a rejected day by themselves while the challenge is open, without an admin
  and without Swagger.
- No schema change, reuse of the withdrawal path, its lock and its photo cleanup.
- The one-activity-per-day rule and every registration rule stay intact.

**Non-Goals:**
- Editing a rejected activity in place or keeping a rejection history (increment 2, D7).
- Retry limits, admin notifications, changes to the validation screen.

## Decisions

### D1. Increment 1 is "withdraw the rejected activity, then register again"

The three routes evaluated:

1. **Withdraw (delete) the own `REJECTED` activity, then register a new one for that day.**
   One status check changes in `remove`; the lock, the closed-challenge rule and the photo
   cleanup are reused as they are. The new activity goes through `create`, so every rule (period,
   weekday, heart-rate rule, own uploads, one per day, active challenge) is applied again by code
   that already exists and is tested. Cost: the rejection reason disappears with the row (D5).
2. **Correct and resubmit the same activity** (edit fields and photos, back to `PENDING`). Keeps
   the id and could keep history, but needs a new endpoint that duplicates the validation of
   `create` for an update, photo replacement with cleanup of the dropped files, a decision on what
   happens with `validatedById`/`validatedAt`, an edit form, a "resubmitted" marker for the admin
   and, to keep the history worth having, a migration (D7).
3. **Both, by increments.** Route 1 now, route 2 later if the missing history proves to matter.

**Chosen: 3, delivering route 1 now.** It solves the actual problem (the day is blocked) with a
one-line backend change and no migration, which is what the roadmap estimated for increment 1.
Route 2 adds history and a nicer flow, but neither the owner nor the current process needs the
history today (the admin already decides each new `PENDING` activity on its own merits), so its
cost is not justified yet.

### D2. Same rules as withdrawing a pending activity

- Allowed only for the owner, only for `PENDING` or `REJECTED`, only when the challenge is not
  `COMPLETED`. The closed check keeps its precedence over ownership and status.
- `VALIDATED` answers 403 "Solo se pueden eliminar actividades pendientes o rechazadas" (the old
  text is a prefix of the new one, so existing assertions keep matching).
- Admin deletion is unchanged (any activity of a challenge that is not closed).
- The status is the one re-read under the lock, so the decision always uses fresh data.

### D3. Fairness: the one-per-day rule is never bypassed

- Withdrawing removes the row; registering again creates a new one through `create`. At no moment
  can a participant hold two activities for the same day: the unique index still guarantees it,
  and the 409 still answers a concurrent second registration.
- A rejected activity scores nothing, so removing it changes neither the ranking nor the results.
- The new activity is `PENDING`: it scores only if an admin validates it, exactly like a
  first-time registration of a past day. A participant who withdraws gains nothing they could not
  have obtained by registering correctly the first time.
- Days that are no longer registrable (the period or the valid weekdays were edited after the
  rejection) can still be withdrawn, since a rejected activity is worth nothing, but `create` will
  refuse the date with its usual 400; the web does not offer "Registrar ese día" for them (D6).

### D4. No retry limit

A day can be withdrawn and registered again any number of times while the challenge is open.
Each new registration is a new `PENDING` activity that the admin can reject again with a new
reason. The admin's review is the control, and the volume is bounded by the participant's own
valid days. A limit would need a counter that survives the deletion, which means a migration
(see P1).

### D5. What happens to `rejectionReason` and the calendar

- The reason is deleted with the activity. Until the participant withdraws, it stays visible in
  "Mis actividades" and in the calendar, so the participant reads it before deciding. The request
  itself is traced by the existing access-log line (`DELETE /api/activities/:id`, 204, request id).
- The calendar needs no change: after the withdrawal the dashboard refreshes it (existing rule)
  and the day shows "Sin registro" (past) or "Hoy" (today) with the existing link to the upload
  form, or "Descanso" if it is no longer valid. The summary loses one `rejected` and one
  `registered`. The streak is display-only and recomputes by itself.

### D6. Web

- `ActivityRow` offers "Retirar" on `PENDING` and `REJECTED` rows of the participant (the list
  only shows the selected active challenge). `VALIDATED` rows still have no action.
- Rejected rows show, under the reason, "Puedes retirarla y registrar ese día de nuevo."
- Confirmation in the row, as today, with a specific question for rejected rows: "¿Retirar esta
  actividad rechazada? Se borrará con sus fotos y podrás registrar ese día de nuevo." and the
  buttons "Sí, retirar" / "No". Pending rows keep "¿Retirar esta actividad?".
- After withdrawing a rejected activity, the list shows "Actividad retirada." and, when that day's
  calendar entry is `valid` and the challenge is `ACTIVE`, a "Registrar ese día" link to
  `/dashboard/upload?date=<YYYY-MM-DD>`. The upload form already prefills the date from the query.
- "Mi mes" is unchanged: the rejected cell already links to the row (`#actividad-<id>`), where the
  hint and the action are now visible.
- Errors keep the existing handling: the API message is shown (for example the 400 of a closed
  challenge or the 403 of an activity validated meanwhile), and the list is refreshed.

### D7. Increment 2, recorded for the future

If history becomes necessary, increment 2 would be `PUT /activities/:id/resubmission` for the
owner of a `REJECTED` activity of an `ACTIVE` challenge, under the lock:

- Same body and rules as `create` except the date, which cannot change (the day is the identity
  under the unique index). New photos must pass `assertOwnedAsset`; photos removed from the
  activity are released with `deleteAssetsLater` after the commit.
- Status back to `PENDING`, `validatedById`/`validatedAt`/`validationNote` cleared.
- **Migration:** a new table `ActivityRejection(id, activityId, reason, rejectedById, rejectedAt)`
  written by `reject` (and backfilled from the current `rejectionReason`), plus
  `DailyActivity.resubmissionCount Int @default(0)` if a retry limit is wanted. The admin
  validation list would show "Reenviada" with the previous reasons; the calendar would keep
  `rejectionReason` as the last one.
- It would replace the withdraw-and-register path for rejected activities only if the owner wants
  the history; both can coexist.

## Risks / Trade-offs

- **Rejection history is lost on withdrawal** → accepted for increment 1 (D5); increment 2 is the
  remedy if it matters. The access log still records the deletion.
- **Reusing the photos of the withdrawn activity through the API.** Its files are released after
  the commit; an API client that sends the same ids in the new registration could point at a file
  that is already deleted (the reference check only protects files referenced at cleanup time).
  The web always uploads new files, so this only affects hand-made API calls. Mitigation: the
  confirmation says the photos are deleted; no code change.
- **More review work for the admin** if participants register a day several times → bounded by
  the participant's valid days; see P1 if it becomes a problem.
- **Race with the admin.** Both paths run under the challenge lock and re-read the status:
  - Admin validates the rejected activity while the owner withdraws it: if the validation commits
    first, the withdrawal answers 403 and the activity stays `VALIDATED`; if the withdrawal commits
    first, the validation answers 404 "Actividad no encontrada".
  - Admin closes the challenge meanwhile: the withdrawal answers 400 (closed) or commits before the
    close, which does not change the results because a rejected activity scores nothing.
  - Owner registers the day again while a previous withdrawal is still in flight: the unique index
    answers 409 until the deletion has committed.

## Migration Plan

- No schema change and no data migration. Deploy is the usual release.
- Rollback: revert the code. Rejected activities withdrawn in the meantime are not restored (the
  same as withdrawn pending ones); nothing else depends on them.

## Open Questions

- **P1. Retry limit per day.** [NO BLOQUEANTE]
  Options: (a) no limit; (b) one withdrawal per day and challenge (needs a counter that survives
  the deletion, so a migration); (c) a per-challenge limit configured by the admin.
  Recommendation: (a), because the admin's review already controls abuse and (b)/(c) bring back
  the migration that increment 1 avoids. The spec uses (a).
- **P2. Trace of the rejection after the withdrawal.** [NO BLOQUEANTE]
  Options: (a) none beyond the existing access-log line; (b) an extra info log line with activity
  id, challenge id and previous status (no personal data); (c) the history table of increment 2.
  Recommendation: (a) now and (c) only if the owner asks for history; (b) adds a log nobody reads.
  The spec uses (a).
- **P3. Label of the action on rejected rows.** [NO BLOQUEANTE]
  Options: (a) the same "Retirar" with the hint "Puedes retirarla y registrar ese día de nuevo.";
  (b) a distinct label such as "Retirar para corregir".
  Recommendation: (a), one action with one meaning, consistent with the guide and the existing
  journeys; the hint explains the purpose. The spec uses (a).
- **P4. When to do increment 2.** [NO BLOQUEANTE]
  Options: (a) leave it as a future change, decided after real use of increment 1; (b) include it
  now. Recommendation: (a): increment 1 removes the blocker without a migration, and the need for
  history is not established. This change implements (a).

None of the questions blocks the approval: each has a recommended default already written into the
spec.
