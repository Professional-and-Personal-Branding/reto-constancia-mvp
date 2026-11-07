## Why

The rollback of every release with a migration depends on the backup of runbook §5.1, and that
backup has never been proven to restore:

- §5.1 is two hand-typed commands (`pg_dump … --format=custom` and `pg_restore --clean …`). There
  is no script, no check that the file restores, and no check that it contains every row.
- The runbook sends the owner to "restaurar el respaldo de §5.1" as the way back from a migration
  (§4, rollback). A dump that turns out to be truncated, made with an incompatible client or
  restored into the wrong database is discovered at the worst possible moment.
- This development machine (Windows) has **no PostgreSQL client tools on the PATH**; the only
  `pg_dump` available is the one inside the `reto-constancia-db` container
  (`postgres:16-alpine`, host port 5433), so the §5.1 commands do not even run here as written.

Source: CON-4 of `docs/propuestas-mejoras-ciclo2-2026-10-29.md`, approved by the owner on
2026-10-29 with P3 (a): a light OpenSpec change in `platform-operations`.

## What Changes

- **New `scripts/db-backup.mjs`** (Node, no new dependency):
  1. dumps the source database (`DATABASE_URL` from the environment, else `backend/.env`) to
     `backups/reto-YYYYMMDD-HHMM.dump` (custom format), counting the rows of every table right
     before and right after the dump;
  2. creates a temporary database `reto_restore_check_<timestamp>` on a **local** server (the
     guard of `scripts/lib/test-db.mjs`) and restores the dump into it;
  3. compares the row count of every table of the source with the restored copy;
  4. drops the temporary database (always, also on failure);
  5. prints a per-table report and ends with `OK` (exit 0) or `FALLO` (exit 1); refusals (non-local
     target, missing tools, bad arguments) exit 2. A dump that fails verification is renamed
     `*.unverified.dump`.
- **Tools:** it uses `pg_dump`/`pg_restore`/`psql` from the PATH when present, otherwise runs
  them with `docker exec` inside `reto-constancia-db`, streaming the dump through stdin/stdout.
- **`--file <dump>` mode** verifies an existing dump (for example one made in the Seenode shell)
  by restoring it into the temporary database and reporting its counts, without a source to
  compare against (labelled "sin comparación con el origen").
- **Runbook §5.1** is rewritten around the script: when to run it, how on Windows/Docker, where
  to keep the files, retention, and what to do with `FALLO`. `backups/` is git-ignored.
- **No schema change, no migration, no new dependency, no new environment variable** (it reuses
  `DATABASE_URL`).

## Non-goals

- Scheduled or automatic backups, uploading the dump anywhere, or encryption by the script.
- Restoring into production: the script only ever writes to a local temporary database; the real
  restore stays the manual `pg_restore` of the runbook.
- Comparing row contents (checksums); counts per table are the agreed light check.
- Any change to the API or the web.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `platform-operations`: adds the requirement that a database backup is verified by restoring it
  into a local temporary database and comparing row counts.

## Impact

- **Scripts:** new `scripts/db-backup.mjs`; `scripts/lib/test-db.mjs` reused as is
  (`databaseUrl`, `assertLocalDatabase`).
- **Repo:** `.gitignore` (`backups/`).
- **Docs:** `docs/runbook-despliegue.md` §5.1 (and the checklist line of §2 that points to it),
  `CHANGELOG.md` (`[Sin publicar]`).
- **QA:** new manual case `TC-HEALTH-06` with its recorded execution (the catalog has no test kind
  for root scripts; same approach as `TC-SEC-04`).
- **Delivery:** one PR (`chore/db-backup-verify` or `feature/`, as the owner prefers; the
  OpenSpec cycle applies either way).
