## Context

See proposal.md for the motivation. `GET /challenges` (any signed-in user) returns every
challenge with its status; `GET /challenges/:id/results` (any signed-in user) returns the
ranking, winners and payout, and already reflects awards and the `COMPLETED` status. The
results page renders the winners block and drops the "proyectado" label when the status is
`COMPLETED`, but it only ever loads the challenge chosen by `useActiveChallenge`, which is
built on `GET /challenges/active/list` and falls back when the selection is not active.

## Goals / Non-Goals

**Goals:**
- Reach any closed challenge's final results from the ranking page with one control.
- Keep the active-challenge selection rules of `challenge-lifecycle` exactly as they are.

**Non-Goals:**
- Changing who can see results (already any signed-in user) or the shape of the API.
- Editing awards of a closed challenge from this view.
- Hiding draft challenges from `GET /challenges` (unchanged behaviour, out of scope).

## Decisions

### The closed challenge lives in the URL, not in the header selection
The ranking page reads `?reto=<id>`. When it names a `COMPLETED` challenge, the page loads
that challenge's results; otherwise it uses the header's active challenge as today. The
closed-challenge control writes the query parameter and "Volver al reto activo" removes it.
This keeps the header's stored selection (`reto.selectedChallengeId`) and its fallback rule
untouched and gives the shareable address for free.
*Alternative:* list closed challenges in the header selector. Rejected: the dashboard and
upload pages cannot operate on a closed challenge, and it would break the "falls back when
no longer active" rule.

### Closed challenges come from `GET /challenges`, filtered in the client
A small hook (`useClosedChallenges`) fetches `/challenges`, keeps `COMPLETED` ones and sorts
them by end date, newest first. No new endpoint: the list is short (one challenge per month)
and the endpoint is already available to every signed-in user.
*Alternative:* `GET /challenges?status=COMPLETED`. Deferred: no payload or privacy reason to
add it now.

### No-active state shows the closed list
When there is no active challenge and no `?reto`, the page shows the "no active challenge"
message followed by the closed challenges as links, so the page is never a dead end.

## Risks / Trade-offs

- [The admin award panel would appear on a closed challenge] → the panel is shown only for
  the active ranking; a closed challenge's results are read-only in this view.
- [A stale link points to a challenge that was reopened or deleted] → unknown or non-closed
  ids fall back to the active ranking (spec scenario).
