## Why

The multi-app deployment strategy (`docs/despliegue/ESTRATEGIA-MULTI-APP-2026-11-26.md`, Annex C;
Annexes A and E) makes an **OCI image in GHCR** the common artifact for every target (Seenode by
image, a VPS with Compose, Fly). Today `.github/workflows/ci.yml` only tests and builds: no image of
Reto exists outside a developer's machine, so a release cannot be pulled, inspected or rolled back by
digest. Annex C.6 names this change as the first step for Reto, and it does not depend on Seenode's
image path (still Beta and unverified from CI).

The image to publish already exists: `Dockerfile.single-service` (one stage, `USER node`,
`HEALTHCHECK`, about 540 MB), added by `single-service-deploy`. This change publishes it **as it is**.

## What Changes

- **New workflow `.github/workflows/publish-image.yml`**, separate from `ci.yml`:
  - Triggers: push of a release tag `vX.Y.Z` and `workflow_dispatch`. **Never** on `pull_request`
    nor on branch pushes (design D1).
  - Guards before building: the tag matches `vX.Y.Z`, equals the `version` of `backend/package.json`
    and its commit is reachable from `origin/main` (D2).
  - Builds `Dockerfile.single-service` for `linux/amd64` only, without provenance or SBOM
    attestations, so the digest is a single image manifest (D3).
  - Scans the built image **before pushing** and fails on CRITICAL vulnerabilities with a fix
    available; HIGH findings are reported, not blocking (D6).
  - Pushes `ghcr.io/<owner>/reto-constancia` with tags `X.Y.Z` and `sha-<full commit>` (dispatch:
    only `sha-<full commit>`), OCI labels (`source`, `revision`, `version`, `created`), and **never**
    `latest` (D4). A release tag already present in the registry is never overwritten (D5).
  - Writes the image reference by digest (`ghcr.io/…@sha256:…`), tags, revision and size to the job
    summary (D8).
  - Minimal permissions: workflow `permissions: {}`, job `contents: read` + `packages: write`; only
    `GITHUB_TOKEN`, no PAT and no new secret (D7).
- **Package visibility: private** (D9), set and verified after the first publication.
- **Docs:** `docs/runbook-despliegue.md` gets the image reference per release in §8 (registry) and
  "redeploy the previous release by digest" in §4 as the image-path rollback; `docs/gitflow.md`
  notes that pushing the release tag publishes the image.
- **QA:** manual cases `TC-HEALTH-09` (release publication) and `TC-SEC-17` (no publication from a
  PR, minimal permissions, scan gate).

> **Flagged explicitly**
> - **No schema change, no migration**; `@@unique([month, year])` untouched.
> - **No runtime dependency and no new application environment variable.**
> - **New CI dependencies (third-party actions)**: `docker/setup-buildx-action`,
>   `docker/login-action`, `docker/metadata-action`, `docker/build-push-action` and
>   `aquasecurity/trivy-action`, each pinned by full commit SHA (D7).
> - **New GitHub resource**: the GHCR package `reto-constancia` under the organization (private).
> - `Dockerfile.single-service` and `ci.yml` are **not modified**; the three required jobs (Backend,
>   Frontend, E2E de UI) and branch protection stay as they are.

## Non-goals

- Automatic or manual deployment to Seenode (by image or by Git), the GHCR read credential for
  Seenode, moving `latest` after a health check (later change, wave 1b of Annex D).
- Multi-stage `Dockerfile.single-service`, bumping its base image (`node:20-bookworm-slim`) or pinning
  it by digest (separate change; see Risks).
- `version` in `/api/health`, image signing (cosign), SBOM publication, multi-arch builds.
- External backup template (separate change, Annex B.4).
- A reusable cross-repository template (`deploy-templates`, Annex C.2): this workflow lives in Reto.
- Automatic cleanup of package versions (D10).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `platform-operations`: adds the release image publication (triggers and guards, platform, tags and
  immutability, scan gate, minimal permissions, private package, digest record, rollback by digest,
  isolation from the required CI jobs).

## Impact

- **CI (one PR):** new `.github/workflows/publish-image.yml`; no change to `ci.yml`.
- **Docs:** `docs/runbook-despliegue.md` §4 and §8, `docs/gitflow.md` (release section).
- **QA:** `TC-HEALTH-09`, `TC-SEC-17` in `docs/qa/catalog.mjs` (manual, with recorded evidence).
- **Test battery:** unchanged (13/13); the workflow does not run locally.
- **Unchanged:** application code, API contract, UI, Playwright journeys, the 3 required jobs.
- **First real run:** the first release tag after merge (target 1.16.0, which brings
  `Dockerfile.single-service`), or a `workflow_dispatch` from `develop` for verification.
