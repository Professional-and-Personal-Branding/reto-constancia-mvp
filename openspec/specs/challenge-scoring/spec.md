# challenge-scoring Specification

## Purpose
Defines how each participant's score and qualification are computed from their validated activities and the challenge configuration, how the winners of a challenge are selected, and how a tie at the top is resolved.

## Requirements

### Requirement: Score is configurable per challenge
The score of a participant SHALL be `validatedDays x pointsPerValidatedDay + totalKm x pointsPerKm`, rounded to two decimals, where both factors are challenge configuration with defaults `1` and `0`. Only validated activities SHALL contribute. The ranking SHALL be ordered by score descending and, for equal scores, by total kilometres descending.

#### Scenario: Default scoring counts validated days
- **GIVEN** a challenge with the default `pointsPerValidatedDay = 1` and `pointsPerKm = 0`
- **AND** a participant with 6 validated days and 30 km
- **WHEN** results are computed
- **THEN** their score is `6`

#### Scenario: Kilometres add points
- **GIVEN** a challenge with `pointsPerValidatedDay = 10` and `pointsPerKm = 1`
- **AND** a participant with 3 validated days and 12.5 km
- **WHEN** results are computed
- **THEN** their score is `42.5`

#### Scenario: Only validated activities count
- **GIVEN** a challenge with `pointsPerKm = 1`
- **AND** a participant with one validated activity of 5 km and one pending activity of 8 km
- **WHEN** results are computed
- **THEN** the kilometres of the pending activity are excluded from the score

#### Scenario: Ranking order
- **GIVEN** two participants with the same score and 20 km and 12 km respectively
- **WHEN** results are computed
- **THEN** the one with 20 km is listed first

### Requirement: A minimum of validated days can be required to qualify
A participant SHALL be qualified when their validated days are greater than or equal to `minValidatedDaysToQualify` (default `0`) and their score is greater than zero. Only qualified participants MAY win. Every ranking entry SHALL expose its `score` and its `qualified` flag, and non-qualified participants SHALL still appear in the ranking.

#### Scenario: Below the minimum
- **GIVEN** a challenge with `minValidatedDaysToQualify = 10`
- **AND** the participant with the highest score has 8 validated days
- **WHEN** results are computed
- **THEN** that participant is listed with `qualified: false`
- **AND** the challenge has no winner

#### Scenario: At the minimum
- **GIVEN** a challenge with `minValidatedDaysToQualify = 10`
- **AND** a participant has exactly 10 validated days
- **THEN** that participant is `qualified: true`

#### Scenario: Default requires at least one validated day
- **GIVEN** a challenge with the default `minValidatedDaysToQualify = 0`
- **AND** a participant with no validated activities
- **THEN** that participant is `qualified: false` and cannot win

### Requirement: The number of winners is configurable
A challenge SHALL admit at most `maxWinners` winners (default `2`, minimum `1`). When the number of qualified participants tied at the top is less than or equal to `maxWinners`, all of them SHALL win and no tiebreak SHALL be applied.

#### Scenario: Single winner challenge
- **GIVEN** a challenge with `maxWinners = 1`
- **AND** three participants tied at the top
- **WHEN** results are computed
- **THEN** exactly one winner is returned

#### Scenario: Tie within the allowed number
- **GIVEN** a challenge with `maxWinners = 2`
- **AND** two participants tied at the top
- **WHEN** results are computed
- **THEN** both win
- **AND** no draw is needed

### Requirement: The tiebreak rule is configurable
When more qualified participants tie at the top than `maxWinners` allows, the system SHALL apply the challenge's `tiebreakRule`: `DRAW` (default) selects `maxWinners` of them at random and reports that a draw was needed; `TOTAL_KM` orders the tied participants by kilometres descending and takes the first `maxWinners`, reporting a draw only when the kilometres at the cut-off line are also tied; `SHARE_ALL` declares every tied participant a winner regardless of `maxWinners`. The notes of the results SHALL state which rule was applied.

#### Scenario: Random draw
- **GIVEN** a challenge with `maxWinners = 2` and `tiebreakRule = DRAW`
- **AND** four participants tied at the top
- **WHEN** results are computed
- **THEN** exactly two winners are returned, all of them among the tied participants
- **AND** the results report that a draw was needed

#### Scenario: Tiebreak by kilometres
- **GIVEN** a challenge with `maxWinners = 1` and `tiebreakRule = TOTAL_KM`
- **AND** three participants tied at the top with 30 km, 22 km and 18 km
- **WHEN** results are computed
- **THEN** the winner is the one with 30 km
- **AND** no draw is needed

#### Scenario: Kilometres also tied
- **GIVEN** a challenge with `maxWinners = 1` and `tiebreakRule = TOTAL_KM`
- **AND** two participants tied at the top with the same kilometres
- **WHEN** results are computed
- **THEN** one winner is returned
- **AND** the results report that a draw was needed

#### Scenario: Everyone tied wins
- **GIVEN** a challenge with `maxWinners = 2` and `tiebreakRule = SHARE_ALL`
- **AND** five participants tied at the top
- **WHEN** results are computed
- **THEN** the five of them are winners
- **AND** no draw is needed

### Requirement: Manual awards keep precedence
A manual award registered by the admin SHALL keep overriding the computed winners, regardless of the scoring configuration, and the payout SHALL be split among the awarded participants.

#### Scenario: Awards override the computation
- **GIVEN** a challenge with `maxWinners = 1` whose computed winner is participant A
- **WHEN** the admin registers B and C as awarded
- **THEN** the results list B and C as winners
- **AND** the payout is split between two winners

### Requirement: Scoring configuration is validated
The system SHALL accept `pointsPerValidatedDay` and `pointsPerKm` as numbers greater than or equal to `0`, `minValidatedDaysToQualify` as an integer greater than or equal to `0`, and `maxWinners` as an integer greater than or equal to `1`, when a challenge is created or updated. Values outside those ranges SHALL be rejected with `400`.

#### Scenario: Invalid number of winners
- **WHEN** an admin creates a challenge with `maxWinners = 0`
- **THEN** the request is rejected with `400`

#### Scenario: Valid custom configuration
- **WHEN** an admin creates a challenge with `pointsPerValidatedDay = 10`, `pointsPerKm = 0.5`, `minValidatedDaysToQualify = 8`, `maxWinners = 1` and `tiebreakRule = TOTAL_KM`
- **THEN** the request succeeds with `201`
- **AND** the stored challenge keeps those values

### Requirement: Web shows and edits the scoring rules
The admin challenge form SHALL let an admin set the four scoring fields with their defaults pre-filled. The results page SHALL describe the active scoring rule, show the computed points when the scoring is not the default one, and mark participants that do not qualify.

#### Scenario: Admin configures a challenge
- **WHEN** the admin opens the new challenge form
- **THEN** the four scoring fields are shown with the default values

#### Scenario: Participant reads the ranking
- **GIVEN** a challenge with `pointsPerKm = 1` and `minValidatedDaysToQualify = 5`
- **WHEN** a participant opens the results page
- **THEN** the page explains how points are computed and the minimum to qualify
- **AND** a participant with fewer than 5 validated days is marked as not qualified
