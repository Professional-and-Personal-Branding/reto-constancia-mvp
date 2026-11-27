## 0. Approval

- [ ] 0.1 The owner approves these artifacts (proposal, design D1–D11 and the defaults of Open Questions P1–P7); no workflow before that
- [ ] 0.2 Branch `chore/ci-publish-ghcr-image` from `develop`

## 1. Workflow

- [ ] 1.1 Resolve the full commit SHAs of the pinned versions of `docker/setup-buildx-action`, `docker/login-action`, `docker/metadata-action`, `docker/build-push-action` and `aquasecurity/trivy-action`, from each project's official repository (D7)
- [ ] 1.2 `.github/workflows/publish-image.yml`: triggers `push.tags: ['v*.*.*']` and `workflow_dispatch`; `permissions: {}`; job permissions `contents: read`, `packages: write`; `runs-on: ubuntu-24.04`; `timeout-minutes: 30`; concurrency `publish-image-${{ github.ref }}` without cancel (D1, D7, D11)
- [ ] 1.3 Guards on a tag: `vX.Y.Z` format, equal to `backend/package.json` version, ancestor of `origin/main` (checkout `fetch-depth: 0`, `persist-credentials: false`); tag and ref passed through `env`, never interpolated into scripts (D2, D7)
- [ ] 1.4 Immutability check: if `X.Y.Z` exists in GHCR, write its digest to the summary and end successfully without building (D5)
- [ ] 1.5 Build `Dockerfile.single-service` for `linux/amd64`, `load: true`, `provenance: false`, `sbom: false`, no GHA cache; tags and OCI labels from `docker/metadata-action` (version, `sha-<40 chars>`, no `latest`) (D3, D4)
- [ ] 1.6 Trivy scan of the local image: fail on fixable CRITICAL, HIGH and unfixed CRITICAL to the summary, database failure fails the job; `.trivyignore` only if a justified exception is needed (D6)
- [ ] 1.7 Push, then summary (reference by digest, tags, commit, uncompressed size, scan result, warning at ≥ 700 MB) and `digest` job output (D8)

## 2. Verification (on GitHub, after merge to `develop`)

- [ ] 2.1 The workflow's PR shows only the 3 required jobs; the publication workflow does not run on it
- [ ] 2.2 `workflow_dispatch` from `develop`: publishes only `sha-<commit>`; `docker buildx imagetools inspect` shows one `linux/amd64` manifest and the labels; record the digest
- [ ] 2.3 Set the package visibility to Private, grant the repository `Write` (Actions access), and confirm an anonymous `docker pull` is denied (D9)
- [ ] 2.4 Re-run the dispatch: `sha-<commit>` may be re-pushed, no version tag appears
- [ ] 2.5 At the first release tag (1.16.0): tags `1.16.0` and `sha-<commit>`; re-running the run pushes nothing and reports the same digest; pulling `@sha256:<digest>` works and `revision` equals the tag commit
- [ ] 2.6 Negative guards, on a throwaway tag that is deleted afterwards: a tag different from the package version fails before building (record the run link)

## 3. Docs and QA

- [ ] 3.1 `docs/runbook-despliegue.md`: §8 records the image digest per release; §4 adds "image path: redeploy the previous release's digest" (migrations rule unchanged); dispatch-image manual cleanup after 30 days (D10)
- [ ] 3.2 `docs/gitflow.md` (release section): pushing `vX.Y.Z` publishes the image; a broken image is fixed with a new patch version, never by re-tagging
- [ ] 3.3 `docs/qa/catalog.mjs`: `TC-HEALTH-09` "La release publica una imagen amd64 privada e inmutable en GHCR" (pre: release tag pushed; steps: inspect manifest and labels, re-run the run, pull by digest, anonymous pull; expected: one amd64 manifest, `revision` = tag commit, same digest after the re-run, anonymous pull denied) and `TC-SEC-17` "Ningún PR publica imágenes y la publicación usa permisos mínimos" (steps: open a PR, review the workflow permissions and action pins, check that the scan step runs before the push step and fails on fixable CRITICAL (evidence from the first run that trips it, or from a dispatch on a throwaway branch whose Dockerfile pins an old vulnerable base, deleted afterwards); expected: no run on the PR, only `contents: read` + `packages: write`, SHA pins, nothing pushed when the scan fails); both `manual` with the run links as evidence
- [ ] 3.4 `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0") and `npx --yes @fission-ai/openspec@1.14.0 validate --all --strict`
- [ ] 3.5 `CHANGELOG.md` entry in the next release section (new workflow, no migration, no application variable)

## 4. Close

- [ ] 4.1 PR to `develop` with the 3 required jobs green; the owner merges
- [ ] 4.2 Archive at the release that includes it (`openspec archive ci-publish-ghcr-image -y`)
