## ADDED Requirements

### Requirement: Database backups are verified by restoring them
The repository SHALL provide `scripts/db-backup.mjs`, which dumps the database named by
`DATABASE_URL` (or `backend/.env`) in PostgreSQL custom format to a dated file, restores it into a
newly created temporary database on a local server, compares the row count of every table of the
`public` schema (including `_prisma_migrations`) between the source and the restored copy, drops
the temporary database and ends with `OK` and exit code 0 only when every count matches. It SHALL
use the PostgreSQL client tools of the PATH when available and otherwise the ones of the
`reto-constancia-db` container. It MUST refuse to run (exit code 2, no database created) when the
restore target is not local, and it MUST NOT write to the source database. It SHALL require no new
dependency and no new environment variable.

#### Scenario: Backup restores with the same counts
- **GIVEN** the local development database with the seed loaded
- **WHEN** the owner runs `node scripts/db-backup.mjs`
- **THEN** a file `backups/reto-YYYYMMDD-HHMM.dump` is written
- **AND** the report lists every table with equal source and restored counts
- **AND** the script prints `OK` and exits with code 0
- **AND** no `reto_restore_check_*` database remains on the local server

#### Scenario: A count differs
- **WHEN** the restored copy of any table has a different row count than the source, or a table is missing
- **THEN** the script prints `FALLO` naming the tables, exits with code 1, renames the dump to `*.unverified.dump` and drops the temporary database

#### Scenario: The database changes during the dump
- **WHEN** the source counts taken before and after the dump differ
- **THEN** the script prints `FALLO` "la base cambió durante el respaldo; repítelo en un momento sin actividad" and exits with code 1

#### Scenario: Non-local restore target
- **WHEN** the owner runs the script with `--target` pointing to a host that is not `localhost`, `127.0.0.1` or `::1`
- **THEN** the script exits with code 2 with the guard's message before creating any database or dump

#### Scenario: Restore target equals the source
- **WHEN** the source and the restore target are the same host, port and database
- **THEN** the script exits with code 2 without dumping or restoring

#### Scenario: No client tools, Docker available
- **GIVEN** a Windows machine without `pg_dump` on the PATH and the `reto-constancia-db` container running
- **WHEN** the owner runs the script
- **THEN** it dumps and restores through `docker exec` and reaches the same `OK`, without the database URL appearing on any command line

#### Scenario: Incompatible client version
- **WHEN** the source server's major version is newer than the client's
- **THEN** the script exits with code 2 explaining which client version is needed, before dumping

#### Scenario: Verifying a dump made elsewhere
- **GIVEN** a dump made with the runbook command in the service shell
- **WHEN** the owner runs `node scripts/db-backup.mjs --file <dump>`
- **THEN** the script restores it into a temporary local database, requires a non-empty `_prisma_migrations`, prints the counts and `OK (sin comparación con el origen)`, and drops the temporary database

#### Scenario: Truncated dump
- **WHEN** the owner verifies a truncated dump file with `--file`
- **THEN** the restore fails, the script prints `FALLO`, exits with code 1 and leaves no temporary database

### Requirement: The runbook makes the verified backup a deploy gate
`docs/runbook-despliegue.md` §5.1 SHALL instruct running `scripts/db-backup.mjs` before deploying
any release with a migration and SHALL forbid deploying such a release without an `OK` from it. It
SHALL document how to run the script on Windows with Docker, where to keep the dump files (outside
the repository and the hosting, as they contain personal data), how long to keep them and how to
restore one. `backups/` SHALL be ignored by git.

#### Scenario: Release with a migration
- **GIVEN** a release whose notes list a migration
- **WHEN** the owner follows the deploy checklist
- **THEN** the checklist points to §5.1 and requires the `OK` of the script before the deploy step

#### Scenario: Dumps are never committed
- **WHEN** the owner runs `git status` after a backup
- **THEN** the files under `backups/` are not listed
