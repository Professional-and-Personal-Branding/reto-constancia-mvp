## Why

Three everyday actions exist only in the API, so admins and participants need someone to
call it by hand (observation OBS-02 in the QA catalog):

- an admin cannot fix a challenge's rules (dates, valid days, fee, prize, scoring) after
  creating it;
- a participant cannot withdraw a pending activity they registered by mistake;
- an admin cannot record a partial payment, only "paid in full" or "unpaid".

While reviewing the edit path we also found that updating a challenge does not check the
period the way creation does, so an edit can leave `startDate` after `endDate`.

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
- QA catalog: OBS-02 is resolved and the three cases gain web journeys; guide steps 2.3, 3.3
  and 4.5 stop saying "vía API".

## Capabilities

### New Capabilities
- `activity-withdrawal`: participants withdraw their own pending activities from the web,
  under the existing API rules (own and pending only; admins may delete any).

### Modified Capabilities
- `challenge-lifecycle`: adds editing a draft or active challenge's rules from the web and the
  period validation on update.
- `challenge-finance`: adds recording a partial payment amount from the web.

## Impact

- **Frontend:** `app/dashboard/admin/challenges/page.tsx` (form reused for editing),
  `app/dashboard/admin/participants/page.tsx` (amount input), `app/dashboard/page.tsx`
  (withdraw action).
- **Backend:** `ChallengesService.update` validates the period. No new endpoints, no schema
  changes.
- **Tests:** API e2e for the period validation, Playwright journeys for the three actions, QA
  catalog and guide updates.
