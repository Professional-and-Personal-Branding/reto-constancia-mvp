## 1. Increment 1 - API (tests first)

- [x] 1.1 On `feature/participant-my-month-calendar`, unit tests in `activities/calendar.spec.ts` for `buildCalendar` (D1, D3): one entry per day of the period in order, `YYYY-MM-DD` keys, `valid` from the injected rules, rest day, activity summary keys (exact set, no photos or user), activity on a day no longer valid kept and counted, activity outside the period omitted, `summary` counts, a period crossing a month, a leap-year February; then implement the pure function
- [x] 1.2 Consistency unit test: for every day of a fixture challenge, `valid` equals `isWithinPeriod && isValidDay` as used by `create` (the same `ChallengesService` methods are injected, not copied)
- [x] 1.3 Unit tests in `activities.service.spec.ts` for `myCalendar` (D4): `404` unknown challenge, `403` "No participas en este reto", only the caller's activities are queried, any challenge status answers; then implement it (expose the enrolment check of `ChallengesService` for reads)
- [x] 1.4 Controller route `GET /activities/me/calendar` with a DTO (`challengeId` required `IsUUID`, unknown keys rejected by the global pipe) and Swagger summary "Mi calendario del reto (solo propio)"
- [x] 1.5 API e2e `backend/test/activity-calendar.e2e-spec.ts`: the 31-day month of the spec scenario with validated, pending and rejected days; a rest day; `400` without or with a bad `challengeId`; `404`; `403` for a non-enrolled participant; two participants on the same day only see their own; `userId` in the query is rejected with `400` (global `forbidNonWhitelisted`); a `COMPLETED` challenge still answers `200`; a `valid: true` day is accepted by `POST /activities` and a `valid: false` day inside the period gets the weekday `400`

## 2. Increment 1 - Web

- [x] 2.1 `lib/types.ts`: `MyCalendar`, `CalendarDay`, `CalendarActivity`, `CalendarSummary`
- [x] 2.2 `lib/calendar.test.ts` (node:test) first, then `lib/calendar.ts`: `dayState(day, today)` for every state of D2 (string comparison of day keys, no `validDays` logic); `todayDuty(calendar, today)` for the five cases of D6
- [x] 2.3 Dashboard today card (D6): query key `['activities', 'calendar', challengeId]`, only when `challenge.me` is set; banner "Hoy es día válido y aún no registraste tu actividad" + "Registrar hoy" to `/dashboard/upload?date=<today>`, "Hoy es día de descanso", "Hoy ya está" with the badge, period notices; previous button while loading or on error
- [x] 2.4 Upload form (D7): `min`/`max`, `?date=` prefill (with the Suspense boundary Next 15 needs for `useSearchParams`), hint texts and disabled submit from the calendar entry; unchanged behaviour without calendar data
- [x] 2.5 Lint, types (`rtk proxy npx tsc --noEmit -p .` locally) and build green

## 3. Increment 1 - Playwright and QA

- [x] 3.1 New `e2e/tests/13-my-month.spec.ts` (D11): `storageState: STATE.participant`, month 10 of `E2E_YEAR`, data by API fixtures, `page.clock.setFixedTime` inside the period; test "la tarjeta de hoy guía según el día y la subida avisa un día de descanso": open valid day shows the banner and "Registrar hoy" prefills the form; a rest day picked in the form shows the hint and disables the submit
- [x] 3.2 QA catalog: new TC-ACT-20 (calendar API: shape, validity consistent with registration, 403/404/400, own data only), TC-ACT-21 (dashboard today card), TC-ACT-22 (upload date hints and prefill); update TC-ACT-18 (the form now also warns about rest days and registered days) with links to the new tests
- [ ] 3.3 PR 1 to `develop` after `node scripts/run-tests.mjs` (13/13), DB reset, `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0") and `openspec validate --all --strict`; `CHANGELOG.md` Sin publicar (no migration, no new variables)

## 4. Increment 2 - "Mi mes" grid

- [x] 4.1 `lib/calendar.test.ts` first: `weeksOf(days)` (Monday first, leading and trailing blanks, a period crossing months), `currentStreak(days, today)` for the D9 cases (rest day skipped, open today, rejected and missed end it, pending counts); then implement
- [x] 4.2 "Mi mes" section between the stats and "Mis actividades" (D8, D10): `<table>` with caption and weekday headers, cell glyph + hidden text + token colour, `aria-current="date"`, links only when `status` is `ACTIVE` (upload prefill for missed/today, `#actividad-<id>` anchor on the existing rows), legend, "X de Y días válidos registrados", "Racha: N días"; light and dark themes
- [x] 4.3 Add the `id="actividad-<id>"` anchors to the "Mis actividades" rows without changing their content
- [x] 4.4 `13-my-month.spec.ts`: test "Mi mes muestra cada estado, la racha y cabe en el teléfono" (validated, pending, rejected, missed, rest, today, future, legend, counts, streak, 375 px without horizontal scroll) and test "un día sin registro abre la subida con esa fecha"; same session and data, no new login
- [x] 4.5 QA catalog: new TC-ACT-23 (grid states, links, streak, accessibility and phone width); `node scripts/validate-test-cases.mjs`

## 5. Docs and verification

- [x] 5.1 Guide steps 4.3 (today card, date hints) and 4.4 ("Mi mes") with captures in the guide capture suite; `docs/architecture.md` endpoint list
- [x] 5.2 `CHANGELOG.md` Sin publicar (no migration, no new dependency, no new environment variable); reset the DB; full battery and catalog validator once before PR 2; record in `docs/testing.md`
- [ ] 5.3 PR 2 to `develop` with the 3 CI jobs green; the owner merges; archive the change in the next release branch
