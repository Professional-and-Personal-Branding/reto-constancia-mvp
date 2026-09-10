# Project Gitflow

Branching model to keep `main` always deployable.

## Main branches

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Stable, releasable code. Only receives merges from `release/*` or `hotfix/*`. | Production |
| `develop` | Continuous integration of finished features. | Staging |

## Supporting branches

| Prefix | Branches from | Merges into | Use |
|---|---|---|---|
| `feature/*` | `develop` | `develop` | New features (e.g. `feature/bulk-import`) |
| `fix/*` | `develop` | `develop` | Non-urgent fixes |
| `release/*` | `develop` | `main` + `develop` | Prepare a release (bump, changelog, QA) |
| `hotfix/*` | `main` | `main` + `develop` | Urgent production fix |

## Typical feature flow

```bash
git checkout develop
git pull
git checkout -b feature/my-feature
# ...work + commits...
git push -u origin feature/my-feature
# Open a PR into develop. Requires: green CI (lint + build + test) and 1 review.
```

## Commit convention

We use Conventional Commits:

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance (deps, config)
- `docs:` documentation
- `test:` tests
- `refactor:` refactor with no functional change
- `ci:` pipeline

Example: `feat(import): bulk import of participants from CSV/XLSX`

## Rules

- Never commit directly to `main`.
- `develop` and `main` are protected: merge only via PR with green CI.
- One feature = one branch = one small, reviewable PR.
