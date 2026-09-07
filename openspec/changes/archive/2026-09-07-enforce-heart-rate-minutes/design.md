## Context

See proposal.md - Why. Current state that shapes the approach:

- `Challenge.minHeartRateMinutes` (default 20, DTO `@Min(1)`) is stored and shown in the upload copy, but `ActivitiesService.create()` only checks status, participation, period, valid day and the 1-per-day uniqueness.
- `DailyActivity` has `durationMinutes`, `avgHeartRate`, `hasHeartRateProof` (client-provided boolean) and photos typed `ACTIVITY | HEART_RATE | METRICS`. There is no field for the minutes of heart-rate recording.
- `validate()` takes no body; `reject()` takes `{ reason }`. `findOne()` includes `challenge` and `photos`; `findAll()` includes `photos` and `user` only.
- `ImportService.validateRow()` returns `errors[]` per row from `TEMPLATE_HEADERS`; `PreviewResult.summary` has `total/valid/invalid`. The template's second sample row has `hasHeartRateProof=false` with status `VALIDATED` (historical manual record).
- Frontend types live in `lib/types.ts`; the validations page uses `Field` cells and an inline reason input for rejections that can be mirrored for the override note.

## Goals / Non-Goals

**Goals:**
- Store the heart-rate minutes explicitly (`heartRateMinutes`) and make compliance a single pure, unit-tested function reused by registration, validation, listing and import.
- Strict for new registrations, explicit (override + note) for admin validation, informative (warnings) for imports.
- Keep `hasHeartRateProof` meaningful: derived from photos on registration, explicit only in imports.

**Non-Goals:**
- Automatic rejection of non-compliant activities or retroactive re-evaluation of already validated ones (`heartRateMinutes` stays null on old rows).
- OCR or any analysis of the heart-rate image.
- Changing scoring/ranking (still counts validated days).
- Requiring `heartRateMinutes` when the challenge has `minHeartRateMinutes = 0`.

## Decisions

1. **Schema: two nullable columns, one migration.**
   `heartRateMinutes Int?` and `validationNote String?` on `DailyActivity` (migration `add_activity_heart_rate_minutes_and_validation_note`). Nullable keeps existing rows valid with no backfill. Alternative: reuse `durationMinutes` as proxy - rejected by the owner.

2. **Compliance helper as a pure method in `ActivitiesService`.**
   `assessHeartRate(challenge: { minHeartRateMinutes }, activity: { heartRateMinutes: number | null; hasHeartRateProof: boolean }) => { compliant: boolean; reasons: string[] }`. `minHeartRateMinutes <= 0` short-circuits to compliant. Reasons are Spanish user-facing strings: "Se requieren al menos N min de registro de FC", "Falta indicar los minutos con FC", "Falta la captura de frecuencia cardíaca". Import reuses the same helper with the row's explicit flag.

3. **Registration: derive the proof flag, validate the pair, then enforce.**
   In `create()`: `hasHeartRateProof = dto.photos.some(p => p.type === HEART_RATE)`; if `dto.heartRateMinutes > dto.durationMinutes` -> `400` ("Los minutos con FC no pueden superar la duración"); then run the helper and throw `BadRequestException(reasons.join('. '))` when non-compliant. DTO: `heartRateMinutes?: number` with `@IsInt() @Min(1)`. The client flag in the DTO is kept for backward compatibility but ignored.

4. **Override on validation via body DTO, note persisted.**
   New `ValidateActivityDto { override?: boolean; note?: string (5..300) }`. `validate(id, validatorId, dto)`: when non-compliant and `!(dto.override && dto.note)` -> `400` with the reasons; otherwise update with `validationNote = dto.note ?? null`. Alternative: reuse `rejectionReason` - rejected, it would conflate two states.

5. **Derived `heartRateCompliant` in every activity response.**
   Private `withCompliance(activity)` mapper applied in `findAll()` (and therefore `findMine()`/`findPending()`), `findOne()`, `create()`, `validate()`, `reject()`. Lists include `challenge: { select: { minHeartRateMinutes: true } }`; the mapper adds the boolean and removes that helper include so payloads only gain `heartRateMinutes`, `validationNote` and `heartRateCompliant`. Not stored, so changing `minHeartRateMinutes` re-evaluates automatically.

6. **Import: new column, warnings not errors.**
   `TEMPLATE_HEADERS` gains `heartRateMinutes` (after `avgHeartRate`); `validateRow()` parses it (optional, integer >= 1, `<= durationMinutes` else error). `preview()` evaluates each valid row against the resolved challenge (it already looks it up) and fills `PreviewRow.warnings: string[]` plus `summary.warnings`. `applyRow()` writes `heartRateMinutes`. Sample rows: Ana gets `heartRateMinutes: 30` (compliant), Bruno stays without proof (yields the one warning used by tests/docs). Rationale: historical records are the main import use case; the admin decides.

7. **Challenge DTOs accept 0.** `@Min(0)` in create/update DTOs; the admin form allows 0 with hint "0 = sin regla de FC".

8. **Frontend.**
   - Upload: new numeric input "Minutos con FC (según la captura)" next to "FC promedio"; `compliant = min === 0 || (hrMinutes >= min && !!heartRatePhoto.file)`; also `hrMinutes <= durationMinutes`; disable submit and show an inline explanation with the challenge minimum. Server messages still surface via the existing `onError`.
   - Validations: `Field` "FC registrada" (`heartRateMinutes` min or "—"), badge "Cumple FC" / "No cumple FC" from `heartRateCompliant`; for non-compliant activities "Validar" opens an inline note field (same pattern as the reject reason) and sends `{ override: true, note }`.
   - Import page: show `warnings` per row (amber) and `summary.warnings`.
   - Types: `DailyActivity.heartRateMinutes: number | null`, `validationNote: string | null`, `heartRateCompliant: boolean`; preview row `warnings: string[]`, summary `warnings: number`.

## Risks / Trade-offs

- [Participants used to registering without the capture are now blocked] -> the form explains the rule before submit and names the minimum; the admin can set `minHeartRateMinutes = 0` for a lenient month.
- [Imports with many non-compliant historical rows] -> they keep their given status (typically `VALIDATED` for history); only `PENDING` imports need overrides, and the preview shows the count up front.
- [Existing tests/scripts register activities without `HEART_RATE` photos or minutes] -> `parallel-session-test.mjs` and e2e fixtures are updated; seed activities are created via Prisma and get `heartRateMinutes` set to keep demo data compliant.
- [Old frontend against new backend] -> registrations without `heartRateMinutes` would be rejected in challenges with a minimum; deploy backend and frontend together (same release), which is the current practice.

## Migration Plan

1. Migration adds two nullable columns; safe on existing data, no backfill.
2. Deploy backend and frontend in the same release (see last risk).
3. Rollback: redeploy previous versions; the extra columns are harmless.

## Open Questions

- Should the participant's own activity list show the compliance badge and the recorded minutes? Additive UI; does not change the specs. Decide during UI review.
