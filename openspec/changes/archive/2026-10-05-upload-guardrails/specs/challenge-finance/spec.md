## ADDED Requirements

### Requirement: Payment proofs must be the participant's own upload
A participant SHALL be able to attach a payment proof only to a challenge they are enrolled in, and
only with an asset uploaded to their own `payment-proof` folder for that challenge, with its URL
exactly the storage URL of that id. A non-participant MUST receive 403 "No participas en este reto";
any other proof MUST be rejected with 400 "El comprobante debe subirse desde la plataforma" and
nothing is stored. The closed-challenge rule of "Payments close with the challenge" still applies
first. Admins SHALL NOT attach proofs: the admin payment endpoint MUST reject proof fields with 400,
and marking or unmarking a payment MUST leave the stored proof unchanged.

#### Scenario: Own proof
- **GIVEN** a participant enrolled in an active challenge
- **WHEN** they attach a proof uploaded to their own `payment-proof` folder
- **THEN** the proof is stored

#### Scenario: Someone else's proof
- **WHEN** a participant submits the proof id of another participant
- **THEN** the response is 400 and their record is unchanged

#### Scenario: Not enrolled
- **WHEN** a user who is not enrolled uploads a proof for the challenge
- **THEN** the response is 403 "No participas en este reto"

#### Scenario: Admin sends proof fields
- **WHEN** an admin marks a payment sending `paymentProofUrl` or `paymentProofCloudinaryId`
- **THEN** the response is 400 and the participant record is unchanged

#### Scenario: Unmarking keeps the proof
- **GIVEN** a participant with a stored proof
- **WHEN** the admin marks the payment as unpaid
- **THEN** the stored proof is unchanged
