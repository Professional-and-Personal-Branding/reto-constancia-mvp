## Context

1.11.0 shipped bulk enrolment and monthly renewal (`2026-10-20-monthly-challenge-renewal`). Its code
review left three low-severity findings; this change closes them and adds the browser coverage that
the specs already ask for. Facts the decisions rely on:

- Every enrolment path locks the challenge row first, in `FOR SHARE` mode: writers do not block each
  other, only the close (`FOR UPDATE`) does (`backend/src/challenges/challenge-lock.ts:6`, `:42-45`).
- `ChallengeParticipant` has `@@unique([challengeId, userId])` and `joinedAt DateTime @default(now())`
  (`timestamp(3)`, millisecond precision) (`backend/prisma/schema.prisma:88-98`).
- The bulk body accepts 1 to 200 UUIDs: `@ArrayMinSize(1)`, `@ArrayMaxSize(200)`,
  `@IsUUID('4', { each: true })` (`backend/src/challenges/dto/bulk-add-participants.dto.ts:7-9`). The
  renewal passes the source roster, which has no fixed limit but is bounded by the number of users.
- The installed Prisma is 5.22.0; `createManyAndReturn` (GA since 5.14) exists for Postgres and its
  generated args include `skipDuplicates` (verified by the spike of D1).
- The single enrolment (`challenges.service.ts:308`) already relies on `P2002` and is deterministic.
  The renewal calls `enrollMany` on a challenge created in the same uncommitted transaction, so nobody
  else can enrol in it concurrently.
- Uploads: the signature covers only `allowed_formats`, `folder` and `timestamp`
  (`upload.service.ts:159-161`), so Cloudinary assigns a new random `public_id`; the local simulator
  names every file `randomUUID()` (`upload.service.ts:221`, id built at `:225`). The web sends the ids
  returned by its own uploads (`frontend/lib/cloudinary.ts:70`,
  `frontend/app/dashboard/upload/page.tsx:90-99`).
- `assertOwnedAsset` only accepts ids under the caller's own `<base>/<challenge>/<user>/<purpose>/`
  folder (`upload-policy.ts:85-95`), and `POST /activities` always creates the activity for the
  caller (`activities.service.ts:66-80`).
- Both dialogs (renewal and close) are mounted only while their id is set and always with `open`
  (`frontend/app/dashboard/admin/challenges/page.tsx:91-109`), so their `[open]` effect runs once and
  captures the first `isPending` (`renew-challenge-dialog.tsx:49-59`,
  `close-challenge-dialog.tsx:62-73`).
- React is 18.3 (`frontend/package.json:23`): the `inert` prop is not supported, so it is set on the
  DOM node.
- Playwright runs with `workers: 1` and `fullyParallel: false`; route interception is already used for
  pending and error states (`03-admin-validation.spec.ts:92`, `12-assisted-close.spec.ts:52`).

## Goals / Non-Goals

**Goals:** `enrolled` is exact under concurrency; the photo-release limit is specified with its
evidence; the renewal dialog behaves as an accessible modal and words 0 and 1 participants
correctly; the specified web scenarios that Playwright does not walk are covered.

**Non-Goals:** see the proposal (close dialog, lock modes, import vs bulk race, file-id registry, API
changes).

## Decisions

### D1. Bulk insert reports exactly what it inserted: `createManyAndReturn`

`enrollMany` keeps its reads (users, existing enrolments) and replaces the insert step:

```ts
const created = await tx.challengeParticipant.createManyAndReturn({
  data: toInsert.map((userId) => ({ challengeId, userId })),
  skipDuplicates: true,
  select: { userId: true },
});
const inserted = new Set(created.map((c) => c.userId));
```

- Postgres runs `INSERT … ON CONFLICT DO NOTHING RETURNING`: the returned rows are exactly the rows
  this statement inserted. A row inserted by a concurrent transaction (committed, or uncommitted, in
  which case Postgres waits for it and then skips) is not returned, so that user goes to
  `alreadyEnrolled`.
- The shared `joinedAt` and the `findMany` by `joinedAt` are removed; `joinedAt` takes its default.
  The pre-read of existing enrolments stays: it avoids sending rows known to exist.
- The function contract (`EnrollManyResult`, one list per distinct id) does not change.

**Spike (2026-10-28, local Postgres 16 on port 5433, base `reto_constancia`, throwaway script outside
the repository, temporary challenge 1/2099 deleted at the end):**

| Case | Result |
|---|---|
| X already enrolled (committed); `createManyAndReturn([X, Y], skipDuplicates, select userId)` | Returns only Y |
| Transaction A inserts Z and stays open; transaction B runs `createManyAndReturn([Z])` | B does not finish before A commits; after the commit B returns 0 rows |
| Rows in the challenge afterwards | 3 (X, Y, Z once each) |
| SQL issued by Prisma | `INSERT INTO "ChallengeParticipant" ("id","challengeId","joinedAt","userId","paid") VALUES (…), (…) ON CONFLICT DO NOTHING RETURNING "id", "userId"` |

**Size:** 5 bind parameters per row, so the 200-id limit of the DTO means at most 1,000 parameters
(Postgres allows 65,535) and at most 200 returned rows of two columns (`id`, `userId`) with
`select: { userId: true }`. A renewal of a roster larger than ~13,000 people would hit the parameter
limit; the platform has a few dozen users, so no chunking is added (noted in Risks).

Alternatives considered:

| Option | Cost | Why not |
|---|---|---|
| `INSERT … ON CONFLICT DO NOTHING RETURNING` by `$queryRaw` | Hand-written SQL with the table name (no `@@map`, same caveat as `challenge-lock.ts`); `id` has a Prisma-side `@default(uuid())`, so the SQL must supply `crypto.randomUUID()` per row; `Prisma.join` for 200 tuples | Same SQL as D1 (see spike) with more code to keep in sync with the schema |
| `createMany` + re-read by a per-call token | Needs a column to hold the token (migration) | Out of scope by definition (no migration) |
| Lock the challenge `FOR UPDATE` for bulk enrolment, or an advisory lock per challenge | Serializes bulk with every activity write of the month (`FOR UPDATE` blocks `FOR SHARE`) or adds a second lock concept | Fixes a millisecond race by adding contention on the busiest row |
| One `create` per user catching `P2002` | A failed statement aborts the Postgres transaction (`25P02`), so each insert needs a savepoint; up to 200 round trips | Slower and more complex than one statement |

### D2. The spec states the concurrency guarantee, consistent with the existing text

`challenge-enrollment` gains one paragraph and one scenario: a user is in `enrolled` only for the
request whose insert created the enrolment, and concurrent requests put the user in `enrolled` of
exactly one response and `alreadyEnrolled` of the others. Checked against the current spec:

- `challenge-enrollment/spec.md:42-45` ("`enrolled` and `alreadyEnrolled` list … the users enrolled
  by this request and … those that were already enrolled"): the new text defines "enrolled by this
  request" as "inserted by this request's statement"; a user enrolled by the concurrent request was,
  from this request's point of view, already enrolled. No contradiction.
- `:50` ("Every distinct requested id SHALL appear in exactly one of the three lists"): unchanged
  and still true per response; the new scenario adds the cross-response property.

### D3. Photo release after a withdrawal: risk accepted, written into the spec, no code

**Is the race real?** Only partly.

- The window exists: `deleteAssetsLater` counts references and then destroys
  (`upload.service.ts:304-311`); a registration that commits a photo row with the same id between the
  count and the destroy, or after the destroy, points to a deleted file.
- It needs the **same id** to be sent again. The web never does: every registration uploads new
  files, Cloudinary assigns a random `public_id` (not part of the signature) and the simulator uses
  `randomUUID()` (`upload.service.ts:221`).
- Through the API, a participant can resend an id of their own deleted activity (it passes
  `assertOwnedAsset`), but nobody can reach another participant's file, so the only possible damage
  is the caller's own new activity showing a missing photo, which the admin then rejects. The same
  exposure exists without any race: resending the id seconds later always hits a deleted file.
  `2026-10-20-resubmit-rejected-activity` (design, Risks) already accepted it.
- **Admin deletions open no new vector.** An admin MAY delete another participant's activity
  (`activities.service.ts:310-321`, specified in `activity-withdrawal`) and its files are released the
  same way, but the admin cannot register an activity on that participant's behalf with those ids:
  `POST /activities` creates the activity for the caller only and `assertOwnedAsset` checks the
  caller's folder. The participant could resend the ids, which is the case above.

**Options:**

| Option | Cost | Assessment |
|---|---|---|
| A. Accept and specify (chosen) | Spec text and two documentary scenarios | Matches the real exposure: self-inflicted, API-only |
| B. Re-count after destroying and log `warn` when the id is referenced again | ~5 lines and a unit test | Detects only the millisecond window, not the more likely later resend (P3: rejected) |
| C. Reject in `POST /activities` any id that belonged to a deleted activity | Needs a record of released ids (migration) | Out of scope |
| D. Delay the release (for example, until the close) | Changes a specified behaviour and keeps files longer | Contradicts `activity-withdrawal` |

The two new `activity-withdrawal` scenarios ("Registering the same day again from the web" and
"Reusing a released file id through the API") are **documentary**: they state a guarantee and a
limit and get no automated test of their own. The first is exercised by TC-ACT-24, which already
withdraws and registers the day again from the web.

### D4. Renewal dialog: an accessible modal that words the roster correctly

**Native `<dialog>` + `showModal()` was evaluated and set aside.** It would bring the top layer, an
inert background and focus return for free. The deciding problem is `Escape` while pending: the spec
requires that it does nothing, and the only hook is `preventDefault()` on `cancel`. Chromium applies
the HTML close-request anti-abuse rule to dialogs, so `cancel` is not cancelable when there was no user
activation since the previous close request; `Escape` does not count as activation, so a second
`Escape` during a slow request would close the dialog anyway. Working around it (reopening on `close`)
is more fragile than the manual trap. The manual version also keeps the existing markup and
Playwright locators (`getByRole('dialog')`).

Manual modal, in a hook `useModalDialog` (`frontend/lib/use-modal-dialog.ts`) used by the renewal
dialog:

1. **Portal and inert background.** The dialog renders through `createPortal` into `document.body`.
   While it is mounted, every other element child of `body` that is not already inert gets the
   `inert` attribute and `aria-hidden="true"` (set on the DOM node, React 18); exactly those are
   restored on unmount. The page behind cannot be focused, clicked or read by assistive technology.
2. **Focus trap.** One `keydown` listener on `document` (capture phase), so it also sees keys when
   focus fell to `body`. On `Tab` it cycles among the dialog's enabled focusable elements (`button`,
   `input`, `summary`, `[href]`, `[tabindex]:not([tabindex="-1"])`, not disabled); `Shift+Tab` on
   the first goes to the last and `Tab` on the last goes to the first. **If focus is not on any of
   them (index −1, for example after the focused button became disabled), `Tab` goes to the first and
   `Shift+Tab` to the last.** With no enabled control, focus stays on the dialog element
   (`tabIndex={-1}`). The index arithmetic is a pure helper
   (`frontend/lib/focus-trap.ts`, `nextFocusIndex(current, count, backwards)`) with `node:test` tests.
3. **Pending.** When `isPending` becomes true the hook focuses the dialog element, so focus never
   falls to `body` when "Crear borrador" is disabled under it.
4. **Escape.** The listener reads `isPending` and `onCancel` through refs updated on every render, so
   it never uses stale values while the initial-focus effect still runs once. `Escape` while pending
   does nothing.
5. **Initial focus** stays on "Cancelar".
6. **Focus return.** The page keeps the "Renovar" button that opened the dialog (a ref set on click)
   and passes it as `returnFocusTo`; on unmount (cancel, `Escape` or success) the hook focuses it if
   it is still in the document. After a success the status message is announced by its existing
   `role="status"`.
7. **Roster wording.** With `toCopy.length === 0` the checkbox is not rendered, the section shows
   "<reto> no tiene participantes activos para inscribir." and confirming sends
   `copyParticipants: false`; the skipped list still shows the inactive ones. With one person the
   label reads "Inscribir al participante activo de <reto>"; with N > 1 it keeps "Inscribir a los N
   participantes activos de <reto>". The text comes from a pure helper in `frontend/lib/renewal.ts`.
   The confirm rule is unchanged (free month, non-blank name, nothing pending).

**Close dialog: explicit debt.** `close-challenge-dialog.tsx:62-73` has the same stale `Escape`
handler (it can close while the close is pending) and no trap. Decision (P1, adopted by the orchestrator): it is not changed
here; it gets its own change that reuses `useModalDialog` and extends the web requirement of
`challenge-lifecycle`. The hook is written without renewal-specific logic so that change is a small
adoption. The debt is recorded in the `CHANGELOG.md` entry of this change.

### D5. Playwright and API coverage of specified scenarios

Specified web scenarios against `e2e/tests/14-renewal.spec.ts`:

| Spec scenario | Walked today | Action |
|---|---|---|
| enrollment: Enrol three people at once (financial summary counts them unpaid) | Partly (2 people, no finance check) | Extend W-a |
| enrollment: Select all (button shows N) | Partly (only "not 0") | Extend W-a: exact N |
| enrollment: Nothing selected | Yes | — |
| enrollment: Someone was deactivated meanwhile | No | New W-b |
| renewal: Renew from the list, Month already taken, Draft row | Yes | — |
| renewal: Server error | No | New W-c |
| renewal (new): Keyboard stays inside, Escape while creating, Tab after focus was lost, Closing returns focus | No | New W-c |
| renewal (new): Source without active participants | No | New W-d |
| renewal (new): Source with one active participant | No | New W-e |

Not added: the inactive list inside the dialog and the "ajustado" budget wording (pure helpers already
tested by `renewal.test.ts`; a browser walk would need deactivating a seed user that other journeys
share).

Journeys (all in `14-renewal.spec.ts`, admin storage state, no new login, no fixed waits):

- **W-a (extended)** "inscribe a varios participantes de una vez y muestra el resultado": exact count
  after "Seleccionar todos" (equal to the number of candidate checkboxes); the financial summary
  counts the two new enrolments as unpaid.
- **W-b (new)** "lista como omitido a un candidato desactivado después de cargar la página": register
  a throwaway user `bulk-<timestamp>@e2e.local` by API (one registration; the limit is 5 per minute
  per IP and `15-account.spec.ts` uses one), load the participants page, deactivate the user with
  `PATCH /users/:id { active: false }`, tick them and one seed candidate, press the button; the status
  lists the throwaway user with "usuario inactivo" and the seed candidate as enrolled.
- **W-c (new)** "el diálogo de renovar atrapa el foco, ignora Escape mientras crea y muestra el error
  del servidor": open "Renovar" on the source; `Tab` past the last control and `Shift+Tab` from the
  first keep `document.activeElement` inside the dialog, and the element holding the challenge list
  has `inert` and `aria-hidden="true"`; intercept `**/api/challenges/*/renew` with a
  handler that awaits a promise the test resolves (deferred `route.fulfill`, no timers); confirm,
  check "Creando…" and that the dialog element has focus, press `Escape` and check the dialog still
  shows "Creando…"; resolve the promise with `409` "Ya existe un reto para 10/<YEAR>"; the dialog
  shows the message, the list has no new row, and `Tab` lands on the first enabled control of the
  dialog; `Escape` closes it and the focused element is the "Renovar" button of the source row.
- **W-d (new)** "renovar un reto sin participantes activos crea el borrador con 0 inscritos": a
  second source in 7/<YEAR> with no participants (target 8/<YEAR>; both months unused by other specs,
  reset before and after); the dialog shows "… no tiene participantes activos para inscribir." and no
  checkbox; confirming shows "<nombre> creado en borrador con 0 inscritos".
- **W-e (new)** "con un solo participante activo la casilla habla en singular": runs after W-d;
  enrol one seed user in the 7/<YEAR> source by API and reopen "Renovar" (the participants section
  renders even though 8/<YEAR> is now taken); the checkbox reads "Inscribir al participante activo de
  <reto>" and is checked; `Escape` closes.

API e2e (in `backend/test/challenge-renewal.e2e-spec.ts`):

- **Deterministic:** "BULK: una inscripción hecha por otra transacción abierta queda como ya
  inscrita". Using the app's `PrismaService`: transaction A inserts the enrolment of user Z and stays
  open (held by a promise); `enrollMany` runs for [Y, Z] in transaction B through the service's
  locked path; the test waits until B is blocked by polling `pg_stat_activity` for a backend with
  `wait_event_type = 'Lock'` (bounded by a deadline, no fixed sleep), commits A, then awaits B:
  `enrolled` is [Y] and `alreadyEnrolled` is [Z]. The outcome does not depend on timing: if B's
  pre-read runs after A's commit, Z is in `alreadyEnrolled` through the pre-read; the lock wait only
  makes the test exercise the `ON CONFLICT` path.
- **Invariant:** "BULK: dos inscripciones en bloque simultáneas dejan a cada usuario en una sola
  lista de cada respuesta y una sola vez en el roster". Two concurrent HTTP requests with the same
  three active users on a fresh challenge, one round: each response puts every id in exactly one list,
  each user appears in `enrolled` of at most one response, and the roster has each user once. It
  asserts properties, not a timing.

### D6. Link to the QA catalog (`docs/qa/catalog.mjs`)

- `TC-PART-08`: add both API e2e tests of D5; replace the unit test "un usuario inscrito en paralelo
  queda como ya inscrito, nunca en las dos listas" with "cuenta como inscritos solo las filas que
  devolvió el insert; las omitidas por conflicto quedan como ya inscritas"; one expected line for
  concurrent requests.
- `TC-PART-09`: add W-b; extend `expected` with the finance check and the exact count.
- `TC-CHAL-24`: add W-c for the server error ("el error del servidor se muestra dentro del diálogo y
  la lista no cambia").
- **New `TC-CHAL-25` "Diálogo de renovar: teclado y reto sin participantes"** (Alta, UI, guide 2.5):
  - pre: admin session; an `ACTIVE` source with participants and an `ACTIVE` source without any; the
    next months free;
  - steps: open "Renovar"; move with `Tab` and `Shift+Tab`; confirm with a slow server, press `Escape`,
    then `Tab` after the error; close with `Escape`; renew the source without participants; enrol one
    person in it and reopen "Renovar";
  - expected: focus never leaves the dialog, also after the confirm button was disabled; `Escape`
    does nothing while "Creando…" and closes it otherwise; focus returns to "Renovar"; without
    participants there is no checkbox, the text "… no tiene participantes activos para inscribir." is
    shown and the notice says "… creado en borrador con 0 inscritos"; with one person the checkbox
    reads "Inscribir al participante activo de <reto>";
  - auto: W-c, W-d, W-e, the `focus-trap.test.ts` tests and the label tests of `renewal.test.ts`
    (kind `web`).
- The documentary scenarios of D3 get no catalog entry of their own; TC-ACT-24 keeps covering the web
  path.
- Regenerate `docs/qa/test-cases.*` with the existing script; `node scripts/validate-test-cases.mjs`
  must end with "Pruebas sin caso: 0". The historical counts of `docs/testing.md` are updated only at
  the release.

## Risks / Trade-offs

- **`createManyAndReturn` behaviour** → verified by the spike (D1) and guarded by the deterministic
  API e2e test.
- **The invariant test can pass with the old code** because it cannot force the same millisecond →
  accepted; the deterministic test and the unit test guard the mechanism.
- **Manual focus trap** can miss an element type → the selector covers every control the dialog
  renders today; W-c walks it in a real browser.
- **Inert siblings of `body`** could include a toast or another overlay → the hook only touches
  elements that were not inert and restores exactly those; the renewal dialog is the only portal.
- **Close dialog keeps the stale `Escape`** → explicit debt (D4), follow-up change.
- **Throwaway users accumulate** in the local database (as in `15-account.spec.ts`) → harmless; the
  database is reset between the battery and the validator.
- **Import vs concurrent bulk enrolment** (observed, out of scope): the import reads the participation
  and then creates it (`import.service.ts:436-445`); a bulk enrolment of the same user in between makes
  the import fail with `P2002` and roll back. Rare and the import can be repeated; noted for a future
  change.
- **Photo release (D3)** → accepted and specified; affects only the caller's own hand-made API calls.
- **Parameter limit of one insert** (65,535 bind parameters, ~13,000 rows) → unreachable through the
  bulk endpoint (200 ids); a renewal of a roster that large would fail as a whole and roll back.

## Migration Plan

No schema change, no migration, no new environment variable, no new dependency, no API contract
change.

- **One PR** (backend, web, Playwright and catalog together) from `feature/renewal-hardening` to
  `develop`, with one run of the battery (`node scripts/run-tests.mjs`) and one run of the catalog
  validator before opening it.
- **Release 1.12.1** through `release/1.12.1` from `develop` (not `hotfix/*`), where this change is
  archived with `openspec archive renewal-hardening -y`.
- Rollback: redeploy 1.12.0 (API and web); no data to revert.

## Open Questions

Adopted by the orchestrator after the review vote (2026-10-28), subject to the owner's approval of
this proposal: P1 the close dialog stays as explicit debt for a follow-up change; P2 the proposed
wording for 0 and 1 participants is kept; P3 no detection log for reused file ids; P4 one PR, shipped
in 1.12.1.

No other open questions.
