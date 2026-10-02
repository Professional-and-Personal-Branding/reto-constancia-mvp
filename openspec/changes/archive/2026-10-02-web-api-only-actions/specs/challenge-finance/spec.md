## ADDED Requirements

### Requirement: Admins record partial payments from the web
The admin participants page SHALL let the admin enter the amount received when marking a
participant as paid, pre-filled with the challenge fee. The amount MUST be greater than zero.
Saving MUST record it as `amountPaid`; an amount below the fee MUST show the participant as
partial with the amount still owed, and the financial summary MUST update immediately.

#### Scenario: Partial payment
- **GIVEN** a challenge with a fee of 120 and an unpaid participant
- **WHEN** the admin records a payment of 60
- **THEN** the participant shows as partial, owing 60
- **AND** the collected total increases by 60

#### Scenario: Full payment by default
- **WHEN** the admin records a payment without changing the pre-filled amount
- **THEN** the participant shows as paid in full

#### Scenario: Invalid amount
- **WHEN** the admin enters 0 or leaves the amount empty
- **THEN** the payment cannot be saved and the form explains why
