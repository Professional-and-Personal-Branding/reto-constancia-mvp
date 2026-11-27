## ADDED Requirements

### Requirement: Release images are published only from release tags or a manual dispatch
The repository SHALL provide a workflow, separate from the required CI workflow, that builds
`Dockerfile.single-service` and publishes it to GHCR as `ghcr.io/<owner>/reto-constancia`. It SHALL
run only on the push of a tag matching `vX.Y.Z` and on a manual dispatch. It SHALL NOT run on pull
requests nor on branch pushes. On a tag, before building, it MUST fail without publishing when the tag
is not `vX.Y.Z`, differs from `v` plus the `version` of `backend/package.json`, or points to a commit
that is not reachable from `main`.

#### Scenario: Release tag
- **GIVEN** the release `X.Y.Z` merged to `main` and the tag `vX.Y.Z` on its merge commit
- **WHEN** the tag is pushed
- **THEN** the image is built, scanned and published with tags `X.Y.Z` and `sha-<commit>`

#### Scenario: Pull request
- **WHEN** a pull request is opened or updated against `develop` or `main`
- **THEN** the publication workflow does not run and nothing is pushed to the registry

#### Scenario: Tag that does not match the version
- **GIVEN** `backend/package.json` declares `1.16.0`
- **WHEN** the tag `v1.16.1` is pushed
- **THEN** the job fails before building and nothing is pushed

#### Scenario: Tag outside main
- **WHEN** a tag `vX.Y.Z` is pushed on a commit that is not reachable from `main`
- **THEN** the job fails before building and nothing is pushed

#### Scenario: Manual dispatch
- **WHEN** the workflow is dispatched by hand on a branch
- **THEN** the image is published only with the tag `sha-<commit>`, never with a version tag

### Requirement: The published image is a single linux/amd64 manifest with traceable labels
The image SHALL be built for `linux/amd64` only, without provenance or SBOM attestations, so that its
digest identifies one image manifest. It SHALL carry the OCI labels `source` (repository URL),
`revision` (commit), `version` and `created`. The workflow SHALL NOT publish the `latest` tag.

#### Scenario: Inspecting a release image
- **WHEN** the image `X.Y.Z` is inspected in the registry
- **THEN** it has one manifest, for `linux/amd64`
- **AND** its `revision` label equals the commit of the tag `vX.Y.Z` and its `version` label is `X.Y.Z`
- **AND** the package has no `latest` tag

### Requirement: Release image tags are immutable
A version tag `X.Y.Z` already present in the registry MUST NOT be overwritten. A run for an existing
version SHALL push nothing, report the existing digest and end successfully.

#### Scenario: Re-running a published release
- **GIVEN** `X.Y.Z` already published with digest `D`
- **WHEN** the workflow runs again for the tag `vX.Y.Z`
- **THEN** nothing is pushed, `X.Y.Z` still resolves to `D` and the summary reports `D`

### Requirement: Images are scanned before they are published
The workflow SHALL scan the built image before pushing it and MUST NOT push when the scan finds a
CRITICAL vulnerability with a fix available, unless the vulnerability is listed with a reason in the
versioned ignore file. HIGH findings and unfixed CRITICAL findings SHALL be listed in the job summary
without failing. A scan that cannot run (for example, the vulnerability database is unavailable) MUST
fail the job.

#### Scenario: Fixable critical vulnerability
- **WHEN** the scan reports a CRITICAL vulnerability with a fixed version available
- **THEN** the job fails and the registry receives no new version

#### Scenario: Only high findings
- **WHEN** the scan reports HIGH vulnerabilities and no fixable CRITICAL one
- **THEN** the image is published and the HIGH findings appear in the job summary

### Requirement: The publication uses minimal permissions and a private package
The workflow SHALL declare no default permissions and grant its job only `contents: read` and
`packages: write`. It SHALL authenticate to the registry with the workflow's `GITHUB_TOKEN` and use no
other secret. Third-party actions SHALL be pinned by full commit SHA. The GHCR package SHALL be
private.

#### Scenario: Permissions of the workflow
- **WHEN** the workflow file is reviewed
- **THEN** the top-level permissions are empty and the job grants only `contents: read` and
  `packages: write`
- **AND** every third-party action reference is a 40-character commit SHA

#### Scenario: Anonymous pull
- **WHEN** someone without credentials pulls `ghcr.io/<owner>/reto-constancia:X.Y.Z`
- **THEN** the registry denies it

### Requirement: The digest of each publication is recorded for rollback
Each run that publishes or finds a release SHALL write to its job summary the image reference by
digest (`ghcr.io/<owner>/reto-constancia@sha256:…`), its tags, the commit, the uncompressed size and
the scan result, and expose the digest as a job output. It SHALL emit a non-failing warning when the
uncompressed size is 700 MB or more. Release versions SHALL NOT be deleted automatically, so the
digest of every previous release stays pullable for rollback.

#### Scenario: Rollback target
- **GIVEN** releases `X.Y.Z` and a later `X.Y.(Z+1)` published
- **WHEN** an operator pulls the digest recorded for `X.Y.Z`
- **THEN** the pull succeeds and the image's `revision` label is the commit of `vX.Y.Z`

#### Scenario: Large image
- **WHEN** the uncompressed image is 700 MB or larger
- **THEN** the summary shows a warning and the job does not fail for that reason

### Requirement: The publication does not interfere with the required CI
The publication workflow SHALL NOT be a required check, SHALL use its own concurrency group without
cancelling a run in progress, and SHALL NOT modify the required CI workflow nor share its triggers.

#### Scenario: Release merge
- **WHEN** the release PR is merged to `main` and the tag is pushed
- **THEN** the required jobs (Backend, Frontend, E2E de UI) run as before on the push to `main`
- **AND** the publication runs as a separate workflow whose result does not gate any pull request
