## MODIFIED Requirements

### Requirement: Admins renew a challenge from the web after a preview
The admin challenge list SHALL offer "Renovar" on `ACTIVE` and `COMPLETED` challenges and not on
`DRAFT` ones. "Renovar" SHALL open a dialog built from the renewal preview that shows the target
month and period, a summary of the copied rules (marking a manual budget as "ajustado" with its
amount), a name field prefilled with the suggested name, the participants section, and the note "No
se copian pagos, comprobantes, actividades ni premiaciones. El reto nace en borrador: revísalo y
actívalo cuando corresponda." The participants section SHALL:
- with N > 1 active participants to copy, show a checkbox "Inscribir a los N participantes activos de
  <reto>" that starts checked;
- with exactly one, show a checkbox "Inscribir al participante activo de <reto>" that starts checked;
- with none, show no checkbox and the text "<reto> no tiene participantes activos para inscribir.",
  and confirming SHALL send `copyParticipants: false`;
- in every case list the people to copy and the inactive ones that will not be copied.

When the target month is already taken the dialog SHALL say "Ya existe un reto para <Mes AAAA>" with
its status and the confirm button MUST be disabled. Confirming SHALL send the name and the checkbox
value; on success the dialog closes, the list shows the new challenge as a draft and a status message
says "<nombre> creado en borrador con N inscritos". Any failed request SHALL show the API message
inside the dialog.

The dialog SHALL behave as a modal: while it is open the rest of the page MUST NOT be focusable or
exposed to assistive technology; when it opens, focus SHALL move to "Cancelar"; `Tab` and
`Shift+Tab` MUST keep focus inside the dialog, cycling among its enabled controls, also when the
focused control was disabled meanwhile (then `Tab` SHALL go to the first enabled control and
`Shift+Tab` to the last); while the renewal is being created focus SHALL stay on the dialog;
`Escape` SHALL close it unless the renewal is being created, in which case `Escape` MUST do nothing;
when the dialog closes (cancel, `Escape` or success), focus SHALL return to the "Renovar" button that
opened it.

#### Scenario: Renew from the list
- **GIVEN** the 10/2026 challenge is `ACTIVE` with two active participants and 11/2026 is free
- **WHEN** the admin presses "Renovar", keeps the suggested name and the checkbox, and confirms
- **THEN** the list shows "Reto Noviembre 2026" as a draft with 2 participants
- **AND** the page says "Reto Noviembre 2026 creado en borrador con 2 inscritos"

#### Scenario: Month already taken
- **GIVEN** a challenge already exists for 11/2026
- **WHEN** the admin presses "Renovar" on the 10/2026 challenge
- **THEN** the dialog says "Ya existe un reto para Noviembre 2026" and the confirm button is disabled

#### Scenario: Draft row
- **WHEN** the admin opens the challenge list
- **THEN** a `DRAFT` challenge offers no "Renovar"

#### Scenario: Server error
- **WHEN** confirming answers `409` or `400`
- **THEN** the dialog shows the API message and nothing is added to the list

#### Scenario: Source without active participants
- **GIVEN** the 10/2026 challenge is `ACTIVE` with no active participants and 11/2026 is free
- **WHEN** the admin presses "Renovar"
- **THEN** the dialog shows no participants checkbox and says "Reto Octubre 2026 no tiene participantes activos para inscribir."
- **AND** confirming sends `copyParticipants: false` and the page says "Reto Noviembre 2026 creado en borrador con 0 inscritos"

#### Scenario: Source with one active participant
- **GIVEN** the source has exactly one active participant
- **WHEN** the admin opens its renewal dialog
- **THEN** the checkbox reads "Inscribir al participante activo de <reto>" and starts checked

#### Scenario: Keyboard stays inside the dialog
- **GIVEN** the renewal dialog is open
- **WHEN** the admin presses `Tab` repeatedly, or `Shift+Tab` on its first control
- **THEN** focus moves only among the dialog's enabled controls and never reaches the page behind it

#### Scenario: Escape while creating
- **GIVEN** the admin confirmed and the dialog shows "Creando…"
- **WHEN** the admin presses `Escape`
- **THEN** the dialog stays open until the request ends

#### Scenario: Tab after focus was lost while confirming
- **GIVEN** the admin confirmed, the confirm button was disabled while "Creando…" was shown, and the request answered `409`
- **WHEN** the admin presses `Tab`
- **THEN** focus moves to the first enabled control of the dialog and not to the page behind it

#### Scenario: Page behind the dialog
- **GIVEN** the renewal dialog is open
- **WHEN** the admin tries to reach the challenge list with the keyboard or a screen reader
- **THEN** the list is not focusable and is hidden from assistive technology until the dialog closes

#### Scenario: Closing returns focus
- **WHEN** the admin closes the dialog with `Escape` or "Cancelar", or the renewal succeeds
- **THEN** focus is on the "Renovar" button of the source challenge
