## Context

- `UploadService` (in `UploadCoreModule`) knows the base folder, the mode and the uploads dir.
  `saveLocal` stores `<uploadsDir>/<folder>/<uuid><ext>` and returns `public_id = <folder>/<uuid>`.
- `ActivityPhoto.cloudinaryId` has no unique constraint. `ChallengeParticipant` stores
  `paymentProofCloudinaryId`. Imported photos use `import/<userId>/<date>` ids that point to
  external URLs.
- `ActivitiesService.remove` deletes inside `withChallengeLock` (1.6.0), and `findOne` includes
  the photos. `uploadPaymentProof` updates the participant under the same lock.
- PDFs are uploaded as `image` resources (1.5.0), so `destroy` with `resource_type: 'image'`
  covers both purposes.
- `scripts/lib/test-db.mjs` shows how a script loads the backend's Prisma client and `.env`.

## Goals / Non-Goals

**Goals:** files of deleted activities are released; deletion can never break the user's action
or delete a file still in use; the owner can see the quota usage and the orphans.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - `deleteAsset(publicId): Promise<'deleted' | 'not_found'>`.**
   - Cloudinary: `uploader.destroy(id, { resource_type: 'image', invalidate: true })`. A
     `result` of `ok` gives `'deleted'`, `not found` gives `'not_found'`, anything else throws.
     Network errors propagate.
   - Local:
     1. resolve `dir = resolve(uploadsDir, dirname(id))` and refuse it unless it stays inside
        `uploadsDir`;
     2. find the file starting with `basename(id) + '.'` and remove it;
     3. if there is none, return `'not_found'`.
2. **D2 - `deleteAssetsLater(ids): Promise<void>`.** It never throws.
   1. Keep only managed ids: they start with `<base>/` and contain no `..`. Remove duplicates.
   2. For each id, count references: `activityPhoto.count({ cloudinaryId })` plus
      `challengeParticipant.count({ paymentProofCloudinaryId })`. If the count is above 0, skip
      it with a `debug` log ("still referenced").
   3. Otherwise call `deleteAsset`, through `Promise.allSettled`. A rejection logs `warn` with
      the id only, no names or emails; `not_found` logs `debug`.
   - It is called **after** the transaction commits, so the deleted row no longer counts as a
     reference.
   - The caller does not await it (`void`), so the HTTP response is unaffected. It returns the
     promise so tests can await it.
3. **D3 - Hooks.**
   - `ActivitiesService.remove` captures the photo ids from the locked re-read, deletes the row
     inside the transaction, then calls `deleteAssetsLater(ids)` outside it. If the transaction
     fails, nothing is deleted.
   - `uploadPaymentProof` reads the previous proof id inside the lock and updates the row. After
     the commit, if `UPLOAD_DELETE_REPLACED_PROOFS === 'true'` and the previous id exists and
     differs from the new one, it calls `deleteAssetsLater([previous])`.
   - `markPayment` no longer touches proofs (1.5.0), so it needs no hook.
4. **D4 - Orphan report `scripts/cloudinary-orphans.mjs`** (read-only).
   - Load the backend's Prisma client and `.env` like `scripts/lib/test-db.mjs`.
   - Collect every referenced id (photos and proofs).
   - Cloudinary mode: page `api.resources({ type: 'upload', resource_type: 'image', prefix:
     base + '/', max_results: 500, next_cursor })` and print `api.usage()`.
   - Local mode: walk `backend/uploads/<base>/`.
   - Category comes from the folder: `activity`, `payment-proof`, or `legacy` when the id does
     not follow `<base>/<uuid>/<uuid>/<purpose>/`.
   - Output: a table with id, size, date and category, the total in MB, then exit 0. Missing
     variables in Cloudinary mode exit 1 with a clear message. There is no delete option.

## Risks / Trade-offs

- A file shared by two records -> the reference check keeps it until the last one is gone.
- Seenode restarts during background cleanup -> the file stays orphaned and the monthly report
  shows it.
- Deleting financial evidence -> proofs are kept by default; the flag needs the owner's approval.
- Cloudinary deletion latency or errors -> never reach the user; they are logged.
- Local file name contract -> covered by a unit test and by e2e tests that check the disk.

## Migration Plan

No migration. Ships in the next minor release. `UPLOAD_DELETE_REPLACED_PROOFS` stays unset
(false) in Seenode until the owner decides otherwise. The monthly maintenance step is added to
the runbook.

## Open Questions

- Should replaced payment proofs be deleted? Default no; the owner can enable it later with the
  flag.
