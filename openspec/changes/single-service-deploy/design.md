## Context

Decision (approved by the owner, 2026-11-16): one Seenode Web Service Basic (0.5 GB RAM, 0.2 CPU,
750 MB disk, port fixed in the panel, `PORT` not injected) running the API and the web, plus
PostgreSQL Basic (1 GB, 20 connections) and Cloudinary free. Sources:
`docs/despliegue/DECISION-DESPLIEGUE.md`, `docs/despliegue/RUNBOOK-DESPLIEGUE.md`,
`docs/despliegue/perfil-despliegue.json`.

Facts of the code that shape the design:

- API: `app.listen(port)` on every interface, `PORT` default 3000, global prefix `api`,
  `enableShutdownHooks()` (spec "Graceful shutdown"), helmet on every API response,
  `resolveTrustProxy` (unset → 1 hop in production), login limited to 5 per minute per client IP.
- Web: every API call happens **in the browser** (`frontend/lib/api.ts`, `lib/cloudinary.ts`,
  `app/dashboard/admin/import/page.tsx`); no server component, route handler or middleware calls
  the API today. Tokens live in `localStorage` (no cookies), so same-origin changes no auth logic.
- Seenode builds from the repository with a Build Command and a Start Command (not from a
  Dockerfile); there is no `package.json` at the repository root.
- `prisma` (CLI) and `next` are runtime dependencies; TypeScript, Tailwind and ESLint are dev-only.

```
Browser ──HTTPS──▶ Seenode edge ──▶ :3000 Next (0.0.0.0) ──/api/* rewrite──▶ 127.0.0.1:3001 API ──▶ PostgreSQL
                                     └─ pages, static          (loopback only)                    └▶ Cloudinary (signed)
```

## Goals / Non-Goals

**Goals:** run both apps in one service within 0.5 GB; fail loudly (container exits) instead of
half-working; keep the login limiter per real client; meet the security checks of runbook phase 5;
reproduce the service locally without Seenode; keep dev, CI and the two-service layout working.

**Non-Goals:** see the proposal (standalone output, nonce CSP, CI automation of the smoke, platform
change).

## Decisions

### D1 — Supervisor in Node (`scripts/start-prod.mjs`), not a shell script

The decision document names `scripts/start-prod.sh`. A Node script is chosen instead: the project's
scripts are all Node (`db-backup.mjs`, `run-tests.mjs`), signal forwarding and "first child to exit"
are simple with `child_process`, the logic is unit-testable with `node:test` on Windows (the owner's
machine) and Linux, and `node` is guaranteed in the image while `bash` features are not.

Behaviour (pure logic in `scripts/lib/supervisor.mjs`, the entry point only wires processes):

1. Run `npx prisma migrate deploy` in `backend/`. Non-zero exit → log and exit with that code;
   nothing else starts (same contract as today's `migrate deploy && node dist/main.js`).
2. Start the API: `node --max-old-space-size=$API_MAX_OLD_SPACE_MB backend/dist/main.js` with
   `PORT=$API_PORT` (default 3001), `HOST=127.0.0.1`, `TRUST_PROXY` defaulted to 1 (D5).
3. Poll `http://127.0.0.1:$API_PORT/api/health` every 500 ms up to 60 s. Timeout → stop the API,
   exit 1. Starting Next only after the API is up avoids two cold starts competing for 0.2 CPU and
   avoids a window where `/` answers but `/api/*` gives 502.
4. Start Next: `node --max-old-space-size=$WEB_MAX_OLD_SPACE_MB frontend/node_modules/next/dist/bin/next start -H 0.0.0.0 -p $PORT`
   (`PORT` default 3000) with a **filtered environment** (allowlist: `NODE_ENV`, `PORT`, `PATH`,
   `HOME`, `TZ`, `LANG`, `NEXT_*`): the Next server does not need and does not get `DATABASE_URL`,
   `JWT_*`, `CLOUDINARY_API_SECRET` or `SEED_*`.
5. Children inherit stdout/stderr, so the platform's log tab shows both.
6. **A child exits** (any code, including 0) → log which one and its code, send SIGTERM to the other,
   wait up to 10 s, SIGKILL if still alive, exit with the dead child's code (1 if it was 0 or a
   signal). The platform sees a dead service and restarts it.
7. **SIGTERM/SIGINT to the supervisor** → forward to both children, wait up to 10 s (the API logs
   "Conexión a la base cerrada"), SIGKILL the rest, exit 0 if both stopped in time, 1 otherwise.
   A second signal during shutdown is ignored.
8. Start Command: `exec node scripts/start-prod.mjs` (or `npm start` at the root, see D3), so the
   supervisor is the process that receives the platform's SIGTERM.

Alternatives: `concurrently`/`pm2` (new dependency; pm2 restarts children itself, which hides
crashes from the platform and doubles memory); `&` + `wait -n` in bash (works, but untestable on
Windows and easy to get wrong with signals); Next custom server embedding Nest in one process
(one heap, but couples both apps and changes the two-service layout).

### D2 — Same-origin `/api` through a Next rewrite, opt-in by `API_INTERNAL_URL`

`next.config.mjs` reads `API_INTERNAL_URL` **at build time** (rewrites are compiled into the
routes manifest). When set (single-service: `http://127.0.0.1:3001`), it adds
`{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` }`; when unset, no rewrite
(dev, CI, two-service unchanged). The build of this mode sets `NEXT_PUBLIC_API_URL=/api`, so the
browser calls the same origin and CORS becomes a same-origin check (`CORS_ORIGIN` = the app URL,
still required by the API in production).

- **Server-side calls:** none exist. Rule for the future (spec): code that runs on the Next server
  MUST NOT use the relative `NEXT_PUBLIC_API_URL`; it uses `API_INTERNAL_URL`. A helper
  `apiBaseUrl({ server })` in `frontend/lib/deploy-config.mjs` encodes the rule.
- `/uploads/*` (local Cloudinary simulator) is not rewritten: production uses Cloudinary.
- `experimental.proxyTimeout` is raised to 60 s only when the rewrite is active: the default 30 s
  could cut a challenge close or an export on 0.2 CPU.
- The logic lives in `frontend/lib/deploy-config.mjs` (`apiRewrites(env)`, `securityHeaders()`),
  imported by `next.config.mjs` and unit-tested with the existing `node:test` runner.

Alternative: a hand-written proxy in front of both (nginx/Caddy) — a third process in 0.5 GB and
another config to secure. Next already sits on the public port.

### D3 — One build command with bounded memory (`scripts/build-prod.mjs`) and a root `package.json`

Sequential, never parallel (two compilers at once would not fit):

1. `backend`: `npm ci`, `npx prisma generate`, `npm run build`, `npm prune --omit=dev`
   (`prisma` and `@prisma/client` are runtime dependencies, so `migrate deploy` still works).
2. `frontend`: `npm ci`, `next build` with `NEXT_PUBLIC_API_URL=/api` and
   `API_INTERNAL_URL=http://127.0.0.1:$API_PORT` unless already set, `npm prune --omit=dev`.
3. Every step runs with `NODE_OPTIONS=--max-old-space-size=$BUILD_MAX_OLD_SPACE_MB` (default 400).
4. Prints the size of `backend/` and `frontend/` (node_modules + build output) at the end, so the
   750 MB disk limit is visible in the build log.

`npm ci` replaces the runbook's `npm install`: reproducible, and it fails on a lockfile drift
instead of silently changing versions. The `xlsx` tarball from `cdn.sheetjs.com` installs the same
way.

A **minimal root `package.json`** (`private: true`, `engines.node: ">=20 <23"`,
`scripts.build: "node scripts/build-prod.mjs"`, `scripts.start: "node scripts/start-prod.mjs"`, no
dependencies, no lockfile needed) lets the platform detect a Node project with Root Directory = the
repository root and pick Node 20/22. It does not turn the repo into a workspace.

Fallback if phase 1 shows the disk or the build memory do not fit: `output: 'standalone'` for the
web (smaller runtime, different start command) — a follow-up change, not this one.

### D4 — Memory budget and `connection_limit`

| Piece                 | Default             | Variable                 |
| --------------------- | ------------------- | ------------------------ |
| API heap              | 224 MB              | `API_MAX_OLD_SPACE_MB`   |
| Next heap             | 160 MB              | `WEB_MAX_OLD_SPACE_MB`   |
| Build heap (per step) | 400 MB              | `BUILD_MAX_OLD_SPACE_MB` |
| Rest (RSS, buffers)   | ~120 MB of headroom | —                        |

The heap caps make an over-use fail as a V8 out-of-memory in one child (logged, D1 step 6) instead
of the kernel killing the whole container without a message. Phase 1 rows 5–6 measure the real
numbers; the variables exist so the owner can retune without a code change.

`DATABASE_URL` carries `connection_limit=5` (Prisma's pool; PostgreSQL Basic allows 20, and
`migrate deploy`, backups and the owner's `psql` need room). No code reads it: the supervisor only
**warns** at start, in production, when `DATABASE_URL` has no `connection_limit` parameter, and never
prints the URL.

### D5 — `TRUST_PROXY` with the real proxy chain

Revised during PR 1 (task 3.2) after the local smoke test: the first draft assumed that Next's
rewrite proxy appends its own hop to `X-Forwarded-For`, which would have made the client **2** hops
away. Next 15.5.28 does not: `proxyRequest` builds `http-proxy` without `xfwd`, and the only
`X-Forwarded-For` logic (`base-server.js`: `req.headers['x-forwarded-for'] ??= socket.remoteAddress`)
sets the header only when it is absent. The API therefore sees the header exactly as the platform edge
delivered it, and a connection from 127.0.0.1 (Next).

Chain in this mode: client → Seenode edge (puts the client address at the right end of
`X-Forwarded-For`) → Next (forwards the header untouched) → API. Express walks from the socket
address leftwards through `trust proxy` hops: the socket (Next, loopback) is hop 1 and the right-most
`X-Forwarded-For` entry is the client: `TRUST_PROXY=1`, the same as the production default of
`resolveTrustProxy`, so single-service and two-service layouts behave alike.

- The supervisor sets `TRUST_PROXY=1` for the API child **only when the variable is unset**
  (explicit, independent of `NODE_ENV`); a panel value wins.
- Too few hops (`0`/`false`) → every user shares the loopback address (platform-wide `429`); too
  many (`2` or more) → the client controls the entry the limiter reads and evades it. Both are
  detectable:
  - **Locally** (deterministic, proves Next's part): `scripts/single-service-smoke.mjs` talks to Next
    directly, so its own `X-Forwarded-For: 203.0.113.1` plays the edge. Six logins with that header
    → the sixth is `429`; a seventh with `203.0.113.2` is not; a request with
    `X-Forwarded-For: 198.51.100.9, 203.0.113.1` counts against `203.0.113.1` (`429`), proving a
    forged left entry is ignored. Measured on the container (Next 15.5.28): `TRUST_PROXY=1` passes,
    `2` fails the forged-header check, `0` fails the two-clients check.
  - **On Seenode** (proves the edge's part, runbook phase 5 row 6): two clients on different networks
    (for example a phone on mobile data) — one gets `429` on the sixth attempt, the other does not;
    and the first client sending a forged `X-Forwarded-For` still gets `429`. If the edge **replaces**
    the header instead of appending, `1` is still right; if the platform puts a second proxy in
    front of the edge, the panel value is the number of hops (no code change).

Alternative: trust `loopback` plus the edge's subnet — unknown and undocumented on Seenode.

### D6 — Security headers on web routes

`next.config.mjs` `headers()` for `source: '/((?!api/).*)'` (API responses keep helmet's headers;
matching `/api` too would duplicate them):

- `Strict-Transport-Security: max-age=15552000; includeSubDomains` (180 days, no `preload`: the
  domain is `*.seenode.app`, not ours to preload). Browsers ignore it over plain `http://localhost`.
- `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `poweredByHeader: false`.

Applied in every mode (they are harmless in dev and also fix the two-service layout). A CSP with
`script-src` is out of scope: Next's inline bootstrap scripts need nonces, a larger change with
real breakage risk; the directives above do not restrict scripts, styles, images (Cloudinary) or
`connect-src` (Cloudinary upload), so they cannot break the app.

### D7 — Health check through the public port

The Seenode health check is `/api/health` on port 3000: it traverses Next **and** the rewrite to the
API, so it fails if either process is down (liveness of both, no database: restarting does not fix a
database outage, same reason as runbook §1.3). `/api/health/db` stays for the external monitor.

### D8 — Listen host for the API (`HOST`)

`resolveListenHost(env)` in `backend/src/common/http.ts`: `HOST` trimmed, or `undefined` when unset;
`main.ts` calls `app.listen(port, host)` only when defined. Unset keeps today's behaviour (every
interface), so dev, CI and the two-service layout are unchanged. The supervisor passes `127.0.0.1`,
so the API is unreachable from outside the container even if the platform exposed more ports.

### D9 — Compatibility: single-service is the documented production default; two-service stays

Every code change is opt-in by environment (`HOST`, `API_INTERNAL_URL`, the supervisor). The same
commit deploys either way:

| Layout                     | Build                                          | Start                                                   |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Single service (default)   | `npm run build` at the root                    | `npm start` at the root (supervisor)                    |
| Two services (alternative) | as runbook §1.3/§1.4 today                     | as today                                                |
| Plan B (VPS)               | `backend/Dockerfile` + a web image, or `Dockerfile.single-service` | container command                       |

PR 2 rewrites runbook §1–§4 and `deploy-seenode.md` around the single service and keeps the
two-service steps as an appendix.

### D10 — Local reproduction without Seenode

- **`Dockerfile.single-service`** at the root: `node:20-bookworm-slim` + `openssl ca-certificates`,
  `COPY . .`, `RUN npm run build` (the root script of D3), `EXPOSE 3000`,
  `CMD ["node", "scripts/start-prod.mjs"]` — the same commands the panel runs. `.dockerignore`
  excludes `node_modules`, `.next`, `dist`, `backups`, `uploads`, `.env*` (except `*.example`), `e2e`,
  `.git`.
- Run against the local Postgres:
  `docker run --rm --memory=512m --cpus=0.2 -p 3000:3000 -e DATABASE_URL=postgresql://…@host.docker.internal:5433/reto_constancia?schema=public&connection_limit=5 -e NODE_ENV=production -e CORS_ORIGIN=http://localhost:3000 …`
  with throwaway JWT secrets (never real values).
- `scripts/single-service-smoke.mjs <base-url>`: `/` 200; `/api/health` 200; `/api/health/db` 200;
  `/api/docs` 404; a protected route without session 401; web headers of D6 present; the
  login-limit cases of D5. Exit 0 with `OK`, 1 with the failing checks. It uses a non-existent email,
  so it never touches a real account. It is also what PR 2 tells the owner to run against
  `https://<servicio>.seenode.app` in phase 5.
- Without Docker: `npm run build` then `npm start` at the root on a Linux/macOS shell (Windows works
  too: the supervisor is Node).

## Phase 1 dependency

Phase 1 of `docs/despliegue/RUNBOOK-DESPLIEGUE.md` is the owner's, with his trial account. What its
results change here:

| Phase 1 finding                                     | Effect on this change                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No PostgreSQL 16 / no external DB access (rules 1–2) | Platform goes to plan B; D1, D2, D6, D8, D10 stay useful (VPS runs `Dockerfile.single-service`) |
| Build or runtime does not fit 0.5 GB / 750 MB       | Retune D4 variables; if still short, standalone output (follow-up) or Standard (reopens decision) |
| Seenode needs a Dockerfile or ignores the root `package.json` | Point the service at `Dockerfile.single-service` instead of D3's commands             |
| More than one Seenode proxy hop                     | Panel `TRUST_PROXY` = number of hops (D5); no code change                                   |
| Health check path not configurable                  | Seenode probes `/`; still covers Next; D7 note in the runbook                                |

PR 1 is safe to merge before phase 1 (opt-in, no effect on dev/CI); PR 2 waits for phase 1 so the
runbook records real values.

## Risks / Trade-offs

- **One container, two processes** (accepted in the decision): an OOM takes both down. Mitigation:
  heap caps (D4), supervisor exit (D1), health check of both (D7).
- **Next rewrite proxy behaviour** (`X-Forwarded-For` appending, timeouts, large bodies for the Excel
  import) is not a documented contract. Mitigation: the smoke test pins it on the exact Next version;
  re-run it after every Next upgrade.
- **Build memory on Seenode's builder is unknown**: the 400 MB cap may be too low (slow GC) or
  unnecessary. Measured in phase 1 row 5.
- **Disk 750 MB**: two `node_modules` after prune plus `.next` may be close. The build prints sizes.
- **Filtered env for Next** could hide a variable a future server-side feature needs; the allowlist
  is in one place and covered by a test.

## Migration Plan

No schema change and no data migration. Nothing is deployed yet, so there is no cut-over: the first
deployment follows PR 2's runbook. Rollback of the code: redeploy the previous tag (single service)
or the two-service layout, which this change does not break.

## Open Questions

Defaults below apply unless the owner says otherwise.

- **P1 [BLOQUEANTE] — Order with phase 1.** (a) Implement PR 1 now, in parallel with phase 1; PR 2
  after phase 1. (b) Wait for phase 1 before any code. **Recommendation: (a)** — PR 1 is opt-in and
  harmless, and its local Docker run de-risks phase 1 rows 5–6 before the trial's 7 days run out.
- **P2 [NO BLOQUEANTE] — Supervisor language.** `.mjs` (D1) instead of the `.sh` named in the
  decision checklist. **Recommendation: `.mjs`**; the decision document's checklist line is updated
  in PR 2.
- **P3 [NO BLOQUEANTE] — `TRUST_PROXY` default.** Supervisor defaults it when unset (D5) vs. making it
  mandatory in the panel. **Recommendation: default** plus the phase 5 check. *Outcome: the owner
  approved the default; the measured value is 1, not the 2 first drafted (see D5).*
- **P4 [NO BLOQUEANTE] — Production default layout.** Single service as the documented default, two
  services as an appendix (D9). **Recommendation: yes.**
- **P5 [NO BLOQUEANTE] — HSTS max-age.** 180 days without `preload` (D6) vs. one year.
  **Recommendation: 180 days.**
- **P6 [NO BLOQUEANTE] — Smoke in CI.** Add a job that builds `Dockerfile.single-service` and runs the
  smoke. **Recommendation: not now** (adds minutes to every PR; the manual cases run before each
  release and after Next upgrades); revisit if the single-service code changes often.
- **P7 [NO BLOQUEANTE] — Memory defaults** 224 / 160 / 400 MB (D4). **Recommendation: keep**, retune
  with phase 1 numbers.
