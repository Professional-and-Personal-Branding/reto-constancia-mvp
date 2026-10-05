## 1. Readiness and shutdown

- [x] 1.1 On `feature/ops-observability-baseline`, add `PrismaService.ping()` and the "Conexión a la base cerrada" log in `onModuleDestroy`; `GET /api/health/db` throws `ServiceUnavailableException` (503, same body) with `@ApiServiceUnavailableResponse`
- [x] 1.2 `main.ts`: `app.enableShutdownHooks()` (no `useProcessExit`)

## 2. Request context and access log

- [x] 2.1 `common/request-log.ts` (pure): `REQUEST_ID_PATTERN`, `resolveRequestId`, `resolveRoute`, `accessLogLevel` (D4), `buildRequestLogEntry` (whitelist only) with `request-log.spec.ts` (valid/invalid ids, redaction of body/query/headers, 499 abort entry, levels)
- [x] 2.2 `common/request-context.ts`: `applyRequestContext(app)` (D2) with `request-context.spec.ts` (one line per `close`, finished vs aborted, repeated `close` ignored); call it in `main.ts` right after `NestFactory.create(...)`; CORS `exposedHeaders: ['X-Request-Id']`
- [x] 2.3 `common/route-template.interceptor.ts` registered as `APP_INTERCEPTOR` (D3)

## 3. Exception filter

- [x] 3.1 `common/all-exceptions.filter.ts` registered as `APP_FILTER` with the D5 branches and `all-exceptions.filter.spec.ts`: 409 and 429 intact; `BadRequestException` (malformed JSON) 400; 413 http-errors object replied directly without ERROR; 503 HttpException one ERROR line without stack; `Error('boom')` generic 500 without "boom" and with stack; `statusCode: '400'`, empty message and 5xx http-errors go to the generic 500; headers already sent ends the response; header set from the fallback id in every branch

## 4. Swagger flag and docs of variables

- [x] 4.1 `resolveSwaggerEnabled` in `common/http.ts` with its matrix in `http.spec.ts`; Swagger setup and its log line inside the flag in `main.ts`
- [x] 4.2 `backend/.env.example`: `SWAGGER_ENABLED` and `PUBLIC_URL` with comments

## 5. E2E

- [x] 5.1 `backend/test/ops-observability.e2e-spec.ts` (with `applyRequestContext`, logger spies, at most 3 logins): health 503 via `ping` spy plus liveness 200; request id reuse/generation; route template and unknown routes; no secrets in the log; generic 500 via `findAll` spy and no `ExceptionsHandler` log; malformed JSON 400 without ERROR; client abort gives one 499 line (the slow mock clears its timer); shutdown in its own `it` calling `app.close()`
- [x] 5.2 `backend/test/ops-throttle.e2e-spec.ts`: six failed logins, the sixth 429 with the Throttler body and `X-Request-Id`
- [x] 5.3 Playwright journey in `e2e/tests/03-admin-validation.spec.ts`: a mocked 500 on validate shows the request id in the alert
- [x] 5.4 All existing suites stay green

## 6. QA, runbook and verification

- [x] 6.1 Catalog: TC-HEALTH-03 (503 with the database down), TC-HEALTH-04 (request id incl. parser and routes outside the prefix), TC-SEC-12 (generic 500 with request id), TC-SEC-13 (Swagger off in production), TC-UI-11 (the validation alert shows the code); TC-UI-05 gains the precondition "non-production or `SWAGGER_ENABLED=true`"; run the validator
- [x] 6.2 Runbook: Start Command with `exec`, health check kept on `/api/health` plus the external monitor on `/api/health/db`, Swagger only with `SWAGGER_ENABLED=true`, diagnosis rows (503 on readiness; a user reports a code: search it in Logs), exit 143 on redeploy is normal, variables table
- [x] 6.3 Manual QA: stop local Postgres (503 then 200); production build with and without `SWAGGER_ENABLED`; malformed JSON with curl; SIGTERM shows the closing line
- [x] 6.4 `CHANGELOG.md` Sin publicar; reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs`; record in `docs/testing.md`
- [x] 6.5 Open the PR to `develop`; after merge, archive the change
