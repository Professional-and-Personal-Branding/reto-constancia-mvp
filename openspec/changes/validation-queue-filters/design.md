## Context

Verified against `develop` (3da134a):

- `ActivitiesController.findPending(@Query('challengeId') challengeId?: string)` (admin) calls
  `ActivitiesService.findPending`, which reuses `findAll({ challengeId, status: PENDING })`.
  `findAll` orders by `date desc, createdAt desc` and includes `user`, `photos` and
  `challenge: { minHeartRateMinutes }` only. `challengeId` is a raw query string (no DTO, no UUID
  check).
- `frontend/app/dashboard/admin/validations/page.tsx` calls `/activities/pending` with no
  parameter, under the query key `['activities', 'pending']`, and invalidates `['activities']`
  after validating or rejecting. It shows "N actividades pendientes de revisión" from the list
  length. The card does not name the challenge.
- The header `ChallengeSelector` (`useActiveChallenge`) always resolves one active challenge
  (implicit with one, stored in `localStorage` with several); it cannot represent "all".
- A `PENDING` activity can stay in a `COMPLETED` challenge (the close dialog only warns that it
  will not count). Validating or rejecting it answers 400 "El reto está cerrado; sus actividades
  son definitivas" (`lockOpenActivity`).
- The admin menu is the `navItems` array of `frontend/app/dashboard/layout.tsx`; "Validar" points
  to `/dashboard/admin/validations`.

### Corrections to the cycle 2 proposal (ADM-1)

- "La propuesta s6 fusionó este punto en `multi-challenge-operations`, pero la UI no muestra el
  filtro": `multi-challenge-operations` was only item #12 of the October roadmap
  (`docs/propuestas-features-2026-10-04.md`); it was never an OpenSpec change or spec. No current
  requirement describes the pending queue beyond the heart-rate badge
  (`activity-heart-rate-compliance`). This change is the first to specify it.
- "El filtro es casi solo de UI": the API needs an `order` parameter, a count route, a DTO for the
  query and the challenge name in each item; still small.
- Not mentioned in the proposal: the card does not show the challenge, and pending activities of
  closed challenges keep live buttons that can only fail (D4).

## Goals / Non-Goals

**Goals:** work one challenge at a time, oldest first; see the pending total of active challenges
from any admin page; keep the current "everything" view as the default.

**Non-Goals:** per-challenge counts, pagination, bulk actions, changes to `validate`/`reject`.

## Decisions

### D1. `order` only on the pending route, ascending by default

`GET /activities/pending?challengeId=<uuid>&order=asc|desc` with a new `QueryPendingDto`
(`challengeId` `IsUUID` optional, `order` `IsIn(['asc','desc'])` optional, default `asc`).
Ordering is `[{ date: order }, { createdAt: order }]`. `findAll` gets an optional `order`
argument whose default stays `desc`, so `GET /activities` and `GET /activities/me` do not change.
The only consumer of `/activities/pending` is the validations page, so changing its default is
safe. An invalid `challengeId` now answers 400 instead of an empty list (stricter, documented).

### D2. Count route: active challenges only, one number

`GET /activities/pending/count` (admin) answers `{ "count": n }` with
`prisma.dailyActivity.count({ where: { status: PENDING, challenge: { status: ACTIVE } } })`. It is
declared before `@Get(':id')`; `:id` only matches one segment, so there is no route clash, but the
order keeps intent obvious. The index `@@index([userId, status])` does not cover this query; at the
expected volume (tens of rows) a sequential scan is fine and no index is added (no migration).

### D3. Page-local selector, default "Todos los retos"

The validations page gets its own `<select>`: "Todos los retos" (no `challengeId`) followed by the
active challenges from `GET /challenges/active/list` (already loaded by the header). It does not
use the header selector because that one cannot mean "all" and the approved scenario keeps "all"
as the default. The choice and the order live in the URL query (`?reto=<id>&orden=desc`) so a
reload keeps them; no `localStorage`. The query key becomes
`['activities', 'pending', challengeId ?? 'all', order]`, still under the `['activities']`
prefix that the mutations invalidate. The header text becomes "N actividad(es) pendiente(s) de
revisión" for the current filter.

### D4. Challenge name on every card; closed challenges are read-only

`findAll` adds `challenge.name` and `challenge.status` to its `select` (additive). The card shows
the challenge name under the participant. When `challenge.status` is `COMPLETED` the card shows
the badge "Reto cerrado" and no validate/reject buttons, because the API would answer 400 anyway.
The API list itself keeps including them (approved scenario: no challenge selected keeps today's
"show everything"); see P1.

### D5. Menu badge

`layout.tsx` runs `useQuery(['activities', 'pending', 'count'])` only for admins, with
`refetchOnWindowFocus` (default) and `refetchInterval: 60_000` (react-query stops it in background
tabs). The label helper `pendingBadgeLabel(n)` returns `null` for 0, the number up to 99 and
"99+" above; the badge has `aria-label="N actividades pendientes"`. Validating or rejecting
invalidates `['activities']`, which refreshes the badge too. The badge counts only active
challenges, so with "Todos los retos" the page total can be higher than the badge when a closed
challenge keeps pending activities; the closed cards are marked (D4) so the difference is
explained on screen.

## Risks / Trade-offs

- **Badge and page total can differ** (closed challenges with pending rows) → explained by the
  "Reto cerrado" badge; P1 offers to remove the difference.
- **Polling cost** → one `count` query per admin tab per minute, only while visible.
- **400 for a malformed `challengeId`** where today it returned `[]` → only reachable by hand-made
  calls; the web always sends a UUID from the list.
- **Admin acting on a stale card** → unchanged from today (the API re-reads under the lock).

## Migration Plan

No schema change and no data migration. Rollback: revert the PR and deploy API and web together.
Mixed versions degrade safely: the current route reads `challengeId` as a bare `@Query` string, so
an older API ignores `order` (the list comes back newest first) and answers 404 to
`pending/count` (the web hides the badge on error).

## Open Questions

- **P1. Pending activities of closed challenges in "Todos los retos".** [NO BLOQUEANTE]
  Options: (a) keep them, marked "Reto cerrado" and read-only (D4); (b) exclude them from the list
  when no challenge is selected, so the page total equals the badge. Recommendation: (a) for this
  change, because it is what the owner approved ("sin reto elegido, mostrar todo") and those rows
  are evidence of days that did not count; (b) is a one-line follow-up if the owner prefers.
- **Default kept in this spec:** the order toggle labels "Más antiguas primero" / "Más nuevas
  primero"; the badge cap "99+".
