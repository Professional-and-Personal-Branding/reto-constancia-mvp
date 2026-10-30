## MODIFIED Requirements

### Requirement: Closing from the web shows a checklist first
Before "Cerrar reto" in the admin challenge list and before "Guardar premiación" on an active
challenge, the web SHALL show a dialog with the preview. If there are pending activities, the
confirm button MUST stay disabled until the admin ticks "Cerrar de todas formas: las actividades
pendientes no contarán". Unpaid participants and proofs to review SHALL be shown without blocking,
with the reminders that unpaid participants can still win and that payments cannot be recorded
after closing. Winners and payout SHALL be presented as a projection, and after a successful close
the page SHALL show the results computed by the server. The dialog SHALL show the server's error
message for any failed close or award, and offer to retry on 409.

The dialog SHALL behave as a modal: while it is open the rest of the page MUST NOT be focusable or
exposed to assistive technology; when it opens, focus SHALL move to "Cancelar" and the checkbox
SHALL start unticked; `Tab` and `Shift+Tab` MUST keep focus inside the dialog, cycling among its
enabled controls, also when the focused control was disabled meanwhile (then `Tab` SHALL go to the
first enabled control and `Shift+Tab` to the last); while the close or the award is being saved
focus SHALL stay on the dialog and `Escape` MUST do nothing; otherwise `Escape` SHALL close it; when
the dialog is closed with `Escape` or "Cancelar", focus SHALL return to the "Cerrar reto" or "Guardar
premiación" button that opened it.

#### Scenario: Pending activities block the button
- **GIVEN** an active challenge with one pending activity
- **WHEN** the admin opens "Cerrar reto"
- **THEN** the dialog says that one pending activity will not count and the confirm button is disabled until the checkbox is ticked

#### Scenario: Close from the dialog
- **GIVEN** the dialog of an active challenge with no pending activities
- **WHEN** the admin confirms
- **THEN** the challenge shows as closed in the list

#### Scenario: Award through the dialog
- **GIVEN** an active challenge in the results page
- **WHEN** the admin picks winners and presses "Guardar premiación"
- **THEN** the dialog opens listing those winners, and confirming saves the award and closes the challenge

#### Scenario: Unpaid participants do not block
- **GIVEN** two unpaid participants and no pending activities
- **WHEN** the admin opens the dialog
- **THEN** it lists them with "Pueden ganar igual; el pote es lo recaudado" and the confirm button is enabled

#### Scenario: Server error inside the dialog
- **WHEN** the close or the award answers 400 or 409
- **THEN** the dialog shows the server's message, and on 409 a "Reintentar" button

#### Scenario: Keyboard stays inside the close dialog
- **GIVEN** the close dialog is open
- **WHEN** the admin presses `Tab` repeatedly, or `Shift+Tab` on its first control
- **THEN** focus moves only among the dialog's enabled controls and never reaches the page behind it

#### Scenario: Page behind the close dialog
- **GIVEN** the close dialog is open
- **WHEN** the admin tries to reach the challenge list with the keyboard or a screen reader
- **THEN** the list is not focusable and is hidden from assistive technology until the dialog closes

#### Scenario: Escape while closing
- **GIVEN** the admin confirmed and the dialog shows "Cerrando…"
- **WHEN** the admin presses `Escape`
- **THEN** the dialog stays open until the request ends and then shows its result or error

#### Scenario: Tab after focus was lost while closing
- **GIVEN** the admin confirmed, the buttons were disabled while "Cerrando…" was shown, and the request answered `409`
- **WHEN** the admin presses `Tab`
- **THEN** focus moves to the first enabled control of the dialog and not to the page behind it

#### Scenario: Closing the dialog returns focus
- **GIVEN** the admin opened the dialog from "Cerrar reto" of a challenge, or from "Guardar premiación"
- **WHEN** the admin closes it with `Escape` or "Cancelar"
- **THEN** focus is on the button that opened it

#### Scenario: Reopening starts clean
- **GIVEN** the admin ticked "Cerrar de todas formas" and then cancelled
- **WHEN** the admin opens the dialog again
- **THEN** the checkbox is unticked and the confirm button is disabled
