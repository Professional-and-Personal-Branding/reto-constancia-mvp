## 1. Deletion contract and cleanup

- [x] 1.1 On `feature/upload-asset-cleanup`, `deleteAsset` with the explicit contract (D1): Cloudinary `ok`/`not found`/other/network error; local finds `<id>.<ext>`, refuses paths outside `uploads/`, `not_found` when missing; unit tests
- [x] 1.2 `deleteAssetsLater` (D2): managed ids only, no duplicates, reference check over photos and proofs, `allSettled`, warn/debug logs without personal data, never throws; unit tests (rejection, not found, still referenced by a photo, referenced as a proof, `import/...` ignored)

## 2. Hooks

- [x] 2.1 `ActivitiesService.remove` (D3): ids from the locked re-read, cleanup after the commit, nothing when the deletion fails (closed challenge, 403); unit tests
- [x] 2.2 `uploadPaymentProof` (D3): previous id read under the lock; cleanup after the commit only with `UPLOAD_DELETE_REPLACED_PROOFS=true` and a different id; unit tests for off, on and the same id
- [x] 2.3 API e2e in local mode: withdrawing an activity uploaded through the simulator removes its files from disk; a file shared by two activities is kept; an `import/...` photo triggers no deletion; a replaced proof stays on disk by default

## 3. Orphan report

- [x] 3.1 `scripts/cloudinary-orphans.mjs` (D4) with Cloudinary and local modes, categories, total and usage; exit 1 without credentials outside local mode
- [x] 3.2 Smoke test in local mode (one referenced and one orphan file) wired into the catalog

## 4. Docs and verification

- [x] 4.1 Runbook: monthly maintenance (usage, 70 % alert, report, manual decision), variable `UPLOAD_DELETE_REPLACED_PROOFS`; `.env.example`
- [x] 4.2 QA catalog cases; `CHANGELOG.md` Sin publicar; reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs`; record in `docs/testing.md`
- [ ] 4.3 Open the PR to `develop` with the 3 CI jobs green; after merge, archive the change
