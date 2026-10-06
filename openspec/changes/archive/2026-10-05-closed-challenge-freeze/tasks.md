## 1. PR 1 - Locking and freezing

- [x] 1.1 On `feature/closed-challenge-freeze`, add `challenges/challenge-lock.ts` (D1): `lockChallenge` (share/update, `SET LOCAL lock_timeout`), `withChallengeLock`, `isLockTimeout` with unit tests for the 409 translation of `P2028`, `P2010`/`55P03` and unknown request errors
- [x] 1.2 Activities (D2): validate, reject and delete check the lock first (400 before role/ownership), re-read the activity, keep the heart-rate rule and permissions; `create` runs participation and insert under the lock with the `P2002` catch outside; Swagger 400/409; rewrite the unit mocks for interactive transactions
- [x] 1.3 Challenges (D2): `addParticipant`, `removeParticipant`, `markPayment`, `uploadPaymentProof`, non-closing `update` and `activate` under the lock; unit tests
- [x] 1.4 Import (D3): preview marks closed rows; commit checks the status before creating users, runs each row in `withChallengeLock`, counts only after commit; unit tests including a close in the middle of a commit
- [x] 1.5 Fixtures (D7): `e2e/fixtures/api.ts closeChallenge` clears activities only while `ACTIVE`; `scripts/parallel-session-test.mjs` deletes its December activity before closing
- [x] 1.6 API e2e: validate, reject and delete after closing answer 400 for admin, owner and stranger; participants, payments and rules stay blocked; a closed-challenge import row (file import in `platform-rules.e2e-spec.ts`; the sheet import shares the same code path); a deterministic lock test (another transaction holds `FOR UPDATE` for more than 5 s, validate answers 409 and nothing changes)
- [x] 1.7 Lint, `tsc`, unit and API e2e green; open PR 1 to `develop`

## 2. PR 2 - Closing step and stored draw

- [x] 2.1 `scoring.ts`: Fisher–Yates with injectable `rand`; `selectWinners` returns `guaranteed`, `drawPool`, `drawSeats` (D4); tests for a fixed permutation, uniformity with a seeded generator (60,000 samples, 1/6 ± 0.01), a smoke test with the real `randomInt` and the invariant across `DRAW`, partial and resolved `TOTAL_KM` and `SHARE_ALL`
- [x] 2.2 `results.service.ts`: `computeResults(db, id)`, the automatic-draw note and `drawNeeded = false` when all awards are automatic (D6); public contract unchanged; unit tests
- [x] 2.3 `ChallengesService.closeTx`/`close` (D5): `FOR UPDATE` with a 10 s lock timeout, `DRAFT` 400, idempotent `COMPLETED`, award participants validated under the lock, stored draw; `award()` and the closing branch of `update()` (using `onlyClosing`) go through it; controller `POST /close` calls `close()`; unit tests
- [x] 2.4 `AwardChallengeDto` rejects the reserved note (trimmed); unit test
- [x] 2.5 API e2e: closing a `DRAFT` 400 (close, PATCH, awards); mixed closing PATCH 400; `DRAW` tie closed gives two stored awards and identical results on repeated reads; `TOTAL_KM` partial tie; awards after closing replace the automatic ones; reserved note 400; existing award and close tests stay green
- [x] 2.6 Playwright `08-closed-results` and the guide captures stay green

## 3. Docs and verification

- [x] 3.1 QA catalog: closed-challenge activities final; stored and stable draw; only active challenges close and mixed PATCH rejected; replacing the automatic draw and reserved note; import rows of a closed challenge; lock timeout 409; update TC-CHAL-13; run the validator
- [x] 3.2 `docs/challenge-rules.md` (what a closed challenge freezes, the stored draw), guide (closing, awarding closes the challenge, phase 7 order: create, activate, import, then "Guardar premiación" on the active challenge)
- [x] 3.3 `CHANGELOG.md` Sin publicar with the behaviour changes for API callers; reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs`; record in `docs/testing.md`
- [x] 3.4 Open PR 2 to `develop`; after merge, archive the change
