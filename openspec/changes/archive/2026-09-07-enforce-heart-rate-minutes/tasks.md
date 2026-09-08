## 1. Branch and baseline

- [x] 1.1 Create branch `feature/enforce-heart-rate-minutes` from `develop` and verify `git branch --show-current` prints it
- [x] 1.2 Run the baseline (`cd backend && npm run lint && npx jest`, `cd frontend && npx tsc --noEmit`) and verify all green

## 2. Schema and DTOs

- [x] 2.1 Add `heartRateMinutes Int?` and `validationNote String?` to `DailyActivity` in `schema.prisma`; create migration `add_activity_heart_rate_minutes_and_validation_note` with `npx prisma migrate dev`; verify `prisma generate` compiles and `migrate deploy` applies on the local DB
- [x] 2.2 Add `heartRateMinutes?: number` (`@IsInt() @Min(1)`) to `CreateActivityDto`; create `ValidateActivityDto` (`override?: boolean`, `note?: string` 5..300); change `minHeartRateMinutes` to `@Min(0)` in `CreateChallengeDto`/`UpdateChallengeDto`; verify `npm run build`

## 3. Compliance rule (TDD)

- [x] 3.1 Create `backend/src/activities/activities.service.spec.ts` with red tests for `assessHeartRate()`: compliant; minutes below minimum (reason mentions the minimum); missing minutes; missing proof; `minHeartRateMinutes = 0`. Verify they fail for the right reason, then implement and verify green
- [x] 3.2 Add red tests for `create()`: `heartRateMinutes > durationMinutes` -> 400; `hasHeartRateProof` derived from photos; non-compliant -> 400 whose message includes the minimum; compliant -> created with `heartRateCompliant: true`. Implement and verify green
- [x] 3.3 Add red tests for `validate()`: non-compliant without body -> 400 and no update; with `{ override: true, note }` -> update called with `validationNote`; compliant without body -> `validationNote: null`. Implement and verify green
- [x] 3.4 Implement `withCompliance()` mapping in `findAll()`, `findOne()`, `create()`, `validate()`, `reject()` (lists include the challenge minimum, mapper strips it); unit test `findPending()` mapping two activities (true/false); verify green
- [x] 3.5 Wire `POST /activities/:id/validate` to accept the optional body and document 400 in Swagger; verify build

## 4. Import

- [x] 4.1 Extend `import.service.spec.ts` with red tests: `heartRateMinutes` parsed; `heartRateMinutes > durationMinutes` -> row error; template headers include the column; preview of a row without minutes/proof in a challenge with minimum 20 -> valid with one warning and `summary.warnings = 1`; compliant row -> no warnings
- [x] 4.2 Implement the column in `TEMPLATE_HEADERS`, `validateRow()`, `applyRow()` and the sample rows; implement `warnings` in `preview()` via `assessHeartRate()`; verify 4.1 and existing import tests green
- [x] 4.3 Update `docs/import-template.md` and `docs/import-template.csv` (new column, warnings vs errors); verify the CSV parses with the service (unit test on the doc file or manual preview)

## 5. E2E

- [x] 5.1 Create `backend/test/activity-heart-rate.e2e-spec.ts` (self-cleaning, year 2201 data): challenge with `minHeartRateMinutes = 30`; `heartRateMinutes` 20 + capture -> 400 mentioning 30; 45 min without `HEART_RATE` photo -> 400; capture without minutes -> 400; `heartRateMinutes > durationMinutes` -> 400; compliant -> 201 with derived `hasHeartRateProof: true` and `heartRateCompliant: true`; non-compliant pending created via Prisma: validate no body -> 400, with override+note -> 200 and `validationNote`; challenge with `minHeartRateMinutes: 0` accepts an activity without minutes/capture. Verify `npm run test:e2e` green

## 6. Frontend

- [x] 6.1 Update `lib/types.ts` (`heartRateMinutes`, `validationNote`, `heartRateCompliant`, preview `warnings`) and verify `npx tsc --noEmit`
- [x] 6.2 Upload page: "Minutos con FC" input, client-side compliance (minimum, capture, not above duration), disabled submit with explanation, send `heartRateMinutes`; verify in the browser with the December challenge (min 30): 20 min blocked, 30 min + capture enabled
- [x] 6.3 Validations page: "FC registrada" field, compliance badge, override-note flow sending `{ override: true, note }`, show `validationNote`; verify in the browser that a non-compliant pending activity requires the note
- [x] 6.4 Import page: render row `warnings` and `summary.warnings`; challenge form allows 0 with hint; verify `npm run lint && npm run build`

## 7. Seed, regression script and docs

- [x] 7.1 Seed: set `heartRateMinutes` on seeded activities (compliant demo data); verify `npm run prisma:seed` and that the dashboard shows compliant activities
- [x] 7.2 `scripts/parallel-session-test.mjs`: fixtures gain `heartRateMinutes` and a `HEART_RATE` photo; new section 9: below-minimum registration in December (min 30) -> 400 mentioning 30; compliant -> 201 `heartRateCompliant: true`; validate a non-compliant pending activity -> 400 then 200 with override; clean up. Verify exit 0
- [x] 7.3 Update `docs/challenge-rules.md` (Gap #2 resolved, rule, override, `0` disables), `docs/test-cases.md` (TC-ACT-13..17), `docs/architecture.md` (data model + validation flow); verify Mermaid renders

## 8. Verification and delivery

- [x] 8.1 `openspec validate enforce-heart-rate-minutes --strict`; map every scenario to a test or manual check above
- [x] 8.2 Backend lint+build+unit+e2e and frontend lint+tsc+build green locally
- [x] 8.3 Conventional Commits on `feature/enforce-heart-rate-minutes`, PR to `develop`, CI green
- [ ] 8.4 After merge: `/opsx:archive enforce-heart-rate-minutes` and verify `openspec/specs/activity-heart-rate-compliance/spec.md`
