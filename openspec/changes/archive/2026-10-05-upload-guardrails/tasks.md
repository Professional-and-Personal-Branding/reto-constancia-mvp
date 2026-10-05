## 1. Policy and modules

- [x] 1.1 On `feature/upload-guardrails`, add `upload/upload-policy.ts` (D1) with `upload-policy.spec.ts`: exact formats; `folderFor`/`parseFolder`; `isOwnedAsset` accepts Cloudinary URLs with and without `v123/` and local URLs (also with a `PUBLIC_URL` path), and rejects another host, `res.cloudinary.com.evil.com`, another cloud, `http` in Cloudinary mode, another challenge, user or purpose, `..`, a URL of a different asset, `.pdf` for activities, `.jpeg`, another local origin; regex inputs escaped; base normalized
- [x] 1.2 `UploadCoreModule` (D2); `UploadModule` keeps the controller, imports `UploadCoreModule` and `ChallengesModule` and re-exports the core; `ChallengesModule` and `ActivitiesModule` import the core
- [x] 1.3 `ChallengesService.assertActiveParticipant` and `assertPaymentParticipant` (D3) with unit tests; `ActivitiesService.create` uses the first one keeping messages and order

## 2. Signatures and simulator

- [x] 2.1 `SignUploadDto { challengeId, purpose }`; `signUpload(challengeId, userId, purpose)` signs `allowed_formats, folder, timestamp`, returns `allowedFormats`, `maxBytes`, `image/upload` URL (D4); unit test against `api_sign_request`
- [x] 2.2 `resolveUploadSignLimit` in `common/http.ts` with its tests; `@Throttle` on `sign` (D5); controller unit test of the throttle metadata
- [x] 2.3 Local simulator rules (D8) with unit tests (foreign folder 403, `.gif` 400, `.jpeg` normalized)

## 3. Evidence

- [x] 3.1 `ActivitiesService.create`: repeated id 400, `assertOwnedAsset` for every photo type (D6); update `activities.service.spec.ts` (constructor and photo-based tests) and add the foreign-photo and heart-rate cases
- [x] 3.2 `uploadPaymentProof`: participant 403, own proof only; `MarkPaymentDto` without proof fields (D7); update `challenges.service.spec.ts` constructors and add the cases

## 4. Web

- [x] 4.1 `lib/cloudinary.ts` `uploadToCloudinary(file, challengeId, purpose)`: size check, forwards `allowed_formats`, Spanish messages; `CloudinarySignature` type
- [x] 4.2 Upload page and dashboard proof use the new call and matching `accept` lists

## 5. Tests and fixtures

- [x] 5.1 `backend/test/setup-e2e.ts` in `jest-e2e.json` `setupFiles` (D9) and `backend/test/helpers/assets.ts` (`ownedAsset`)
- [x] 5.2 Update fixtures: `platform-rules`, `activity-heart-rate`, `challenge-lifecycle` and other API e2e suites; `e2e/fixtures/api.ts` (`createActivity`); `scripts/parallel-session-test.mjs` (every `/uploads/test.png` use); `e2e/guide/capture.spec.ts` proof uploaded for real through `/upload/local`; Playwright env with a high `UPLOAD_SIGN_LIMIT`
- [x] 5.3 New API e2e cases: non-participant 403, `folder` in body 400, proof signature on a closed challenge 400, simulator `.gif` 400 and foreign folder 403, activity with `example.com` 400, foreign photo 400, foreign proof 400, admin proof fields 400 with the record unchanged; 429 in its own app instance
- [x] 5.4 Playwright: a PDF proof uploads from the dashboard; a PDF as activity photo shows the format message
- [x] 5.5 Grep gate: no `example.com`, `placehold.co` or legacy evidence ids left in backend tests, e2e or scripts; all suites green

## 6. Docs and verification

- [x] 6.1 QA catalog: update TC-UP-01 and TC-UP-02; new cases for formats per purpose, foreign evidence (activity and proof, admin proof fields), sign rate limit and local simulator; keep TC-UP-03; run the validator
- [x] 6.2 Runbook: Cloudinary setup (PDF delivery), V1 to V5 scheduled with the Seenode setup, `TRUST_PROXY` check for the sign limit, variables `UPLOAD_SIGN_LIMIT` and `UPLOAD_MAX_BYTES`; `.env.example`
- [x] 6.3 Guide (upload and proof steps, formats and messages) and `docs/challenge-rules.md` if it describes uploads; regenerate affected captures
- [x] 6.4 `CHANGELOG.md` Sin publicar (Security and the API contract notes); reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs`; record in `docs/testing.md`
- [x] 6.5 Open the PR to `develop`; after merge, archive the change and prepare release 1.5.0
