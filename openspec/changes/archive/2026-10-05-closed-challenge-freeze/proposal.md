## Why

A closed challenge is supposed to be final (`challenge-lifecycle`: "Closed challenges are final"),
and its prize is paid with real money. In 1.5.0 it is only partly final:

1. **Activities of a closed challenge can still change.** `validate`, `reject` and `remove`
   (`activities.service.ts`) never look at the challenge status. Results are recomputed on every
   read, so a late validation changes the ranking and the winners after the prize was paid.
2. **The import writes into closed challenges.** `applyRow` finds the challenge by month and year
   and creates the participant and the activity without checking the status; the preview does not
   warn either.
3. **The draw is biased, never stored and changes on every reload.** `shuffle` uses
   `sort(() => Math.random() - 0.5)` (not a uniform permutation), and `getResults` runs
   `selectWinners` on every GET. A closed challenge with a tie and no award shows different winners
   each time the page loads.
4. **Three ways to close, no common step.** `POST /close` and `PATCH {status: COMPLETED}` go through
   `update`, and `award()` sets `COMPLETED` in its own transaction. Any of them can close a `DRAFT`.
5. **Every check is "read, then write" without a lock**, including the rules PATCH, participants
   and payments: a write that read `ACTIVE` can commit after the challenge closed.

## What Changes

- **Writes serialized with closing.** Every write that depends on the challenge state runs in a
  transaction that first locks the challenge row in share mode and re-reads its status:
  - activities: create, validate, reject, delete;
  - participants: add, remove;
  - payments: mark a payment, upload a proof;
  - the rules PATCH and activation;
  - each import row.

  If the challenge is `COMPLETED`, the write is rejected without changes. A write that waits more
  than 5 s for the lock answers 409 "El reto se está cerrando; vuelve a intentarlo en unos
  segundos", never 500.
- **Activities of a closed challenge are final**, also for admins: validate, reject and delete
  answer 400 "El reto está cerrado; sus actividades son definitivas".
- **Import never writes into a closed challenge.**
  - The preview marks those rows invalid.
  - The commit re-checks each row under the lock and reports it in `errors`, without creating
    accounts, participants or activities.
- **One closing step.**
  - `POST /close`, `PATCH {status: COMPLETED}` and `POST /awards` on a non-closed challenge run
    the same step. It locks the row exclusively, checks the status, validates award participants
    under the lock and computes the results inside the transaction.
  - Only an `ACTIVE` challenge can be closed (400 "Solo se puede cerrar un reto activo").
  - A closing PATCH with other fields answers 400 "Para cerrar el reto envía solo el estado".
- **Fair draw stored at close.**
  - The shuffle becomes Fisher–Yates with `crypto.randomInt`.
  - If the results need a draw when the challenge closes, all winners are stored once as awards
    with the reserved note "Sorteo automático al cierre". Later reads always return them, with
    `drawNeeded = false`.
  - A later award by the admin replaces them, and the reserved note cannot be sent by clients.
- **BREAKING (API behaviour):**
  - closing or awarding a `DRAFT` answers 400 (it used to close it);
  - validating an already validated activity of a closed challenge answers 400 (it used to be a
    no-op);
  - deleting an activity of a closed challenge answers 400 for everyone;
  - a mixed closing PATCH answers 400.
- **Docs:** the guide's history-import phase gets an explicit order (create, activate, import,
  then save the real award on the active challenge); QA catalog; CHANGELOG with the behaviour
  notes.
- No migration, no new packages. Planned as two PRs: (1) locking and freezing, (2) closing step
  and stored draw.

## Non-goals

- The assisted close (a read-only `close-preview` endpoint and a checklist modal before "Cerrar
  reto" and "Guardar premiación"): follow-up change `assisted-challenge-close`, which builds on
  this one. Until then the web keeps its current confirmation.
- A ranking snapshot or a `drawSeed` column: with every ranking input frozen and the draw stored,
  the ranking of a closed challenge is deterministic without one.
- Reopening a closed challenge, an award panel for closed challenges in the web (correcting a
  stored draw stays an API action), notifications, blocking the close on unpaid participants
  (they can still win), changing the pot (still what was collected).
- Backfilling challenges closed before this change: production has not launched.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-lifecycle`: writes serialized with closing; activities of a closed challenge are
  final; one closing step for active challenges only; reserved draw note; "Closed challenges are
  final" extended.
- `challenge-scoring`: the random tiebreak uses a uniform cryptographic shuffle; a draw is stored
  at close.
- `activity-withdrawal`: nobody deletes activities of a closed challenge.
- `google-sheets-import`: the import (file and sheet) never writes into a closed challenge.

## Impact

- Backend:
  - new `challenges/challenge-lock.ts`;
  - `activities.service.ts`, `challenges.service.ts` (participation helpers, payments,
    `update`/`activate`, new `close` and `closeTx`, `award`), `results.service.ts`
    (`computeResults`, notes), `scoring.ts` (shuffle and selection details),
    `dto/award-challenge.dto.ts`;
  - `import.service.ts` (preview check and one transaction per row);
  - `challenges.controller.ts`.
- Tests:
  - unit specs for scoring, activities, challenges, results, import and the DTO;
  - API e2e: freeze cases, stored draw, closing a `DRAFT`, a deterministic lock-timeout 409, a
    closed-challenge row in the import;
  - Playwright fixture `closeChallenge` and `scripts/parallel-session-test.mjs` adjusted;
  - QA catalog.
- Docs: `docs/challenge-rules.md`, guide (closing, awarding, phase 7), CHANGELOG.
