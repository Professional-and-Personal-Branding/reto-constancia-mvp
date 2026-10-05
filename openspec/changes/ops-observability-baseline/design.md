## Context

Verified in the installed packages (`@nestjs/core` 11.2.7, Express 5):

- `NestApplication.use()` registers on the Express adapter immediately, while body-parser is
  registered later inside `init()` (`registerParserMiddleware()` runs before
  `registerModules()`). A middleware added right after `NestFactory.create` therefore runs before
  body-parser, the `/uploads` static files and every route.
- Malformed JSON (body-parser `SyntaxError`) reaches filters as a `BadRequestException`, because
  `RoutesResolver.mapExternalException` maps it first. Only other body-parser errors, such as the
  413 `PayloadTooLargeError`, arrive as plain http-errors objects.
- `BaseExceptionFilter` logs at ERROR every exception that is not an `HttpException`
  (`handleUnknownError`), including http-errors objects. It also checks `isHeadersSent` before
  replying.
- Express 5 `res.status()` throws `TypeError` for a non-integer code, so a `statusCode: '400'`
  string must never reach `reply`.
- With shutdown hooks and no `useProcessExit`, Nest runs the destroy hooks and then re-raises the
  signal (`process.kill(process.pid, signal)`): the process ends by the signal (exit 143 on
  SIGTERM), or with 1 if a hook fails.
- `main.ts` uses `bufferLogs: true` with the default synchronous `ConsoleLogger`; buffered logs
  flush at init.
- The throttler key is class + handler + IP; `register` and `login` each allow 5 per minute.
  `test:e2e` runs `--runInBand` and every suite builds its own app (own throttler storage).

## Goals / Non-Goals

**Goals:** a readiness probe a monitor can trust; one traceable id per response; one access line
per request with no secrets; 4xx responses unchanged; generic 500 with the id; exactly one ERROR
line per 5xx; clean shutdown; Swagger off in production by default; no new packages.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - `PrismaService.ping()`** runs `SELECT 1`; the controller calls it and throws
   `ServiceUnavailableException` with the same body. `ping()` exists so tests can simulate the
   outage by spying on our own method.
2. **D2 - Request context as an Express middleware** (`applyRequestContext(app)`), called by
   `main.ts` right after the `NestFactory.create(...)` statement and by the new e2e bootstrap. It
   resolves the id, sets `req.requestId` and the response header, takes `process.hrtime.bigint()`
   and registers a single `res.once('close')`: `writableFinished` true means finished, false means
   the client aborted (`status: 499`, `aborted: true`). One `close` per response gives exactly one
   line in both cases.
3. **D3 - Route template from an interceptor.** A global `RouteTemplateInterceptor` stores
   `req.routeTemplate = req.route?.path` while the handler runs (Nest registers handlers with the
   full prefixed path, e.g. `/api/challenges/:id`). The access line uses `req.routeTemplate` and,
   for unmatched requests (404, parser errors), the path of `originalUrl` without the query. This
   does not depend on `req.route` still being set when the response closes.
4. **D4 - Log levels.** `log` below 400 and also for 401 and 404 (expired tokens and bots would
   otherwise flood WARN); `warn` for the other 4xx, 499 and 5xx. `error` is reserved for the
   filter, so alerts key on ERROR.
5. **D5 - `AllExceptionsFilter extends BaseExceptionFilter`** (`APP_FILTER`). It resolves the id
   from `req.requestId`, else from the incoming header, else a new UUID, and sets `X-Request-Id`
   on the response in every branch when it is missing (apps started without the middleware).
   Branches:
   - `HttpException` with status below 500 (validation 400, malformed JSON 400, 404, 409, 429):
     `super.catch()`; body and status as today; no ERROR line (the base logs only unknown errors).
   - http-errors object with `Number.isInteger(statusCode)`, `400 <= statusCode < 500` and a
     non-empty `message` (e.g. 413): reply directly through the HTTP adapter with
     `{ statusCode, message }` (the body Nest produces today), without `super.catch()`, so no ERROR
     line.
   - `HttpException` with status 500 or more (e.g. the health 503): one ERROR line without stack
     `{ requestId, route, status, error: name }`, then `super.catch()` (body kept, the base does not
     log HttpExceptions).
   - Anything else (an `Error`, an unmapped Prisma error, a 5xx http-errors object, a string
     `statusCode`, an empty message, a non-object): if headers were already sent, end the response
     like Nest does; otherwise reply 500 with `{ statusCode: 500, message: 'Ocurrió un error
     inesperado. Si el problema continúa, comparte este código con el administrador: <id>',
     requestId }` and write one ERROR line with the stack. The original message never travels in
     the response, and `super.catch()` is not called, so the base does not log a second line.
   The filter is the only error logger on both paths Nest uses (route handlers and the Express
   error handler); the e2e suite asserts that `ExceptionsHandler` logs nothing.
6. **D6 - Shutdown.** `app.enableShutdownHooks()` without `useProcessExit`: ending by the signal is
   the convention orchestrators expect, and the synchronous console logger has nothing to flush.
   A future asynchronous logger (pino) would need `useProcessExit`. `onModuleDestroy` logs
   "Conexión a la base cerrada". Start Command: `npx prisma migrate deploy && exec node dist/main.js`.
7. **D7 - `SWAGGER_ENABLED`** resolved by a pure `resolveSwaggerEnabled(env)` in `common/http.ts`,
   in the style of `resolveTrustProxy`: unset means off in production and on elsewhere. Playwright
   starts the API with `NODE_ENV ?? 'test'`, so the guide capture of Swagger keeps working.
8. **D8 - Seenode health check stays on `/api/health`.** Restarting does not fix a database
   outage; pointing the platform probe at `/api/health/db` would create a restart loop. The
   readiness probe is for an external monitor.

## Risks / Trade-offs

- Error-format regression -> 4xx go through `super.catch()` or the same body as today; unit
  matrix and the existing e2e suites (which do not install the middleware) cover 400, 404, 409,
  413 and 429 and exercise the filter fallback.
- Exit code 143 on redeploy may look like a failure in the orchestrator -> documented as normal
  in the runbook; `useProcessExit` stays as a later option.
- Log volume -> one line per request is low for the MVP; healthy `/api/health*` lines can move
  to `debug` later.
- The shell may not forward signals -> `exec`, verified on the first redeploy.

## Migration Plan

No migration, no new packages. Ships in 1.5.0. Owner actions in Seenode: Start Command with
`exec`, health check kept on `/api/health`, `SWAGGER_ENABLED` left unset, external monitor on
`/api/health/db` (expects 200, alerts on 503). Rollback: redeploy 1.4.2; `SWAGGER_ENABLED=true`
restores the docs if someone needs them.

## Open Questions

None.
