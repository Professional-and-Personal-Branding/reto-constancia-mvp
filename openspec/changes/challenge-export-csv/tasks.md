## 1. Builder and endpoint

- [x] 1.1 `challenges/challenge-export.ts`: `buildChallengeCsv` (columns, quoting, formula neutralising, BOM added by the caller); unit tests for accents, commas, quotes, line breaks, `=`/`+`/`-`/`@` cells, money and date formats, winners and prize, empty challenge
- [x] 1.2 Service method joining `getResults` and `getFinance` (winners from stored awards; `404` and `400` rules) and the `GET :id/export` route with `@Roles(ADMIN)`, `format` validation, headers and file name (D5); unit tests

## 2. API e2e

- [x] 2.1 `backend/test/challenge-export.e2e-spec.ts`: participant `403`, active `400`, unknown format `400`, missing `404`, closed `200` with BOM, header, rows in ranking order, payment states, stored draw winner flagged and no proof links; the challenge data is unchanged afterwards

## 3. Web

- [x] 3.1 "Descargar acta (CSV)" on the ranking page for admins on closed challenges, with the download helper and error text; Playwright journey (admin downloads and the file name and header are checked; participant has no button)

## 4. Docs and verification

- [x] 4.1 Runbook: monthly routine step (export the record, keep it private, how to open it in Excel); guide ranking section; `docs/testing.md`; CHANGELOG under "Sin publicar"
- [x] 4.2 QA catalog cases linked to every new test ("Pruebas sin caso: 0"); reset the DB; `node scripts/run-tests.mjs` (11/11) and `node scripts/validate-test-cases.mjs`
- [ ] 4.3 Open the PR to `develop` with the 3 CI jobs green; after merge, archive the change
