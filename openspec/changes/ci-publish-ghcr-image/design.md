## Context

- `ci.yml` runs three required jobs (Backend, Frontend, E2E de UI) on `push` to `main`/`develop`
  and on `pull_request`, on `ubuntu-24.04`, with `concurrency` cancelling superseded PR runs. It
  publishes nothing.
- `Dockerfile.single-service` (from `single-service-deploy`, target 1.16.0) is one stage based on
  `node:20-bookworm-slim` (unpinned tag), runs `npm run build` as `USER node`, has a `HEALTHCHECK`
  on `/api/health` and starts `scripts/start-prod.mjs`. It needs no build arguments and contains no
  secrets (runtime variables come from the platform). About 540 MB uncompressed.
- Releases follow `docs/gitflow.md` and `CLAUDE.md`: `release/X.Y.Z` → PR to `main` (3 green checks,
  the owner merges) → annotated tag `vX.Y.Z` on the merge commit of `main` → back-merge.
- The repository is **public** (organization `Professional-and-Personal-Branding`), so standard
  GitHub-hosted runners do not consume Actions minutes [S: GitHub's current policy].
- Annex C.6 sketched this change (publish by SHA, record the digest, scan, private package, never
  from a PR). The owner approved writing the spec first.

## Goals / Non-Goals

**Goals:** every release has one immutable, scanned, private `linux/amd64` image in GHCR, addressable
by version, by commit and by digest, so a later deployment change can deploy and roll back by digest.

**Non-Goals:** see the proposal (deployment, Dockerfile changes, signing, multi-arch, cleanup).

## Decisions

### D1 — Triggers: release tag and manual dispatch; never PRs or branch pushes
`on: push: tags: ['v*.*.*']` and `on: workflow_dispatch`. No `pull_request`, no `push` to
branches. Rationale: what reaches production is a release (runbook §2), the release PR already passed
the 3 required jobs, and building on every merge to `develop` would fill the registry with images
nobody deploys (and churn storage, D10). `workflow_dispatch` covers pre-release verification (for
example, testing the image path in Seenode's phase 1 from `develop` or a `release/*` branch) and
re-publishing after a fixed infrastructure failure.
Alternative kept as P1: also publish on every push to `develop` (Annex C.3 "build once, promote").

### D2 — Guards before any build on a tag
The job fails without building or pushing when: the tag does not match `^v\d+\.\d+\.\d+$`; it differs
from `v` + `version` in `backend/package.json` (the three `package.json` share the version per the
release procedure); or its commit is not an ancestor of `origin/main` (checkout with full history for
the check). A dispatch run skips the version check, publishes only `sha-<commit>` and records the ref
it ran on. Rationale: a tag pushed from a feature branch, or a typo, must not produce a "release"
image.

### D3 — `linux/amd64` only, single manifest, no layer cache
`platforms: linux/amd64` on an `ubuntu-24.04` GitHub-hosted runner (native amd64, no QEMU).
`provenance: false` and `sbom: false`: by default buildx wraps the image in an index with an
attestation manifest (`unknown/unknown`), which some pullers mishandle and which makes "the digest"
ambiguous. With both off, the pushed digest is the image manifest digest that a platform pulls.
No `cache-from/cache-to: type=gha`: the GitHub Actions cache is shared with the npm caches of
`ci.yml` (10 GB per repository) and a ~540 MB image cache could evict them; builds are per release,
so the cache saves little.

### D4 — Name, tags and labels; no `latest`
Image: `ghcr.io/<lowercased repository owner>/reto-constancia`. Tags on a release: `X.Y.Z` (without
`v`, semver convention of `docker/metadata-action`) and `sha-<40-char commit>`; on a dispatch: only
`sha-<40-char commit>`. OCI labels: `org.opencontainers.image.source` (the repository URL, which also
links the package to the repository), `revision` (commit), `version` (`X.Y.Z` or the ref on dispatch),
`created`, `title`. **No `latest`**: Annex B.5 forbids deploying `latest`, and Annex C.3 moves it only
after a health check, which belongs to the deployment change.

### D5 — Release tags are immutable
GHCR has no native tag immutability [S]. Before pushing a release, the job looks up `X.Y.Z` in the
registry (`docker buildx imagetools inspect`): if it exists, the job **does not push**, writes the
existing digest to the summary and ends successfully (so re-running a finished run is harmless). A
`sha-<commit>` tag may be re-pushed only by a dispatch; that never moves `X.Y.Z`.
Consequence: a broken release image is fixed with a new patch version, never by re-tagging.

### D6 — Scan before push, block CRITICAL with a fix
Build with `load: true` into the runner's Docker, scan the local image with Trivy (OS packages and
`node_modules`), then push the same image. Fail on `CRITICAL` with `ignore-unfixed: true`; list
`HIGH` (and unfixed `CRITICAL`) in the job summary without failing. Rationale: scanning after push
(Annex C.2 sketch) would leave a vulnerable release in the registry. Exceptions go in a versioned
`.trivyignore` with the CVE, the reason and a review date, reviewed in the release PR; the vulnerability
database download failing fails the job (no silent pass).
Threshold matches Annex C.4 (CRITICAL); Annex B.5's stricter "HIGH and CRITICAL" is P3.

### D7 — Minimal permissions and pinned actions
Workflow-level `permissions: {}`; the job declares `contents: read` and `packages: write` only (no
`id-token`, no `contents: write`). Registry login with `GITHUB_TOKEN` (ephemeral; no PAT, no new
secret). First-party actions follow `ci.yml` (`actions/checkout@v7`). Third-party actions
(`docker/*`, `aquasecurity/trivy-action`) are pinned by **full commit SHA** with the version in a
comment, per supply-chain practice (Annex B.5; trivy-action's own tags are not trusted as immutable).
`persist-credentials: false` on checkout. No `${{ github.event.* }}` value is interpolated into shell
scripts (tag and ref are passed through `env`).

### D8 — Digest record and rollback contract
The job summary lists `ghcr.io/…/reto-constancia@sha256:<digest>`, the tags, the commit, the
uncompressed size and the scan result; the digest is also a job output for a future deployment
workflow. When the uncompressed size is 700 MB or more the job emits a non-failing warning (Seenode
Basic disk is 750 MB, Annex C.7). The runbook's registry (§8) records the deployed digest per release,
and §4 gains: "image path: redeploy the previous release's `@sha256:` digest" (the data rule of §4
and §5.1 is unchanged: migrations only move forward). Rollback is therefore by digest, never by a
mutable tag.

### D9 — Private package
The package is private (owner's instruction). The first publication creates it; a task sets and
verifies visibility "Private" and that the repository has `Write` on it (Actions access), because
GHCR's default for a package created from a public repository is not verified [S]. Pulling it later
needs a read credential (classic PAT `read:packages`, account-wide; Annex B.2/B.7): that is the
deployment change's problem. See P2.

### D10 — No automatic cleanup in this change
Release versions (`X.Y.Z`) are kept indefinitely: they are the rollback targets. Dispatch-only
versions (`sha-*` without a release tag) may be deleted by hand after 30 days; the runbook documents
the steps. With one image per release (about 16 releases so far) storage grows slowly; GHCR storage
billing for private packages is not verified [S]. Automated pruning (scheduled job) is P4.

### D11 — Isolation from the required CI
Separate file, separate triggers (no overlap with `ci.yml`), own `concurrency` group
`publish-image-${{ github.ref }}` with `cancel-in-progress: false` (a publication is never cancelled
half-way), `timeout-minutes: 30`, fixed `runs-on: ubuntu-24.04`. It is **not** added to the branch
protection's required checks, and it never runs on PRs, so it cannot block or slow a PR. The only
overlap is in time: the tag push happens right after the release merge, while `ci.yml` runs on
`main`; both use GitHub-hosted runners in parallel.

## Risks / Trade-offs

- **Base image `node:20-bookworm-slim`**: Node 20 reached end of life in April 2026, and the tag is
  not pinned by digest, so two builds of the same commit can differ and the first scan may fail on a
  CRITICAL. Mitigation: the digest (not the commit) is the identity (D8); a scan failure blocks only
  publication, never a PR; a separate change bumps the base to Node 22 (as `ci.yml` uses) and pins it
  by digest (P5).
- **Rebuild instead of promote**: the release image is built at the tag, not promoted from an image
  already tested elsewhere. Accepted: the release PR passed the 3 jobs on the same tree, and the
  digest built at the tag is the one recorded and deployed.
- **Third-party actions** can be compromised: pinned by SHA (D7), minimal token scope, no secrets
  beyond `GITHUB_TOKEN`.
- **Size ~540 MB** vs. 750 MB of disk on Seenode Basic: reported every publication (D8); the
  multi-stage change addresses it before wave 1b.
- **Private package + public repository**: anyone can rebuild the image from the public source, so
  privacy protects little and adds a read credential later (P2).

## Migration Plan

No schema change, no data migration, nothing deployed. Merge the workflow to `develop`; verify with a
`workflow_dispatch` from `develop` (dispatch image only); the first release tag after the merge
(1.16.0) publishes the first release image. Rollback of this change: delete or disable the workflow;
already published versions stay in GHCR and can be deleted by hand.

## Open Questions

Defaults below apply unless the owner says otherwise.

- **P1 [NO BLOQUEANTE] — When to publish.** (a) Release tag `vX.Y.Z` + manual dispatch (D1).
  (b) Also every push to `develop` (`sha-*`), promoting at release. (c) Also every push to
  `release/*`. **Recommendation: (a)** — one image per release, nothing to prune, and dispatch covers
  verification; (b) only pays off with a promote step that needs tree matching between the release tip
  and the merge commit, which is out of scope.
- **P2 [NO BLOQUEANTE] — Package visibility.** (a) Private (D9, owner's instruction). (b) Public,
  since the repository and its source are public: no read credential for Seenode and no
  account-wide PAT (Annex B.7, risk 4). **Recommendation: (a) now as instructed**; reconsider in the
  deployment change, where the PAT risk becomes real.
- **P3 [NO BLOQUEANTE] — Scan threshold.** (a) Block CRITICAL with fix (D6, Annex C.4). (b) Block HIGH
  and CRITICAL with fix (Annex B.5). **Recommendation: (a)**, with HIGH listed in the summary; move to
  (b) after the base image bump (P5).
- **P4 [NO BLOQUEANTE] — Retention.** (a) Keep releases indefinitely, delete dispatch images by hand
  after 30 days (D10). (b) Scheduled pruning job. **Recommendation: (a)**; revisit if storage passes
  2 GB or billing starts.
- **P5 [NO BLOQUEANTE] — Base image follow-up.** Open a separate change to bump
  `Dockerfile.single-service` to Node 22 and pin the base by digest (and, later, multi-stage).
  **Recommendation: yes, right after this one**, before the first image deployment.
- **P6 [NO BLOQUEANTE] — Strategy document in the repository.**
  `docs/despliegue/ESTRATEGIA-MULTI-APP-2026-11-26.md` is untracked in the owner's checkout, so this
  change links to a file not on `develop`. **Recommendation:** version it in its own `docs:` PR; until
  then the references are informative.
- **P7 [NO BLOQUEANTE] — Runner variable.** Keep `runs-on: ubuntu-24.04` fixed like `ci.yml` (D11)
  vs. `vars.RUNNER` (Annex C.4). **Recommendation: fixed**: the repository is public (no minutes), and
  a self-hosted runner with `packages: write` is a larger surface.
