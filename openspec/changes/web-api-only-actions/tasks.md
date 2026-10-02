## 1. API

- [ ] 1.1 Extract the period rule into a helper used by create and update, and validate the merged period on update; verify with a new case in `backend/test/platform-rules.e2e-spec.ts` (only `endDate` changed before the start → 400, challenge unchanged) and a unit test

## 2. Web

- [ ] 2.1 Turn `NewChallengeForm` into `ChallengeForm` with an edit mode (pre-filled, month and year fixed, only changed fields sent) and add "Editar" to draft and active challenges; verify with Playwright: edit the fee of an active challenge, closed challenges show no edit, a bad period shows the API message
- [ ] 2.2 Add "Retirar" with in-page confirmation to pending activities in "Mis actividades"; verify with Playwright: withdraw and cancel paths, pending count and today's upload button update
- [ ] 2.3 Add the amount field to "Marcar pagado" in the participants page; verify with Playwright: a partial payment of 60 of 120 shows partial and owing 60, the default amount pays in full, zero is rejected

## 3. QA and documentation

- [ ] 3.1 Link the new journeys in `docs/qa/catalog.mjs` (TC-CHAL-05, TC-ACT-12, TC-FIN-01 gain web coverage), resolve OBS-02 and record OBS-03; verify `node scripts/validate-test-cases.mjs` approves every case with no orphan tests
- [ ] 3.2 Update guide steps 2.3, 3.3 and 4.5 (drop "Vía API", add captures), rebuild and republish the guide; update `CHANGELOG.md` and `docs/testing.md`; run `node scripts/run-tests.mjs` and verify all steps pass
