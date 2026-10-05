## Why

The first production deploy on Seenode is close. Today the API does not give the minimum signals
needed to run it:

1. **The readiness probe lies.** `GET /api/health/db` catches the database error and *returns*
   `{ status: 'error', db: 'down' }` with **HTTP 200** (`health.controller.ts`). Any monitor that
   checks the status code stays green with the database down, and the runbook relies on that
   endpoint for the first-deploy check, the restart order and diagnosis.
2. **Errors are not traceable.** There is no global filter, no request id and no access log
   (`main.ts`, `app.module.ts` only register the throttler guard). The runbook promises that 5xx
   errors are logged with their route; today only Nest's generic `ExceptionsHandler` line is
   written, without route. A participant who hits a 500 has no code to report.
3. **No graceful shutdown.** `enableShutdownHooks()` is not called, so `PrismaService.onModuleDestroy`
   never runs on a redeploy, and the runbook's Start Command
   (`npx prisma migrate deploy && node dist/main.js`) runs node as a child of a shell that may not
   forward the signal.
4. **Swagger is always public**, exposing the map of admin endpoints in production.
5. **`PUBLIC_URL`** is read by the upload service but documented nowhere.

## What Changes

- `GET /api/health/db` answers **503** with the same body when the database does not respond;
  200 when it does. `GET /api/health` (liveness) is unchanged.
- Every HTTP response carries an `X-Request-Id`: a valid incoming header is reused
  (`^[A-Za-z0-9._-]{1,64}$`), otherwise a UUID is generated. CORS exposes the header.
- Every request writes exactly one JSON access-log line `[HTTP]`
  (`requestId, method, route, status, ms, userId`, plus `aborted` for client aborts) with a
  whitelist of fields: no body, no query string, no headers other than the request id.
- A global exception filter: 4xx responses keep today's status and body; any unexpected error
  answers a generic Spanish 500 that includes the request id and never the internal message;
  every 5xx writes exactly one `ERROR` line with the same request id.
- Graceful shutdown: shutdown hooks enabled, "Conexión a la base cerrada" logged, Start Command
  with `exec`.
- `SWAGGER_ENABLED`: Swagger is off by default in production, on elsewhere; `true` forces it on.
- Docs: runbook (Start Command, external monitor on `/api/health/db`, diagnosis rows, variables),
  `.env.example`, QA catalog (TC-HEALTH-03, TC-HEALTH-04, TC-SEC-12, TC-SEC-13, TC-UI-11).
- **BREAKING (operations):** `/api/health/db` can now answer 503, and `/api/docs` is 404 in
  production unless enabled. No API change for application endpoints.
- Target: **1.5.0** (may ship together with the first slice of `upload-guardrails`).

## Non-goals

- pino, winston, APM, Sentry, Prometheus or shipping logs anywhere but Seenode Logs.
- Unifying frontend error handling: screens that show `e.message` keep showing
  "API error 500"; the screens that read the API message will show the code.
- Readiness of Cloudinary or Google Sheets; authentication for Swagger (on/off only); a rate
  limit for `/health/*`; propagating the request id to outgoing calls.
- Any business rule change.

## Capabilities

### New Capabilities
- `platform-operations`: health probes, request traceability and access logging, error
  responses without internal details, graceful shutdown and environment-controlled API docs.

### Modified Capabilities
<!-- None -->

## Impact

- Backend: `prisma.service.ts`, `health.controller.ts`, `main.ts`, `app.module.ts`,
  `common/http.ts`; new `common/request-log.ts`, `common/request-context.ts`,
  `common/route-template.interceptor.ts`, `common/all-exceptions.filter.ts`.
- No new npm packages (only `@nestjs/*` already installed, Express 5 and `node:crypto`); no
  migration; the production `npm audit` gate is unchanged.
- Tests: unit specs for the pure helpers and the filter; two new API e2e suites; one Playwright
  journey; QA catalog.
- Docs: runbook, `backend/.env.example`, CHANGELOG.
- Owner (Seenode panel): change the Start Command to use `exec`, keep the health check on
  `/api/health`, and create a free external monitor on `/api/health/db`.
