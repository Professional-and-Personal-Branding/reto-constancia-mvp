## ADDED Requirements

### Requirement: Admins record the standard fee for several participants at once
`PATCH /challenges/:id/participants/payments` SHALL be available only to admins and SHALL accept
`{ userIds, paid: true }`, with `userIds` an array of 1 to 200 UUIDs; an empty array, more than 200
ids, an id that is not a UUID, `paid` other than `true` or an unknown key MUST be rejected with 400
and nothing written. Repeated ids SHALL be treated as one. For each distinct id the endpoint SHALL:

- record `paid: true`, `paidAt` and `amountPaid` equal to the challenge's `feePerParticipant` when
  the user is enrolled with no payment recorded, and list them in `marked`;
- leave the enrolment unchanged and list it in `alreadyPaid` when its recorded amount equals the fee;
- leave the enrolment unchanged and list it in `excluded` with `reason` `PARTIAL` when the recorded
  amount is lower than the fee, or `DIFFERENT_AMOUNT` when it is higher;
- list the id in `skipped` with `reason` `NOT_ENROLLED` and `message` "No está inscrito en este reto"
  when the user is not enrolled in the challenge.

The answer SHALL be 200 with `feePerParticipant`, `currency` and exactly those four lists, each entry
of `marked`, `alreadyPaid` and `excluded` carrying `userId`, `name`, `email` and `amountPaid`; every
distinct requested id SHALL appear in exactly one list. Amounts SHALL be compared in cents. The
endpoint MUST NOT change payment proofs, MUST NOT overwrite a recorded payment and SHALL write all its
changes in one transaction under the same challenge lock as recording a single payment, reporting
exactly what that transaction wrote. Repeating the same request SHALL mark nobody new. An unknown
challenge SHALL answer 404 "Reto no encontrado"; a `COMPLETED` challenge SHALL answer 400 "No se
puede modificar un reto cerrado" and a challenge whose fee is not greater than zero 400 "Este reto no
cobra cuota", in both cases without writing anything.

#### Scenario: Mixed batch
- **GIVEN** an active challenge with a fee of 120 BOB where Ana has no payment, Bea paid 120, Carla paid 60, Diego paid 150, and Luis is not enrolled
- **WHEN** an admin sends the five ids with `paid: true`
- **THEN** the response is 200 with Ana in `marked` with `amountPaid` 120, Bea in `alreadyPaid`, Carla in `excluded` with `PARTIAL` and 60, Diego in `excluded` with `DIFFERENT_AMOUNT` and 150, and Luis in `skipped` with `NOT_ENROLLED`
- **AND** only Ana's enrolment changed, with `amountPaid` 120 and a `paidAt`

#### Scenario: Repeating the batch
- **GIVEN** the previous batch succeeded
- **WHEN** the admin sends it again
- **THEN** `marked` is empty, Ana and Bea are in `alreadyPaid` and no enrolment changes

#### Scenario: Two identical batches at the same time
- **GIVEN** an active challenge with three enrolled participants without payment
- **WHEN** two admins send the same three ids at the same time
- **THEN** each participant has one payment of the fee
- **AND** each of them appears in `marked` of exactly one response and in `alreadyPaid` of the other

#### Scenario: Closed challenge
- **GIVEN** a `COMPLETED` challenge with an unpaid participant
- **WHEN** an admin sends the participant's id
- **THEN** the response is 400 "No se puede modificar un reto cerrado", the participant stays unpaid and the challenge's `payout.pot` is unchanged

#### Scenario: Free challenge
- **WHEN** an admin sends a batch for a challenge with a fee of 0
- **THEN** the response is 400 "Este reto no cobra cuota" and nothing changes

#### Scenario: Invalid request
- **WHEN** an admin sends an empty `userIds`, 201 ids, an id that is not a UUID or `paid: false`
- **THEN** the response is 400 and nothing changes

#### Scenario: Participant calls the endpoint
- **WHEN** a participant calls `PATCH /challenges/:id/participants/payments`
- **THEN** the response is 403 and nothing changes

### Requirement: The participants page marks payments in bulk and copies the pending list
For a challenge with a fee greater than zero, the admin's "Participantes" page SHALL offer a
checkbox per enrolled participant labelled "Seleccionar el pago de <nombre>", a "Seleccionar sin
pagar" action that selects the shown participants without a payment, and "Marcar seleccionados como
pagados (<n>)". That action SHALL first show a confirmation dialog stating "Se registrará la cuota de
<cuota> <moneda> a <k> personas: <total> <moneda>." for the selected participants without a payment
and listing apart, under "No se tocan:", each selected participant with a partial payment, a
different amount or already paid; it SHALL call the bulk endpoint only on confirmation, in batches of
at most 200 ids, and then show a status message built from the response and refresh the roster and
the financial summary. The page SHALL also offer "Copiar pendientes", which copies one line
"<nombre>: <adeudado> <moneda>" per participant without a payment or with a partial payment, sorted
by name, marked " (comprobante por revisar)" when their proof awaits review, and a last line "Total
adeudado: <suma> <moneda>"; the text MUST NOT contain emails. When the clipboard is not available the
text SHALL be shown selected in a read-only box. For a free challenge neither action SHALL be shown.

#### Scenario: Confirmation states the total
- **GIVEN** a challenge with a fee of 120 BOB and two participants without payment
- **WHEN** the admin presses "Seleccionar sin pagar" and then "Marcar seleccionados como pagados (2)"
- **THEN** the dialog shows "Se registrará la cuota de 120 BOB a 2 personas: 240 BOB."
- **AND** no request is sent until the admin confirms

#### Scenario: Partial payments are shown apart
- **GIVEN** the admin also selected Carla, who paid 60 of 120 BOB
- **WHEN** the dialog opens
- **THEN** it lists "Carla: pago parcial de 60 BOB" under "No se tocan:" and the total still counts two people

#### Scenario: Result after confirming
- **WHEN** the admin confirms
- **THEN** a status message reports 2 payments recorded and Carla untouched, the "Pagados" count grows by 2 and Carla is still partial

#### Scenario: Copy the pending list
- **GIVEN** Ana without payment and Carla with 60 of 120 BOB and a proof awaiting review
- **WHEN** the admin presses "Copiar pendientes"
- **THEN** the clipboard holds "Ana: 120 BOB", "Carla: 60 BOB (comprobante por revisar)" and "Total adeudado: 180 BOB", in that order, without emails
