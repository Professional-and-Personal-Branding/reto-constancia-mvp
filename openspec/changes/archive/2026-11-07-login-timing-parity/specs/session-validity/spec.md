## ADDED Requirements

### Requirement: A failed login does the same work whatever the reason
`POST /api/auth/login` SHALL run exactly one argon2 password verification for every request that
reaches the service. When the email does not exist or its user is inactive, the verification MUST
run against a dummy argon2 hash computed at startup with the same hashing function and parameters
as stored passwords. An unknown email, an inactive user (with any password) and a wrong password
MUST all answer 401 with the same body, "Credenciales inválidas". A correct password of an active
user SHALL keep answering 200 with the user and the tokens. Stored hashes SHALL NOT be changed or
re-hashed, and no schema change SHALL be required.

#### Scenario: Unknown email
- **WHEN** someone logs in with an email that has no account
- **THEN** the password is verified once against the dummy hash
- **AND** the response is 401 "Credenciales inválidas"

#### Scenario: Inactive user, even with the right password
- **GIVEN** a deactivated user
- **WHEN** they log in with their correct password
- **THEN** the password is verified once against the dummy hash, not against their stored hash
- **AND** the response is 401 "Credenciales inválidas"

#### Scenario: Wrong password
- **GIVEN** an active user
- **WHEN** they log in with a wrong password
- **THEN** the password is verified once against their stored hash and the response is 401 "Credenciales inválidas"

#### Scenario: Same response for the three failures
- **WHEN** the three failed logins above are sent
- **THEN** their status codes and bodies are identical

#### Scenario: Valid login unchanged
- **GIVEN** an active user
- **WHEN** they log in with the correct password
- **THEN** the response is 200 with the user and an access and a refresh token, as before

#### Scenario: Dummy hash shares the real parameters
- **WHEN** the dummy hash and a newly hashed password are compared
- **THEN** both use the same algorithm, version, memory, iterations and parallelism

#### Scenario: Rate limit unchanged
- **WHEN** a sixth login is sent from the same IP within a minute
- **THEN** the response is 429 and no password is verified
