## Why

Every month the admin rebuilds the same challenge by hand: opens "+ Nuevo reto", types the name,
picks the month, re-enters the period, the valid days, the heart-rate minimum, the fee, the budget
mode, the currency, the prize text and five scoring rules, and then enrols the same people again one
by one with "+ Inscribir" (one request and one click per person). The feature analysis
(`docs/propuestas-features-2026-10-04.md`, item 9, `enrollment-at-scale-renewal`) rated it as the
step that "removes the biggest repetitive task of the month", and decided to postpone the invitation
code because it adds a migration and an abuse surface.

Everything the renewal needs already exists: the rules live on `Challenge`, the roster on
`ChallengeParticipant`, `@@unique([month, year])` already guarantees one challenge per month, and the
challenge lock (`challenge-lock.ts`) already serializes enrolments with closing. This change only adds
a server-side "copy the rules into next month" step and a way to enrol several users in one request.

## What Changes

- **API, bulk enrolment (PR 1).** New `POST /challenges/:id/participants/bulk` (admin) with
  `{ userIds: uuid[] }` (1 to 200). It enrols every eligible user in one transaction under the
  challenge lock and answers `200` with one outcome per user: `enrolled`, `alreadyEnrolled` or
  `skipped` (unknown user or inactive user, with a Spanish message). One bad user never fails the
  others; a closed challenge rejects the whole request with the existing `400`.
- **Enrolment rule made explicit.** Only existing, **active** users can be enrolled, by the single
  endpoint, the bulk endpoint and the renewal. The single `POST /challenges/:id/participants` now
  answers `400` "El usuario está inactivo" for an inactive user (today the web already hides them).
- **Web, bulk enrolment (PR 1).** The "Agregar participante" card of the admin participants page gets
  a checkbox per candidate, "Seleccionar todos" and "Inscribir seleccionados (N)", and shows the
  per-user summary returned by the API. The per-row "+ Inscribir" stays.
- **API, renewal (PR 2).**
  - New read-only `GET /challenges/:id/renewal-preview` (admin): the target month (the month after
    the source), the suggested name, the period computed by the server (first to last day of that
    month), the rules that will be copied, the participants that would be copied and those skipped
    (inactive), and the challenge that already occupies the target month, if any.
  - New `POST /challenges/:id/renew` (admin) with `{ name?, copyParticipants? }`: creates the target
    month's challenge in `DRAFT` with **only** the rules and the computed period, and, when
    `copyParticipants` is true, enrols the source's active participants with a clean payment state,
    all in one transaction. If the month already exists it answers `409` "Ya existe un reto para
    M/AAAA" with `existingChallengeId`, and nothing is written.
  - The source must be `ACTIVE` or `COMPLETED`; a `DRAFT` answers `400`.
- **Web, renewal (PR 2).** A "Renovar" button on `ACTIVE` and `COMPLETED` rows of the admin challenge
  list opens a dialog with the preview, an editable name, the "Inscribir a los N participantes
  activos" checkbox (checked) and the reminder that payments, proofs, activities and awards are not
  copied; confirming creates the draft, which is then edited and activated with the existing
  buttons.
- **No migration, no schema change, no new dependency, no new environment variable.**
  `@@unique([month, year])` stays and is the renewal's idempotency key.

## Non-goals

- The invitation code or any self-enrolment by participants (postponed by the owner: migration and
  abuse surface).
- Automatic or scheduled renewal (cron, "renew on close"); the admin always presses "Renovar".
- Copying payments (`paid`, `paidAt`, `amountPaid`), payment proofs, activities, imported rows,
  awards or results. Carrying a debt or a late payment over to the new month.
- Renewing into a month other than the one after the source, more than one month ahead, or several
  challenges in the same month (`@@unique([month, year])` stays).
- Renewing from a `DRAFT`.
- Activating the new challenge as part of the renewal: it is born `DRAFT` and goes through the
  existing activation rule.
- Managing the roster of a `DRAFT` challenge from the web participants page (it keeps working on the
  selected active challenge); the renewal copy covers the usual case.
- Bulk removal, bulk payment marking, CSV upload of a roster, search or paging of candidates.
- Changing any rule of activities, scoring, finance, closing or privacy.

## Capabilities

### New Capabilities
- `challenge-enrollment`: who can be enrolled (existing, active users; once per challenge), the bulk
  enrolment endpoint with per-user outcomes under the challenge lock, and the bulk selection in the
  admin participants page.
- `challenge-renewal`: the read-only renewal preview, the renewal that creates next month's challenge
  in `DRAFT` copying only its rules and optionally its active roster, its conflict and atomicity
  rules, and the "Renovar" dialog of the admin challenge list.

### Modified Capabilities
<!-- None: lifecycle, lock, finance and scoring requirements are reused unchanged. -->

## Impact

- Backend:
  - `challenges/renewal.ts` (new, pure): `nextMonth`, `monthPeriod`, `suggestedName`,
    `renewableRules` (the exact list of copied fields);
  - `challenges/enrollment.ts` (new): `enrollMany(tx, challengeId, userIds)` shared by the bulk
    endpoint and the renewal;
  - `challenges.service.ts`: `addParticipant` (active check), `bulkAddParticipants`,
    `renewalPreview`, `renew`;
  - `challenges.controller.ts`: three routes; DTOs `bulk-add-participants.dto.ts`,
    `renew-challenge.dto.ts`.
- Web: `lib/types.ts`, `app/dashboard/admin/participants/page.tsx` (bulk selection and summary),
  `app/dashboard/admin/challenges/page.tsx` ("Renovar"), `components/renew-challenge-dialog.tsx`
  (new), `lib/renewal.ts` with tests (pure formatting of the outcome summary).
- Tests: unit (`renewal.spec.ts`, `enrollment.spec.ts`, `challenges.service.spec.ts`), API e2e
  (`challenge-renewal.e2e-spec.ts`), web unit, one Playwright spec (`14-renewal.spec.ts`), QA
  catalog TC-CHAL-23, TC-CHAL-24, TC-PART-08, TC-PART-09 and an update of TC-PART-01.
- Docs: guide (section 2 "Retos": renew; section 3.1: bulk enrolment) with captures,
  `docs/architecture.md` (endpoint list), `docs/security-owasp.md` (admin-only bulk write with a
  size cap), `CHANGELOG.md`.
- Deploy: **no migration**, no new dependency, no new environment variable. Each PR ships API and web
  together.
