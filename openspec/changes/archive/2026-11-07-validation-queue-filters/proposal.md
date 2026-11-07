## Why

With several active challenges the admin validation queue ("Validar") is the owner's daily
bottleneck, and today it works against them:

- **It mixes every challenge and does not say which one an activity belongs to.** The page calls
  `GET /activities/pending` without `challengeId`, and the card shows the participant, the date and
  the metrics but not the challenge name (the list only includes `challenge.minHeartRateMinutes`).
- **The newest activity comes first** (`orderBy: date desc, createdAt desc`), while what matters
  before a close is to clear the oldest days first.
- **The admin cannot see how much work is waiting** without opening the page.
- **Pending activities of closed challenges stay in the queue forever** with "Validar" and
  "Rechazar" buttons that can only answer 400 "El reto está cerrado; sus actividades son
  definitivas" (closed-challenge freeze).

The API already filters by `challengeId`; the gap is the order, a count and the screen.

Source: ADM-1 of `docs/propuestas-mejoras-ciclo2-2026-10-29.md`, approved by the owner on
2026-10-29 with P4 (a): ascending order by default and one total counter of the pending activities
of active challenges in the admin menu.

## What Changes

- **`GET /activities/pending`** (admin) gains `order=asc|desc`, **ascending by default** (`date`,
  then `createdAt`), and validates `challengeId` as a UUID (400 otherwise). Without `challengeId`
  it still returns every pending activity, as today. Each item also carries the challenge `name`
  and `status` (additive fields).
- **New `GET /activities/pending/count`** (admin): `{ count }`, the number of `PENDING`
  activities whose challenge is `ACTIVE`.
- **Web, "Validar":** a challenge selector ("Todos los retos" plus each active challenge, page
  local, independent from the header selector), an order toggle ("Más antiguas primero" /
  "Más nuevas primero"), the challenge name on each card, and for a card of a closed challenge a
  "Reto cerrado" badge without the validate/reject buttons.
- **Web, admin menu:** the "Validar" item shows the counter as a badge (hidden at 0, "99+" above
  99), refreshed after validating or rejecting and when the window regains focus.
- `validate` and `reject` do not change.
- **No schema change, no migration, no new dependency, no new environment variable.**

## Non-goals

- A per-challenge breakdown in the counter (the selector shows it by filtering; P4 a).
- Bulk validation, pagination, or filters by participant or date.
- Changing `GET /activities` or `GET /activities/me` (they keep the descending order).
- Hiding pending activities of closed challenges from the API list (see design P1).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-lifecycle`: the admin pending queue is filterable per challenge, ordered oldest
  first by default, counted for active challenges, and shows the challenge of each activity.

## Impact

- **Backend:** `ActivitiesController` (`findPending` query DTO, new `pending/count` route declared
  before `:id`), `ActivitiesService.findPending` (order) and a new `countPending`, `findAll`
  include (`challenge.name`, `challenge.status`). New `QueryPendingDto`.
- **Web:** `frontend/app/dashboard/admin/validations/page.tsx`, `frontend/app/dashboard/layout.tsx`
  (badge), `frontend/lib/types.ts`; a small pure helper for the badge label with its test.
- **Tests and QA:** new `TC-ACT-26` (API) and `TC-UI-13` (web); `e2e/tests/03-admin-validation.spec.ts`.
- **Docs:** guide step 5.2 (`docs/guia-plataforma.html`), `docs/architecture.md` (endpoint list),
  `CHANGELOG.md` (`[Sin publicar]`).
- **Delivery:** one PR (`feature/validation-queue-filters`).
