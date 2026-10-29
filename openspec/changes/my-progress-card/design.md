## Context

- **Dashboard** (`frontend/app/dashboard/page.tsx`) for the selected challenge (from
  `GET /challenges/active/list`, only `ACTIVE` challenges) already fetches:
  - `GET /activities/me/calendar?challengeId=` when `challenge.me` exists (the caller is enrolled):
    one entry per day of the period with `valid` (decided by the server with the registration rules)
    and the caller's `activity` (`status` `PENDING`/`VALIDATED`/`REJECTED`) or `null`;
  - `GET /challenges/:id/results`: the ranking, whose rows for a participant carry `userId`, `name`,
    `validatedDays`, `pendingDays`, `rejectedDays`, `totalKm`, `score` and `qualified`
    (`RANK_FIELDS` in `backend/src/challenges/privacy.ts`);
  - the challenge itself with `minValidatedDaysToQualify`, `pointsPerValidatedDay` and `pointsPerKm`.
- **Server rule** (`backend/src/challenges/scoring.ts`): `isQualified` = `validatedDays >=
  minValidatedDaysToQualify` and `score > 0`; `validatedDays` counts the user's `VALIDATED`
  activities of the challenge (`results.service.ts`), `score` = days × points per day + km × points
  per km.
- **Registration rules:** an activity can be registered on any valid day of the period up to today
  (the API checks period and weekday; the upload form caps the date at today), so past valid days
  without an activity can still be filled while the challenge is `ACTIVE`. A rejected activity can
  be withdrawn and the day registered again (`activity-withdrawal`).
- Web unit tests run with `node --test` over `frontend/lib/*.test.ts` and import with relative
  paths; the web cannot import backend code.

Checked against the approved proposal (PAR-1), three corrections:

1. "Los días válidos que quedan" are not only the days from today on: past valid days without an
   activity can still be registered, and pending activities may still be validated. The reachable
   total is `validated + pending + open`, where *open* counts valid days with no activity or with a
   rejected one, past or future (D3).
2. The card does not need to recompute the qualification: the ranking row already carries the
   server's `qualified`. The web rule is still needed to judge "can still reach", and the parity
   table keeps it equal to `isQualified` (D4).
3. The minimum `0` (default) does not mean "already qualified": with `0` the server still requires
   `score > 0`, i.e. at least one validated day under the default scoring. The card uses a target of
   `max(min, 1)` (D2).

## Goals / Non-Goals

**Goals:** the participant sees, where they register, how far they are from the minimum and whether
the days left can still cover it, in words that promise nothing before the close; no API change; the
web rule cannot drift from the server rule unnoticed.

**Non-Goals:** date-based forecasts, notifications, the card for closed or draft challenges, changes
to scoring.

## Decisions

### D1. Where the card shows and where its data comes from

- Rendered below the stats grid, as `<section aria-labelledby>` with the heading "Mi avance".
- Shown only when all hold: the selected challenge has `status` `ACTIVE`; `challenge.me` exists;
  the results are loaded and contain a row with `userId` equal to the user; the calendar is loaded.
  Otherwise the card is not rendered (no zero placeholder): an enrolled user always has a row, so a
  missing row means data not loaded yet or an error, and the rest of the dashboard keeps working.
- Applies to any enrolled user, admin included (an admin can take part and win).
- No new query: it uses the `results` and `calendar` queries already on the page, which are
  invalidated after registering or withdrawing an activity; a validation by the admin shows on the
  next refetch (focus or reload), as the stats do today.

### D2. Target

`target = max(minValidatedDaysToQualify, 1)`. With the default minimum `0` the card reads
"Validados: 0 de 1".

### D3. Open days

`open` = number of calendar entries with `valid: true` and `activity` `null` or with
`activity.status === 'REJECTED'`. It does not depend on today's date (past valid days can still be
registered and future ones will be), so the function is deterministic and the card never contradicts
the upload form. Activities outside the current period are not in the calendar and are not counted as
open; they are already counted in the ranking if they are validated or pending.

### D4. Pure function and states

`qualifyProgress({ min, row: { validatedDays, pendingDays, score, qualified }, days })` returns
`{ state, validated, target, missing, pending, open, percent }` with `missing = max(0, target -
validated)`, `percent = min(100, round(validated * 100 / target))`, and `state`, decided in this
order:

| State | Condition | Main message |
|---|---|---|
| `QUALIFIED` | `row.qualified` | "Ya alcanzas el mínimo; se confirma al cierre." |
| `NO_SCORE` | `validated >= target` and not `qualified` | "Alcanzas el mínimo de días, pero tu puntaje todavía es 0; se confirma al cierre." |
| `REACHABLE` | `missing <= pending + open` | "Te faltan {missing} {día validado / días validados} para el mínimo; aún puedes llegar." |
| `OUT_OF_REACH` | otherwise | "Con los días que quedan no alcanzarías el mínimo de {target} {día validado / días validados}. Cada actividad sigue sumando puntos." |

Detail line, only for `REACHABLE`: "Tienes {pending} {pendiente / pendientes} de validar y {open}
{día válido / días válidos} sin registrar en el período." (singular when the number is 1). The
summary line is always "Validados: {validated} de {target}" (no plural agreement needed), and a
`role="progressbar"` with `aria-valuenow={validated}`, `aria-valuemin=0`,
`aria-valuemax={target}` and `aria-label="Días validados para el mínimo"`. When the scoring is not
the default (`pointsPerValidatedDay !== 1` or `pointsPerKm > 0`, the rule already used by "Top del
reto"), a line "Tu puntaje: {score} pts" is added.

The texts follow owner decision D4: the positive states say "se confirma al cierre" or "aún puedes
llegar", never "calificas" or "ganarás"; the negative state uses the conditional ("no alcanzarías"),
since an admin could still edit the rules or the period.

The function also exposes `qualifiesLike(min, validatedDays, score)` = `validatedDays >= min &&
score > 0`, the web copy of `isQualified`, used to derive `NO_SCORE` consistently and covered by the
parity table (D5).

### D5. Parity table shared by both test runners

`backend/src/challenges/qualification-parity.json`: an array of
`{ name, min, validatedDays, score, qualified }` cases (at least: min 0 with 0 and 1 validated days;
min 10 with 9, 10 and 11; min 3 reached with score 0; fractional scores from km). Two tests read it:

- Jest, `backend/src/challenges/scoring.spec.ts`: "la tabla de paridad coincide con isQualified" —
  for every case, `isQualified(rules(min), { validatedDays, score }) === qualified`.
- node:test, `frontend/lib/progress.test.ts`: "Mi avance: la tabla de paridad coincide con la regla
  del servidor" — reads the same file with `fs` (`../backend/src/challenges/...`) and checks
  `qualifiesLike`.

A change to the server rule without updating the web copy breaks one of the two. The JSON lives next
to `scoring.ts` because the server rule is the source of truth; it is not imported by production
code of either package.

### D6. Tests within the existing budgets

- Web unit tests over `qualifyProgress`: each state, the singular texts, `target` with min 0,
  `open` counting a rejected day and not a pending one, `percent` capped at 100.
- Playwright `e2e/tests/16-my-progress.spec.ts` (next free number), seed participant's stored session
  (no login): `setupChallenge({ month: 6, minValidatedDaysToQualify: 3, validDays: all })`, enrol,
  create and validate 1 activity and leave 1 pending; open "Mi reto", select the challenge and check
  "Validados: 1 de 3", "Te faltan 2 días validados para el mínimo; aún puedes llegar." and the
  progressbar values; validate the pending one and create and validate one more through the API,
  reload and check "Ya alcanzas el mínimo; se confirma al cierre."; `afterAll` closes the challenge
  (`closeChallenge(6)`). Month 6 of `E2E_YEAR` is used by no other journey.

## Risks / Trade-offs

- **Rule drift between web and server** → D5 parity table in both test runners.
- **Wording read as a promise** → D4 texts; the guide repeats that the result is confirmed at the
  close.
- **Stale numbers until refetch** after an admin validates → same behaviour as the existing stats;
  accepted.
- **Open days count past days the participant may not remember to fill** → the detail line says
  "sin registrar en el período", which matches what the upload form accepts; "Mi mes" shows which
  ones.
- **Dashboard height on phones** → one compact card; checked in the Playwright journey at 375 px
  only if the existing layout tests flag overflow (TC-UI-10 is not affected: the header does not
  change).

## Migration Plan

- **No API change, no schema change, no migration, no new environment variable, no new dependency.**
- Deploy the web only. **Rollback:** redeploy the previous web.

## Open Questions

- **P1. Card for a minimum of 0.** [NO BLOQUEANTE]
  Options: (a) show it with target 1 ("Validados: 0 de 1"); (b) hide it when the challenge has no
  minimum. Recommendation: (a): the server does require one validated day, and the card still tells
  the participant when they are in. The spec uses (a).
- **P2. Count past unregistered days as open.** [NO BLOQUEANTE]
  Options: (a) yes, the API accepts them while the challenge is active; (b) only today and future
  valid days. Recommendation: (a), because (b) would say "no alcanzarías" to someone who can still
  fill two forgotten days today. The spec uses (a).

None of the questions blocks the approval.
