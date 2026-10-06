## ADDED Requirements

### Requirement: A draw is stored at close
When a challenge closes and its results, computed inside the closing transaction, need a draw and
no awards exist, the system SHALL draw once and store every winner (guaranteed and drawn) as an
award with the reserved note "Sorteo automático al cierre". Later reads SHALL always return those
winners, with `drawNeeded = false` and the note "Ganadores definidos por sorteo automático al
cierre.".

#### Scenario: Stable winners after closing
- **GIVEN** an `ACTIVE` challenge with four participants tied at the top, `maxWinners = 2` and `DRAW`
- **WHEN** it closes and its results are read twenty times
- **THEN** there are two awards with the reserved note and every read returns the same two winners with `drawNeeded = false`

#### Scenario: No tie
- **WHEN** a challenge with a single winner, or with `SHARE_ALL`, closes
- **THEN** no award is created

#### Scenario: Kilometres tied at the cut-off
- **GIVEN** A with 30 km, B and C with 20 km, all with the same score, `maxWinners = 2` and `TOTAL_KM`
- **WHEN** the challenge closes
- **THEN** A and the drawn one of B and C are stored as awards

## MODIFIED Requirements

### Requirement: The tiebreak rule is configurable
When more qualified participants tie at the top than `maxWinners` allows, the system SHALL apply the challenge's `tiebreakRule`: `DRAW` (default) selects `maxWinners` of them using a uniformly random permutation from a cryptographic source and reports that a draw was needed; `TOTAL_KM` orders the tied participants by kilometres descending and takes the first `maxWinners`, reporting a draw only when the kilometres at the cut-off line are also tied (and breaking that tie with the same uniform random permutation); `SHARE_ALL` declares every tied participant a winner regardless of `maxWinners`. The notes of the results SHALL state which rule was applied. These scenarios describe a challenge that is not closed; a closed challenge with a stored draw reports `drawNeeded = false` (see "A draw is stored at close").

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

#### Scenario: Uniform draw
- **GIVEN** three tied participants and a draw for one seat
- **WHEN** the draw is repeated many times with a fixed-seed generator
- **THEN** each of the six possible orders appears with a frequency within one percentage point of one sixth
