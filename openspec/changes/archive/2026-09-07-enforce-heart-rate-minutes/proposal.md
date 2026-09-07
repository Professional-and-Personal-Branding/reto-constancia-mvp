## Why

Every challenge is configured with `minHeartRateMinutes` (default 20) and the upload screen tells participants "foto del entreno + captura de FC con al menos N min", but nothing in the system checks it: an activity with 5 minutes and no heart-rate capture is accepted and can be validated like any other. Enforcement is entirely manual and invisible to the admin (Gap #2). Making the rule explicit removes ambiguity for participants, gives the admin a clear signal while validating, and keeps historical imports usable.

## What Changes

- New activity field **`heartRateMinutes`**: the minutes of heart-rate recording shown on the capture (distinct from `durationMinutes`, the session length). Optional in the data model, required by the rule when the challenge enforces it. It can never exceed `durationMinutes`.
- Define **heart-rate compliance** of an activity against its challenge: `heartRateMinutes >= minHeartRateMinutes` **and** heart-rate proof present (`hasHeartRateProof`). A challenge with `minHeartRateMinutes = 0` disables the rule.
- `hasHeartRateProof` becomes **derived on registration**: it is true exactly when a `HEART_RATE` photo is attached (the client flag is ignored). Imports keep it as an explicit column because historical rows cannot attach the capture.
- **Registration** (`POST /activities`) rejects non-compliant activities with `400` and a message that states the challenge's minimum.
- Activity responses expose a derived `heartRateCompliant` flag so clients do not re-implement the rule.
- **Admin validation** of a non-compliant activity (typically imported `PENDING` records) requires an explicit override: `POST /activities/:id/validate` with `{ override: true, note }`; the note is stored as `validationNote`. Compliant activities validate as today.
- **Import**: new optional column `heartRateMinutes`; preview reports non-compliant rows as `warnings` (not errors) and the commit imports them unchanged.
- **Web**: the upload form gains the "minutos con FC" input, blocks submission while non-compliant and explains why; the validations page shows the recorded minutes, a compliance badge and the override-note flow; the import page shows warnings; the challenge form accepts `0`.

No **BREAKING** change: `heartRateMinutes` is optional in the API and the file; the only new constraint applies to new registrations in challenges with a minimum, which is the rule participants were already told about. Existing validated activities are untouched (their `heartRateMinutes` is null and they are never re-evaluated automatically).

**Decision recorded:** the owner chose to store the heart-rate minutes as their own field instead of using `durationMinutes` as a proxy.

## Capabilities

### New Capabilities
- `activity-heart-rate-compliance`: the `heartRateMinutes` data, the compliance definition, its enforcement at registration and validation (with admin override), its exposure in activity responses and import previews, and the per-challenge switch (`minHeartRateMinutes = 0`).

### Modified Capabilities
<!-- none: challenge-lifecycle is not affected -->

## Impact

- **Backend**: `backend/src/activities/activities.service.ts` (pure `assessHeartRate()` helper, enforcement + derived `hasHeartRateProof` in `create()`, override in `validate()`, `heartRateCompliant` mapping in list/detail methods), `dto/create-activity.dto.ts` (`heartRateMinutes`), new `dto/validate-activity.dto.ts`, `activities.controller.ts` (body on validate), `challenges/dto/*.ts` (`@Min(0)`), `import/import.service.ts` (column, warnings), unit specs (`activities.service.spec.ts` new, `import.service.spec.ts` extended), e2e suite `activity-heart-rate.e2e-spec.ts`.
- **Database**: one Prisma migration adding `DailyActivity.heartRateMinutes Int?` and `DailyActivity.validationNote String?`.
- **Frontend**: `app/dashboard/upload/page.tsx`, `app/dashboard/admin/validations/page.tsx`, `app/dashboard/admin/import/page.tsx`, `app/dashboard/admin/challenges/page.tsx` (min 0), `lib/types.ts`.
- **Scripts/Docs**: `scripts/parallel-session-test.mjs` (fixtures with `heartRateMinutes` + `HEART_RATE` photo; section 9), `docs/challenge-rules.md`, `docs/import-template.md` and `docs/import-template.csv`, `docs/test-cases.md`, `docs/architecture.md`.
- **Dependencies**: none added.
