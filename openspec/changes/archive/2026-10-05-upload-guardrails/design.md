## Context

- `UploadModule` declares `UploadController` and `UploadService` and exports the service;
  `AppModule` imports it. `ChallengesModule` imports nothing; `ActivitiesModule` imports
  `ChallengesModule`. `PrismaModule` is global.
- `saveLocal` sanitizes the folder with `/[^a-zA-Z0-9/_-]/`, writes `<uuid><ext>` and returns
  `public_id = <folder>/<uuid>` and `secure_url = <publicBaseUrl>/uploads/<folder>/<uuid><ext>`.
- The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so unknown body fields
  answer 400.
- The import writes `ActivityPhoto` rows directly with Prisma (`import/<userId>/<date>` ids), not
  through `ActivitiesService.create`.
- Playwright starts the API with `THROTTLE_LIMIT=2000` so its journeys can run from one IP; a
  route-level `@Throttle` with a fixed number would ignore it.
- API e2e suites boot `AppModule` reading `backend/.env`; there is no Jest e2e setup file.
- Cloudinary accounts created since 2023 may use dynamic folder mode, where the returned
  `public_id` prefix depends on account settings.

## Goals / Non-Goals

**Goals:** only participants spend the quota, only allowed formats are stored, evidence always
points to the caller's own upload, the test suites keep passing in local mode, no migration.

**Non-Goals:** storage cleanup and orphan listing (`upload-asset-cleanup`), signed size limits,
local-simulator polish (see proposal).

## Decisions

1. **D1 - Pure policy module** `upload/upload-policy.ts`:
   - `UPLOAD_PURPOSES`, `ALLOWED_FORMATS` (alphabetical, the client forwards them byte for byte),
     `DEFAULT_MAX_BYTES` (10 MB);
   - `normalizeBase(base)` strips slashes at both ends;
   - `folderFor(base, challengeId, userId, purpose)`, `parseFolder(base, folder)` (UUID segments);
   - `isOwnedAsset({ url, publicId }, ctx)`: the id starts with the derived folder plus `/`, has no
     `..` or `\`, at most 255 characters; the extension is one of the purpose's formats.
     Cloudinary mode: `https:`, hostname exactly `res.cloudinary.com`, path
     `/<cloud>/image/upload/(v<n>/)?<id>.<ext>`. Local mode: same origin as `PUBLIC_URL` (or
     `http://localhost:<PORT>`) and path `<PUBLIC_URL path>/uploads/<id>.<ext>`.
   - Every value interpolated into a regex (`base`, cloud name, id) is escaped. Invariant: the
     derived folder only contains the base, UUIDs and the purpose, so `saveLocal`'s sanitizing
     never changes it; a unit test pins this so a base with unusual characters is rejected at
     start-up instead of silently breaking ownership checks.
   - `jpeg` is not listed: Cloudinary stores JPEGs as `jpg`; the simulator normalizes too (V2
     confirms it on the real account).
2. **D2 - Modules without cycles.** New `UploadCoreModule` provides and exports `UploadService`
   (signing, ownership checks, local saving; depends only on `ConfigService`). `UploadModule`
   keeps only the controller and imports `UploadCoreModule` and `ChallengesModule`, and
   re-exports `UploadCoreModule` so `AppModule` stays unchanged. `ChallengesModule` and
   `ActivitiesModule` import `UploadCoreModule`.
3. **D3 - Participation rules live in `ChallengesService`.**
   `assertActiveParticipant(challengeId, userId)` (404 "Reto no encontrado", 400 "El reto no está
   activo", 403 "No participas en este reto") replaces the inline checks in
   `ActivitiesService.create`, keeping their order and messages.
   `assertPaymentParticipant(challengeId, userId)` reuses the closed-challenge rule (400 "No se
   puede modificar un reto cerrado") and then requires enrolment (403). The user id is the JWT
   `sub`.
4. **D4 - Sign endpoint.** `SignUploadDto { challengeId: UUID, purpose }`. The controller runs the
   participation rule for the purpose, then `signUpload(challengeId, userId, purpose)`, which
   signs `{ allowed_formats, folder, timestamp }` and returns the signature plus
   `allowedFormats`, `maxBytes` (`UPLOAD_MAX_BYTES`, default 10 MB) and
   `uploadUrl = .../image/upload` (a PDF uploaded through `image` is still stored as an image
   resource; V3 confirms delivery). In local mode it returns the same folder and the local URL.
5. **D5 - Configurable sign limit.** `resolveUploadSignLimit(env)` in `common/http.ts` reads
   `UPLOAD_SIGN_LIMIT` (default 30, invalid values fall back), applied with
   `@Throttle({ default: { limit, ttl: 60_000 } })` evaluated at module load. Playwright and the
   API e2e setup raise it; the 429 test runs in its own app instance with a low limit.
6. **D6 - Evidence checks.** `ActivitiesService.create`: participation rule, reject a repeated id
   inside the same request, then `assertOwnedAsset` for every photo regardless of `PhotoType`
   (heart-rate captures come from the same `activity` folder). `uploadPaymentProof`:
   `assertPaymentParticipant`, then `assertOwnedAsset(..., 'payment-proof')`. Messages: "La foto
   debe subirse desde la plataforma" / "El comprobante debe subirse desde la plataforma".
7. **D7 - Admin proof fields removed** from `MarkPaymentDto`: no screen sends them, and keeping
   them would need a "both or none" rule plus ownership checks for an unused path. Sending them
   answers 400 (forbidden fields). Unmarking a payment leaves the stored proof unchanged.
8. **D8 - Honest local simulator.** `POST /upload/local` parses the folder (400 "Carpeta de subida
   no válida"), requires the folder's user to be the caller (403), applies the participation rule
   for the folder's purpose, checks the extension against the purpose's formats (400 "Formato no
   permitido. Usa JPG, PNG, WEBP o HEIC (PDF solo para comprobantes)") and normalizes `.jpeg`.
   It stays disabled in production.
9. **D9 - Tests run in local mode on purpose.** `backend/test/setup-e2e.ts` (registered in
   `jest-e2e.json` `setupFiles`) sets `CLOUDINARY_CLOUD_NAME/_API_KEY/_API_SECRET` to `''` and a
   fixed `PUBLIC_URL`, `UPLOAD_SIGN_LIMIT` high, before `AppModule` compiles. Empty strings, not
   `delete`: dotenv does not override variables already present, so an empty value is what keeps a
   developer's real keys out of the tests. A helper `ownedAsset(...)` builds valid local evidence
   without writing files.
10. **D10 - PDF gate (V3) with plan B written now.** If the owner's account cannot deliver a PDF
    uploaded as a proof, `payment-proof` formats become `heic,jpg,png,webp`, the proof `accept`
    drops `application/pdf`, the guide asks for a photo or screenshot of the receipt, and the
    spec scenario "Payment proof signature" changes its formats accordingly. No `raw` uploads:
    `allowed_formats` would not protect them the same way.

## Risks / Trade-offs

- Breaking the signature contract -> backend and web ship in the same release; only the own web
  uses it.
- Fixtures with external URLs break -> explicit inventory in tasks plus a final grep gate
  (`example.com|placehold.co` and legacy ids in tests and scripts).
- Dynamic folder mode returns a different `public_id` prefix -> V5 checks the real response; the
  fallback is signing `asset_folder` with `use_asset_folder_as_public_id_prefix`.
- A legitimate participant can still upload junk in allowed formats -> per-user folder, rate
  limit and the later orphan script bound it; acceptable for the MVP.
- `TRUST_PROXY` misconfigured would make everyone share the sign limit -> runbook check.
- No signed size limit -> client-side check plus the plan's cap; signed preset as fallback.

## Migration Plan

No migration. Ships in 1.5.0 with `ops-observability-baseline`, before the first deploy. Owner,
on the Cloudinary account: enable "Allow delivery of PDF and ZIP files"; run V1 to V5 from the
runbook (formats accepted and rejected, `.jpeg` stored as `jpg`, PDF proof opens, tampered
`allowed_formats`/`folder` gives "Invalid Signature", real `public_id` and `secure_url` match the
derived folder). V1 to V5 gate opening the production URL, not the merge. Rollback: redeploy
1.4.2 (API and web together).

## Open Questions

None. V3 has its plan B (D10).
