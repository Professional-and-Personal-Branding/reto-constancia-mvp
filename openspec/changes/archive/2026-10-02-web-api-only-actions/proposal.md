## Why

Three everyday actions exist only in the API, so admins and participants need someone to
call it by hand (observation OBS-02 in the QA catalog):

- an admin cannot fix a challenge's rules (dates, valid days, fee, prize, scoring) after
  creating it;
- a participant cannot withdraw a pending activity they registered by mistake;
- an admin cannot record a partial payment, only "paid in full" or "unpaid".

While reviewing the edit path we also found that updating a challenge does not check the
period the way creation does, so an edit can leave `startDate` after `endDate`, and that the
API still lets an admin edit a closed challenge or move it back to draft (observation OBS-03):
changing a closed challenge's scoring rewrites its final ranking and winners.

## What Changes

- **Edit a challenge from the web:** the admin challenges list gets an "Editar" action for
  draft and active challenges. It opens the same form as creation, pre-filled; month and
  year stay fixed. Closed challenges are read-only in the web.
- **Withdraw a pending activity:** "Mis actividades" shows "Retirar" on the participant's
  pending activities, with an in-page confirmation. Validated and rejected activities show no
  action.
- **Partial payment:** the admin participants page lets the admin enter the amount received
  when marking a payment; less than the fee shows as partial with what is still owed.
- **API:** updating a challenge validates the resulting period (`startDate` before `endDate`),
  with the same message as creation.
- **API, BREAKING for tooling:** a `COMPLETED` challenge is final. `PATCH /challenges/:id`
  rejects any change to it, including its status, with 400 "No se puede modificar un reto
  cerrado". Registering the award of a closed challenge stays allowed (it is how a prize drawn
  in person is recorded). Test tooling that reopened closed challenges to reset its data now
  deletes its own test challenges directly in a local database instead.
- QA catalog: OBS-02 and OBS-03 are resolved and the three cases gain web journeys; guide steps 2.3, 3.3
  and 4.5 stop saying "vía API".

## Capabilities

### New Capabilities
- `activity-withdrawal`: participants withdraw their own pending activities from the web,
  under the existing API rules (own and pending only; admins may delete any).

### Modified Capabilities
- `challenge-lifecycle`: adds editing a draft or active challenge's rules from the web, the
  period validation on update, and closed challenges being final.
- `challenge-finance`: adds recording a partial payment amount from the web.

## Impact

- **Frontend:** `app/dashboard/admin/challenges/page.tsx` (form reused for editing),
  `app/dashboard/admin/participants/page.tsx` (amount input), `app/dashboard/page.tsx`
  (withdraw action).
- **Backend:** `ChallengesService.update` validates the period and rejects changes to closed
  challenges. No new endpoints, no schema changes.
- **Test tooling:** `e2e/fixtures/api.ts`, `e2e/guide/capture.spec.ts` and
  `scripts/parallel-session-test.mjs` stop reopening challenges; a shared helper deletes their
  test challenges in the local database (it refuses non-local databases).
- **Tests:** API e2e for the period validation, Playwright journeys for the three actions, QA
  catalog and guide updates.
