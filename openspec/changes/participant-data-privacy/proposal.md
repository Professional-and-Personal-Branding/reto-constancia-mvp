## Why

The production URL will be public, and today the API hands every logged-in user the contact and
payment data of everyone else in the challenge. Verified in the code (1.4.1):

| # | Leak | Where |
|---|---|---|
| 1-2 | `GET /challenges/:id/results` returns each participant's `email` and `paid` in `ranking`, `tiedAtTop` and `winners`, and the winner's `email` in `awards`, to any role | `results.service.ts` (`ParticipantRanking`, `ChallengeAwardResult`); controller has no `@Roles` |
| 3 | The web paints every participant's email in the ranking, for any role | `frontend/app/dashboard/results/page.tsx` |
| 4 | **Most serious.** `GET /challenges/active/list` returns full `ChallengeParticipant` rows (`paid`, `paidAt`, `amountPaid`, `paymentProofUrl`, `paymentProofCloudinaryId`, `paymentProofUploadedAt`) plus `user.email` to any role | `challenges.service.ts` `findActiveList` (`include participants` with no `select`) |
| 5-6 | `GET /challenges/active` and `GET /challenges/:id` do the same | `findActive`, `findOne` |
| 7 | Any participant can list the enrolled users with `email`, `role` and `active` | `GET /challenges/:id/participants`, no `@Roles` |
| 8 | Any logged-in user can open any activity (photos, heart-rate data, owner's email) | `GET /activities/:id`, no owner check |

Someone who did not pay can still win (settled decision), so exposing `paid` per person singles
them out, and a payment proof is a financial document. Participants do not need any of this:
the ranking only paints the email, and the dashboard only looks for the caller's own row.

## What Changes

- **Role-based projection, no schema change, no migration.**
- `GET /challenges/active/list`, `GET /challenges/active` and `GET /challenges/:id` always add
  `me`: the caller's own enrolment (`paid`, `paidAt`, `amountPaid`, `paymentProofUrl`,
  `paymentProofUploadedAt`, `joinedAt`) or `null`. For a PARTICIPANT the `participants` key is
  removed. ADMIN keeps today's full response plus `me`. `isParticipant` stays in `active/list`.
- `GET /challenges/:id/results` for a PARTICIPANT: rows of `ranking`, `tiedAtTop` and `winners`
  keep only `userId, name, validatedDays, pendingDays, rejectedDays, totalKm, score, qualified`;
  rows of `awards` keep `userId, name, awardedAt, notes`. Every top-level field, including
  `payout`, is unchanged. ADMIN unchanged.
- `GET /challenges/:id/participants` becomes admin-only (403 for participants).
- `GET /activities/:id`: only the owner or an admin; anyone else gets 403 "No puedes ver esta
  actividad"; unknown id stays 404. The response shape for owner and admin is unchanged.
- **BREAKING (API contract):** participants no longer receive `participants`, `email` or `paid`
  in those responses. The web of the same release is the only consumer.
- Web: the ranking shows emails only to admins (participants see names and "(tú)"); the
  dashboard reads the caller's payment state from `me`.
- Swagger: 403 responses and updated summaries on the restricted endpoints.
- QA catalog: six security cases (TC-SEC-06 to TC-SEC-11); guide note in step 6.1 and
  regenerated ranking screenshots; CHANGELOG 1.4.2 with Security and API contract notes.
- Target: **1.4.2**, tagged before the first production deploy.

## Non-goals

- Signed or authenticated Cloudinary delivery: whoever already has a proof URL keeps it.
- Restricting who can sign uploads (`POST /upload/sign` lets any logged-in user pick the folder,
  including payment proofs): covered by the planned `upload-guardrails` change.
- Hiding pot aggregates: `payout` is public by decision, so in a small group someone can infer
  how many have not paid. This change guarantees no field identifies another person's payment.
- `GET /challenges` (all challenges, `_count` only), admin-only endpoints (finance, awards,
  import), `GET /auth/me`, and responses to the caller's own mutations.
- Anonymous ranking, per-user privacy settings, access auditing.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-lifecycle`: challenge reads are projected by role; the roster is admin-only; activity
  detail is visible to its owner or an admin.
- `challenge-scoring`: results hide other participants' contact and payment data.
- `challenge-finance`: payment state is visible only to its owner and the admin; the results page
  shows emails only to admins.

## Impact

- Backend: new `backend/src/challenges/privacy.ts` (pure projection functions), changes in
  `challenges.controller.ts`, `activities.controller.ts`, `activities.service.ts`, a shared
  include constant in `challenges.service.ts`.
- Frontend: `lib/types.ts`, `app/dashboard/page.tsx`, `app/dashboard/results/page.tsx`.
- Tests: unit (`privacy.spec.ts`, `activities.service.spec.ts`), API e2e block in
  `platform-rules.e2e-spec.ts`, Playwright `e2e/tests/11-privacy.spec.ts`, regenerated guide
  captures, `docs/qa/catalog.mjs`.
- Docs: guide step 6.1, runbook smoke test, CHANGELOG.
- Deploy: none special. No migration; rollback is redeploying 1.4.1 (API and web).
