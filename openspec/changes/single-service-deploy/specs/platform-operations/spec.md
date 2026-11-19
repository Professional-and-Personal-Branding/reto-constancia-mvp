## ADDED Requirements

### Requirement: The single-service runtime starts in order
The repository SHALL provide `scripts/start-prod.mjs`, a supervisor without new dependencies that
runs `prisma migrate deploy` first and starts nothing if it fails; then starts the API bound to
`127.0.0.1` on `API_PORT` (default 3001); waits at most 60 seconds for the API's `/api/health` to
answer 200; and only then starts the web bound to `0.0.0.0` on `PORT` (default 3000).

#### Scenario: Normal start
- **GIVEN** a successful build and a reachable database
- **WHEN** the supervisor starts
- **THEN** `prisma migrate deploy` runs before either application
- **AND** the web starts only after the API's `/api/health` answered 200
- **AND** `GET /` and `GET /api/health` on the web port answer 200

#### Scenario: Migration fails
- **WHEN** `prisma migrate deploy` exits with a non-zero code
- **THEN** the supervisor exits with that code and neither the API nor the web is started

#### Scenario: API never becomes healthy
- **WHEN** the API's `/api/health` has not answered 200 after 60 seconds
- **THEN** the supervisor stops the API, does not start the web and exits with code 1

### Requirement: The single-service runtime ends as a whole
When either child process exits for any reason, the supervisor MUST stop the other one and exit with
a non-zero code. On SIGTERM or SIGINT it SHALL forward the signal to both children, wait up to 10
seconds, kill what is still running and exit.

#### Scenario: A child process dies
- **GIVEN** both processes running
- **WHEN** the API (or the web) exits, with any code
- **THEN** the supervisor logs which process ended and its code
- **AND** sends SIGTERM to the other process, and SIGKILL if it is still alive after 10 seconds
- **AND** exits with a non-zero code

#### Scenario: Platform stops the service
- **WHEN** the supervisor receives SIGTERM
- **THEN** both children receive SIGTERM
- **AND** the API logs "Conexión a la base cerrada" before ending
- **AND** the supervisor exits with code 0 when both ended within 10 seconds

### Requirement: The single-service children are bounded and isolated
The supervisor SHALL cap each child's heap with `API_MAX_OLD_SPACE_MB` (default 224) and
`WEB_MAX_OLD_SPACE_MB` (default 160), and it MUST NOT pass `DATABASE_URL`, `JWT_*`,
`CLOUDINARY_API_SECRET` or `SEED_*` to the web process.

#### Scenario: Heap caps applied
- **WHEN** the supervisor starts both children without the memory variables
- **THEN** the API runs with `--max-old-space-size=224` and the web with `--max-old-space-size=160`

#### Scenario: Secrets stay out of the web process
- **WHEN** the supervisor starts the web with `DATABASE_URL`, `JWT_SECRET` and `CLOUDINARY_API_SECRET` in its own environment
- **THEN** the web process environment contains none of them

### Requirement: The API listen interface is configurable
The API SHALL listen on the interface named by `HOST` when it is set and non-empty, and on every
interface when it is unset (current behaviour).

#### Scenario: Loopback only
- **WHEN** the API starts with `HOST=127.0.0.1`
- **THEN** it accepts connections on `127.0.0.1` and refuses them on the container's other addresses

#### Scenario: Unset keeps the current behaviour
- **WHEN** the API starts without `HOST`
- **THEN** it listens on every interface, as before this change

### Requirement: The web serves the API under the same origin when configured
When `API_INTERNAL_URL` is set at build time, the web SHALL proxy every request under `/api/` to
`${API_INTERNAL_URL}/api/` preserving method, path, query, headers and body, with a proxy timeout of
60 seconds; when it is unset the web SHALL NOT add that proxy. In this mode the browser bundle SHALL
use the relative base `/api`. Code that runs on the web server MUST NOT call the API through the
relative public base and SHALL use `API_INTERNAL_URL`.

#### Scenario: Browser call through the web
- **GIVEN** the single-service build (`API_INTERNAL_URL=http://127.0.0.1:3001`, `NEXT_PUBLIC_API_URL=/api`)
- **WHEN** the browser calls `POST /api/auth/login` on the web origin
- **THEN** the API answers it and the response reaches the browser unchanged, with its `X-Request-Id`

#### Scenario: Two-service and development builds
- **WHEN** the web is built without `API_INTERNAL_URL`
- **THEN** `GET /api/health` on the web is not proxied (404 from the web) and the browser uses the absolute `NEXT_PUBLIC_API_URL` as before

### Requirement: The API identifies the client behind the single-service proxy chain
In the single-service runtime the supervisor SHALL start the API with `TRUST_PROXY=2` (platform edge
and web proxy) unless `TRUST_PROXY` is already set, in which case that value wins. Requests from
different clients MUST be counted separately by the rate limiters, and a client-supplied
`X-Forwarded-For` entry to the left of the addresses appended by the trusted proxies MUST NOT change
the client identity.

#### Scenario: Two clients do not share the login limit
- **GIVEN** the single-service runtime reached through one upstream proxy that appends the client address
- **WHEN** client A fails to log in six times within a minute and client B then tries once
- **THEN** A's sixth attempt answers 429 and B's attempt does not answer 429

#### Scenario: Forged forwarding header
- **GIVEN** client A has reached the login limit
- **WHEN** A sends another attempt with a forged leftmost `X-Forwarded-For` address
- **THEN** the attempt still answers 429

#### Scenario: Explicit value wins
- **WHEN** the supervisor starts with `TRUST_PROXY=3`
- **THEN** the API runs with three trusted hops

### Requirement: Web responses carry security headers
Every web response outside `/api/` SHALL carry `Strict-Transport-Security: max-age=15552000; includeSubDomains`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` and a `Content-Security-Policy` with `frame-ancestors 'none'`,
`base-uri 'self'`, `object-src 'none'` and `form-action 'self'`, and SHALL NOT carry `X-Powered-By`.
API responses keep the API's own headers without duplicates.

#### Scenario: Page headers
- **WHEN** a client requests `GET /` from the web
- **THEN** the response carries the five headers above and no `X-Powered-By`

#### Scenario: API headers not duplicated
- **WHEN** a client requests `GET /api/health` through the web
- **THEN** each security header appears once, as sent by the API

### Requirement: The production build is one bounded command
The repository SHALL provide `scripts/build-prod.mjs`, run by `npm run build` at the repository
root, which installs with `npm ci` and builds the API and then the web sequentially with the heap
capped by `BUILD_MAX_OLD_SPACE_MB` (default 400), removes development dependencies and prints each
package's disk size. It SHALL default the web's `NEXT_PUBLIC_API_URL` to `/api` and
`API_INTERNAL_URL` to `http://127.0.0.1:<API_PORT>`. A failing step MUST stop it with a non-zero code.

#### Scenario: Successful build
- **WHEN** `npm run build` runs at the repository root on a clean checkout
- **THEN** `backend/dist/main.js` and the web build exist, development dependencies are absent, and the sizes are printed

#### Scenario: Failing step
- **WHEN** any install or build step fails
- **THEN** the script stops there and exits with a non-zero code

### Requirement: The service health check covers both processes
The single-service health check SHALL be `GET /api/health` on the public port, which reaches the
API through the web, so it fails when either process is down. It MUST NOT depend on the database.

#### Scenario: API down behind a live web
- **WHEN** the API process is not answering and the web still is
- **THEN** `GET /api/health` on the public port does not answer 200

### Requirement: A missing database connection limit is reported
In production the supervisor SHALL log a warning when `DATABASE_URL` has no `connection_limit`
parameter, and it MUST NOT print the connection string or any part of its credentials.

#### Scenario: No connection limit
- **WHEN** the supervisor starts with `NODE_ENV=production` and a `DATABASE_URL` without `connection_limit`
- **THEN** it logs a warning recommending `connection_limit=5` that contains neither the URL, the user nor the password, and the start continues

### Requirement: The single-service runtime can be reproduced locally
The repository SHALL provide `Dockerfile.single-service`, which runs the same root build and start
commands as the platform, and `scripts/single-service-smoke.mjs <base-url>`, which checks the web
page, health endpoints, Swagger off (404), a protected route (401), the web security headers and the
login-limit scenarios with forwarding headers, and ends with `OK` (exit 0) or the failed checks
(exit 1). The smoke script MUST use only a non-existent account.

#### Scenario: Container under the plan's limits
- **GIVEN** the image built from `Dockerfile.single-service` and the local database
- **WHEN** it runs with `--memory=512m --cpus=0.2` and the smoke script targets it
- **THEN** the smoke script prints `OK` and exits with code 0 and the container did not restart

#### Scenario: Wrong proxy configuration detected
- **WHEN** the container runs with `TRUST_PROXY=1` (too few hops) or `TRUST_PROXY=3` (too many)
- **THEN** the smoke script fails the two-clients check (with 1) or the forged-forwarding-header check (with 3) and exits with code 1
