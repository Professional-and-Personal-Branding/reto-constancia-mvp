## Why

Scoring and prize allocation are the only rules still hardcoded in `ResultsService` (Gap #3): the score is always "validated days", every participant with at least one validated day can win, the number of winners is fixed at two, and a tie of three or more is always resolved by a random draw. Any month that wants a minimum attendance to qualify, a bonus per kilometre, a single winner or a deterministic tiebreak needs a code change and a deploy. The rules table in `docs/challenge-rules.md` already enumerates exactly which dimensions vary between months; this change turns those four dimensions into per-challenge configuration.

## What Changes

- Four new configurable fields per challenge, with defaults that reproduce today's behavior **exactly**:
  - `pointsPerValidatedDay` (default `1`) and `pointsPerKm` (default `0`): the score becomes `validatedDays x pointsPerValidatedDay + totalKm x pointsPerKm`. With the defaults the score equals the validated days, as today.
  - `minValidatedDaysToQualify` (default `0`): participants below this number cannot win, and are flagged as not qualified in the ranking.
  - `maxWinners` (default `2`): how many winners the challenge admits.
  - `tiebreakRule` (default `DRAW`): what happens when more participants tie at the top than `maxWinners` allows. `DRAW` picks winners at random (today's behavior), `TOTAL_KM` breaks the tie by distance, `SHARE_ALL` lets every tied participant win and share the prize.
- Ranking entries expose the computed `score` and a `qualified` flag; the results notes state which rules were applied.
- **Admin UI**: the challenge form gains the four fields with inline help; the results page shows a points column when the scoring is not the default one, marks non-qualified participants and explains the active rule.
- The payout already splits the pot among the winners, so a different `maxWinners` or `SHARE_ALL` automatically changes the amount per winner. No change to `challenge-finance`.
- Docs: `docs/challenge-rules.md` (Gap #3 resolved, the rules table filled in for what is now configurable), `docs/architecture.md` (data model), `docs/test-cases.md` (new cases); `scripts/parallel-session-test.mjs` gains scoring checks.

No **BREAKING** change: existing challenges keep the current behavior through the defaults, and no existing field or endpoint changes shape. `ChallengeResults` only gains fields.

**Assumption recorded for approval:** these four dimensions come from the rules table the owner wrote in `docs/challenge-rules.md`. They cover "minimum to qualify", "ranking criterion", "number of winners" and "tiebreak rule". If the real months need something outside them (streak bonuses, per-exercise weights, per-week quotas), that is a separate change; this one does not attempt to build a general rules engine.

## Capabilities

### New Capabilities
- `challenge-scoring`: how a participant's score and qualification are computed from their validated activities and the challenge configuration, how winners are selected, and how ties are resolved.

### Modified Capabilities
<!-- none: challenge-finance consumes the winners count and keeps its contract; lifecycle and heart-rate rules are untouched -->

## Impact

- **Backend**: new `backend/src/challenges/scoring.ts` (pure `computeScore()`, `selectWinners()`), `results.service.ts` (uses them, adds `score`/`qualified` to ranking entries and rule notes), `challenges/dto/create-challenge.dto.ts` and `update-challenge.dto.ts` (four fields with validation), unit specs (`scoring.spec.ts` new, `results.service.spec.ts` extended), e2e suite `challenge-scoring.e2e-spec.ts`.
- **Database**: one Prisma migration adding four columns to `Challenge` plus the `TiebreakRule` enum, all with defaults; no backfill.
- **Frontend**: `app/dashboard/admin/challenges/page.tsx` (form fields), `app/dashboard/results/page.tsx` (points column, qualification, rule description), `lib/types.ts`.
- **Scripts/Docs**: `scripts/parallel-session-test.mjs`, `docs/challenge-rules.md`, `docs/architecture.md`, `docs/test-cases.md`.
- **Dependencies**: none added.
