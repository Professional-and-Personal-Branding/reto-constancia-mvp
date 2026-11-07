# platform-operations Specification

## Purpose
Operational behaviour of the API that the people running it rely on: health probes a monitor can
trust, a traceable id and one safe access-log line per request, error responses that never leak
internal details, graceful shutdown, and API docs controlled by environment.

## Requirements

### Requirement: Readiness reflects the real database state
`GET /api/health/db` SHALL answer 200 with `{ status: 'ok', db: 'up', timestamp }` when the
database answers, and 503 with `{ status: 'error', db: 'down', timestamp }` when it does not.
`GET /api/health` SHALL NOT depend on the database.

#### Scenario: Database reachable
- **WHEN** `GET /api/health/db` is requested and the database answers
- **THEN** the response is 200 with `db: 'up'`

#### Scenario: Database down
- **WHEN** the database does not answer
- **THEN** `GET /api/health/db` responds 503 with `db: 'down'`
- **AND** one ERROR line `[HTTP]` with the route and status 503 is written, carrying the same request id as the response header

#### Scenario: Liveness without the database
- **WHEN** the database is down
- **THEN** `GET /api/health` still responds 200

### Requirement: Every response carries a traceable request id
Every response the API process sends (including `/api/*`, unknown routes inside and outside the
prefix, `/uploads/*` and body-parser errors) SHALL carry `X-Request-Id`. An incoming header
matching `^[A-Za-z0-9._-]{1,64}$` SHALL be reused; otherwise a UUID v4 SHALL be generated. CORS
SHALL expose the header to the web.

#### Scenario: No incoming header
- **WHEN** a request arrives without `X-Request-Id`
- **THEN** the response carries a UUID v4 in `X-Request-Id`

#### Scenario: Valid incoming header
- **WHEN** a request arrives with `X-Request-Id: abc-123`
- **THEN** the response header and the access-log line use `abc-123`

#### Scenario: Invalid incoming header
- **WHEN** the header is longer than 64 characters or contains spaces or line breaks
- **THEN** it is ignored and a UUID v4 is generated

#### Scenario: Unknown routes and parser errors
- **WHEN** `GET /api/no-existe`, `GET /fuera-del-prefijo` or a malformed JSON `POST /api/auth/login` is requested
- **THEN** each response carries `X-Request-Id`, and the malformed JSON answers 400

### Requirement: Each request writes exactly one safe access-log line
Each request SHALL write exactly one JSON line tagged `[HTTP]` with `requestId`, `method`,
`route`, `status`, `ms` and `userId` (the JWT subject, or `null`), plus `aborted: true` with
status 499 when the client closes the connection first. `route` SHALL be the route template for
matched routes and the path without query for unmatched ones. The line SHALL NOT contain the
request body, the query string or any header other than the request id. The level SHALL be
`log` below 400 and for 401 and 404, and `warn` for the other 4xx, 499 and 5xx.

#### Scenario: Completed request
- **WHEN** an authenticated `GET /api/challenges/<id>?x=1` completes
- **THEN** there is exactly one `[HTTP]` line, with `route` equal to `/api/challenges/:id` and the caller's id in `userId`

#### Scenario: Aborted request
- **WHEN** the client closes the connection before the response ends
- **THEN** there is exactly one `[HTTP]` line for that request id, with status 499 and `aborted: true`

#### Scenario: No secrets in the log
- **WHEN** `POST /api/auth/login?token=secreto` is sent with a password in the body and `Authorization: Bearer abc.def.ghi`
- **THEN** no `[HTTP]` line contains the password, `secreto`, `Bearer` or the token

### Requirement: Unexpected errors do not leak internal details
Any error that is not a deliberate 4xx SHALL answer 500 with `{ statusCode: 500, message,
requestId }`, where `message` is in Spanish and includes the request id, and SHALL NOT include the
internal error message. Every 5xx SHALL write exactly one ERROR line with the request id (with the
stack for unexpected errors). Deliberate 4xx responses SHALL keep today's status and body and
SHALL NOT write ERROR lines.

#### Scenario: Unhandled error
- **WHEN** a service throws `Error('detalle interno')` while handling `GET /api/challenges`
- **THEN** the response is 500, `requestId` in the body equals the response header, `message` contains that id
- **AND** the body does not contain "detalle interno"
- **AND** exactly one ERROR line with the stack and that id is written, and no other component logs the error

#### Scenario: Business errors unchanged
- **WHEN** a payment is recorded on a `COMPLETED` challenge
- **THEN** the response is still 400 "No se puede modificar un reto cerrado"

#### Scenario: Parser and payload errors
- **WHEN** malformed JSON or an oversized body is sent
- **THEN** the response is 400 or 413, not 500, and no ERROR line is written

#### Scenario: Rate limit unchanged
- **WHEN** the login rate limit is exceeded
- **THEN** the response is 429 with `{ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }` and an `X-Request-Id`

### Requirement: Graceful shutdown
On SIGTERM or SIGINT the API SHALL run its shutdown hooks, close the database connection and log
"Conexión a la base cerrada" before the process ends.

#### Scenario: Termination signal
- **WHEN** the running API receives SIGTERM
- **THEN** "Conexión a la base cerrada" is logged and the process ends by the signal

#### Scenario: Application closed
- **WHEN** the application is closed programmatically
- **THEN** the database connection is closed and the same line is logged

### Requirement: API docs are controlled by environment
`/api/docs` SHALL be served when `SWAGGER_ENABLED=true`, SHALL NOT be served when
`SWAGGER_ENABLED=false`, and when the variable is unset SHALL be off with `NODE_ENV=production`
and on otherwise.

#### Scenario: Production default
- **WHEN** `NODE_ENV=production` and `SWAGGER_ENABLED` is unset
- **THEN** `GET /api/docs` responds 404 with an `X-Request-Id`

#### Scenario: Explicitly enabled
- **WHEN** `SWAGGER_ENABLED=true`
- **THEN** `/api/docs` is served in any environment

#### Scenario: Development and test
- **WHEN** `NODE_ENV` is not `production` and the variable is unset
- **THEN** `/api/docs` is served

### Requirement: Database backups are verified by restoring them
The repository SHALL provide `scripts/db-backup.mjs`, which dumps the database named by
`DATABASE_URL` (or `backend/.env`) in PostgreSQL custom format to a dated file, restores it into a
newly created temporary database on a local server, compares the row count of every table of the
`public` schema (including `_prisma_migrations`) between the source and the restored copy, drops
the temporary database and ends with `OK` and exit code 0 only when every count matches. It SHALL
use the PostgreSQL client tools of the PATH when available and otherwise the ones of the
`reto-constancia-db` container. It MUST refuse to run (exit code 2, no database created) when the
restore target is not local, and it MUST NOT write to the source database. It SHALL require no new
dependency and no new environment variable.

#### Scenario: Backup restores with the same counts
- **GIVEN** the local development database with the seed loaded
- **WHEN** the owner runs `node scripts/db-backup.mjs`
- **THEN** a file `backups/reto-YYYYMMDD-HHMM.dump` is written
- **AND** the report lists every table with equal source and restored counts
- **AND** the script prints `OK` and exits with code 0
- **AND** no `reto_restore_check_*` database remains on the local server

#### Scenario: A count differs
- **WHEN** the restored copy of any table has a different row count than the source, or a table is missing
- **THEN** the script prints `FALLO` naming the tables, exits with code 1, renames the dump to `*.unverified.dump` and drops the temporary database

#### Scenario: The database changes during the dump
- **WHEN** the source counts taken before and after the dump differ
- **THEN** the script prints `FALLO` "la base cambió durante el respaldo; repítelo en un momento sin actividad" and exits with code 1

#### Scenario: Non-local restore target
- **WHEN** the owner runs the script with `--target` pointing to a host that is not `localhost`, `127.0.0.1` or `::1`
- **THEN** the script exits with code 2 with the guard's message before creating any database or dump

#### Scenario: Restore target equals the source
- **WHEN** the source and the restore target are the same host, port and database
- **THEN** the script exits with code 2 without dumping or restoring

#### Scenario: No client tools, Docker available
- **GIVEN** a Windows machine without `pg_dump` on the PATH and the `reto-constancia-db` container running
- **WHEN** the owner runs the script
- **THEN** it dumps and restores through `docker exec` and reaches the same `OK`, without the database URL appearing on any command line

#### Scenario: Incompatible client version
- **WHEN** the source server's major version is newer than the client's
- **THEN** the script exits with code 2 explaining which client version is needed, before dumping

#### Scenario: Verifying a dump made elsewhere
- **GIVEN** a dump made with the runbook command in the service shell
- **WHEN** the owner runs `node scripts/db-backup.mjs --file <dump>`
- **THEN** the script restores it into a temporary local database, requires a non-empty `_prisma_migrations`, prints the counts and `OK (sin comparación con el origen)`, and drops the temporary database

#### Scenario: Truncated dump
- **WHEN** the owner verifies a truncated dump file with `--file`
- **THEN** the restore fails, the script prints `FALLO`, exits with code 1 and leaves no temporary database

### Requirement: The runbook makes the verified backup a deploy gate
`docs/runbook-despliegue.md` §5.1 SHALL instruct running `scripts/db-backup.mjs` before deploying
any release with a migration and SHALL forbid deploying such a release without an `OK` from it. It
SHALL document how to run the script on Windows with Docker, where to keep the dump files (outside
the repository and the hosting, as they contain personal data), how long to keep them and how to
restore one. `backups/` SHALL be ignored by git.

#### Scenario: Release with a migration
- **GIVEN** a release whose notes list a migration
- **WHEN** the owner follows the deploy checklist
- **THEN** the checklist points to §5.1 and requires the `OK` of the script before the deploy step

#### Scenario: Dumps are never committed
- **WHEN** the owner runs `git status` after a backup
- **THEN** the files under `backups/` are not listed
