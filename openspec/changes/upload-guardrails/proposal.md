## Why

Registration is public, so once the production URL opens anyone can create an account. Today
any logged-in user can spend the owner's Cloudinary quota and attach evidence that is not theirs
(verified in 1.4.2):

1. **The signature covers only `{folder, timestamp}`** (`upload.service.ts`): with a valid
   signature any format can be uploaded.
2. **The client chooses the folder and the resource type** (`SignUploadDto`: free `folder`,
   `resourceType` `image | raw | auto`), and `POST /upload/sign` only requires a session.
3. **Evidence accepts any URL.** Activity photos are checked with `@IsString` only; payment proofs
   with `@IsUrl` on any host. A participant can submit someone else's photo id or an external
   image.
4. **`markPayment` lets an admin write any proof URL/id**, a path no screen uses, and
   `uploadPaymentProof` does not check that the caller participates (it fails with a Prisma error
   instead of 403).
5. **The web groups uploads by month** (`YYYY-MM`, `payments/YYYY-MM`), which does not fit several
   active challenges at once.

This is the last item planned before the first deploy (release 1.5.0, with
`ops-observability-baseline`).

## What Changes

This is the minimum slice that closes those holes. Cleanup of storage is a later change.

- **Bound signatures:** `POST /api/upload/sign` takes `{ challengeId, purpose }` with `purpose`
  `activity | payment-proof`. The server derives the folder
  `<base>/<challengeId>/<userId>/<purpose>`, signs `allowed_formats`, `folder` and `timestamp`, and
  always returns an `image/upload` URL. The response adds `allowedFormats` and `maxBytes`. A body
  with `folder`, `resourceType` or any other field answers 400.
- **Only participants sign:** `activity` requires an `ACTIVE` challenge, `payment-proof` one that
  is not `COMPLETED`. Non-participants (admins included) get 403; an unknown challenge 404.
- **Allowed formats:** activity `heic,jpg,png,webp`; payment proof `heic,jpg,pdf,png,webp`.
- **Own evidence only:** every activity photo (all photo types, heart-rate captures included) and
  every payment proof must be the caller's own upload: its id under the caller's folder for that
  challenge and purpose, and its URL exactly the storage URL of that id with an allowed extension.
  Otherwise 400 and nothing is stored. Data imported by the admin (file or Google Sheets) does not
  go through this rule and keeps working.
- **Payment proofs:** a non-participant gets 403. **BREAKING (admin API):** `PATCH
  /challenges/:id/participants/:userId/payment` no longer accepts proof fields; admins record
  payments, participants upload their own proof.
- **Rate limit:** at most `UPLOAD_SIGN_LIMIT` signatures per minute per client (default 30),
  configurable so the test suites can raise it.
- **Local simulator** (development only): `POST /upload/local` accepts only the caller's own
  derived folder (participation checked) and the allowed formats, and normalizes `.jpeg` to `.jpg`
  like Cloudinary does.
- **Web:** uploads pass `challengeId` and `purpose`, forward `allowed_formats` exactly as signed,
  check the size before uploading, use `accept` lists that match the formats, and show Spanish
  messages for format and size errors.
- **Docs and tests:** e2e setup that forces local mode, fixtures that build owned assets, guide
  capture that uploads a real proof, runbook steps for the owner's Cloudinary account (PDF
  delivery, checks V1 to V5) and QA catalog cases.
- **BREAKING (API):** the signature contract changes; backend and web ship together.
- No migration, no new packages.

## Non-goals

- Deleting assets when an activity is withdrawn or a proof is replaced, the `deleteAsset`
  contract and the orphan listing script: follow-up change `upload-asset-cleanup`.
- A size limit enforced by Cloudinary (no stable signed parameter; a signed upload preset is the
  fallback if needed), mimetype sniffing and a custom 413 message in the local simulator.
- Admin uploading a proof on behalf of a participant, moderation or antivirus, moving existing
  assets (production does not exist yet), uploading imported images to Cloudinary, closing
  public registration, HEIC display transformations.

## Capabilities

### New Capabilities
- `upload-guardrails`: upload signatures bound to challenge, participant and purpose; allowed
  formats; rate limit; activity evidence must be the participant's own upload.

### Modified Capabilities
- `challenge-finance`: payment proofs must be the participant's own upload; admins cannot attach
  proofs.

## Impact

- Backend: new `upload/upload-policy.ts` (pure rules) and `upload/upload-core.module.ts`;
  `upload.service.ts`, `upload.controller.ts`, `upload.module.ts`, `dto/sign-upload.dto.ts`;
  `ChallengesService` participation helpers, `uploadPaymentProof`, `MarkPaymentDto`;
  `ActivitiesService.create` and its DTO; `common/http.ts` (sign limit).
- Web: `lib/cloudinary.ts`, `lib/types.ts`, `app/dashboard/upload/page.tsx`, `app/dashboard/page.tsx`.
- Tests: unit specs (policy, service, controller, challenges, activities); new
  `backend/test/setup-e2e.ts`; fixtures in API e2e suites, `e2e/fixtures/api.ts`,
  `scripts/parallel-session-test.mjs`, `e2e/guide/capture.spec.ts`; new e2e cases; QA catalog.
- Docs: runbook (Cloudinary setup, V1 to V5, variables), `.env.example`, guide, CHANGELOG.
- Owner: Cloudinary account with PDF delivery enabled; V1 to V5 before opening the URL.
