## Context

Challenge reads return Prisma rows with `participants: { include: { user: { select: { id, name,
email } } } }` and no `select` on the participant, so every payment column travels to any role.
`ResultsService.getResults` builds rows with `email` and `paid`. The services are also used by
internal flows (`update`, `award`, admin screens) that need the full rows.

Consumers checked in the repository: the only reader of `Challenge.participants` in the web is
`app/dashboard/page.tsx` (own row lookup); the admin participants page uses
`GET /challenges/:id/participants` with its own type; the ranking reads `email` only to paint it.
Backend e2e tests read `paid`/`paymentProofUrl` only from admin calls or from the caller's own
mutations. `active/list` with a participant token is asserted only for `id` and `isParticipant`.

## Goals / Non-Goals

**Goals:** no response to a PARTICIPANT carries another person's email or payment data; the
caller keeps their own payment state; admins see exactly what they see today; no schema change.

**Non-Goals:** Cloudinary delivery, upload signing, pot aggregates, anonymous ranking (see
proposal).

## Decisions

1. **D1 - Remove `participants` for PARTICIPANT instead of sending `{userId, name}[]`.** No web
   code needs it once the dashboard reads `me`; names are already in the ranking, the view
   designed for that; and it avoids sending the roster of a challenge the caller is not in.
   A future counter would use `_count`, as `findAll` does.
2. **D2 - `me` goes to every role.** It is the single source of the caller's payment state,
   also for an enrolled admin.
3. **D3 - Keep `isParticipant`** in `active/list`: `pickDefaultChallenge` uses it.
4. **D4 - Project in the controller with whitelists.** Services keep returning full models for
   internal flows and admin screens. Row projections use explicit key lists, so a new column
   cannot leak by omission; the top level of results passes through and is guarded by a
   key-set test.
5. **D5 - Typing without generic `keyof` tricks.** Export from `challenges.service.ts` a
   `participantsInclude` constant declared with `satisfies Prisma.ChallengeInclude` and derive
   `ChallengeWithParticipants = Prisma.ChallengeGetPayload<{ include: typeof participantsInclude }>`.
   `findActiveList`, `findActive` and `findOne` use the constant (removes the duplicated
   include). The projection function is generic only on the outer object (to keep
   `isParticipant`) and types the participant row against the concrete base type. Controller
   methods declare explicit return types. Must compile under `noImplicitAny` and
   `strictNullChecks`.
6. **D6 - 403, not 404, for someone else's activity.** Consistent with `remove`; ids are UUIDs.
   Unknown id stays 404 for every role.
7. **D7 - No compatibility fallback in the web.** 1.4.2 is the first production deploy, so no
   1.4.1 web is ever live against the new API. The web reads `challenge.me` only. Rolling back
   means redeploying 1.4.1 for both services, as the runbook already says.
8. **D8 - The activity-detail rule lives in `challenge-lifecycle`,** next to "Activities are
   scoped per challenge", which already holds the activity access rules; the heart-rate
   capability is about validity, not access.

## Risks / Trade-offs

- Dashboard regression for participants or an enrolled admin -> `me` for all roles, a unit
  test per role and a Playwright check of the payment state on the dashboard.
- Tests that use the ranking or roster with a participant token -> inventory above shows none;
  the full battery and catalog run must stay green.
- Playwright login budget (5 logins per minute per IP) -> the new suite uses the existing admin
  and participant tokens; the second participant (Bruno, from the seed) and his activity are
  created through admin endpoints (import commit), no extra login.
- Inference from public aggregates -> accepted, documented as residual risk.
- Payment proofs remain public URLs -> follow-up with Cloudinary delivery work.

## Migration Plan

Code only, released as 1.4.2 before the first production deploy: API first, then web, as the
runbook says. The runbook smoke test gains participant-token checks. Rollback: redeploy 1.4.1
(API and web); no data risk.

## Open Questions

None.
