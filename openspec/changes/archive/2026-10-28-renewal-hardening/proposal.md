## Why

The code review of 1.11.0 (bulk enrolment and monthly renewal) left three low-severity findings and
a gap in the browser coverage of scenarios that are already specified:

- **Bulk enrolment can misreport who it enrolled.** `enrollMany`
  (`backend/src/challenges/enrollment.ts:74-85`) gives every row of one call the same `joinedAt` and,
  when `createMany({ skipDuplicates })` inserts fewer rows than expected, re-reads the rows with that
  exact `joinedAt` to decide which ones are "ours". Enrolment writers take the challenge lock in
  `FOR SHARE` mode (`backend/src/challenges/challenge-lock.ts:6`), so they do not serialize each other.
  Two bulk requests that enrol the same user in the same millisecond (`joinedAt` is `timestamp(3)`)
  both find the row and both report the user in `enrolled`; the spec says every id is in exactly one
  list and `enrolled` lists the users enrolled **by this request**.
- **Releasing the photos of a withdrawn activity could, in theory, delete a file the new activity of
  the same day uses.** `ActivitiesService.remove` (`backend/src/activities/activities.service.ts:305-327`)
  calls `deleteAssetsLater` after the commit, which counts references and then destroys the file
  (`backend/src/upload/upload.service.ts:299-313`). A registration that sends the **same**
  `cloudinaryId` again can lose its file. The analysis (design D3) shows the web can never do this, so
  the risk only affects hand-made API calls against the caller's own folder; it was already accepted in
  `2026-10-20-resubmit-rejected-activity` and is now written into the spec.
- **The renewal dialog is not a proper modal and mislabels an empty roster.**
  `frontend/components/renew-challenge-dialog.tsx`:
  - `Tab` leaves the dialog for the page behind it (no focus trap), although it declares
    `aria-modal="true"` (line 78);
  - the `Escape` handler is registered once at mount with a stale `isPending` (lines 49-59), so
    `Escape` closes the dialog while the renewal is being created;
  - focus is not returned to the "Renovar" button that opened it;
  - with no active participants it shows a checked "Inscribir a los 0 participantes activos de …"
    (line 143), and with one it says "a los 1 participantes".
- **Playwright does not walk four specified web scenarios:** a server error inside the renewal dialog,
  a candidate deactivated after the participants page loaded, the exact count of "Seleccionar todos",
  and the financial summary counting the new enrolments as unpaid (design D5).

## What Changes

- **Deterministic bulk enrolment:** `enrollMany` inserts with `createManyAndReturn({ skipDuplicates:
  true })` (Prisma 5.22, already installed), which runs `INSERT … ON CONFLICT DO NOTHING RETURNING`;
  a user is in `enrolled` exactly when this statement inserted their row. The `joinedAt` comparison and
  its second read go away. No raw SQL, no lock change.
- **Photo release after a withdrawal:** no code change. The spec states that the web uploads new
  files for every registration and that a file whose id is sent again through the API after its
  activity was deleted is not guaranteed to exist.
- **Renewal dialog behaviour** (shared hook `useModalDialog`; native `<dialog>` evaluated and set
  aside, design D4):
  - rendered in a portal with the rest of the page `inert` and `aria-hidden` while open;
  - focus trapped inside the dialog (`Tab` and `Shift+Tab` cycle), also after the focused button was
    disabled during the request; focus stays on the dialog while pending;
  - `Escape` closes it only while nothing is pending, and focus returns to the "Renovar" button of
    the source row after cancelling, `Escape` or a successful renewal;
  - with no active participants: no checkbox, the text "<reto> no tiene participantes activos para
    inscribir." and `copyParticipants: false` is sent;
  - with one active participant: "Inscribir al participante activo de <reto>".
- **Playwright:** four new journeys and two extended assertions in `e2e/tests/14-renewal.spec.ts`
  (design D5), deterministic (deferred `route.fulfill`, no fixed waits), linked to `TC-CHAL-24`,
  `TC-PART-09` and the new `TC-CHAL-25`; two new API e2e tests (a deterministic one with an open
  transaction, and an invariant one with concurrent requests) linked to `TC-PART-08`.
- The two new `activity-withdrawal` scenarios are **documentary** (no test of their own, design D3).
- **No schema change, no migration, no new dependency, no new environment variable, no API contract
  change.**

## Non-goals

- Making the close dialog (`close-challenge-dialog.tsx`) a proper modal too. It has the same stale
  `Escape` handler (`:62-73`); this is **explicit debt** for a follow-up change that reuses
  `useModalDialog` and extends `challenge-lifecycle` (design D4, P1).
- Changing the lock mode of enrolments, adding advisory locks or serializing writers.
- Making the Google Sheets import tolerate a concurrent bulk enrolment of the same user (it can fail
  with `P2002` and roll back the import; observed, not reported in the review; see Risks).
- A registry of released file ids, delaying deletions or rejecting reused ids (design D3).
- Any change to the renewal API, the preview or the enrolment messages.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-enrollment`: concurrent bulk requests report each newly enrolled user in `enrolled` of
  exactly one response.
- `challenge-renewal`: the renewal dialog traps focus, handles `Escape` only when nothing is pending,
  returns focus to its trigger, and words an empty or single-person roster correctly.
- `activity-withdrawal`: photo release states the web's guarantee (new files per registration) and
  the accepted limit for ids reused through the API.

## Impact

- **Backend:** `backend/src/challenges/enrollment.ts` (insert step only) and its unit test
  `enrollment.spec.ts`; two API e2e tests in `backend/test/challenge-renewal.e2e-spec.ts`. The insert
  was verified against local Postgres with a throwaway spike (design D1).
- **Frontend:** `frontend/components/renew-challenge-dialog.tsx`, a new hook
  `frontend/lib/use-modal-dialog.ts` (portal, inert background, trap, `Escape`, focus return), a pure
  helper `frontend/lib/focus-trap.ts` with `node:test` tests, the roster label helper in
  `frontend/lib/renewal.ts`, and
  `frontend/app/dashboard/admin/challenges/page.tsx` (gives the dialog the element to return focus
  to).
- **E2E:** `e2e/tests/14-renewal.spec.ts`; one throwaway registration (login limit untouched, design
  D5).
- **Docs:** `docs/qa/catalog.mjs` (TC-CHAL-24, TC-CHAL-25 new, TC-PART-08, TC-PART-09) and the
  regenerated `docs/qa/test-cases.*`; `CHANGELOG.md` (Sin publicar).
- **Data:** none. Rollback is redeploying the previous API and web.
- **Delivery:** one PR (backend, web, Playwright and catalog) to `develop`, one battery run and one
  validator run at the end; shipped and archived in `release/1.12.1` from `develop`.
