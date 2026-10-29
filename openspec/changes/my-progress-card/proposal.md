## Why

A participant cannot tell, from "Mi reto", whether they are on track to qualify:

- The dashboard (`frontend/app/dashboard/page.tsx`) shows "Validados", "Pendientes", "Posición" and
  "Top del reto", but not the minimum of validated days the challenge requires
  (`minValidatedDaysToQualify`), how many they still miss, or whether the days left can still get
  them there.
- The minimum and the "no califica" mark appear only in the ranking (`results/page.tsx`), mixed with
  everybody else's rows.
- The constancy goal of the challenge is exactly that minimum; showing it where the participant
  registers every day is the cheapest nudge the platform can give.

This is PAR-1 of `docs/propuestas-mejoras-2026-10-28.md`, approved by the owner on 2026-10-28 with
decision D4 (wording that promises nothing).

## What Changes

- **New card "Mi avance"** on the dashboard, below the stats, for the selected `ACTIVE` challenge when
  the user is enrolled. It shows "Validados: X de N" with a progress bar and one state message:
  - "Ya alcanzas el mínimo; se confirma al cierre." when the server marks the row `qualified`;
  - "Te faltan K días validados para el mínimo; aún puedes llegar." plus how many are pending and how
    many valid days are still unregistered, when those can cover the gap;
  - "Con los días que quedan no alcanzarías el mínimo de N días validados. Cada actividad sigue
    sumando puntos." when they cannot;
  - a rare fourth state when the days are reached but the score is still 0.
- **Data already on the page, no API change:** the caller's own ranking row from
  `GET /challenges/:id/results` (already fetched by the dashboard; `validatedDays`, `pendingDays`,
  `score`, `qualified`), `minValidatedDaysToQualify` of the selected challenge (already in
  `GET /challenges/active/list`) and the caller's calendar `GET /activities/me/calendar` (already
  fetched; `valid` and `activity` per day).
- **Pure function** `frontend/lib/progress.ts` (`qualifyProgress`) with `node:test` tests, and a
  **parity table** shared with the backend: the same JSON cases run against `isQualified` of
  `backend/src/challenges/scoring.ts` (Jest) and against the web rule (node:test).
- One Playwright journey, QA catalog TC-ACT-25 and TC-SCORE-08, guide step "Leer el panel Mi reto"
  updated, `CHANGELOG.md`.
- **No API change, no schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- Changing how qualification or the score is computed (`challenge-scoring` unchanged).
- Projections based on dates ("a este ritmo…"), streak goals or notifications.
- Showing the card for closed or draft challenges (the dashboard only lists `ACTIVE` ones; closed
  ones have the results page).
- "PAR-2" (mentioned by one evaluator; no data, not approved).
- Showing the card to non-enrolled users or to admins who do not participate.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `participant-calendar`: the dashboard ("Mi reto") gains the "Mi avance" card, computed from the
  caller's ranking row, the challenge's minimum and the caller's calendar, with a web rule kept equal
  to the server's qualification rule.

## Impact

- **Frontend:** `frontend/lib/progress.ts` (new) and `frontend/lib/progress.test.ts` (new),
  `frontend/app/dashboard/page.tsx` (render the card; no new query).
- **Backend:** none in production code. New shared table
  `backend/src/challenges/qualification-parity.json` read by `scoring.spec.ts` and by
  `frontend/lib/progress.test.ts`.
- **Tests:** web unit tests, one backend unit test over the table, new Playwright file
  `e2e/tests/16-my-progress.spec.ts` (or the next free number) with the seed participant's stored
  session and a challenge in month 6 of `E2E_YEAR` (unused by other journeys).
- **Docs:** guide (step "Leer el panel Mi reto"), `docs/qa/catalog.mjs`, `CHANGELOG.md`.
