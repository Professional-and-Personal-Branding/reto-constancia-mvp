## Why

Every challenge is configured with `minHeartRateMinutes` (default 20) and the upload screen tells participants "foto del entreno + captura de FC con al menos N min", but nothing in the system checks it: an activity with 5 minutes and no heart-rate capture is accepted and can be validated like any other. Enforcement is entirely manual and invisible to the admin (Gap #2). Making the rule explicit removes ambiguity for participants, gives the admin a clear signal while validating, and keeps historical imports usable.

## What Changes

- Define **heart-rate compliance** of an activity against its challenge: `durationMinutes >= minHeartRateMinutes` **and** a heart-rate capture is attached (`hasHeartRateProof` with a `HEART_RATE` photo). A challenge with `minHeartRateMinutes = 0` disables the rule.
- **Registration** (`POST /activities`) rejects non-compliant activities with `400` and a message that states the challenge's minimum; declaring `hasHeartRateProof` without a `HEART_RATE` photo is also rejected.
- Activity responses (`GET /activities`, `/activities/me`, `/activities/pending`, detail) expose a derived `heartRateCompliant` flag so clients can render it without re-implementing the rule.
- **Admin validation** of a non-compliant activity (e.g. imported records) requires an explicit override: `POST /activities/:id/validate` with `{ override: true, note }`; the note is stored as `validationNote` and returned with the activity. Compliant activities validate as today.
- **Import** preview reports non-compliant rows as `warnings` (not errors) and the commit imports them unchanged; historical manual records remain importable, and the admin sees how many rows will need an override.
- **Web**: the upload form blocks submission while the activity is non-compliant and explains why; the validations page shows a compliance badge and, for non-compliant activities, asks for the override note before validating.
- `minHeartRateMinutes` accepts `0` when creating/updating a challenge (rule disabled for that challenge).

No **BREAKING** change: the only new constraint is on new registrations below the configured minimum, which is the rule participants were already told about. Existing validated activities are untouched.

**Assumption recorded for approval:** the duration used for the rule is `durationMinutes` (the session length), on the basis that the heart-rate capture covers the whole session. Storing a separate `heartRateMinutes` read from the capture is deferred (see design.md - Non-Goals); if the owner prefers that field now, this proposal must be updated before apply.

## Capabilities

### New Capabilities
- `activity-heart-rate-compliance`: definition of heart-rate compliance, its enforcement at registration and validation (with admin override), its exposure in activity responses and import previews, and the per-challenge switch (`minHeartRateMinutes = 0`).

### Modified Capabilities
<!-- none: challenge-lifecycle is not affected (no state transition changes) -->

## Impact

- **Backend**: `backend/src/activities/activities.service.ts` (pure `assessHeartRate()` helper, enforcement in `create()`, override in `validate()`, `heartRateCompliant` mapping in `findAll()`/`findOne()`), new `dto/validate-activity.dto.ts`, `activities.controller.ts` (body on validate), `challenges/dto/*.ts` (`@Min(0)` for `minHeartRateMinutes`), `import/import.service.ts` (`warnings` in preview rows and summary), unit specs (`activities.service.spec.ts` new, `import.service.spec.ts` extended), e2e suite `activity-heart-rate.e2e-spec.ts`.
- **Database**: one Prisma migration adding nullable `DailyActivity.validationNote` (text).
- **Frontend**: `app/dashboard/upload/page.tsx` (client-side compliance check and explanation), `app/dashboard/admin/validations/page.tsx` (badge + override note flow), `app/dashboard/admin/import/page.tsx` (show warnings), `lib/types.ts` (`heartRateCompliant`, `validationNote`, preview `warnings`).
- **Scripts/Docs**: `scripts/parallel-session-test.mjs` (section 9: below-minimum registration -> 400, override validation), `docs/challenge-rules.md` (Gap #2 resolved, rule definition), `docs/import-template.md` (warnings), `docs/test-cases.md` (new TC-ACT cases), `docs/architecture.md` (validation flow note).
- **Dependencies**: none added.
