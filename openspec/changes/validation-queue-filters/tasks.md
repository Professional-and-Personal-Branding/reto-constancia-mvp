## 0. Approval

- [ ] 0.1 The owner approves these artifacts (proposal, design D1–D5, spec deltas and the default of P1); no code before that
- [ ] 0.2 Branch `feature/validation-queue-filters` from `develop` (one PR, API and web)

## 1. Tests first (backend)

- [ ] 1.1 Unit, `activities.service.spec.ts`: `findPending` passes `orderBy` ascending by default and descending with `desc`, and filters by `challengeId`; `findAll` without `order` keeps `desc`; `countPending` counts `PENDING` with `challenge.status = ACTIVE`
- [ ] 1.2 API e2e, `backend/test/platform-rules.e2e-spec.ts` (prefix `QUEUE:`): two active challenges and one closed; queue of A oldest first, `order=desc` reversed, tie broken by `createdAt`; no parameters lists every challenge including the closed one with `challenge.status`; `challengeId=abc` and `order=sideways` answer 400; count excludes the closed challenge and drops after a validation; participant gets 403 on both routes
- [ ] 1.3 Run them and check they fail for the expected reason

## 2. Backend

- [ ] 2.1 `QueryPendingDto` (`challengeId` `IsUUID` optional, `order` `IsIn(['asc','desc'])` optional) and `findPending(dto)`; `findAll` takes an optional order (default `desc`) and selects `challenge.name` and `challenge.status`
- [ ] 2.2 `GET /activities/pending/count` (admin, declared before `:id`) and `ActivitiesService.countPending()`; Swagger summaries
- [ ] 2.3 1.1 and 1.2 green

## 3. Web

- [ ] 3.1 `frontend/lib/pending.ts`: `pendingBadgeLabel(n)` (`null` for 0, number up to 99, "99+") with `frontend/lib/pending.test.ts`
- [ ] 3.2 Validations page: challenge selector ("Todos los retos" + active challenges), order toggle, both in the URL query (`reto`, `orden`); query key `['activities','pending', id ?? 'all', order]`; summary for the current filter
- [ ] 3.3 Card: challenge name; `COMPLETED` → badge "Reto cerrado" and no actions (D4)
- [ ] 3.4 `layout.tsx`: admin-only count query (`refetchInterval` 60 s), badge on "Validar" with `aria-label`; hidden on error or 0; check the header still fits (TC-UI-10)
- [ ] 3.5 `frontend/lib/types.ts`: `challenge.name`/`status` on the pending item

## 4. Playwright (bounded: extend one journey)

- [ ] 4.1 `e2e/tests/03-admin-validation.spec.ts`: new test "la cola filtra por reto, ordena de la más antigua y el menú muestra el contador" (two challenges, select one, toggle order, badge drops after validating)

## 5. QA catalog and docs

- [ ] 5.1 `docs/qa/catalog.mjs`: `TC-ACT-26` "Cola de validación por reto, orden y contador (API)" (links 1.1, 1.2) and `TC-UI-13` "Selector de reto, orden y contador en Validar" (links 3.1, 4.1); update `TC-ACT-11` if its expected text mentions the order
- [ ] 5.2 Guide step 5.2 (`docs/guia-plataforma.html`): selector, order and badge; refresh its capture if the guide suite covers the page
- [ ] 5.3 `docs/architecture.md` (endpoint table and the validation sequence), `CHANGELOG.md` `[Sin publicar]` (no migration)

## 6. Verification and PR

- [ ] 6.1 `node scripts/run-tests.mjs` 13/13, reset the database, `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"), `openspec validate --all --strict`
- [ ] 6.2 PR to `develop` in Spanish; the owner merges after the 3 CI jobs are green
