## Why

Cloudinary's free plan has a fixed quota of storage, bandwidth and transformations. Since 1.5.0
every photo and payment proof lives in a per-challenge, per-user folder, but nothing is ever
deleted:

- **Withdrawn and deleted activities leave their photos behind.** `ActivitiesService.remove`
  deletes the row and never touches the files.
- **A replaced payment proof leaves the old file behind.** `uploadPaymentProof` overwrites the
  stored id.
- **`UploadService.deleteAsset` is never called, and it is broken in local mode.**
  - The simulator stores `<id>.<ext>` but receives a `public_id` without extension, so `fs.rm`
    deletes nothing and reports nothing.
  - In Cloudinary mode it swallows every error, and `destroy` answers `{ result: 'not found' }`
    instead of failing, so callers cannot tell success from failure.
- **Nobody can see what is taking space.** There is no way to list files that no record points
  to (abandoned uploads, files of deleted participants or challenges).

## What Changes

- **Explicit `deleteAsset` contract.**
  - It returns `'deleted'` or `'not_found'` and throws on any other outcome.
  - Cloudinary mode: `destroy` with `resource_type: 'image'` and `invalidate: true`.
  - Local mode: finds `<publicId>.<ext>`, refuses paths outside `uploads/` and works for real.
- **Best-effort cleanup, never blocking.** `deleteAssetsLater(ids)` runs after the database
  commit. It only touches ids under the configured base folder, never `import/...` ones, and skips
  any id still referenced by another photo or by a payment proof. Failures are logged as `warn`
  with the public id, and `not_found` as `debug`. The user's response never changes.
- **Withdrawing or deleting an activity** releases its photos through that cleanup. Since 1.6.0
  this only happens in challenges that are not closed.
- **Replaced payment proofs are kept by default.** They are financial evidence, so the old file
  is deleted only when `UPLOAD_DELETE_REPLACED_PROOFS=true`. Enabling it needs the owner's
  approval.
- **Read-only orphan report** `node scripts/cloudinary-orphans.mjs`. It lists files under the
  base folder that no record references, with size, date and category (`activity`,
  `payment-proof` or `legacy`), plus the total and Cloudinary's usage. It deletes nothing, and in
  local mode it walks `backend/uploads/`.
- **Runbook:** a monthly maintenance step (usage review, alert at 70 %, run the report, decide
  manually) and the new variable.
- No migration, no new packages, no change to the API responses.

## Non-goals

- Automatic deletion of orphans. The script only reports; a `--apply` mode would be its own
  change.
- Cleaning files when a participant or a challenge is removed: the report finds them.
- Changing the upload rules of `upload-guardrails`.
- Deleting replaced proofs by default.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `upload-guardrails`: storage deletion contract, never-blocking cleanup with reference checks,
  orphan report.
- `activity-withdrawal`: deleting an activity releases its photos.
- `challenge-finance`: replaced proofs are kept unless explicitly configured.

## Impact

- Backend:
  - `upload/upload.service.ts` (`deleteAsset`, `deleteAssetsLater`);
  - `activities/activities.service.ts` (`remove`);
  - `challenges/challenges.service.ts` (`uploadPaymentProof` behind the flag).
- New `scripts/cloudinary-orphans.mjs` (Cloudinary and local modes).
- Tests:
  - unit tests for the contract, cleanup, hooks and flag;
  - API e2e that checks files in local mode: deleted, shared and kept;
  - a script smoke test in local mode;
  - QA catalog.
- Docs: runbook (maintenance, variable), `.env.example`, `docs/testing.md`, CHANGELOG.
