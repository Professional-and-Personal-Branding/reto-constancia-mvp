## Context

- `ChallengesService.create` checks `@@unique([month, year])` first (`409` "Ya existe un reto para
  M/AAAA"), then `startDate < endDate`, and stores the rules with the model defaults for anything not
  sent. The web form fills the period with the first and last day of the chosen month as
  `YYYY-MM-DD` (stored at UTC midnight); `isWithinPeriod` compares the activity's date-only value
  with `startDate`/`endDate`.
- `addParticipant(challengeId, userId)`: `404` "Reto no encontrado" / "Usuario no encontrado",
  `400` "No se puede modificar un reto cerrado", then `writeWhileOpen` (FOR SHARE lock, re-read
  status) and `create`; `P2002` becomes `409` "El usuario ya participa en este reto". It does **not**
  check `User.active` today; the web only lists active `PARTICIPANT` users as candidates.
- Enrolment works on `DRAFT` and `ACTIVE` challenges; the web participants page only works on the
  selected **active** challenge (`useActiveChallenge`).
- `ChallengeParticipant` carries the payment state (`paid`, `paidAt`, `amountPaid`, proof fields)
  with defaults that mean "nothing paid" (`paid = false`, the rest `null`). The pot is what was
  actually collected (`pot-from-collected`); copying `paid`/`amountPaid` on a duplicate was
  explicitly discarded in the feature analysis.
- The global exception filter passes `HttpException` bodies through (`BaseExceptionFilter`), so a
  `409` can carry an extra field.
- Playwright uses `E2E_YEAR = 2025` and every month of it is already taken by a spec; the seed uses
  5/2026; `deleteTestChallenges` removes test challenges from a local database only.

## Goals / Non-Goals

**Goals:** next month's challenge in one confirmation, with the same rules and the same active
people and nothing financial carried over; several users enrolled in one request without one bad id
failing the rest; no schema change; the existing lifecycle, lock and closed-challenge rules untouched.

**Non-Goals:** see proposal.

## Decisions

1. **D1 - Two small endpoints plus one preview, no migration.**
   - Bulk enrolment and renewal reuse the existing tables. `@@unique([month, year])` is not removed:
     it is what makes the renewal safe to repeat (D7). No new column records "renewed from": the
     renewal is a convenience, not a relation the domain needs (the new challenge is an ordinary
     challenge once created).
2. **D2 - Target month and period are computed by the server.**
   - Target = the month after the source (`12/Y -> 1/(Y+1)`), in `renewal.ts` (`nextMonth`).
   - Period = first to last calendar day of the target month (`monthPeriod`), stored exactly as the
     web form stores it (`YYYY-MM-DD` at UTC midnight), leap years included. A source with a
     shortened period (for example from the 5th to the 28th) does not carry its offsets: the admin
     adjusts the draft with "Editar" (P2).
   - The client sends neither month, year nor dates; the preview shows them before confirming.
3. **D3 - Exactly what is copied, and nothing else.**
   - Copied from the source: `validDays`, `minHeartRateMinutes`, `feePerParticipant`, `budgetTotal`
     (`null` stays automatic; a manual amount is copied as is and the preview labels it "ajustado"),
     `currency`, `prizeDescription`, `pointsPerValidatedDay`, `pointsPerKm`,
     `minValidatedDaysToQualify`, `maxWinners`, `tiebreakRule`.
   - Set by the renewal: `month`, `year`, `startDate`, `endDate` (D2), `name` (the request's
     trimmed `name`, or the suggested "Reto <Mes> <AAAA>" with the Spanish month name),
     `status = DRAFT`.
   - Never copied: status, activities, imported rows, awards, results, payments and proofs.
   - `renewableRules(source)` is a pure function with an explicit allow-list; a unit test asserts
     its exact key set, so a future column is not copied by accident.
4. **D4 - Only an `ACTIVE` or `COMPLETED` challenge can be renewed.**
   - The admin prepares next month near the end of the current one, usually before closing it
     (closing waits for pending validations, often after the 1st). Requiring `COMPLETED` would
     force a close before the new month can even exist. A `DRAFT` has not run yet, so "renewing" it
     makes no sense: `400` "Solo se puede renovar un reto activo o cerrado" (preview and renew).
   - The source is only read; renewing never changes it, so the closed-challenge freeze is untouched
     and no lock is taken on the source (D7).
5. **D5 - Roster copy is opt-in in the API and checked by default in the web.**
   - `copyParticipants` (boolean, default `false`). When true, the source's participants whose user
     is `active` are enrolled in the new challenge with the model defaults (no payment, no proof,
     `joinedAt` = now). Inactive users are skipped and reported. Admins enrolled in the source are
     copied like anyone else (enrolment is not role-restricted today).
   - The response is `201` with `{ challenge, participants: { enrolled, skipped } }`.
6. **D6 - Enrolment rule: existing, active, once per challenge.**
   - A shared `enrollMany(tx, challengeId, userIds)` (in `enrollment.ts`) classifies each distinct
     id: unknown user -> `skipped` `NOT_FOUND` "Usuario no encontrado"; `active = false` ->
     `skipped` `INACTIVE` "El usuario está inactivo"; already enrolled -> `alreadyEnrolled`;
     otherwise it is inserted (`createMany` with `skipDuplicates`) and reported in `enrolled`.
     Duplicated ids in the request are counted once. The response reflects the final state: a user
     enrolled concurrently by another request appears in `enrolled` or `alreadyEnrolled`, never in
     both, and is never enrolled twice (`@@unique([challengeId, userId])`).
   - The single `POST /challenges/:id/participants` applies the same active check: `400` "El
     usuario está inactivo" after the existing `404`s (P4). The web never offered inactive users,
     so no screen changes.
7. **D7 - Atomicity, idempotency and locks.**
   - **Bulk:** one transaction through the existing `writeWhileOpen` (FOR SHARE lock on the target,
     status re-read): `COMPLETED` -> `400` "No se puede modificar un reto cerrado" for the whole
     request, nothing written; a lock wait over 5 s -> the existing `409` "El reto se está
     cerrando; vuelve a intentarlo en unos segundos". Per-user problems never fail the request.
     Repeating the same request is harmless: everyone comes back as `alreadyEnrolled`.
   - **Renew:** one transaction (the writer timeouts of `WRITER_TX`) that creates the challenge and,
     if asked, calls `enrollMany` on it. Either both are committed or nothing is. The new row is
     invisible to every other request until the commit and is born `DRAFT`, so there is no state
     transition of an existing challenge to serialize and no lock is needed on it; the source is
     only read. Activation afterwards goes through the existing `POST :id/activate` under its lock.
   - **Idempotency key:** `@@unique([month, year])`. The service checks the target month first and,
     on a race, maps `P2002` on `month_year` to the same answer: `409` with
     `{ message: "Ya existe un reto para M/AAAA", existingChallengeId }`. A double click or a retry
     after a timeout never creates two challenges and never enrols anyone in the existing one.
8. **D8 - Read-only renewal preview.**
   - `GET /challenges/:id/renewal-preview` (admin) returns, with no writes and no locks:
     ```json
     {
       "source": { "id": "uuid", "name": "Reto Octubre 2026", "month": 10, "year": 2026, "status": "ACTIVE" },
       "target": { "month": 11, "year": 2026, "name": "Reto Noviembre 2026",
                   "startDate": "2026-11-01", "endDate": "2026-11-30" },
       "rules": { "validDays": [1,2,3,4,5,6], "minHeartRateMinutes": 20, "feePerParticipant": "120.00",
                  "budgetTotal": null, "budgetMode": "auto", "currency": "BOB", "prizeDescription": "...",
                  "pointsPerValidatedDay": 1, "pointsPerKm": "0.00", "minValidatedDaysToQualify": 0,
                  "maxWinners": 2, "tiebreakRule": "DRAW" },
       "participants": {
         "toCopy": [{ "userId": "uuid", "name": "Ana", "email": "ana@..." }],
         "skipped": [{ "userId": "uuid", "name": "Luis", "email": "luis@...", "reason": "INACTIVE",
                       "message": "El usuario está inactivo" }]
       },
       "existing": null
     }
     ```
   - Decimal rules are serialized exactly as `GET /challenges/:id` serializes them; `budgetMode`
     is `auto` when `budgetTotal` is `null`, otherwise `manual`.
   - `existing` is `{ id, name, status }` of the challenge already in the target month, or `null`;
     the web disables the confirmation when it is set. The preview is a projection: `renew`
     recomputes everything in its own transaction.
9. **D9 - Bulk endpoint contract.**
   - `POST /challenges/:id/participants/bulk`, admin only, body `{ userIds }`: array of 1 to 200
     UUIDs (`ArrayMinSize`, `ArrayMaxSize`, `IsUUID('4', { each: true })`); unknown keys are
     rejected by the global pipe. `@HttpCode(200)` because a request may create nothing.
   - Answer `{ enrolled: Row[], alreadyEnrolled: Row[], skipped: Skip[] }` with
     `Row = { userId, name, email }` and `Skip = { userId, reason: 'NOT_FOUND' | 'INACTIVE', message }`.
     Admin-only, so emails are allowed (same as the roster).
   - The cap of 200 bounds one transaction and the lock hold time; the group is a few dozen people.
10. **D10 - Web: "Renovar" in the admin challenge list (PR 2).**
    - Button "Renovar" on `ACTIVE` and `COMPLETED` rows (next to the existing actions). It opens
      `RenewChallengeDialog` (same dialog pattern as `CloseChallengeDialog`), which loads the
      preview and shows: "Se creará <target.name> en borrador", the period, a rules summary, an
      editable name prefilled with the suggestion, the checkbox "Inscribir a los N participantes
      activos de <source.name>" (checked; the names in a collapsible list; inactive ones listed as
      "no se copian: usuario inactivo"), and the fixed note "No se copian pagos, comprobantes,
      actividades ni premiaciones. El reto nace en borrador: revísalo y actívalo cuando corresponda."
    - With `existing` set: "Ya existe un reto para <Mes AAAA> (<estado>)" and the confirm button
      disabled. A `409` or `400` on confirm shows the API message inside the dialog.
    - On success: the dialog closes, `['challenges']` is invalidated and a status line says
      "<name> creado en borrador con N inscritos"; the new row offers the existing "Editar"
      and "Activar".
11. **D11 - Web: bulk selection in the participants page (PR 1).**
    - The "Agregar participante" card keeps the same candidate list (active `PARTICIPANT` users not
      enrolled) and adds a checkbox per row with an accessible label ("Seleccionar a <nombre>"),
      "Seleccionar todos" and the primary button "Inscribir seleccionados (N)", disabled with no
      selection or while pending. The per-row "+ Inscribir" keeps calling the single endpoint.
    - After the request, a `role="status"` line summarizes the outcome ("3 inscritos · 1 ya estaba
      inscrito · 1 omitido: Luis (usuario inactivo)"), the selection is cleared and the existing
      queries (`participants`, `finance`, `results`, `challenge`) are invalidated. The summary text
      comes from a pure function `bulkSummary(result)` in `lib/renewal.ts`, unit-tested.
12. **D12 - Two PRs inside one change (as D5 of the calendar).**
    - **PR 1:** enrolment rule, `enrollMany`, bulk endpoint, participants page selection, their tests
      and QA cases. Useful on its own (enrolling the group after creating a challenge by hand).
    - **PR 2:** `renewal.ts`, preview, renew (reusing `enrollMany`), the "Renovar" dialog, their
      tests and QA cases. The change is archived after PR 2.
13. **D13 - Small E2E footprint.**
    - One Playwright spec `14-renewal.spec.ts`, admin session already stored, data by API fixtures
      in a month pair that no other spec uses (source and target in `E2E_YEAR + 1`, avoiding the
      seed's 5/2026; both deleted with `deleteTestChallenges` before the test). Two tests: bulk
      enrolment with its summary (PR 1); renew from the list, the new draft with its participants,
      and the conflict message on a second attempt (PR 2).
    - Every rule detail (inactive, unknown, duplicates, cap, closed target, lock, race on the month,
      exact copied fields, payments reset, `DRAFT` source, roles) is covered by unit and API e2e
      tests, not by browser tests.

## Risks / Trade-offs

- **A manual budget copied as is no longer matches the roster** -> the preview labels it
  "ajustado" with its amount, and the draft can be edited before activation. Automatic budgets
  follow the copied roster by themselves.
- **The roster copy reads the source while it is still active** -> someone enrolled in the source
  after the renewal is not copied; the admin adds them with the bulk selection. Accepted: a lock on
  the source would make the renewal wait for (or fail during) a close for no benefit.
- **Two admins renew at the same time** -> one commits, the other gets the `409` with
  `existingChallengeId` (D7); nothing is enrolled twice.
- **The single endpoint now rejects inactive users** -> a behaviour change for API callers only; the
  web never offered them, and the rule is the owner's (P4).
- **A future rule column is not copied** -> the allow-list is deliberate; adding the column to
  `renewableRules` is a one-line change guarded by the key-set unit test.
- **A draft cannot be managed from the participants page** -> the renewal copy covers the usual case;
  after activation the bulk selection works (P6).
- **Bulk insert holding the share lock** -> capped at 200 ids, one `findMany` for users, one for
  existing enrolments and one `createMany`; well under the 5 s writer lock timeout.

## Migration Plan

**No migration, no schema change, no new dependency, no new environment variable.**
`@@unique([month, year])` and `@@unique([challengeId, userId])` stay and are relied upon.

Release: PR 1 and PR 2 can ship in the same minor release or PR 1 first; each ships API and web
together. Rollback: redeploy the previous release. Challenges and enrolments created by a renewal are
ordinary rows; nothing needs to be undone (a draft created by mistake can be left unused, as today).

## QA Cases (for `docs/qa/catalog.mjs`, added with the tests that cover them)

- **TC-PART-08 - Inscribir a varios usuarios de una vez (API)** - Alta, Funcional, guide 3.1.
  - Pre: reto ACTIVE con Ana inscrita; Bea y Carla activas sin inscribir; Luis inactivo; un reto
    COMPLETED.
  - Data: `POST /api/challenges/:id/participants/bulk` con Ana, Bea, Carla, Luis y un UUID sin
    usuario; la misma lista otra vez; Bea dos veces; lista vacía, 201 ids, un id no UUID; como
    participante; contra el reto cerrado; `POST .../participants` con Luis.
  - Expected: 200 con Bea y Carla en `enrolled`, Ana en `alreadyEnrolled`, Luis `INACTIVE` y el UUID
    `NOT_FOUND` en `skipped`; repetir no inscribe a nadie nuevo; Bea una sola vez; 400 en las listas
    inválidas; 403 al participante; 400 "No se puede modificar un reto cerrado" sin cambios; el alta
    individual de Luis da 400 "El usuario está inactivo"; los nuevos figuran impagos en finanzas.
  - Auto: `enrollment.spec.ts`, `challenges.service.spec.ts`, `challenge-renewal.e2e-spec.ts`
    (`BULK:`).
- **TC-PART-09 - Inscripción en bloque desde Participantes** - Alta, UI, guide 3.1.
  - Pre: sesión de admin; reto activo con candidatos.
  - Steps: marcar dos candidatos; "Inscribir seleccionados (2)"; "Seleccionar todos".
  - Expected: "2 inscritos", ambos pasan a Inscritos y salen de los candidatos; el botón queda
    deshabilitado sin selección; un omitido se lista con su motivo.
  - Auto: `14-renewal.spec.ts` (bulk test), `renewal.test.ts` (`bulkSummary`).
- **TC-CHAL-23 - Renovar un reto en el mes siguiente (API)** - Alta, Funcional, guide 2.x.
  - Pre: reto 10/AAAA ACTIVE con reglas no default, Ana pagada, Bea con comprobante, Luis inactivo;
    un reto COMPLETED con actividades y premiación; un reto DRAFT; un reto de diciembre.
  - Data: `GET .../renewal-preview`; `POST .../renew` con `{}`, con `copyParticipants: true`, con
    nombre propio y con nombre en blanco; renovar dos veces y dos a la vez; como participante.
  - Expected: preview con mes siguiente, período del primer al último día (enero del año siguiente
    para diciembre, 29 de febrero en bisiesto), reglas, `toCopy`, `skipped` y `existing`; 201 con un
    reto DRAFT con exactamente las once reglas y ningún pago, comprobante, actividad ni premiación;
    Ana y Bea copiadas impagas y sin comprobante, Luis omitido; el reto origen sin cambios; el
    segundo intento 409 "Ya existe un reto para M/AAAA" con `existingChallengeId` y sin inscribir a
    nadie; concurrentes: un 201 y un 409; DRAFT 400; nombre en blanco 400; participante 403; el reto
    renovado se activa con la regla de siempre.
  - Auto: `renewal.spec.ts`, `challenges.service.spec.ts`, `challenge-renewal.e2e-spec.ts`
    (`RENEW:`).
- **TC-CHAL-24 - Renovar desde la lista de retos** - Alta, UI, guide 2.x.
  - Pre: sesión de admin; reto origen ACTIVE con dos participantes; mes siguiente libre.
  - Steps: "Renovar"; revisar el diálogo; confirmar; "Renovar" otra vez.
  - Expected: el diálogo muestra mes, período, reglas, la casilla marcada con las personas y la nota
    de lo que no se copia; al confirmar aparece el borrador con 2 participantes y el aviso "<nombre>
    creado en borrador con 2 inscritos"; el segundo intento dice "Ya existe un reto para <Mes AAAA>"
    con el botón deshabilitado; un borrador no ofrece "Renovar".
  - Auto: `14-renewal.spec.ts` (renew test).

## Open Questions

1. **P1 - Which month does a renewal create?** [NO BLOQUEANTE]
   - (a) Always the month after the source (written into the spec). (b) The admin picks any free
     month.
   - Recommendation: (a); it is the monthly flow, keeps the dates computed on the server and makes
     a double click a clean `409`. (b) can come later as an optional field.
2. **P2 - Period of the new challenge.** [NO BLOQUEANTE]
   - (a) First to last day of the target month (written into the spec). (b) Keep the source's day
     offsets, clamped to the target month's length.
   - Recommendation: (a); it is what the form proposes when creating a challenge, and a shortened
     period is an exception the admin fixes in the draft.
3. **P3 - Which challenges can be renewed?** [NO BLOQUEANTE]
   - (a) `ACTIVE` and `COMPLETED` (written into the spec). (b) Only `COMPLETED`. (c) Any, `DRAFT`
     included.
   - Recommendation: (a); closing often happens after the new month starts, and renewing never
     changes the source, so allowing `ACTIVE` costs nothing and does not touch the freeze.
4. **P4 - Does the single enrolment also reject inactive users?** [NO BLOQUEANTE]
   - (a) Yes, `400` "El usuario está inactivo" (written into the spec). (b) Only bulk and renewal
     check it.
   - Recommendation: (a); "only existing and active users are enrolled" is the owner's rule and
     should not depend on which endpoint is used.
5. **P5 - Default of the roster copy.** [NO BLOQUEANTE]
   - (a) `copyParticipants` defaults to `false` in the API and the web checkbox starts checked
     (written into the spec). (b) Defaults to `true` in the API too.
   - Recommendation: (a); an API call that enrols people should say so explicitly, while the web
     still makes the common case one click.
6. **P6 - Managing a draft's roster from the web.** [NO BLOQUEANTE]
   - (a) Out of scope: the participants page keeps working on the selected active challenge
     (written into the proposal). (b) Let the participants page open any non-closed challenge with
     `?reto=<id>`.
   - Recommendation: (a) now; the renewal copy covers the monthly case and (b) touches the
     challenge selector shared by several pages.
7. **P7 - Two PRs or one?** [NO BLOQUEANTE]
   - (a) Two PRs inside this change: bulk enrolment first, renewal second (written into tasks).
     (b) One PR.
   - Recommendation: (a); each PR stays small and reviewable, and PR 1 is useful alone.
