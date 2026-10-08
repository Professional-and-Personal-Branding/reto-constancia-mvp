## Context

- Since 1.6.0 a `COMPLETED` challenge is final: `ResultsService.getResults` returns the stored
  awards (including the automatic draw, note `Sorteo automático al cierre`) and the ranking no
  longer moves. `FinanceService.getFinance` returns the per-participant payment state, the
  collected total and the pot. The results also carry `payout` (`pot`, `perWinner`, `monetary`).
- `projectResultsForViewer` hides emails and payment state from non-admins; the export does not
  go through it because the route is admin only.
- The import template already sets the CSV conventions: UTF-8, comma, built on the server, and
  downloaded from the web through an authenticated `fetch` and a temporary link.
- Participant names come from public registration, so they are untrusted text inside a file the
  admin opens in a spreadsheet.

## Goals / Non-Goals

**Goals:** a faithful, shareable record of a closed challenge that opens correctly in Excel and
Google Sheets and cannot run a formula.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - Route and guards.** `GET /challenges/:id/export?format=csv`, `@Roles(ADMIN)`. `format`
   is optional and only `csv` is accepted; any other value answers `400`, so a future format is
   an additive change. A missing challenge answers `404`; a challenge that is not `COMPLETED`
   answers `400` with a message that says why.
2. **D2 - Source of truth.** Build from `getResults(id)` and `getFinance(id)` in one pass, joined
   by `userId`. Winners are the stored `awards`, not a recomputed selection, so the file always
   matches what the platform shows. A participant with no award is not a winner.
3. **D3 - Columns (fixed order, Spanish headers).**
   `reto, periodo, moneda, cuota, pote, posicion, nombre, email, dias_validados,
   dias_pendientes, dias_rechazados, km, puntaje, califica, estado_pago, monto_pagado,
   fecha_pago, ganador, nota_premio, premio`.
   - `periodo` is `YYYY-MM` from `year` and `month`.
   - Numbers use a dot decimal with two digits for money and km, no thousands separator.
   - Dates are `YYYY-MM-DD` (the stored day, no timezone shift).
   - Booleans are `si` / `no`. `estado_pago` is `pagado`, `parcial` or `pendiente`.
   - `premio` is `payout.perWinner` for winners when the pot is monetary, otherwise empty.
   - `posicion` follows the ranking order already returned (1-based, ties not collapsed).
4. **D4 - File format.** Pure function `buildChallengeCsv(rows): string` in
   `challenges/challenge-export.ts`:
   - header line plus one line per participant, `CRLF` separated, ending with `CRLF`;
   - a cell is quoted when it contains a comma, a quote, a line break or leading/trailing
     spaces, with quotes doubled;
   - a text cell whose first character is `=`, `+`, `-`, `@`, tab or carriage return is
     prefixed with `'` before quoting. Numeric columns are never prefixed, so a negative number
     stays a number;
   - the controller prepends the BOM `﻿` and sets `text/csv; charset=utf-8`.
5. **D5 - File name.** `acta-reto-YYYY-MM.csv` from the challenge's year and month. It never
   uses the challenge name, so the header cannot be injected with a crafted name.
6. **D6 - Web.** `app/dashboard/results/page.tsx` shows the button only when
   `user.role === 'ADMIN'` and a closed challenge is selected. It calls the route through the
   same authenticated fetch as the import template and shows the API error text on failure.
7. **D7 - Privacy and logging.** The route is admin only, returns emails and payment amounts,
   and the access log already records the route template and user, never the body. No extra
   logging.

## Risks / Trade-offs

- **Excel with a Spanish locale expects `;`.** With a comma the file may open as a single
  column. We keep the comma for consistency with the import template and Google Sheets, and the
  runbook explains "Datos > Desde texto/CSV" and UTF-8. If the owner prefers `;`, it is a
  one-constant change.
- **Formula injection** -> neutralised by D4 and covered by a unit test with `=`, `+`, `-`, `@`.
- **The file contains personal data** (emails, payments). It is admin only and not stored on the
  server; the runbook reminds the owner to keep it private.
- **A closed challenge with no participants** -> the file has only the header, which is valid.
- **Large challenges** -> built in memory; a challenge has tens of participants, not thousands.

## Migration Plan

No migration. Ships in the next minor release (1.8.0). No variable and no rollback step: the
route is read-only.

## Open Questions

- Comma or semicolon as the separator? Default comma (template convention); the owner can
  switch it.
