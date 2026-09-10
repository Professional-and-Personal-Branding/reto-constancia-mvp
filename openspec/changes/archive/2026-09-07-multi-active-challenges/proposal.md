## Why

`GET /challenges/active` resolves the participant's working challenge with a plain "first ACTIVE row" lookup while nothing defines what happens when an admin activates two challenges at once: participants of the second challenge are silently locked out of the dashboard, upload and results pages, and which challenge "wins" is arbitrary. This is Gap #1 of the platform. The owner has decided the product must **support several simultaneously active challenges** (for example a month closing while the next one is already open, or two groups running in parallel), so the fix is to make multi-active a first-class, deterministic behavior instead of forbidding it.

## What Changes

- Several challenges MAY be `ACTIVE` at the same time. Activation becomes an explicit lifecycle transition: only a `DRAFT` challenge can be activated, re-activating an `ACTIVE` challenge is an idempotent no-op, and a `COMPLETED` challenge cannot be re-activated (`400`).
- New endpoint `GET /challenges/active/list`: every `ACTIVE` challenge, newest first, with a per-request `isParticipant` flag so the client knows which ones the caller belongs to.
- `GET /challenges/active` keeps its shape (`Challenge | null`) but becomes deterministic: the active challenge the caller participates in with the latest start date, otherwise the latest active challenge, otherwise `null`.
- Participant-facing pages (dashboard, upload, results) and the admin participants page operate on a **selected** challenge. When more than one challenge is active, a selector appears in the header; the selection persists in the browser. With a single active challenge nothing changes visually.
- Activities stay scoped per challenge: a user who participates in two active challenges can register one activity per day **in each** challenge, and the ranking of each challenge is independent (already true in the data model, now covered by the spec).
- Admin challenge list shows the server error message when an activation is rejected.
- Docs (`docs/challenge-rules.md`, `docs/architecture.md`, `docs/test-cases.md`) and `scripts/parallel-session-test.mjs` gain the rule and regression checks.

No **BREAKING** change: existing endpoints keep their contracts; one endpoint is added.

**Decision recorded:** the earlier draft of this change enforced a single active challenge. The owner reviewed it and chose multi-active support instead; this proposal replaces that draft entirely.

## Capabilities

### New Capabilities
- `challenge-lifecycle`: state transitions of a challenge (`DRAFT -> ACTIVE -> COMPLETED`), concurrent active challenges, how the active challenge list and the default active challenge are resolved for a caller, and how a participant selects among active challenges.

### Modified Capabilities
<!-- none: openspec/specs/ is empty; this is the first spec of the project -->

## Impact

- **Backend**: `backend/src/challenges/challenges.service.ts` (new `activate()`, `findActiveList(userId)`, deterministic `findActive(userId)`), `challenges.controller.ts` (activate route, new `GET active/list`, current user on active routes), new unit spec `challenges.service.spec.ts`, e2e cases in `backend/test/app.e2e-spec.ts`.
- **Database**: no schema change, no migration.
- **Frontend**: new hook `frontend/lib/use-active-challenge.ts` and component `frontend/components/challenge-selector.tsx`; `app/dashboard/layout.tsx` renders the selector; `app/dashboard/page.tsx`, `dashboard/upload/page.tsx`, `dashboard/results/page.tsx`, `dashboard/admin/participants/page.tsx` consume the hook; `dashboard/admin/challenges/page.tsx` shows activation errors.
- **Scripts/Docs**: `scripts/parallel-session-test.mjs` (activate the second challenge, list active, register the same date in both, ranking independence, close), `docs/challenge-rules.md`, `docs/architecture.md`, `docs/test-cases.md`.
- **Dependencies**: none added.
