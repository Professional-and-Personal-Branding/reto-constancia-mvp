## 1. Branch and baseline

- [ ] 1.1 Create branch `feature/enforce-heart-rate-minutes` from `develop` (after PR #5 is merged) and verify `git branch --show-current` prints it
- [ ] 1.2 Run the baseline (`cd backend && npm run lint && npx jest`, `cd frontend && npx tsc --noEmit`) and verify all green

## 2. Compliance rule (TDD)

- [ ] 2.1 Create `backend/src/activities/activities.service.spec.ts` with red tests for `assessHeartRate()`: compliant; below minimum (reason mentions the minimum); missing `HEART_RATE` photo; `hasHeartRateProof` false with photo present; `minHeartRateMinutes = 0` -> compliant. Verify they fail for the right reason
- [ ] 2.2 Implement `assessHeartRate()` as a pure method and verify 2.1 passes
- [ ] 2.3 Add red tests for `create()`: non-compliant -> `BadRequestException` whose message includes the minimum; `hasHeartRateProof: true` without `HEART_RATE` photo -> `BadRequestException`; compliant -> creates and returns `heartRateCompliant: true`. Implement and verify green
- [ ] 2.4 Add red tests for `validate()`: non-compliant without body -> `BadRequestException` and no update; with `{ override: true, note }` -> update called with `validationNote`; compliant without body -> validated with `validationNote: null`. Implement `ValidateActivityDto` (`override?: boolean`, `note?: string` 5..300) and the service logic; verify green
- [ ] 2.5 Add `heartRateCompliant` mapping (`withCompliance`) to `findAll()`, `findMine()`, `findPending()`, `findOne()`, `create()`, `validate()`, `reject()`; add a unit test on `findPending()` mapping two activities (true/false); verify green

## 3. Schema and DTOs

- [ ] 3.1 Add `validationNote String?` to `DailyActivity` in `schema.prisma` and create migration `add_activity_validation_note` with `npx prisma migrate dev`; verify `npx prisma migrate deploy` on a fresh DB applies it and `prisma generate` compiles
- [ ] 3.2 Change `minHeartRateMinutes` validation to `@Min(0)` in `CreateChallengeDto` and `UpdateChallengeDto`; add a unit/e2e assertion that `minHeartRateMinutes: 0` is accepted
- [ ] 3.3 Wire `POST /activities/:id/validate` to accept the optional `ValidateActivityDto` body and document `400` in Swagger; verify `npm run build` and `/api/docs`

## 4. Import warnings

- [ ] 4.1 Extend `import.service.spec.ts` with red tests: preview marks a 15-minute row without proof as valid with one warning mentioning the minimum and the capture; summary `warnings` counts it; a compliant row has no warnings
- [ ] 4.2 Implement `warnings` per `PreviewRow` and `summary.warnings` in `preview()` using `assessHeartRate()` against the resolved challenge; verify 4.1 passes and `commit()` behavior is unchanged (existing tests green)
- [ ] 4.3 Update `docs/import-template.md` to describe warnings vs errors; verify the sample template still previews with 1 warning (bruno row) and 0 errors

## 5. E2E

- [ ] 5.1 Create `backend/test/activity-heart-rate.e2e-spec.ts` (self-cleaning, year 2201 data): challenge with `minHeartRateMinutes = 30`; register 20 min with capture -> 400 mentioning 30; register 45 min without `HEART_RATE` photo -> 400; `hasHeartRateProof: true` without photo -> 400; compliant -> 201 with `heartRateCompliant: true`; create a non-compliant pending activity via Prisma, validate without body -> 400, with override+note -> 200 and `validationNote`; challenge with `minHeartRateMinutes: 0` accepts 5-minute activity. Verify `npm run test:e2e` green locally and in CI

## 6. Frontend

- [ ] 6.1 Update `lib/types.ts` (`heartRateCompliant`, `validationNote`, preview `warnings`) and verify `npx tsc --noEmit`
- [ ] 6.2 Upload page: compute client-side compliance from minutes + capture + challenge minimum; disable submit with an inline explanation; verify manually with a 30-minute challenge (20 min blocked, 30 min + capture enabled)
- [ ] 6.3 Validations page: compliance badge from `heartRateCompliant`; for non-compliant activities "Validar" opens a note field and sends `{ override: true, note }`; show `validationNote` after validation; verify manually the 400 path is no longer reachable from the UI
- [ ] 6.4 Import page: render row `warnings` and `summary.warnings`; admin challenge form allows 0 with hint; verify `npm run lint && npm run build`

## 7. Regression script and docs

- [ ] 7.1 Add section 9 to `scripts/parallel-session-test.mjs`: registration below the December minimum (30) -> 400 mentioning 30; compliant registration -> 201 `heartRateCompliant: true`; admin validate of a non-compliant pending (created with `PENDING` via import or a low-minimum challenge) -> 400 then 200 with override; clean up. Update existing fixtures to include a `HEART_RATE` photo. Verify the script exits 0
- [ ] 7.2 Update `docs/challenge-rules.md` (Gap #2 resolved, rule definition, override, `0` disables), `docs/test-cases.md` (TC-ACT-13..16), `docs/architecture.md` (validation flow note); verify Mermaid renders

## 8. Verification and delivery

- [ ] 8.1 Run `openspec validate enforce-heart-rate-minutes --strict` and map every scenario to a test or manual check above
- [ ] 8.2 Backend lint+build+unit+e2e and frontend lint+tsc+build green locally
- [ ] 8.3 Conventional Commits on `feature/enforce-heart-rate-minutes`, PR to `develop`, CI green
- [ ] 8.4 After merge: `/opsx:archive enforce-heart-rate-minutes` and verify `openspec/specs/activity-heart-rate-compliance/spec.md`
