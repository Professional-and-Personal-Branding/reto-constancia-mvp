## 0. Approval and phase 1

- [x] 0.1 The owner approves these artifacts (proposal, design D1–D10 and the defaults of Open Questions P1–P7); no code before that
- [ ] 0.2 The owner runs phase 1 of `docs/despliegue/RUNBOOK-DESPLIEGUE.md` with his Seenode trial account (PostgreSQL 16, external database access with origin control and `db-backup.mjs` `OK`, build and runtime resources, redeploy of a previous commit) and records it in its "Registro de la fase 1"; any finding in the design's "Phase 1 dependency" table updates this change before PR 2
- [x] 0.3 Branch `feature/single-service-deploy` from `develop` for PR 1 (per P1, it may start before 0.2 ends)

## 1. PR 1 — Tests first

- [x] 1.1 `backend/src/common/http.spec.ts`: `resolveListenHost` (unset/empty → `undefined`, `127.0.0.1` kept, whitespace trimmed); run it and see it fail
- [x] 1.2 `scripts/lib/supervisor.test.mjs` (`node:test`, fake children built with `process.execPath -e`): migration failure exits with its code and starts nothing; API health timeout exits 1 without starting the web; web starts only after health 200; a child exiting (code 0, 1 and by signal) stops the other and exits non-zero; SIGTERM forwarded to both, exit 0 within the grace period and 1 after SIGKILL; second signal ignored; web env has no `DATABASE_URL`/`JWT_*`/`CLOUDINARY_API_SECRET`/`SEED_*`; `TRUST_PROXY` defaulted to 1 only when unset; `connection_limit` warning present in production without it and never containing the URL, user or password
- [x] 1.3 `frontend/lib/deploy-config.test.ts` (existing `node:test` runner): `apiRewrites` empty without `API_INTERNAL_URL` and one `/api/:path*` rule with it; `securityHeaders` returns the five headers of D6 for `/((?!api/).*)`; `apiBaseUrl({ server: true })` never returns a relative URL
- [x] 1.4 Battery: new step `repo:scripts` (`node --test scripts/lib/`) in `scripts/run-tests.mjs`; the count goes from 13 to 14

## 2. PR 1 — Implementation

- [x] 2.1 `backend/src/common/http.ts` `resolveListenHost`; `backend/src/main.ts` `app.listen(port, host)` only when defined (D8); `backend/.env.example` documents `HOST` (commented)
- [x] 2.2 `scripts/lib/supervisor.mjs` + `scripts/start-prod.mjs` (D1, D4 warning, D5 default) with a usage header in the style of `scripts/db-backup.mjs`
- [x] 2.3 `scripts/build-prod.mjs` (D3) and the minimal root `package.json` (`private`, `engines`, `build`, `start`; no dependencies)
- [x] 2.4 `frontend/lib/deploy-config.mjs` and `frontend/next.config.mjs`: rewrites and `experimental.proxyTimeout` only with `API_INTERNAL_URL`, `headers()` of D6, `poweredByHeader: false`; `frontend/.env.example` documents `API_INTERNAL_URL` (commented) and the `/api` value for this mode
- [x] 2.5 `Dockerfile.single-service` and root `.dockerignore` (D10)
- [x] 2.6 `scripts/single-service-smoke.mjs <base-url>` (D10, D5 cases with `X-Forwarded-For`)
- [x] 2.7 New files formatted with `node scripts/format.mjs`; existing files are not reformatted

## 3. PR 1 — Verification (local only; record each run)

- [x] 3.1 `docker build -f Dockerfile.single-service -t reto-single .` and `docker run --memory=512m --cpus=0.2` against the local Postgres (port 5433 via `host.docker.internal`, `connection_limit=5`, throwaway JWT secrets): `node scripts/single-service-smoke.mjs http://localhost:3000` → `OK`; record build time, peak memory (`docker stats`) and `du -sh` of `backend/` and `frontend/` inside the container
- [x] 3.2 Same container with `TRUST_PROXY=0` and with `TRUST_PROXY=2`: the smoke fails the expected check (spec scenario "Wrong proxy configuration detected"); if the default does not pass, revise D5 before merging (done: the default is 1, not 2, because Next does not append its hop)
- [x] 3.3 `docker kill --signal=SIGTERM` → logs show "Conexión a la base cerrada" and the container exits 0; `docker exec … kill <api pid>` → the container exits non-zero within 10 s
- [x] 3.4 Without `API_INTERNAL_URL`: `cd frontend && npm run build` behaves as before (no `/api` rewrite); `next dev` and the battery ports (3002/3005) unchanged
- [x] 3.5 Wait 60 s between login-limit runs (5 per minute per IP) so the battery's login steps do not get 429

## 4. PR 1 — QA catalog, docs of the change and PR

- [x] 4.1 `docs/qa/catalog.mjs`: `TC-HEALTH-07` "El servicio único arranca, responde y se detiene en orden" (auto: `supervisor.test.mjs` cases; manual: 3.1 and 3.3); `TC-HEALTH-08` "Si un proceso del servicio único muere, el contenedor termina" (auto + manual 3.3); `TC-SEC-15` "La web envía cabeceras de seguridad" (auto: `deploy-config.test.ts`; manual: `curl -sI`); `TC-SEC-16` "El límite de login distingue clientes detrás de la cadena de proxies" (manual: 3.1 and 3.2). If `scripts/validate-test-cases.mjs` does not collect `scripts/lib/*.test.mjs`, extend it so "Pruebas sin caso: 0" covers them
- [x] 4.2 `CLAUDE.md` and `docs/testing.md`: battery 14/14 and the new step; `docs/testing.md` §6 with the runs of section 3
- [x] 4.3 `CHANGELOG.md` `[Sin publicar]`: new optional variables (`HOST`, `API_INTERNAL_URL`, `API_PORT`, `API_MAX_OLD_SPACE_MB`, `WEB_MAX_OLD_SPACE_MB`, `BUILD_MAX_OLD_SPACE_MB`), new root files, no migration
- [x] 4.4 `node scripts/run-tests.mjs` 14/14, reset the database, `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"), `openspec validate --all --strict` (battery 14/14 and validator 173/173 done; `npx --yes @fission-ai/openspec@1.14.0 validate --all --strict` 19/19 on the merged branch; CLI 2.0.0 gives 4/19 for long requirements of other specs)
- [x] 4.5 PR 1 to `develop` in Spanish; the owner merges after the 3 CI jobs are green

## 5. PR 2 — Operational docs (after phase 1 and PR 1)

- [x] 5.1 Branch `chore/single-service-deploy-docs` from `develop`
- [x] 5.2 `docs/runbook-despliegue.md` header table (platform: one Web Service), §1 (1.2 database with `connection_limit=5`; 1.3 single service: Root Directory = repository root, Build `npm run build`, Start `npm start`, Port 3000, health check `/api/health`, variables including `NEXT_PUBLIC_API_URL=/api` as a build variable, `TRUST_PROXY` per phase 1, `CORS_ORIGIN` = the app URL; 1.4/1.5 merged; 1.6 adds `node scripts/single-service-smoke.mjs $BASE`), §2 (one redeploy, not two), §3 (smoke test URLs on one origin), §4 (rollback redeploys one service; "API y web juntas" becomes automatic) and §7 (new variables); two-service steps move to an appendix
- [x] 5.3 `docs/deploy-seenode.md`: diagram and steps for one Web Service; two-service layout as an alternative section
- [x] 5.4 `docs/despliegue/RUNBOOK-DESPLIEGUE.md`: phase 2 points to this change, phase 5 row 6 adds the two-network and forged-header check; `docs/despliegue/DECISION-DESPLIEGUE.md` checklist marks the code items done and names `start-prod.mjs`; also document that plan B without a proxy that sets X-Forwarded-For lets a client evade the login limit (review finding 12)
- [ ] 5.5 Values measured in phase 1 (memory, disk, build time, proxy hops) recorded in the runbook's limits table and in D4 defaults if they changed
- [ ] 5.6 `openspec validate --all --strict`; PR 2 to `develop` in Spanish; the owner merges

## 6. Release (1.16.0)

- [ ] 6.1 Archive the change in the release branch (`openspec archive single-service-deploy -y`); republish the guide and the runbook artifacts after the merge to `main`
