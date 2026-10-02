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
- Changing what the API allows on `COMPLETED` challenges. Today `PATCH` can still edit a
  closed challenge's rules and move it back to `DRAFT`; the e2e fixtures rely on the latter to
  reset test data. Blocking it changes the lifecycle contract and the test infrastructure, so
  it is recorded as observation OBS-03 for a separate decision. The web never offers it.
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

### Period validation on update
`update` merges the incoming dates with the stored ones and applies the creation rule before
writing. The rule moves to a small shared helper so create and update cannot diverge.

## Risks / Trade-offs

- [Editing the scoring of an active challenge changes the live ranking] → expected behaviour;
  the form states it when the challenge is active.
- [A shortened period leaves activities outside it] → out of scope (non-goal); they keep
  counting as today. Noted in the guide.
