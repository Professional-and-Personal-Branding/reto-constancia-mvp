## ADDED Requirements

### Requirement: The pending queue is filterable per challenge and oldest first
`GET /api/activities/pending` SHALL be admin-only and SHALL accept two optional query parameters:
`challengeId` (a UUID; otherwise 400) and `order` (`asc` or `desc`; otherwise 400). It SHALL
return only `PENDING` activities, of that challenge when `challengeId` is given and of every
challenge otherwise, ordered by activity date and then by creation time, ascending when `order` is
`asc` or absent and descending when it is `desc`. Each item SHALL include the challenge `name` and
`status`. `GET /api/activities` and `GET /api/activities/me` SHALL keep their newest-first order.

#### Scenario: One challenge, oldest first
- **GIVEN** active challenges A and B, A with pending activities dated the 3rd and the 1st and B with one dated the 2nd
- **WHEN** the admin requests `GET /api/activities/pending?challengeId=<A>`
- **THEN** the response lists only A's two activities, the 1st before the 3rd, each with `challenge.name` of A

#### Scenario: Reversed order
- **WHEN** the admin requests `GET /api/activities/pending?challengeId=<A>&order=desc`
- **THEN** the activity of the 3rd comes before the one of the 1st

#### Scenario: Same date, creation time breaks the tie
- **GIVEN** two pending activities of A for the same date from different participants
- **WHEN** the admin requests the queue of A without `order`
- **THEN** the one created first comes first

#### Scenario: No challenge selected
- **WHEN** the admin requests `GET /api/activities/pending` without parameters
- **THEN** the response lists the pending activities of every challenge, oldest first, including those of a `COMPLETED` challenge with `challenge.status` `COMPLETED`

#### Scenario: Invalid parameters
- **WHEN** the admin sends `challengeId=abc` or `order=sideways`
- **THEN** the response is 400 and nothing is listed

#### Scenario: Participants cannot read the queue
- **WHEN** a participant requests `GET /api/activities/pending`
- **THEN** the response is 403

### Requirement: The admin can count the pending activities of active challenges
`GET /api/activities/pending/count` SHALL be admin-only and SHALL answer `{ "count": n }`, where
`n` is the number of `PENDING` activities whose challenge is `ACTIVE`. Activities of `DRAFT` or
`COMPLETED` challenges MUST NOT be counted. The route SHALL NOT change any data.

#### Scenario: Total across active challenges
- **GIVEN** active challenges A with two pending activities and B with one, and a completed challenge C with one pending activity
- **WHEN** the admin requests `GET /api/activities/pending/count`
- **THEN** the response is 200 with `{ "count": 3 }`

#### Scenario: Count follows validation
- **GIVEN** the count is 3
- **WHEN** the admin validates one of those activities and requests the count again
- **THEN** the response is `{ "count": 2 }`

#### Scenario: Participants cannot count
- **WHEN** a participant requests `GET /api/activities/pending/count`
- **THEN** the response is 403

### Requirement: The validation page filters by challenge and shows the pending counter
The admin "Validar" page SHALL offer a challenge selector with "Todos los retos" (the default) and
each active challenge, and an order toggle with "Más antiguas primero" (the default) and "Más
nuevas primero"; both choices SHALL be kept in the page URL. Each card SHALL show the challenge
name. A card of a `COMPLETED` challenge SHALL show "Reto cerrado" and SHALL NOT offer validating
or rejecting. For admins, the "Validar" menu item SHALL show the pending count of active
challenges as a badge, hidden when it is 0 and shown as "99+" above 99, refreshed after a
validation or rejection and when the window regains focus.

#### Scenario: Admin works one challenge
- **GIVEN** two active challenges with pending activities
- **WHEN** the admin opens "Validar" and picks challenge A
- **THEN** only A's pending activities are shown, oldest first, and the summary counts only them

#### Scenario: Admin reverses the order
- **WHEN** the admin switches to "Más nuevas primero"
- **THEN** the cards are shown newest first and a reload keeps the selected challenge and order

#### Scenario: Default view unchanged in scope
- **WHEN** the admin opens "Validar" without choosing a challenge
- **THEN** the pending activities of every challenge are shown, oldest first, each card naming its challenge

#### Scenario: Closed challenge card
- **GIVEN** a pending activity of a `COMPLETED` challenge
- **WHEN** the admin opens "Validar" with "Todos los retos"
- **THEN** its card shows "Reto cerrado" and has no "Validar" or "Rechazar" button

#### Scenario: Badge in the menu
- **GIVEN** three pending activities in active challenges
- **WHEN** the admin is on any page of the dashboard
- **THEN** the "Validar" menu item shows the badge "3"
- **AND** after validating one of them the badge shows "2" without reloading the page

#### Scenario: No badge at zero or for participants
- **WHEN** there are no pending activities in active challenges, or the user is a participant
- **THEN** no badge is shown
