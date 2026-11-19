## Why

The owner approved the deployment decision in `docs/despliegue/DECISION-DESPLIEGUE.md`
(2026-11-16): Seenode, but as **one Web Service** (Basic, 0.5 GB RAM, 0.2 CPU) that runs both the
NestJS API and the Next.js web, plus a managed PostgreSQL Basic and Cloudinary. The documented plan
(two Web Services, `docs/runbook-despliegue.md` and `docs/deploy-seenode.md`) costs 12 USD per
month and breaks the 10 USD cap; the single-service variant costs 8 USD.

The current code cannot run that way:

- The API always listens on every interface of `PORT` (`backend/src/main.ts`), and the only start
  command runs one process (`backend/Dockerfile`, runbook §1.3). Two processes in one container
  need a start script that runs the migration, starts both, and **ends the container when either
  one dies** (otherwise a dead API behind a live web looks healthy to the platform).
- The web calls the API through an absolute `NEXT_PUBLIC_API_URL`. With one public port (3000,
  owned by Next) the browser must reach the API under the same origin: Next has to proxy `/api/*`
  to the API on loopback.
- With Next in front, the API's peer is Next on loopback and the client address arrives in
  `X-Forwarded-For`. The proxy-hop count of the login limiter (5 per minute per IP) has to match that
  chain, or every user is keyed on the same address (platform-wide `429`) or a client-forged
  `X-Forwarded-For` evades it; the smoke test measures which value is right (see design D5).
- Next sends no security headers today (no HSTS, no anti-framing): phase 5 of the deployment
  runbook stops on that (cut rule 6).
- 0.5 GB must hold the build of both apps and, at run time, two Node heaps; PostgreSQL Basic
  allows 20 connections.

Phase 1 of `docs/despliegue/RUNBOOK-DESPLIEGUE.md` (PostgreSQL 16, external database access with
origin control, whether 0.5 GB / 0.2 CPU are enough, redeploying a previous commit) is done **by
the owner with his own Seenode trial account**. Its results can change this design (see design,
"Phase 1 dependency").

## What Changes

- **New `scripts/start-prod.mjs` (process supervisor, Node, no dependency):** runs
  `prisma migrate deploy`; starts the API on `127.0.0.1:3001`; waits for `/api/health`; starts Next
  on `0.0.0.0:$PORT` (3000); forwards SIGTERM/SIGINT to both; if either child exits, stops the other
  and exits non-zero so the platform restarts the service. Bounded heap per child.
- **New `scripts/build-prod.mjs`:** one sequential build for both packages with bounded memory, then
  prunes dev dependencies.
- **New minimal root `package.json`** (private, `engines`, `build`/`start` scripts, **no
  dependencies**) so the platform detects a Node project at the repository root.
- **API:** optional `HOST` to choose the listen interface (`backend/src/common/http.ts`,
  `main.ts`). Unset keeps today's behaviour.
- **Web (`frontend/next.config.mjs`):** when `API_INTERNAL_URL` is set at build time, rewrite
  `/api/:path*` to it; always send security headers on web routes (HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, a CSP limited to `frame-ancestors`/`base-uri`/
  `object-src`/`form-action`) and drop `X-Powered-By`.
- **Client IP:** the supervisor gives the API `TRUST_PROXY=1` when the variable is unset; the
  proxy chain is proven locally by a smoke script and on Seenode by the runbook.
- **`connection_limit`:** documented as `connection_limit=5` in `DATABASE_URL`; the supervisor warns
  (without printing the URL) when it is missing in production.
- **Local reproduction without Seenode:** root `Dockerfile.single-service` + `.dockerignore`
  running the same build and start commands, under `--memory=512m --cpus=0.2`, and
  `scripts/single-service-smoke.mjs <base-url>` (health, web, headers, Swagger off, login limit per
  client and forged `X-Forwarded-For`).
- **Docs (separate PR 2):** `docs/runbook-despliegue.md` §1–§4 and `docs/deploy-seenode.md` describe
  the single-service variant as the production default; the two-service layout stays as an
  alternative.

> **Flagged explicitly**
> - **No schema change, no migration**; `@@unique([month, year])` untouched.
> - **No new runtime dependency** (Node built-ins only).
> - **New environment variables** (all optional, defaults keep today's behaviour):
>   `HOST` (API), `API_INTERNAL_URL` (web, build time), `API_PORT`, `API_MAX_OLD_SPACE_MB`,
>   `WEB_MAX_OLD_SPACE_MB` (supervisor), `BUILD_MAX_OLD_SPACE_MB` (build script).
>   `NEXT_PUBLIC_API_URL` changes value in this mode (`/api`, relative).
> - **New root files:** `package.json` (no dependencies), `Dockerfile.single-service`,
>   `.dockerignore`.
> - **Test battery:** a new step for the root scripts' `node:test` suite (13 → 14 steps); `CLAUDE.md`
>   and `docs/testing.md` are updated in the same PR.

## Non-goals

- Changing the platform decision, its cost cap or plan B (VPS); doing phase 1 of the runbook (owner).
- `output: 'standalone'` in Next, a full script-src CSP with nonces, or `Permissions-Policy`.
- Removing the two-service layout or `backend/Dockerfile` (kept for the alternative and plan B).
- Automating the single-service smoke in CI (see Open Questions).
- Any change to business behaviour, the API contract, the UI or the QA journeys.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `platform-operations`: adds the single-service runtime (supervisor, loopback API, same-origin
  `/api` proxy, client IP behind the proxy chain, web security headers, bounded build, health check
  through the public port, connection-limit warning).

## Impact

- **Code (PR 1):** `scripts/start-prod.mjs`, `scripts/build-prod.mjs`,
  `scripts/single-service-smoke.mjs`, `scripts/lib/supervisor.mjs` (+ `node:test` tests),
  `backend/src/common/http.ts` (+ spec), `backend/src/main.ts`, `frontend/next.config.mjs`,
  `frontend/lib/deploy-config.mjs` (+ test), root `package.json`, `Dockerfile.single-service`,
  `.dockerignore`, `scripts/run-tests.mjs`, `backend/.env.example`, `frontend/.env.example`.
- **QA:** new cases `TC-HEALTH-07`, `TC-HEALTH-08`, `TC-SEC-15`, `TC-SEC-16` in `docs/qa/catalog.mjs`.
- **Docs (PR 2):** `docs/runbook-despliegue.md` §1–§4 and §7, `docs/deploy-seenode.md`,
  `docs/despliegue/RUNBOOK-DESPLIEGUE.md` (phase 2 and phase 5 row 6 point to the smoke script).
- **Unchanged:** dev and test flows (`npm run start:dev`, `next dev`, battery ports 3002/3005, CI
  jobs), because every new behaviour is opt-in by environment.
- **Delivery:** PR 1 (code + tests) and PR 2 (operational docs) to `develop`; target release 1.16.0.
