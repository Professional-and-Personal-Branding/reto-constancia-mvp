## 1. Branch and baseline

- [ ] 1.1 Create branch `feature/google-sheets-import` from `develop` and verify `git branch --show-current` prints it
- [ ] 1.2 Run the baseline (`cd backend && npm run lint && npx jest`, `cd frontend && npx tsc --noEmit`) and verify all green

## 2. Pipeline refactor (no behavior change)

- [ ] 2.1 Extract `previewRows(rows)` and `commitRows(rows, options, adminId)` in `import.service.ts`; make `preview(buffer)`/`commit(buffer, ...)` delegate to them; verify existing import unit tests and e2e stay green
- [ ] 2.2 Add `rowsFromSheet(values: string[][])` with header normalization (trim, case-insensitive), required-header check (`400` naming missing headers) and blank-row skipping; add unit tests (valid header, missing `date`, blank rows, header with spaces/uppercase); verify green

## 3. Sheets client

- [ ] 3.1 Add `google-auth-library` to backend dependencies (`npm install google-auth-library`) and verify `npm run build`
- [ ] 3.2 Implement `backend/src/import/sheets.client.ts`: `isConfigured()`, `getSpreadsheet(id)`, `getValues(id, range)`, private-key unescaping, error mapping (403 not_shared, 404 not_found, 400 invalid_range); register in `ImportModule`
- [ ] 3.3 Add `sheets.client.spec.ts` with a mocked `fetch`/token: builds the right URLs (encoded range), maps 403/404/400, reports `isConfigured()` false without env; verify green

## 4. Endpoints

- [ ] 4.1 Add `dto/sheet-import.dto.ts` (`spreadsheetId` required string, `range` optional string) and implement `ImportService.getSheetStatus()`, `previewSheet()`, `commitSheet()` (503 when not configured, 400 with mapped reason on read failure, commit reads everything before writing); unit tests with a stub client for status (readable/not shared), preview summary mirror and idempotent commit delegation; verify green
- [ ] 4.2 Add `GET /import/sheet/status`, `POST /import/sheet/preview`, `POST /import/sheet/commit` (admin) to `import.controller.ts` with Swagger docs; verify build
- [ ] 4.3 Create `backend/test/import-sheet.e2e-spec.ts` overriding `SheetsClient` with a fake (in-memory spreadsheets): not configured -> 503; participant -> 403; status readable/not shared; preview `{ total: 3, valid: 2, invalid: 1, warnings: 1 }`; commit skip then update; missing header -> 400; range selection. Self-cleaning (year 2097 data). Verify `npm run test:e2e` green

## 5. Frontend

- [ ] 5.1 Add `SheetStatus` to `lib/types.ts` and the "Desde Google Sheets" section to `app/dashboard/admin/import/page.tsx` (status query on mount, inputs, Comprobar/Previsualizar/Importar reusing the options and result tables, disabled explanation when not configured); verify `npx tsc --noEmit`, `npm run lint`
- [ ] 5.2 Verify in the browser with the backend not configured (section disabled with explanation, file import still works) and with the fake-configured backend if feasible (status + preview render); `npm run build` with the dev server stopped

## 6. Config, script and docs

- [ ] 6.1 Add `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_DEFAULT_RANGE` (commented) to `backend/.env.example`; document them in README and the deploy guide
- [ ] 6.2 Rewrite the phase 2 section of `docs/import-template.md` as a setup guide (Google Cloud project, Sheets API, service account JSON, share the sheet, header in row 1, endpoints); add TC-IMP-05..08 to `docs/test-cases.md`; add the endpoints to `docs/architecture.md`
- [ ] 6.3 Add a check to `scripts/parallel-session-test.mjs`: `GET /import/sheet/status` as admin returns `configured` boolean (and 403 for Ana); verify exit 0

## 7. Verification and delivery

- [ ] 7.1 `openspec validate google-sheets-import --strict`; map every scenario to a test or manual check above
- [ ] 7.2 Backend lint+build+unit+e2e and frontend lint+tsc+build green locally
- [ ] 7.3 Conventional Commits on `feature/google-sheets-import`, PR to `develop`, CI green
- [ ] 7.4 After merge: `/opsx:archive google-sheets-import` and verify `openspec/specs/google-sheets-import/spec.md`
