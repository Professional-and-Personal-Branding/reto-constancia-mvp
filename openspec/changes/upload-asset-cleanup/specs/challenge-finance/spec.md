## ADDED Requirements

### Requirement: Replaced payment proofs are kept unless configured otherwise
Replacing a payment proof SHALL keep the previous file by default, because it is financial
evidence. Only when `UPLOAD_DELETE_REPLACED_PROOFS` is `true` SHALL the previous file be released
after the change is committed, and only if no other record references it. Unmarking a payment
SHALL never touch the stored proof.

#### Scenario: Default keeps the old proof
- **GIVEN** the flag is not set
- **WHEN** a participant replaces their payment proof
- **THEN** the previous file is kept

#### Scenario: Flag enabled
- **GIVEN** `UPLOAD_DELETE_REPLACED_PROOFS=true`
- **WHEN** a participant replaces their payment proof with a different file
- **THEN** the previous file is released after the change is saved

#### Scenario: Same file again
- **GIVEN** the flag is enabled
- **WHEN** a participant submits the same proof id again
- **THEN** nothing is released
