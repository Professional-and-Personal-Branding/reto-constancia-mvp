## Context

Verified against `develop` (3da134a):

- `docs/runbook-despliegue.md` §5.1 "Respaldo antes de migraciones": `pg_dump "$DATABASE_URL"
  --format=custom --file=reto-$(date +%Y%m%d-%H%M).dump` "desde una máquina con acceso a la base
  (o la shell del servicio)", kept outside Seenode; restore with `pg_restore --clean --if-exists
  --no-owner`. The deploy checklist (§2) and the rollback section (§4) point to it.
- `docker-compose.yml`: service `postgres`, `container_name: reto-constancia-db`,
  `postgres:16-alpine`, user/password `postgres`/`postgres`, database `reto_constancia`, port
  `5433:5432`. These are development values already in the repository.
- `scripts/lib/test-db.mjs` exports `databaseUrl(env)` (environment first, then `backend/.env`)
  and `assertLocalDatabase(url)` (host must be `localhost`, `127.0.0.1`, `::1` or `[::1]`).
- `scripts/cloudinary-orphans.mjs` is the precedent for an operational script (header comment
  with usage, reads `backend/.env`, loads `@prisma/client` from `backend/` with `createRequire`).
- This machine has no `pg_dump`, `pg_restore` or `psql` on the PATH; Docker Desktop is
  installed.
- `docs/qa/catalog.mjs` link kinds cover backend, web, API e2e, Playwright, the guide and the
  parallel-session script; root scripts are covered by `manual` cases (`TC-SEC-04`).

### Corrections to the cycle 2 proposal (CON-4)

- "Es la red de seguridad para la release 1.14, que trae la migración del reenvío de
  actividades": no change proposes that migration. Increment 2 of `resubmit-rejected-activity` is
  only recorded as future work (archived design D7, P4 "leave it as a future change"), and no
  release plan in `docs/` or `CHANGELOG.md` schedules it. The script is still needed before **any**
  release with a migration; the sentence about 1.14 is dropped.
- "Depende de tener `pg_dump` local y Docker": it needs **one** of the two. With Docker only (this
  machine) the client tools inside the container are used (D2).
- "Protegida por la guarda de `scripts/lib/test-db.mjs`": the guard protects the **restore
  target**. The **source** is normally production (remote) and is only read by `pg_dump`; the
  guard cannot apply to it and must not (D3).

## Goals / Non-Goals

**Goals:** one command that produces a dump and proves it restores with every row; safe by
construction (never writes outside a local temporary database); runs on this Windows + Docker
setup and on a machine with the client tools.

**Non-Goals:** scheduling, off-site upload, encryption, content checksums, restoring production.

## Decisions

### D1. Interface

```
node scripts/db-backup.mjs [--out <dir>] [--target <url>] [--tool auto|local|docker] [--file <dump>]
```

- Source: `databaseUrl()` (env `DATABASE_URL`, else `backend/.env`). For production the owner
  runs it with `DATABASE_URL` set in that shell only, as §5.1 already does.
- `--out`: default `backups/` at the repo root (git-ignored).
- `--target`: the local **maintenance** URL used to create and drop the temporary database;
  default `postgresql://postgres:postgres@localhost:5433/postgres` (the compose service).
- `--tool`: `auto` (default) uses the PATH tools if `pg_dump --version` runs, else Docker.
- `--file`: verify an existing dump instead of creating one (D6).
- No new environment variable.

### D2. Running the tools: PATH or `docker exec`

- **Local tools:** `spawn('pg_dump', ['--format=custom', '--dbname', src, '--file', out])`,
  `pg_restore --no-owner --no-privileges --exit-on-error --dbname <temp>`, counts through `psql`.
- **Docker:** `docker exec -i -e SRC reto-constancia-db sh -c 'pg_dump --format=custom --dbname="$SRC"'`
  with the script's stdout piped into the dump file (binary-safe stream); restore pipes the file into
  `docker exec -i reto-constancia-db pg_restore … --dbname=<temp inside the container>`. The URL is
  passed through the environment (`-e SRC` takes the value from the script's environment), never
  on the command line, so it does not show up in the process list.
- **Inside the container** `localhost:5433` does not exist: a local source or target URL is rewritten
  to `localhost:5432` for the container; a remote source is passed as is.
- **Version check:** the script reads the server major version of the source and the client major
  version; if the server is newer it stops with exit 2 and "pg_dump <v> no puede respaldar un
  servidor <w>; actualiza la imagen de la base local o usa un cliente <w>". (`postgres:16-alpine`
  covers servers up to 16.)
- All counting goes through `psql -At` in the same tool mode, so the script does not depend on
  `backend/node_modules`.

### D3. Safety rules

- `assertLocalDatabase(target)` before anything else (exit 2 with its message otherwise).
- The temporary database is always named `reto_restore_check_<YYYYMMDDHHMMSS>`; the script only
  creates and drops names with that prefix (checked again right before `DROP DATABASE`).
- If the source and the target point to the same host, port **and** database name, the script
  refuses (exit 2): restoring over the source is impossible by construction.
- Cleanup in `finally`: `DROP DATABASE IF EXISTS "<temp>" WITH (FORCE)` (Postgres 13+), also after
  `FALLO` or Ctrl+C (`SIGINT` handler).
- The script never runs `pg_restore --clean` and never connects to the source with write
  statements: only `pg_dump` and `SELECT count(*)`.

### D4. What is compared

- Tables: `information_schema.tables` where `table_schema = 'public'` and
  `table_type = 'BASE TABLE'`, including `_prisma_migrations` (proves the migration state).
- Source counts are taken **before and after** the dump. If they differ, the database changed
  during the dump and the result is `FALLO` "la base cambió durante el respaldo; repítelo en un
  momento sin actividad" (with the per-table difference). This avoids an exported snapshot, which
  a pooled connection may not support.
- Restored counts must equal the source counts table by table, and the set of tables must be
  equal. Any difference is `FALLO` with the table names.
- Report: one line per table (`tabla  origen  restaurada  ✓|✗`), then
  `OK: backups/reto-…dump verificado (N tablas, M filas)` or `FALLO: <motivo>`. No row content is
  printed.

### D5. Exit codes and files

- `0` OK; `1` FALLO (dump error, restore error, count mismatch, database changed); `2` refused
  (non-local target, same database, missing tools, incompatible version, bad arguments).
- On `1` the dump is renamed to `*.unverified.dump` so it is never mistaken for a good backup.
- The script never deletes old dumps (retention is a human decision, D7).

### D6. `--file` mode (dump made elsewhere)

When the database is only reachable from the Seenode shell (§5.1 allows it), the owner makes the
dump there with the §5.1 command, downloads it and runs `node scripts/db-backup.mjs --file
<dump>`. The script restores it into the temporary database, requires `_prisma_migrations` to exist
and be non-empty, prints the counts and ends with
`OK (sin comparación con el origen)`; the owner compares a couple of counts by eye with the
admin screens. It is a weaker check, labelled as such.

### D7. Runbook §5.1 (rewritten)

- **When:** before every deploy whose release notes list a migration, and once a month.
- **How (Windows, this project):** `docker compose up -d postgres`; in PowerShell
  `$env:DATABASE_URL = '<url de producción>'; node scripts/db-backup.mjs; Remove-Item Env:DATABASE_URL`
  (Git Bash: `DATABASE_URL='<url>' node scripts/db-backup.mjs`). With client tools installed it
  uses them; otherwise Docker.
- **Result:** deploy only after `OK`. `FALLO` → do not deploy; repeat; if it persists, check the
  version message and the report.
- **Where:** the `.dump` contains personal data (names, emails, payments): keep it off the
  repository and off Seenode, in an encrypted folder of the owner; never attach it to issues or
  chats.
- **Retention:** the last 3 verified dumps plus the one taken before each release with a migration
  until the next release with a migration is confirmed; delete the rest by hand.
- **Restore** (unchanged command, now pointing to a verified file).

## Risks / Trade-offs

- **A dump with personal data on the owner's disk** → git-ignored folder, runbook storage rules,
  `scan-secrets` does not need to read binaries; the script prints counts only.
- **Client/server version mismatch** → detected before dumping (D2), exit 2 with the fix.
- **Seenode not reachable from outside** → `--file` mode (D6), weaker but still proves the file
  restores.
- **Count check misses corrupted values** → accepted for the light version; `pg_restore
  --exit-on-error` already fails on structural damage.
- **Busy database makes it fail** → by design (D4); the platform has little traffic, so retrying
  succeeds.
- **Docker not running** → exit 2 "No se encontró pg_dump ni el contenedor reto-constancia-db".

## Migration Plan

No schema change and no data migration. The script and the runbook ship in one PR; nothing is
deployed. Rollback: revert the PR (the manual §5.1 commands remain valid).

## Open Questions

- **Defaults kept in this spec** (owner can change without blocking): output folder `backups/`;
  retention "last 3 + pre-migration"; monthly run in addition to pre-migration.
