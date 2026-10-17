## Why

Constancy is the whole point of the challenge, yet a participant cannot see their month at a
glance. The dashboard shows two counters (validated, pending), a flat "Mis actividades" list and a
"Subir actividad de hoy" button that appears **every day**, including rest days and days outside
the period, where the API then answers `400` ("Ese día de la semana no es válido para este reto").
The upload form only caps the date at today: it does not say that the chosen day is a rest day,
outside the period or already registered until the request fails.

The feature analysis (`docs/propuestas-features-2026-10-04.md`, item 7) rated the "Mi mes"
calendar as the best motivation lever, with two warnings: the valid-day logic must not be duplicated
in the client, where it could drift from the server, and it must not bring a heavy E2E load. Its
guidance was to ship the cheap part first (rest-day CTA and date-picker hints) and the full grid
after, and the "hoy no registraste" banner of the discarded notification centre moved here.

Every fact the calendar needs already exists: the period (`startDate`/`endDate`), `validDays`
(0=Sun..6=Sat), the one-activity-per-day constraint and each activity's status. This change only
lets the server compute the participant's own calendar once and the web paint it.

## What Changes

- **API, own calendar.** New read-only `GET /activities/me/calendar?challengeId=<uuid>`: for the
  caller's own enrolment, every day of the challenge period with `valid` (computed with the same
  `isWithinPeriod`/`isValidDay` rules that `POST /activities` enforces) and the caller's activity
  of that day (status and a short summary) or `null`, plus counts. Only the caller's data; `403`
  when not enrolled; no today-dependent field.
- **Web, increment 1 (cheap first).**
  - Dashboard "today" card replaces the always-on button: "Registrar hoy" with the banner
    "Hoy es día válido y aún no registraste tu actividad", "Hoy es día de descanso", "Hoy ya está"
    with the status, or the period notice (not started / ended).
  - Upload form: `min`/`max` from the period, prefill from `?date=YYYY-MM-DD`, and an inline hint
    when the chosen date is a rest day, outside the period or already registered (submit disabled
    for those), all read from the calendar response, never recomputed.
- **Web, increment 2 (the grid).** A "Mi mes" section on the dashboard: a week grid of the
  challenge period where each day shows its state (validated, pending, rejected, rest, missed,
  today open, future), a legend, "X de Y días válidos registrados" and the current streak
  (display only). A missed or open valid day links to the prefilled upload form; a day with an
  activity links to its row in "Mis actividades".
- Accessible (table semantics, text and icon besides colour, `aria-current="date"`) and built for
  phones first (7 columns that fit 360 px without horizontal scroll, touch targets of at least
  40 px), with the `web-theme` tokens in both themes.
- **No migration, no schema change, no new dependency, no new environment variable.**

## Non-goals

- Notifications of any kind (push, email, in-app centre, reminders) and any cron or scheduled job.
- Seeing another participant's calendar, or an admin view of a participant's calendar.
- Creating, editing, withdrawing or resubmitting activities from the grid; the grid only links to
  the existing upload form and list.
- Changing any registration rule: one activity per day and challenge, valid days, period,
  heart-rate rule, the closed-challenge freeze, scoring. Streaks never affect score (excluded by
  `docs/challenge-rules.md`).
- A server-side "today" or a configurable time zone; rejecting future dates on the server
  (pre-existing behaviour, see Open Questions P5).
- Calendars of closed challenges in the web (the dashboard only works on active challenges); the
  endpoint still answers for them, read-only.
- Admin pages, import, export, results.

## Capabilities

### New Capabilities
- `participant-calendar`: the participant's own read-only calendar of a challenge computed by the
  server, the dashboard "today" card, the upload date hints and the "Mi mes" grid with counts and
  a display-only streak.

### Modified Capabilities
<!-- None: registration, privacy and heart-rate rules are reused unchanged. -->

## Impact

- Backend:
  - `activities/calendar.ts` (new, pure): `buildCalendar(challenge, activities, rules)`;
  - `activities.service.ts`: `myCalendar(userId, challengeId)` (enrolment check, one query);
  - `activities.controller.ts`: `GET me/calendar` with a DTO (`challengeId` required UUID) and
    Swagger summary;
  - `challenges.service.ts`: `assertEnrolled` exposed for reads (today private) or an equivalent
    public `assertParticipant`.
- Web:
  - `lib/types.ts` (`MyCalendar`, `CalendarDay`), `lib/calendar.ts` (new, pure: `dayState`,
    `currentStreak`, `weeksOf`) with `lib/calendar.test.ts`;
  - `app/dashboard/page.tsx` (today card in increment 1, "Mi mes" section in increment 2);
  - `app/dashboard/upload/page.tsx` (`?date=` prefill, `min`/`max`, hints).
- Tests: unit (`calendar.spec.ts`, `activities.service.spec.ts`), API e2e
  (`activity-calendar.e2e-spec.ts`), web unit (`calendar.test.ts`), one Playwright spec
  (`13-my-month.spec.ts`, participant session already stored, clock fixed), QA catalog
  TC-ACT-20 to TC-ACT-23 and an update of TC-ACT-18.
- Docs: guide step 4.3/4.4 with captures, `docs/architecture.md` (endpoint list), `CHANGELOG.md`.
- Deploy: **no migration**, no new dependency, no new environment variable. API and web ship
  together (the web reads the new endpoint).
