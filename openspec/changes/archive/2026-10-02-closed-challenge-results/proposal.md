## Why

Once a challenge is closed, nobody can see its final ranking in the web app: every
selector lists active challenges only, so the winners block and the final prize the
results page already knows how to render are unreachable. Participants want to check who
won last month and admins need to show the outcome when they hand over the prize. Today the
only way is calling `GET /api/challenges/:id/results` by hand (observation OBS-01 in the QA
catalog).

## What Changes

- The ranking page offers the closed challenges, most recent first, so any signed-in user
  can open the final results of one: ranking, winners and the final prize per winner.
- Opening a closed challenge does not change the active challenge selected in the header;
  the page offers a way back to the active ranking.
- A closed challenge's results have a shareable address (`/dashboard/results?reto=<id>`).
- When no challenge is active, the ranking page shows the closed challenges instead of a
  dead end.
- QA catalog: TC-CHAL-12 becomes an automated case and OBS-01 is closed. The guide's step
  6.3 explains how to see a closed ranking, with a capture.

No backend or API changes: the existing endpoints already return everything needed.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `challenge-lifecycle`: adds a requirement that closed challenges stay viewable in the
  web ranking, alongside the existing selection of active challenges (which does not change).

## Impact

- **Frontend:** the ranking page (`frontend/app/dashboard/results/page.tsx`) and a small hook
  to list closed challenges from `GET /challenges`.
- **Tests:** Playwright journey for opening a closed challenge, the shareable address and the
  no-active-challenge state; QA catalog update.
- **Docs:** guide step 6.3 and its capture, `docs/qa` regenerated, CHANGELOG.
