## Context

See proposal.md - Why. Current state that shapes the approach:

- `Challenge.minHeartRateMinutes` (default 20) is stored and shown in the upload copy, but `ActivitiesService.create()` only checks status, participation, period, valid day and the 1-per-day uniqueness.
- `DailyActivity` already has `durationMinutes`, `hasHeartRateProof` and photos typed `ACTIVITY | HEART_RATE | METRICS`. The upload form sets `hasHeartRateProof = checkbox && !!heartRatePhoto.file`, so the flag and the photo are already correlated client-side but not server-side.
- `ActivitiesService.validate()` takes no body; `reject()` takes `{ reason }`. `findOne()` includes `challenge` and `photos`, `findAll()` includes photos and user.
- `ImportService.validateRow()` returns `errors[]` per row; `PreviewResult.summary` has `total/valid/invalid`. The sample template contains a row with `hasHeartRateProof=false` and status `VALIDATED`, i.e. historical manual records exist.
- Frontend types live in `lib/types.ts`; the validations page renders `Field` cells including "Captura FC" with a warning color when `hasHeartRateProof` is false.

## Goals / Non-Goals

**Goals:**
- One pure, unit-tested definition of compliance reused by registration, validation, listing and import.
- Strict for new registrations, explicit (override + note) for admin validation, informative (warnings) for imports.
- No re-implementation of the rule in the frontend: the API sends `heartRateCompliant`; the upload form only mirrors the two inputs it controls (minutes and capture) for instant feedback.

**Non-Goals:**
- A separate `heartRateMinutes` value read from the capture (deferred; would need a schema field, an import column and a UI input). The rule uses `durationMinutes`.
- Automatic rejection of non-compliant activities or retroactive re-evaluation of already validated ones.
- OCR or any analysis of the heart-rate image.
- Changing scoring/ranking (still counts validated days).

## Decisions

1. **Compliance helper as a pure function in `ActivitiesService`.**
   `assessHeartRate(challenge: { minHeartRateMinutes }, activity: { durationMinutes, hasHeartRateProof, photos: { type }[] }) => { compliant: boolean; reasons: string[] }`. Reasons are Spanish user-facing strings ("Se requieren al menos 30 min con captura de FC", "Falta la captura de frecuencia cardíaca"). `minHeartRateMinutes <= 0` short-circuits to compliant. Alternative: a Prisma computed column or DB view - rejected, the rule depends on challenge config and photos and is trivial in code.

2. **Enforce in `create()` before the insert; validate flag/photo consistency.**
   After the existing checks, run the helper on the DTO; throw `BadRequestException(reasons.join('. '))`. Additionally, `hasHeartRateProof === true` with no `HEART_RATE` photo is a `400` ("hasHeartRateProof requiere una foto de tipo HEART_RATE") so stored data stays consistent.

3. **Override on validation via body DTO, note persisted.**
   New `ValidateActivityDto { override?: boolean; note?: string (5..300) }`. `validate(id, validatorId, dto)`: if the activity is non-compliant and `!(dto.override && dto.note)` -> `400` with the reasons; otherwise update with `validationNote = dto.note ?? null`. Migration `add_activity_validation_note`: `ALTER TABLE "DailyActivity" ADD COLUMN "validationNote" TEXT;`. Alternative: reuse `rejectionReason` - rejected, it would conflate two states. Alternative: no persistence - rejected, the override should be auditable.

4. **Derived `heartRateCompliant` in every activity response.**
   A private `withCompliance(activity)` mapper is applied in `findAll()`, `findMine()`, `findPending()`, `findOne()`, `create()`, `validate()` and `reject()`. Lists need the challenge's `minHeartRateMinutes`: `findAll()` adds `challenge: { select: { minHeartRateMinutes: true } }` to the include and the mapper strips it if the client did not have it before (keep payload shape stable except for the new boolean). Not stored, so a later change of `minHeartRateMinutes` re-evaluates automatically.

5. **Import: warnings, not errors.**
   `validateRow()` keeps its contract; a new step in `preview()` evaluates each normalized row against the resolved challenge (already looked up for `challengeMonth/Year`) and fills `PreviewRow.warnings: string[]` plus `summary.warnings`. `commit()` is unchanged. Rationale: historical records are the main import use case and their proof cannot be reconstructed; the admin decides.

6. **Challenge DTOs accept 0.**
   `CreateChallengeDto`/`UpdateChallengeDto.minHeartRateMinutes` use `@Min(0)`; the admin form allows 0 with a hint "0 = sin regla de FC".

7. **Frontend.**
   - Upload: compute `compliant = min === 0 || (durationMinutes >= min && !!heartRatePhoto.file)`; disable submit and show an inline explanation with the challenge minimum; server messages still surface via the existing `onError`.
   - Validations: badge "Cumple FC" / "No cumple FC" from `heartRateCompliant`; for non-compliant activities the "Validar" button opens an inline note field (same pattern as the reject reason) and sends `{ override: true, note }`.
   - Import page: show `warnings` per row and the count in the summary.
   - Types: `DailyActivity.heartRateCompliant: boolean`, `validationNote: string | null`; preview row `warnings: string[]`, summary `warnings: number`.

## Risks / Trade-offs

- [Participants used to registering short sessions are now blocked] -> the form explains the rule before submit and the message names the minimum; the admin can set `minHeartRateMinutes = 0` for a lenient month.
- [`durationMinutes` is a proxy for heart-rate minutes] -> documented assumption; a future `heartRateMinutes` field can replace it in the helper without touching callers.
- [Imports with many non-compliant historical rows create validation work] -> import keeps their given status (typically `VALIDATED` for history); only `PENDING` imports need overrides.
- [Existing tests/scripts register activities without `HEART_RATE` photos] -> `parallel-session-test.mjs` and e2e fixtures are updated to include a `HEART_RATE` photo; seed activities are created directly via Prisma and are not evaluated.

## Migration Plan

1. Migration adds a nullable column; safe on existing data, no backfill.
2. Deploy backend first (new field ignored by the old frontend), then frontend.
3. Rollback: redeploy previous backend; the extra column is harmless. Dropping it is a separate down-style migration if ever needed.

## Open Questions

- Should the participant's own activity list also show the compliance badge? Additive UI, does not change the specs; decide during UI review.
