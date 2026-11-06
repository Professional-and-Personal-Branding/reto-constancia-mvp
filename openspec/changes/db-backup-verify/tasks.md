## 0. Approval

- [ ] 0.1 The owner approves these artifacts (proposal, design D1–D7 and the defaults in Open Questions); no code before that
- [ ] 0.2 Branch from `develop` (one PR with the script, `.gitignore` and the runbook)

## 1. Script

- [ ] 1.1 `scripts/db-backup.mjs` with the usage header (style of `cloudinary-orphans.mjs`), argument parsing (D1) and exit codes (D5); new file, so Prettier applies (`node scripts/format.mjs`)
- [ ] 1.2 Tool detection and both modes (D2): PATH tools, or `docker exec -i` with the URL passed through `-e SRC`; URL rewrite of local hosts to `localhost:5432` inside the container; client/server version check
- [ ] 1.3 Safety (D3): `assertLocalDatabase(target)` first; `reto_restore_check_<timestamp>` prefix checked before every `DROP`; refuse source = target; cleanup in `finally` and on `SIGINT`
- [ ] 1.4 Counts (D4) before and after the dump and on the restored copy; per-table report; `*.unverified.dump` on failure
- [ ] 1.5 `--file` mode (D6)
- [ ] 1.6 `.gitignore`: `backups/`

## 2. Manual verification (local only; record each run)

- [ ] 2.1 `docker compose up -d postgres`, seed loaded: `node scripts/db-backup.mjs` → `OK`, exit 0, no `reto_restore_check_*` left (`docker exec reto-constancia-db psql -U postgres -Atc "select datname from pg_database"`)
- [ ] 2.2 `--target postgresql://postgres:postgres@example.com:5432/postgres` → exit 2, no file, no database
- [ ] 2.3 `--file` on a copy of the dump → `OK (sin comparación con el origen)`; on a truncated copy (first half of the bytes) → `FALLO`, exit 1, nothing left
- [ ] 2.4 `git status` shows nothing under `backups/`; `node scripts/scan-secrets.mjs` clean

## 3. QA catalog and docs

- [ ] 3.1 `docs/qa/catalog.mjs`: manual case `TC-HEALTH-06` "El respaldo de la base se verifica restaurándolo" (pre: Docker con `reto-constancia-db`; data: the commands of 2.1–2.3; expected: OK/exit 0, exit 2 for a non-local target, FALLO/exit 1 for a truncated dump, no temporary database left) with the date and evidence of section 2
- [ ] 3.2 `docs/runbook-despliegue.md` §5.1 rewritten per design D7; §2 checklist line "Respaldo de la base reciente (ver §5.1)" becomes "Respaldo verificado con `node scripts/db-backup.mjs` (OK) si la versión trae migraciones"
- [ ] 3.3 `CHANGELOG.md` `[Sin publicar]`; `docs/testing.md` §6 with the manual runs

## 4. Verification and PR

- [ ] 4.1 `node scripts/run-tests.mjs` 13/13 (format of the new file included), reset the database, `node scripts/validate-test-cases.mjs` ("Pruebas sin caso: 0"), `openspec validate --all --strict`
- [ ] 4.2 PR to `develop` in Spanish; the owner merges after the 3 CI jobs are green; it must be merged before the next release with a migration
- [ ] 4.3 After the merge, republish the runbook artifact at release time (`node scripts/build-runbook-artifact.mjs --ref origin/main`)
