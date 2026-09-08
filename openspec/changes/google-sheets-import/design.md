## Context

See proposal.md - Why. Current state that shapes the approach:

- `ImportService.parse(buffer)` turns a CSV/XLSX buffer into `RawRow[]` (`Record<string, unknown>` keyed by header) and `preview(buffer)` / `commit(buffer, options, adminId)` call `parse()` then iterate rows with `validateRow()`, `applyRow()` and the heart-rate warnings. Everything after parsing is source-agnostic.
- `TEMPLATE_HEADERS` is the contract of the file; the sample template (`docs/import-template.csv`) matches it.
- `ConfigModule` is global; services read env through `ConfigService` (see `UploadService` for the "not configured -> feature disabled" pattern of the Cloudinary simulator).
- The import page already has options (`defaultStatus`, `duplicateStrategy`, `defaultPassword`), a preview table and a commit result block driven by `ImportPreviewResult` / `ImportCommitResult`.
- CI has no network access to Google; tests must not call the real API.

## Goals / Non-Goals

**Goals:**
- One import pipeline with two sources (file, sheet); zero duplication of validation or idempotency logic.
- Server-side credentials only; the browser never talks to Google.
- Testable without network: the Sheets client is an injectable boundary with a fake in tests.
- Clear operator experience: status endpoint + explicit "not configured" state.

**Non-Goals:**
- User OAuth (each admin authorizing their own Google account).
- Writing back to the sheet (marking rows as imported) - can be a later change.
- Scheduled/automatic sync; the admin triggers it.
- Reading photos from Drive; `photoUrl` stays a plain URL column.

## Decisions

1. **Service account + Sheets REST via `fetch`, JWT signed with Node's `crypto` (zero dependencies).**
   `SheetsAuth` (`backend/src/import/sheets-auth.ts`) implements the service-account flow documented by Google: build a JWT (`RS256`, claims `iss` = service account email, `scope` = `https://www.googleapis.com/auth/spreadsheets.readonly`, `aud` = `https://oauth2.googleapis.com/token`, `iat`/`exp` = now + 1h), sign it with `crypto.sign('RSA-SHA256', ...)` using `GOOGLE_PRIVATE_KEY` (with `\n` unescaping, as Seenode env vars are single-line), exchange it at the token endpoint with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, and cache the access token until 5 minutes before expiry. `SheetsClient` (`backend/src/import/sheets.client.ts`) uses it to call `GET https://sheets.googleapis.com/v4/spreadsheets/{id}?fields=properties.title,sheets.properties.title` and `GET .../values/{range}?valueRenderOption=FORMATTED_VALUE`.

   **Alternatives considered (kept here for future refactors):**
   - `google-auth-library` (official Google client): same flow with token caching, retries and clock-skew handling built in; adds one dependency plus transitives. Preferred if the integration grows (Drive, more scopes, many calls) - swap `SheetsAuth` for `new JWT({ email, key, scopes })` and keep `SheetsClient` untouched.
   - `googleapis` (full SDK): typed clients for every Google API; rejected for the MVP (tens of MB, slow cold start on Seenode).
   - Public CSV export link (`.../export?format=csv`) without credentials: trivial, but the sheet holds emails and would have to be public; rejected.
   - User OAuth (each admin authorizes their Google account): no service account needed, but requires a consent screen, per-user refresh tokens and more UI; excessive for the MVP.
   - Google API key: only works for public spreadsheets; rejected for the same privacy reason.

   Rationale for the zero-dependency choice: one or two calls per admin action, a stable and documented protocol, smaller supply-chain surface and faster cold starts. The auth class is ~40 lines, unit-tested with a mocked `fetch`, and isolated behind `SheetsClient` so any of the alternatives can replace it without touching the import pipeline.

2. **Client as an injectable boundary.** `SheetsClient` exposes `isConfigured()`, `getSpreadsheet(id)` and `getValues(id, range)`, and maps Google errors (403 -> `not_shared`, 404 -> `not_found`, 400 -> `invalid_range`). Tests provide a fake through Nest DI (`overrideProvider(SheetsClient)`) in e2e and a stub object in unit tests.

3. **Pipeline refactor in `ImportService`.** Extract `previewRows(rows: RawRow[])` and `commitRows(rows, options, adminId)` from the current methods; `preview(buffer)`/`commit(buffer, ...)` become `previewRows(parse(buffer))` etc. New `rowsFromSheet(values: string[][])`: first non-empty row is the header (trimmed, lower-cased, matched to `TEMPLATE_HEADERS` case-insensitively), required headers checked (`400` naming missing ones), empty rows skipped, every cell kept as string (same as CSV with `raw: true`).

4. **Endpoints.** `GET /import/sheet/status?spreadsheetId&range`, `POST /import/sheet/preview` and `POST /import/sheet/commit` with JSON body `{ spreadsheetId, range? }` (commit also accepts the existing `ImportOptionsDto` as query, like the file commit, for UI reuse). Default range: `GOOGLE_SHEETS_DEFAULT_RANGE` env or the first sheet (`A:Z`). All `@Roles(ADMIN)`. Not configured -> `ServiceUnavailableException`. Read failures -> `BadRequestException` with the mapped reason; commit reads the whole range before writing anything, so a read failure never leaves a partial import.

5. **Frontend.** New section in the import page: inputs (spreadsheet id, sheet/range), "Comprobar" (status), "Previsualizar" and "Importar" reusing the options and the result components. `useQuery(['import','sheet','status'])` on mount without id to learn `configured`; disabled state with explanation when false. Types: `SheetStatus`.

6. **Configuration and docs.** `.env.example` gains the three variables (commented). `docs/import-template.md` phase 2 section becomes a setup guide (create service account, download JSON, copy `client_email` and `private_key`, share the sheet with the email, keep the template header in row 1). README/deploy guide list the env vars.

## Risks / Trade-offs

- [Private key handling] -> only via env vars, never logged; `GOOGLE_PRIVATE_KEY` unescaped at load; docs warn not to commit it.
- [Google API quotas/latency] -> two calls per action, admin-triggered; no polling.
- [Header drift in the sheet] -> status endpoint reports row count and preview names missing headers; case/space-insensitive matching absorbs the common typos.
- [CI without network] -> fake client in tests; the real client has a unit test for URL/range building and error mapping only.
- [Same-day duplicates between file and sheet imports] -> the existing `(challenge, user, date)` idempotency applies to both sources.

## Migration Plan

No database change. Add the env vars to Seenode when the owner creates the service account; until then the endpoints answer `503` and the UI shows the disabled state. Rollback: redeploy the previous version; the variables are ignored.

## Open Questions

- Should the default spreadsheet id also live in env (`GOOGLE_SHEETS_SPREADSHEET_ID`) so the UI pre-fills it? Cosmetic; can be added without changing the spec (the id in the request always wins).
