## Why

When a challenge closes, its result lives only in the database: who participated, how many days
each person validated, who paid how much, and who won. Nothing leaves the platform.

- **No record outside the platform.** The shared pot is real money. If the owner is ever asked
  "who won in May and how much was paid?", the only answer is a live query. The Seenode plan may
  not include database backups, so a closed challenge has no copy anywhere else.
- **The admin rebuilds the account by hand.** To settle a month they read the ranking page, the
  finance panel and the winners list, and copy numbers into a spreadsheet.
- **A closed challenge is final since 1.6.0.** Its ranking, payments and stored draw can no
  longer change, so a file exported today is still true tomorrow. That makes it a reliable
  record.

## What Changes

- **New endpoint** `GET /api/challenges/:id/export?format=csv`. Admin only, `COMPLETED`
  challenges only (anything else answers `400`). It never changes data.
- **One flat table, one row per participant**, in ranking order, with: position, name, email,
  validated, pending and rejected days, km, score, whether they qualified, payment state, amount
  paid, payment date, whether they won, the award note (for example the automatic draw) and the
  prize amount. The challenge name, period, currency, fee and pot are repeated in dedicated
  columns so the file stands alone when opened or merged.
- **Spreadsheet-safe file.**
  - UTF-8 with BOM so Excel keeps accents, `CRLF` line ends and the comma as separator, like the
    import template.
  - Text cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading
    apostrophe, because names come from public registration (formula injection).
  - `Content-Disposition: attachment; filename="acta-reto-YYYY-MM.csv"`.
- **Web:** an admin-only "Descargar acta (CSV)" button on the ranking page when a closed
  challenge is selected. It reuses the authenticated download used by the import template.
- **Runbook and guide:** the export is added to the monthly routine, as the copy of the result
  to keep outside Seenode. Not a replacement for database backups.
- No migration, no new packages, no change to any existing response.

## Non-goals

- Exporting active or draft challenges. Their data still moves; the file would be a snapshot
  that looks final.
- XLSX or PDF output, a second layout, or a per-activity export. Only the participant table.
- Payment proof links. The files are private evidence and the CSV is meant to be shared.
- Sending the file by email or storing it on the server.
- A public or participant-facing export. Participants already see the ranking.

## Capabilities

### New Capabilities
- `challenge-export`: the closed-challenge CSV record, its columns, its safety rules and its
  access control.

### Modified Capabilities
<!-- None -->

## Impact

- Backend: new `challenges/challenge-export.ts` (pure CSV builder) and an `exportCsv` method in
  `challenges.service.ts`, plus the route in `challenges.controller.ts`. It reuses
  `ResultsService.getResults` and `FinanceService.getFinance`.
- Web: button and download helper on `app/dashboard/results/page.tsx`.
- Tests:
  - unit tests for the builder (columns, escaping, BOM, injection, winners, payout);
  - API e2e: `403` for a participant, `400` for an active challenge, `200` with the right
    content for a closed one, and the stored draw winner flagged;
  - one Playwright journey that downloads the file as the admin;
  - QA catalog.
- Docs: `docs/runbook-despliegue.md` (monthly routine), guide section for the ranking,
  `docs/testing.md`, CHANGELOG.
