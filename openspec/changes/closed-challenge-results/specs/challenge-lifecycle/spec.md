## ADDED Requirements

### Requirement: Closed challenges stay viewable in the ranking
The web ranking page SHALL let any signed-in user open the final results of a `COMPLETED`
challenge. The page MUST offer the closed challenges ordered from the most recent end date,
and opening one MUST show its final ranking, its winners and the final prize per winner,
without labelling the prize as projected. Opening a closed challenge MUST NOT change the
active challenge selected in the header, and the page MUST offer a way back to the active
challenge's ranking. The results of a closed challenge MUST be reachable through a
shareable address. When there are no closed challenges, no closed-challenge control is
shown.

#### Scenario: Opening a closed challenge
- **GIVEN** challenge M is `COMPLETED` with an awarded winner
- **WHEN** a participant opens the ranking page and picks M among the closed challenges
- **THEN** the page shows M's ranking, the winners block and the final prize per winner
- **AND** the prize is not marked as projected

#### Scenario: Header selection is untouched
- **GIVEN** the user has active challenge A selected in the header
- **WHEN** the user opens closed challenge M in the ranking and then returns to the active ranking
- **THEN** the ranking shows A again
- **AND** the dashboard and upload pages still operate on A

#### Scenario: Shareable address
- **WHEN** a signed-in user opens `/dashboard/results?reto=<id of M>`
- **THEN** the page shows M's final results directly

#### Scenario: No active challenge
- **GIVEN** no challenge is `ACTIVE` and at least one is `COMPLETED`
- **WHEN** a user opens the ranking page
- **THEN** the page offers the closed challenges instead of only reporting that nothing is active

#### Scenario: Unknown or not closed challenge in the address
- **WHEN** the address names a challenge that does not exist or is not `COMPLETED`
- **THEN** the page shows the active ranking as usual and does not fail
