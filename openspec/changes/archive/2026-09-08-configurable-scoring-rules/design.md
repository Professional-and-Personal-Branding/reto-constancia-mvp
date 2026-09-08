## Context

See proposal.md - Why. Current state that shapes the approach:

- `ResultsService.getResults()` builds each ranking entry with `validatedDays`, `pendingDays`, `rejectedDays`, `totalKm` and `paid`, sorts by validated days and then kilometres, computes `topScore` as the highest `validatedDays`, and `tiedAtTop` as everyone matching it with `topScore > 0`.
- `computeWinners(tied)` is a private method with the hardcoded ladder: 0 tied -> no winner, 1 -> single, 2 -> both, 3+ -> `Math.random()` shuffle picking two, setting `drawNeeded`.
- Manual awards already override the computed winners, and `computePayout()` (spec `challenge-finance`) divides the pot by the number of awards or winners, so any change in the number of winners flows into the payout with no extra work.
- `Challenge` already carries per-month configuration (`validDays`, `minHeartRateMinutes`, fee, budget); adding scoring fields follows that precedent.
- The results page reads `validatedDays`, `topScore` and `winners`; `docs/challenge-rules.md` has a table listing exactly the four dimensions that vary between months.

## Goals / Non-Goals

**Goals:**
- Make the four dimensions of the rules table configurable per challenge, with defaults that keep every existing challenge behaving exactly as today.
- Isolate scoring and winner selection in a pure, unit-tested module so the rules can be read and changed in one place.
- Keep the composition with the finance payout intact.

**Non-Goals:**
- A general rules engine or user-defined formulas.
- Streak bonuses, per-exercise-type weights, weekly quotas or handicaps; they are outside the four dimensions the owner listed and would each need their own change.
- Retroactively re-scoring closed challenges with a new configuration (changing a `COMPLETED` challenge's fields is possible today and simply re-computes the read-only results).
- Payment-based eligibility, which stays an open business question of `challenge-finance`.

## Decisions

1. **Score as a linear formula instead of a mode enum.**
   `score = validatedDays * pointsPerValidatedDay + totalKm * pointsPerKm`, rounded to two decimals. With `(1, 0)` the score is the validated days, so today's behavior is the default rather than a special case. Alternative: a `scoringMode` enum (`DAYS` / `DAYS_AND_KM`) - rejected, it needs the same two numbers anyway and adds a branch to every consumer.

2. **`qualified` as a first-class flag on the ranking entry.**
   `qualified = validatedDays >= minValidatedDaysToQualify && score > 0`. The `score > 0` term preserves today's rule that a participant with no validated activity never wins, including when the minimum is `0`. Non-qualified participants stay in the ranking (the group wants to see everyone) but are excluded from `tiedAtTop` and from the winners.

3. **`selectWinners(tied, maxWinners, tiebreakRule)` as a pure function.**
   New `backend/src/challenges/scoring.ts` exporting `computeScore()` and `selectWinners()`, both pure and unit-tested; `ResultsService` keeps only the data loading and mapping. `DRAW` shuffles and slices, reporting `drawNeeded: true`. `TOTAL_KM` sorts by kilometres descending and slices; when the kilometre value at the cut-off is shared by more candidates than the remaining seats, the tie among *those* is resolved by a draw and `drawNeeded` is true, so the rule never silently invents an order. `SHARE_ALL` returns every tied participant and ignores `maxWinners`.

4. **Notes describe the applied rules.**
   The existing `notes` array gains a line naming the scoring formula when it is not the default and the tiebreak that was applied, so the UI and the parallel-session script can assert on behavior without re-deriving it.

5. **Schema: four columns plus one enum, all defaulted.**
   `pointsPerValidatedDay Int @default(1)`, `pointsPerKm Decimal @default(0) @db.Decimal(6, 2)`, `minValidatedDaysToQualify Int @default(0)`, `maxWinners Int @default(2)`, `tiebreakRule TiebreakRule @default(DRAW)` with `enum TiebreakRule { DRAW TOTAL_KM SHARE_ALL }`. Defaults make the migration safe on existing rows with no backfill. Decimal for `pointsPerKm` keeps the "0.5 points per km" case exact; it is read with `Number()` like the other decimals.

6. **DTO validation mirrors the spec.**
   `@Min(0)` for the two point factors and the minimum, `@Min(1)` for `maxWinners`, `@IsEnum(TiebreakRule)`; all optional so existing clients are unaffected.

7. **Frontend.**
   - Challenge form: a "Reglas de puntaje" block with the four inputs pre-filled with the defaults and one-line help each.
   - Results page: a line describing the active rule ("1 punto por día validado" / "10 por día + 1 por km · mínimo 8 días"), a `Puntos` column shown only when the scoring is not the default, and a muted "no califica" marker on non-qualified rows. The existing "Validados" column stays.
   - Types: `ParticipantRanking` gains `score` and `qualified`; `Challenge` gains the four fields.

## Risks / Trade-offs

- [An admin changes the rules mid-month] -> results are computed on read, so the ranking changes immediately; the results page states the active rule, and the change is visible in the admin form. Documented in `docs/challenge-rules.md`.
- [`SHARE_ALL` with many tied participants makes the per-winner payout very small] -> the payout line already shows the amount per winner before the challenge is closed, so the admin sees it and can still override with a manual award.
- [Random draw is not reproducible] -> unchanged from today; `drawNeeded` flags it and the admin can register the manual award that prevails.
- [More configuration to explain] -> the defaults reproduce today's behavior, so an admin who ignores the block gets the current product.

## Migration Plan

One additive migration with defaults; safe on existing data and reversible by redeploying the previous backend (the extra columns are ignored). Deploy backend before frontend; an old frontend simply ignores the new fields.

## Open Questions

- Should a closed (`COMPLETED`) challenge freeze its ranking instead of recomputing it on every read? That is today's behavior for every rule, not something this change introduces; worth its own change if the owner wants historical results immutable.
