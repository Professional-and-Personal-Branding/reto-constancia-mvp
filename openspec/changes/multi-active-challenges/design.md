## Context

See proposal.md - Why. Current state that shapes the approach:

- `ChallengesService.findActive()` is `prisma.challenge.findFirst({ where: { status: ACTIVE } })` with no ordering and no notion of caller; four frontend pages (`dashboard`, `upload`, `results`, `admin/participants`) each run their own `useQuery(['challenge','active'])` and treat the result as *the* challenge.
- Activation is not a dedicated service method: the controller calls the generic `update(id, { status: ACTIVE })`, and `PATCH /challenges/:id` accepts `status` through `UpdateChallengeDto`.
- `DailyActivity` is already unique per `(challengeId, userId, date)` and `ResultsService` already filters by `challengeId`, so per-challenge scoping needs no data change.
- Frontend state lives in TanStack Query + `localStorage` (tokens); there is no global store. The `api()` client already refreshes tokens and throws `ApiError` with the server body.
- `scripts/parallel-session-test.mjs` seeds a May challenge (ACTIVE) and creates a December challenge (DRAFT) with different rules; it currently never activates the second one.

## Goals / Non-Goals

**Goals:**
- Make concurrent active challenges deterministic end to end (API resolution rules + UI selection).
- Keep every existing endpoint contract intact; add exactly one endpoint.
- Zero database migration.
- Keep the participant experience unchanged when a single challenge is active.

**Non-Goals:**
- Per-user "default challenge" stored server-side (browser persistence is enough for the MVP).
- Automatic activation/closing based on dates (scheduler).
- Reworking other transitions (`COMPLETED -> DRAFT`, reopening).
- Admin validations page filtering by challenge (it lists all pending activities across challenges, which is still correct; a filter can be a later change).

## Decisions

1. **Multi-active with client-side selection (owner decision) instead of a single-active invariant.**
   Rationale: overlapping months and parallel groups are real use cases for the owner; the data model already isolates activities and rankings per challenge. Alternative (single-active + 409 + partial unique index) was drafted first and rejected by the owner.

2. **Add `GET /challenges/active/list`; keep `GET /challenges/active` as the deterministic "default".**
   `findActiveList(userId)` returns ACTIVE challenges `orderBy startDate desc` with participants included and maps `isParticipant = participants.some(p => p.userId === userId)`. `findActive(userId)` reuses that list and applies the preference rule (participant first, then newest). Alternative: change `/challenges/active` to return an array - rejected as a breaking change for the script and any external client.
   Route declaration order in the controller: `active/list` and `active` are declared before `:id`.

3. **Dedicated `activate(id)` in the service; `update()` delegates when `dto.status === ACTIVE`.**
   Rules: DRAFT -> ACTIVE; ACTIVE -> return unchanged; COMPLETED -> `BadRequestException('Un reto cerrado no puede reactivarse')`. `update()` strips `status` from the generic data when it is ACTIVE, calls `activate()` first, then applies remaining fields. User-facing messages stay in Spanish like the rest of the API. Alternative: remove `status` from `UpdateChallengeDto` - rejected (breaking).

4. **Frontend: one hook, one selector, no global store.**
   - `lib/use-active-challenge.ts`: `useQuery(['challenge','active-list'])` -> `/challenges/active/list`; reads `localStorage['reto.selectedChallengeId']`; exposes `{ challenge, challenges, isLoading, select(id) }`. Default = first with `isParticipant`, else first. If the stored id is not in the list it is ignored (fallback). Wrapped in `try/catch` because `localStorage` can throw. The query key starts with `'challenge'` so existing `qc.invalidateQueries({ queryKey: ['challenge'] })` calls keep working.
   - `components/challenge-selector.tsx`: a `<select>` rendered by `app/dashboard/layout.tsx` only when `challenges.length > 1`; option label `name` plus a "(no inscrito)" hint when `!isParticipant`.
   - Pages replace their local `useQuery` with the hook; the rest of each page is untouched because the hook returns the same `Challenge` shape (with `participants`).
   - Selection is broadcast through a tiny `useSyncExternalStore` subscription so the header and the page re-render together when the user switches. Alternative: React context in the layout - more plumbing for the same effect.

5. **Regression coverage in three layers.**
   Unit (mocked Prisma) for `activate()`, `findActive()`, `findActiveList()`; e2e with a real Postgres for the HTTP contracts and RBAC; `scripts/parallel-session-test.mjs` for the cross-challenge flow (activate December, both listed, same date registered in both, independent rankings, close December, list shrinks).

## Risks / Trade-offs

- [Two active challenges but the participant is enrolled in only one] -> the selector still lists both (admins need it); the "(no inscrito)" hint and the default preference keep participants on their own challenge. Registering in a challenge they are not enrolled in still fails server-side with the existing 400.
- [Selection stored per browser, not per account] -> a user on two devices may see different defaults; acceptable for the MVP and documented in `docs/challenge-rules.md`.
- [Admin `validations` page mixes activities of several challenges] -> each row already shows the challenge name; a filter is deferred (see Non-Goals).
- [`/challenges/active` semantics change for non-participants] -> only ordering becomes defined (newest first); previously undefined.

## Migration Plan

No database migration. Deploy backend then frontend behind the normal PR flow; the new endpoint is additive so an old frontend keeps working against the new backend. Rollback is a plain redeploy of the previous version.

## Open Questions

- Should the selector also list the user's `COMPLETED` challenges to browse historical rankings? Purely additive UI; it does not change the specs above and can be raised as its own change.
