## Context

- The backend has no row locks and no interactive transactions; the only `$transaction` is the
  array one in `award()`. Status checks run before the write with no condition on the write.
- `ChallengesService` already has `assertActiveParticipant` / `assertPaymentParticipant`
  (upload-guardrails) and `openForPayments`; `ActivitiesService.create` uses the first one.
- `ResultsService.getResults` computes the ranking on every read and calls `selectWinners`; awards
  take precedence when they exist. `ChallengeAward` has `notes`, a unique `(challengeId, userId)`
  and FKs to user and challenge only.
- `ImportService.applyRow` caches the challenge per commit and creates users, participants and
  activities with no status check; `commitRows` turns row exceptions into `errors`.
- Prisma 5.22 supports `$transaction(fn, { maxWait, timeout })`. The model `Challenge` has no
  `@@map`, so the table is `"Challenge"`.

## Goals / Non-Goals

**Goals:** nothing that feeds the ranking or the pot of a `COMPLETED` challenge can change,
including writes racing the close; one closing step; a fair draw stored once; clear 400/409
messages, never 500.

**Non-Goals:** assisted close UI, snapshots, reopening (see proposal).

## Decisions

1. **D1 - Shared lock helper** (`challenges/challenge-lock.ts`, plain functions):
   - `lockChallenge(tx, id, mode)` runs `SET LOCAL lock_timeout`, then
     `SELECT status FROM "Challenge" WHERE id = $1 FOR SHARE | FOR UPDATE`, and returns the status
     (404 if missing). A comment pins the table name.
   - `withChallengeLock(prisma, fn, opts)` wraps `$transaction` and translates lock or transaction
     timeouts into 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos" through
     `isLockTimeout(e)`. That covers `P2028`, a `P2010` or unknown request error carrying SQLSTATE
     `55P03`, and `PrismaClientUnknownRequestError` with `55P03`.
   - Timeouts, ordered so the lock fails first with its own message:

     | Who | lock_timeout | maxWait | timeout |
     |---|---|---|---|
     | Writers | 5 s | 5 s | 10 s |
     | Closer | 10 s | 5 s | 15 s |
2. **D2 - Writers take `FOR SHARE`** and re-read under the lock:
   - **Activities.** For validate, reject and delete: `findOne` outside the transaction only for
     the 404 and the challenge id. Inside:
     1. lock; if `COMPLETED`, 400 "El reto está cerrado; sus actividades son definitivas". This
        check comes before role, ownership and activity-status checks;
     2. re-read the activity (404 if gone);
     3. apply today's logic on the fresh row: the already-validated short-circuit, the heart-rate
        rule with override, and the delete permissions;
     4. write.
   - **`create`.** `assertActiveParticipant` and the insert move inside the transaction.
     Ownership of the evidence (upload-guardrails) is checked before the transaction, since it
     does not depend on state. The `P2002` catch moves outside, because Prisma aborts the
     transaction on that error.
   - **Participants and payments.** `addParticipant`, `removeParticipant`, `markPayment` and
     `uploadPaymentProof` do their status check (same messages as today) and write inside
     `withChallengeLock`.
   - **Rules and activation.** A non-closing `update()` and `activate()` lock the row
     (`FOR UPDATE`), re-check the status and write in the same transaction, so a rules PATCH that
     read `ACTIVE` cannot land after the close.
3. **D3 - Import per row.**
   - `previewRows` marks rows whose challenge is `COMPLETED` with "El reto M/AAAA está cerrado; no
     se pueden importar actividades".
   - `applyRow` resolves the challenge (cached id only, never the cached status) and does an
     unlocked status check before creating the user, so a closed challenge never creates accounts.
   - It then runs participation and activity create/update in `withChallengeLock`, with a locked
     re-check.
   - Counters (`created`, `updated`, `participantsCreated`, `usersCreated`) increase only after the
     row commits. One transaction per row is acceptable at MVP volumes, and it lets a close
     interleave between rows.
4. **D4 - Fair shuffle.** Fisher–Yates with an injectable `rand` (default `crypto.randomInt`).
   `selectWinners` gains an optional `rand` and returns internal details `guaranteed`, `drawPool`
   and `drawSeats`, with the invariant `guaranteed.length + (drawSeats ?? 0) === winners.length`.
   These details are internal: the public `GET /results` contract does not change, and the
   assisted-close change will expose them through its own endpoint.
5. **D5 - Closing step `closeTx(id, manual?)`.** One transaction with `FOR UPDATE`:
   1. Read the status under the lock.
      - `DRAFT`: 400 "Solo se puede cerrar un reto activo".
      - `COMPLETED` without `manual`: return unchanged, so closing twice is idempotent.
      - `COMPLETED` with `manual`: replace the awards (an award after closing).
      - `ACTIVE`: set `COMPLETED`.
   2. With `manual`: validate under the lock that every user id is a participant (400 "Solo se
      puede premiar a participantes del reto"), then delete the awards and create the admin's, with
      the admin's note.
   3. Without `manual`: compute the results inside the transaction (`computeResults(tx, id)`). If a
      draw is needed and there are no awards, create one award per winner with
      `AUTO_DRAW_NOTE = 'Sorteo automático al cierre'`; the winners already include the guaranteed
      ones of `TOTAL_KM`.
   - `close(id)`, `award()` and the closing branch of `update()` all call `closeTx`. "Other fields"
     in a closing PATCH reuses the existing `onlyClosing` predicate (undefined values ignored).
6. **D6 - Results notes.**
   - Awards that all carry `AUTO_DRAW_NOTE` produce "Ganadores definidos por sorteo automático al
     cierre." and `drawNeeded = false`; any other awards keep "Premiación registrada por el
     administrador."
   - `AwardChallengeDto` rejects the reserved note (trimmed) with "Esa nota está reservada para el
     sorteo automático", so the origin cannot be faked.
7. **D7 - Fixtures and scripts.**
   - `e2e/fixtures/api.ts closeChallenge` clears activities only while the challenge is `ACTIVE`.
   - `scripts/parallel-session-test.mjs` deletes its December activity before closing that
     challenge.

## Risks / Trade-offs

- Raw SQL depends on the table name -> comment plus the integration tests exercising it.
- Lock timeouts leave the operation undone -> 409 with a retry message; a close takes well under a
  second at MVP volumes. Proven by a deterministic API e2e that holds `FOR UPDATE` from another
  transaction for more than 5 s.
- Import is slower (one transaction per row) -> acceptable; can batch later without changing the
  contract.
- History cannot be imported into a closed month -> intentional; the guide documents the order.
- Admins cannot fix activities after closing -> intentional; the assisted close will help review
  before closing, and awards stay available.
- A stranger gets 400 instead of 403 when deleting in a closed challenge -> accepted, the operation
  is rejected either way.
- Behaviour changes for API callers -> listed in the proposal and in the CHANGELOG.

## Migration Plan

No migration. Two PRs into `develop`:
1. Locking and freezing.
2. Closing step and stored draw.

Archive after the second PR. Ships in the next minor release; no deploy steps change.

## Open Questions

None.
