## Why

The bulk import already covers historical data through CSV/XLSX files, but the group keeps its day-to-day log in a Google Sheet: every sync means exporting a file and uploading it, and the admin cannot preview what changed without that round trip. Reading the sheet directly (phase 2 announced in `docs/import-template.md`) removes the export step, keeps one source of truth for the manual log, and reuses the validation, warnings and idempotency rules the file import already has.

## What Changes

- New admin endpoints to import **directly from a Google Sheet**: `POST /import/sheet/preview` (dry-run) and `POST /import/sheet/commit`, taking `spreadsheetId` and an optional `range`/sheet name, plus the same options as the file commit (`defaultStatus`, `duplicateStrategy`, `defaultPassword`).
- Rows read from the sheet SHALL go through **exactly the same pipeline** as file rows: same headers (the template), same row validation, same heart-rate warnings, same skip/update semantics. The file import is refactored so preview/commit accept parsed rows from either source.
- **Access with a service account** (server-side credentials, read-only scope). The sheet is shared with the service account email; no user OAuth. When credentials are not configured the sheet endpoints answer `503` with an explicit message, and the file import keeps working.
- A **connection check** endpoint `GET /import/sheet/status` tells the UI whether the integration is configured and, when a spreadsheet id is given, whether it is readable (title, sheet names, row count).
- **Web**: the import page gains a "Desde Google Sheets" section (spreadsheet id, sheet/range, status, preview and commit with the same result tables as the file flow), shown as unavailable when the backend is not configured.
- Docs: `docs/import-template.md` (setup guide: Google Cloud project, service account, share the sheet, env vars), `docs/deploy-seenode.md` or README (new env vars), `docs/test-cases.md` (new cases), `docs/architecture.md` (endpoints).

No **BREAKING** change: file endpoints keep their contracts; sheet endpoints are additive and disabled by default.

## Capabilities

### New Capabilities
- `google-sheets-import`: reading a spreadsheet through a service account, the connection status, and importing its rows with the same validation and idempotency as the file import.

### Modified Capabilities
<!-- none: the file import has no main spec yet; its behavior is unchanged and is referenced, not modified -->

## Impact

- **Backend**: `backend/src/import/sheets.client.ts` (thin client: service-account JWT + Sheets REST `values.get` and `spreadsheets.get`, injectable so tests can fake it), `import.service.ts` (refactor: `previewRows()`/`commitRows()` shared by file and sheet; `previewSheet()`/`commitSheet()`), `import.controller.ts` (three endpoints), `import.module.ts`, `dto/sheet-import.dto.ts`, config (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, optional `GOOGLE_SHEETS_DEFAULT_RANGE`), unit specs (`sheets.client.spec.ts`, `import.service.spec.ts` extended), e2e `import-sheet.e2e-spec.ts` with a fake client.
- **Dependencies**: `google-auth-library` (JWT for the service account). No `googleapis` bundle; Sheets REST is called with `fetch`.
- **Database**: no schema change.
- **Frontend**: `app/dashboard/admin/import/page.tsx` (new section), `lib/types.ts` (`SheetStatus`).
- **Scripts/Docs**: `scripts/parallel-session-test.mjs` (status endpoint reports not configured or configured), `docs/import-template.md`, `docs/test-cases.md`, `docs/architecture.md`, `backend/.env.example`, `README.md`.
