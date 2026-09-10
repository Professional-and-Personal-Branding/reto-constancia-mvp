## 1. Branch and baseline

- [x] 1.1 Create branch `feature/multi-active-challenges` from `develop` and verify `git branch --show-current` prints it
- [x] 1.2 Run the baseline (`cd backend && npx jest`, `cd frontend && npx tsc --noEmit`) and verify both are green before touching code

## 2. Backend lifecycle and resolution rules (TDD)

- [x] 2.1 Create `backend/src/challenges/challenges.service.spec.ts` with red tests for `activate()`: DRAFT -> ACTIVE; already ACTIVE -> returned unchanged without an update call; COMPLETED -> `BadRequestException`; unknown id -> `NotFoundException`. Verify the suite fails for the right reasons
- [x] 2.2 Implement `ChallengesService.activate(id)` and verify the tests from 2.1 pass
- [x] 2.3 Make `update()` delegate to `activate()` when `dto.status === ACTIVE` and still apply the other fields; add unit tests (COMPLETED + status ACTIVE -> 400; DRAFT + status ACTIVE + name -> ACTIVE and renamed). Verify green
- [x] 2.4 Add red tests for `findActiveList(userId)` (ordered by startDate desc, `isParticipant` computed, empty list) and `findActive(userId)` (participant-first, newest otherwise, null when none); implement both and verify green
- [x] 2.5 Wire the controller: `POST :id/activate` -> `activate()`; `GET active/list` and `GET active` receive the current user; declare both before `GET :id`; add `@ApiResponse` for 400/403. Verify `npm run build` passes and Swagger lists the new route
- [x] 2.6 Add e2e cases in `backend/test/app.e2e-spec.ts` (admin login via seed credentials): activate a second challenge -> 200 and both ACTIVE; re-activate -> 200; activate COMPLETED -> 400; participant activate -> 403; `GET /challenges/active/list` ordering and `isParticipant`; `GET /challenges/active` preference rule; same date registered in two challenges -> 201 twice; duplicate in one -> 409. Verify `npm run test:e2e` is green against the local DB on port 5433

## 3. Frontend selection

- [x] 3.1 Add `frontend/lib/use-active-challenge.ts` (query `['challenge','active-list']`, localStorage key `reto.selectedChallengeId` guarded with try/catch, default preference, external-store subscription) and verify `npx tsc --noEmit` passes
- [x] 3.2 Add `frontend/components/challenge-selector.tsx` and render it in `app/dashboard/layout.tsx` only when more than one challenge is active; verify with two active challenges that the selector appears and with one that it does not
- [x] 3.3 Replace the local active-challenge queries in `dashboard/page.tsx`, `dashboard/upload/page.tsx`, `dashboard/results/page.tsx` and `dashboard/admin/participants/page.tsx` with the hook; verify switching the selector changes activities, ranking, dates and participants shown
- [x] 3.4 In `dashboard/admin/challenges/page.tsx` show `ApiError` body messages for activate/close failures and invalidate `['challenge']` on success; verify a 400 from activating a COMPLETED challenge is rendered
- [x] 3.5 Run `npm run lint`, `npx tsc --noEmit` and `npm run build` in `frontend` and verify all pass

## 4. Regression script and docs

- [x] 4.1 Extend `scripts/parallel-session-test.mjs`: activate the December challenge (200), enroll Ana, `GET /challenges/active/list` returns both with correct `isParticipant`, `GET /challenges/active` for Ana returns the participant-first result, register the same date in both challenges (201 twice), rankings independent, close December and list shrinks. Verify the script exits 0 against the local API
- [x] 4.2 Update `docs/challenge-rules.md` (multi-active rule, lifecycle transitions, selection persistence) and `docs/architecture.md` (state diagram DRAFT -> ACTIVE -> COMPLETED, new endpoint); verify Mermaid renders
- [x] 4.3 Add the new cases to `docs/test-cases.md` and verify they map one-to-one to the spec scenarios

## 5. Verification and delivery

- [x] 5.1 Run `openspec validate multi-active-challenges --strict` and verify every scenario in `specs/challenge-lifecycle/spec.md` maps to a passing automated test or a manual check listed here
- [x] 5.2 Run backend lint+build+unit+e2e and frontend lint+build+tsc; verify all green locally
- [x] 5.3 Commit with Conventional Commits in English on `feature/multi-active-challenges` and open a PR to `develop`; verify CI is green
- [ ] 5.4 After merge, run `/opsx:archive multi-active-challenges` and verify `openspec/specs/challenge-lifecycle/spec.md` contains the requirements
