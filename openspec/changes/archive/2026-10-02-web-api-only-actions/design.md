## Context

See proposal.md. The API already supports all three actions: `PATCH /challenges/:id`
(admin), `DELETE /activities/:id` (own pending, or any for admins) and
`PATCH /challenges/:id/participants/:userId/payment` with `amountPaid`. The web lacks the
controls. `ChallengesService.create` checks `startDate < endDate`; `update` does not.

## Goals / Non-Goals

**Goals:**
- Give each action a web control that reuses the existing endpoints and messages.
- Close the period gap on update with the same rule and message as creation.

**Non-Goals:**
- Editing month or year (they are the challenge's unique key).
- Warning about existing activities that fall outside an edited period.

## Decisions

### One form for create and edit
`NewChallengeForm` becomes `ChallengeForm` with an optional `challenge` prop. In edit mode
it pre-fills every field, hides month and year, and sends only the changed fields through
`PATCH`. One form keeps validation and labels identical in both flows.
*Alternative:* a separate edit dialog. Rejected: duplicated fields drift apart.

### In-page confirmations, no browser dialogs
"Retirar" turns into "¿Retirar? Sí / No" in place. The same pattern is already used for
rejections and closing challenges, it is keyboard accessible, and it works where
`window.confirm` is blocked.

### Payment amount inline in the participant row
"Marcar pagado" opens an amount field pre-filled with the fee and a "Guardar pago" button.
The default path (full payment) stays one confirmation away; a partial amount is just a
different number. The summary refreshes through the existing query invalidation.

### Closed challenges are final in the API (OBS-03)
`update` rejects any change once the challenge is `COMPLETED`, before looking at the fields,
with the message the participant endpoints already use. Awards stay allowed: they are the
way to record a prize drawn after closing, and `POST /awards` does not touch rules or dates.
*Alternative:* block only rule fields and keep `status: DRAFT` as an admin "reopen". Rejected:
the lifecycle spec already says a closed challenge cannot be reactivated, and a reopen path
would let the final results drift.

### Test data no longer reopens challenges
The Playwright fixture, the guide capture suite and the parallel-session script reopened
closed challenges to reuse a month. They now call a shared helper (`scripts/lib/test-db.mjs`)
that deletes their own test challenges by month and year with Prisma; participants,
activities and awards go with them through the existing cascades. The helper is test-only: it
refuses any `DATABASE_URL` whose host is not local, and it only deletes the month/year pairs it
is given. This mirrors what the backend e2e suites already do through `PrismaService`.
*Alternative:* an admin `DELETE /challenges/:id` endpoint. Rejected: it would add a destructive
production endpoint just to serve tests.

### Period validation on update
`update` merges the incoming dates with the stored ones and applies the creation rule before
writing. The rule moves to a small shared helper so create and update cannot diverge.

## Risks / Trade-offs

- [Editing the scoring of an active challenge changes the live ranking] → expected behaviour;
  the form states it when the challenge is active.
- [A shortened period leaves activities outside it] → out of scope (non-goal); they keep
  counting as today. Noted in the guide.
