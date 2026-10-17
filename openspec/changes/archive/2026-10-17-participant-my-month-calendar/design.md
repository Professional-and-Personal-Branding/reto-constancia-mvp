## Context

- `ActivitiesService.create` enforces, in order: active challenge and enrolment
  (`assertActiveParticipant`), owned photos, `isWithinPeriod(challenge, date)`,
  `isValidDay(challenge, date)` (`date.getUTCDay()` on the date-only value), the heart-rate rule
  and `@@unique([challengeId, userId, date])` (`409` "Ya registraste una actividad para ese día").
  The server has no notion of "today" and does not reject future dates; the web caps the date
  input at `isoToday()`.
- Days are Postgres `date` values serialized at UTC midnight. The web works on calendar days with
  `frontend/lib/dates.ts` (`toDayKey`, `isoToday` = the user's **local** day, `formatDay` without
  zone shift).
- `GET /activities/me?challengeId=` returns the caller's activities (with `heartRateCompliant`);
  the dashboard uses it for the counters, "Hoy ya está" and the "Mis actividades" list, and
  invalidates `['activities']` after an upload or a withdrawal.
- The dashboard and the upload page work on the selected active challenge
  (`useActiveChallenge`); `challenge.me` is `null` when the caller is not enrolled.
- Playwright already freezes the browser clock (`page.clock.setFixedTime`, spec 10) and stores a
  participant session (`STATE.participant`); E2E challenges live in 2025, month 10 is unused.

## Goals / Non-Goals

**Goals:** a participant sees their month and today's duty at a glance, on a phone; the rule of
which days count lives only on the server; the cheap part ships first; no schema change and a small
E2E footprint.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - The server computes the calendar; the client only paints it.**
   - New `GET /activities/me/calendar?challengeId=<uuid>` (required, `400` if missing or not a
     UUID). Declared in `ActivitiesController`; the two-segment path does not clash with
     `GET :id`.
   - `buildCalendar(challenge, activities, { isWithinPeriod, isValidDay })` is a pure function in
     `activities/calendar.ts` that walks every UTC day from `startDate` to `endDate` (inclusive)
     and calls **the same** `ChallengesService.isWithinPeriod`/`isValidDay` that `create` calls.
     There is no second implementation of the rule anywhere, and a unit test asserts that a day is
     `valid` exactly when `create` would accept that date on period and weekday.
   - The upload hints and the grid read `valid` from the response; the web never inspects
     `validDays` to decide whether a day counts (it keeps showing the "Días válidos: ..." text it
     already shows).
2. **D2 - "Today" belongs to the client; the response has no today-dependent field.**
   - The participant's day is their local calendar day (`isoToday()`), which the server cannot
     know without a time-zone setting. Instead of adding one (new env var, new rule), the server
     returns facts that do not depend on today, and the web derives the presentation state with
     a pure function over day keys (`YYYY-MM-DD` string comparison):
     `activity ? activity.status : !valid ? REST : day > today ? FUTURE : day === today ? TODAY_OPEN : MISSED`.
   - This is a display mapping, not a registration rule: it does not decide whether a date is
     accepted. It also makes E2E deterministic: freezing the browser clock is enough.
3. **D3 - Response shape (plain day keys, own data only).**
   ```json
   {
     "challengeId": "uuid", "status": "ACTIVE",
     "startDate": "2025-10-01", "endDate": "2025-10-31", "validDays": [1,2,3,4,5,6],
     "days": [
       { "date": "2025-10-01", "valid": true,
         "activity": { "id": "uuid", "status": "PENDING", "exerciseType": "RUNNING",
                       "durationMinutes": 40, "distanceKm": "5.2", "heartRateMinutes": 25,
                       "heartRateCompliant": true, "rejectionReason": null } }
     ],
     "summary": { "validDaysTotal": 27, "registered": 10, "validated": 7, "pending": 2, "rejected": 1 }
   }
   ```
   - Dates are `YYYY-MM-DD` (no instant, no zone to misread); `toDayKey` still works on them.
   - The activity summary carries `heartRateMinutes` and `heartRateCompliant` so the
     `activity-heart-rate-compliance` rule "every activity returned exposes compliance" keeps
     holding. No photos, no user object, no validator id.
   - An activity on a day that is no longer valid (weekday or period edited after registration,
     or imported) stays on its day with `valid: false` and is counted; an activity outside the
     current period is omitted from `days` and `summary` ("Mis actividades" still lists it).
   - `summary` counts days of `days`: `validDaysTotal` = days with `valid`, `registered` = days
     with an activity, and one count per status. No today-dependent counts.
4. **D4 - Access: the caller's own enrolment, any challenge status, read-only.**
   - `userId` always comes from the JWT; there is no `userId` parameter. Unknown challenge `404`
     "Reto no encontrado"; not enrolled `403` "No participas en este reto" (same messages as
     today). Admins get their own calendar only if enrolled, like anyone else.
   - Works for `DRAFT`, `ACTIVE` and `COMPLETED`; `status` lets the web hide every "registrar"
     link unless the challenge is `ACTIVE`. Nothing is written, so the closed-challenge freeze is
     untouched and no challenge lock is taken.
   - One `findUnique` on the challenge, one enrolment check, one `findMany` on the caller's
     activities of that challenge (`select` of the summary fields). The period is a month in
     practice; a longer period only grows the `days` array (at most 366 entries per year).
5. **D5 - Two increments in one change.**
   - **Increment 1 (PR 1):** the endpoint with its tests, the dashboard "today" card and the
     upload form hints. It already removes the useless button on rest days and the "fill, submit,
     get 400" loop.
   - **Increment 2 (PR 2):** the "Mi mes" grid, counts and streak, reusing the same query.
   - One change so the endpoint is designed once; the change is archived after PR 2. Increment 1
     is releasable alone if the release comes first.
6. **D6 - Dashboard "today" card (increment 1).** Uses the calendar entry of `isoToday()`, only
   when `challenge.me` is not `null` (otherwise no request, since it would be `403`):
   - registered: "Hoy ya está" with the status badge (as today);
   - valid and open: banner "Hoy es día válido y aún no registraste tu actividad" with the
     "Registrar hoy" button to `/dashboard/upload?date=<today>`;
   - not valid: "Hoy es día de descanso" and no button;
   - today before `startDate`: "El reto empieza el <día>"; after `endDate`: "El período del reto
     terminó"; no button in either case;
   - while the calendar loads or if it fails: today's behaviour (the existing button), so the
     page never gets worse than now. The query key is `['activities', 'calendar', challengeId]`,
     so the existing `invalidateQueries({ queryKey: ['activities'] })` after an upload or a
     withdrawal refreshes it with no extra code.
7. **D7 - Upload form hints (increment 1).**
   - `min` = `startDate`, `max` = the earlier of `endDate` and `isoToday()`.
   - `?date=YYYY-MM-DD` prefills the date when it is a day of the calendar; otherwise today.
   - Hint under the date, from the calendar entry: "Ese día es de descanso en este reto",
     "La fecha está fuera del período del reto" or "Ya registraste una actividad para ese día"
     (same texts as the API errors); the submit button is disabled while a hint is shown. The API
     still validates everything; without calendar data there are no hints and the form behaves as
     today.
8. **D8 - "Mi mes" grid (increment 2).**
   - Placed on the dashboard between the stats and "Mis actividades"; no new page or nav entry.
   - Weeks start on Monday (es-BO); only the period's days are drawn, leading and trailing cells
     are empty; a period that crosses months shows the month name on the first day of each month.
   - Each state has a token colour **and** a glyph and a text: validated "✓ Validado", pending
     "• Pendiente", rejected "✕ Rechazado", missed "! Sin registro", today open "Hoy", rest
     "Descanso", future "—"; a legend below lists them.
   - Links (only when `status` is `ACTIVE`): missed and today-open days go to
     `/dashboard/upload?date=<day>`; a day with an activity goes to `#actividad-<id>`, its row in
     "Mis actividades" (the rejection reason is already there). Future and rest days are not
     interactive.
   - Header line: "X de Y días válidos registrados" (`summary.registered` of
     `summary.validDaysTotal`) and "Racha: N días".
9. **D9 - Streak is display-only and computed by a pure web function.**
   - `currentStreak(days, today)`: walking back from today over `valid` days, count consecutive
     days with a `PENDING` or `VALIDATED` activity; today without an activity does not break it
     (the day is still open); a `REJECTED` or missed valid day ends it; rest days are skipped.
   - It never reaches the API, the score or the ranking (streak bonuses are excluded by
     `docs/challenge-rules.md`). It depends on today, so it lives with D2 in the web, unit-tested
     with `node:test`.
10. **D10 - Accessibility and phones.**
    - A `<table>` with a `<caption>` ("Mi mes: <reto>"), weekday `<th scope="col">` with short
      text and the full name in `abbr`/`aria-label`; each day cell has an accessible name like
      "lunes 6 de octubre: validado"; today has `aria-current="date"`; links are real `<a>`
      elements reachable with Tab.
    - At 360 px the 7 columns fit inside the 16 px gutters (cells of at least 40 px, square, the
      day number and glyph only; the state text is visually hidden but read). No horizontal scroll
      at 375 px, checked in Playwright.
    - Colours from `web-theme` tokens (`accent`, `ok`, `warn`, `bad`, `ink-mute`) in both themes;
      state is never conveyed by colour alone.
11. **D11 - Small E2E footprint.**
    - One spec `13-my-month.spec.ts`, `storageState: STATE.participant` (no login), month 10 of
      the E2E year, data created by API fixtures (`createActivity`, validate and reject with the
      stored admin token), browser clock fixed inside the period (`page.clock.setFixedTime`).
    - Three tests: the today card and the upload hint/prefill (increment 1); the grid states,
      legend, counts and streak plus the 375 px check (increment 2); a missed-day link that lands
      on the prefilled form. Every rule detail (403, 404, consistency with `create`, privacy) is
      covered by unit and API e2e tests, not by browser tests.

## Risks / Trade-offs

- **Client and server disagree on valid days** -> removed by D1: the client never computes
  validity; the consistency unit test pins `valid` to the `create` rules.
- **The client's "today" differs from the server's UTC day** -> by design (D2); it only changes
  which day is labelled "Hoy", and it already works this way for the date input. The API remains
  the judge of what is accepted.
- **One more request on the dashboard** -> a single indexed query per challenge, cached by React
  Query and refreshed by the existing invalidation; the dashboard still loads if it fails.
- **A future-dated activity registered through the API** shows up as registered on a future day ->
  accepted; it is a pre-existing gap (P5), not introduced here.
- **E2E load and the 5 logins per minute limit** -> one spec, stored session, no new login, data
  by API.
- **Grid density on small phones** -> numbers and glyphs only in cells, text in the legend and
  accessible names; checked at 375 px.

## Migration Plan

**No migration, no schema change, no new dependency, no new environment variable.** The endpoint
reads existing columns; `@@unique([challengeId, userId, date])` and `@@unique([month, year])` are
untouched.

Release: increment 1 (API and web together) can ship in the next minor release; increment 2 is a
web-only addition on top. Rollback: redeploy the previous release; there is no data to undo.

## Open Questions

1. **P1 - First day of the week.** [NO BLOQUEANTE]
   - (a) Monday (written into the spec). (b) Sunday, matching `validDays` 0=Sun.
   - Recommendation: (a); it is the usual calendar in Bolivia and keeps rest Sundays at the end of
     the row.
2. **P2 - What counts for the streak?** [NO BLOQUEANTE]
   - (a) `PENDING` and `VALIDATED`; a rejected or missed valid day breaks it (written into the
     spec). (b) Only `VALIDATED`.
   - Recommendation: (a); validation can lag days behind and a streak that only moves when the
     admin validates does not motivate. It is display-only, so it cannot affect prizes.
3. **P3 - Two PRs or one?** [NO BLOQUEANTE]
   - (a) Two PRs inside this change: endpoint + today card + upload hints, then the grid (written
     into tasks). (b) One PR with everything.
   - Recommendation: (a), as the feature analysis asked (cheap first); each PR stays small and
     increment 1 is useful on its own.
4. **P4 - Where does "Mi mes" live?** [NO BLOQUEANTE]
   - (a) A section of the dashboard (written into the spec). (b) A new page `/dashboard/mi-mes`
     with a nav entry.
   - Recommendation: (a); the dashboard is where participants land from the phone, and it avoids
     a new navigation item and journey.
5. **P5 - Should the server reject future dates?** [NO BLOQUEANTE]
   - (a) Not in this change: keep today's behaviour (only the web caps the date). (b) Add the rule
     now, which needs a server-side "today" and a time-zone decision.
   - Recommendation: (a); it is a separate rule change with its own question about time zones, and
     the calendar does not depend on it.
6. **P6 - Admin view of a participant's calendar.** [NO BLOQUEANTE]
   - (a) Out of scope (written into the proposal). (b) Reuse `buildCalendar` behind an admin-only
     `GET /activities/calendar?challengeId&userId` later.
   - Recommendation: (a) now; D1 keeps (b) cheap if the admin asks for it.
