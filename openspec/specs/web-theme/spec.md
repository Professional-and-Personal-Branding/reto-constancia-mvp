# web-theme Specification

## Purpose
Lets each person use the web app in a light or a dark theme, following their operating
system until they choose one with a switch that the browser remembers.

## Requirements

### Requirement: Light and dark themes on every screen
The web app SHALL provide a light theme and a dark theme for every screen, public and
private. Both themes SHALL show the same content, controls and states; only colors
change. Activity, payment and qualification states (validated, pending, rejected, paid,
partial, unpaid, "no califica") SHALL remain distinguishable in both themes.

#### Scenario: Dashboard in the light theme
- **WHEN** the light theme is active and a participant opens "Mi reto"
- **THEN** the page background, cards, text and borders use the light palette
- **AND** the period, countdown, metrics and activity states are all visible

#### Scenario: Status badges in both themes
- **WHEN** a list shows validated, pending and rejected activities
- **THEN** each badge is legible and distinguishable from the others in the light theme and in the dark theme

### Requirement: Default theme follows the operating system
While the person has not chosen a theme, the web app SHALL use the theme requested by the
operating system or browser (`prefers-color-scheme`), and SHALL switch live when that
setting changes. When the system expresses no preference, the dark theme SHALL apply.

#### Scenario: System prefers light
- **WHEN** a person with no stored choice opens the app on a system set to light
- **THEN** the app renders in the light theme

#### Scenario: System changes while the app is open
- **WHEN** no theme has been chosen and the system setting changes from dark to light
- **THEN** the app changes to the light theme without a reload

### Requirement: Theme switch
The public and private layouts SHALL show a theme switch in the header. The switch SHALL
toggle between the light and the dark theme, expose its state to assistive technology as
a switch with a Spanish accessible name that names the action, and be operable with the
keyboard.

#### Scenario: Turning on the light theme
- **WHEN** the dark theme is active and the person activates the switch
- **THEN** the app changes to the light theme immediately, on the current page, without a reload
- **AND** the switch reports the new state

#### Scenario: Keyboard use
- **WHEN** the switch has focus and the person presses Space or Enter
- **THEN** the theme toggles

### Requirement: Remembered choice without flashes
A theme chosen with the switch SHALL be stored in the browser and SHALL take precedence
over the operating system setting on every later visit in that browser. The stored theme
SHALL be applied before the first paint, so no page shows the other theme first.

#### Scenario: Choice survives a reload
- **WHEN** a person on a dark system chooses the light theme and reloads the page
- **THEN** the page renders in the light theme from the first paint

#### Scenario: Choice is independent per browser
- **WHEN** the person opens the app in a different browser with no stored choice
- **THEN** that browser follows its operating system setting

### Requirement: Readable contrast and native controls
In both themes, body text on its background SHALL have a contrast ratio of at least
4.5:1, and secondary text and status colors on their backgrounds at least 3:1. Native
controls (date inputs, selects, checkboxes and scrollbars) SHALL render in the active
theme.

#### Scenario: Contrast of the palette
- **WHEN** the contrast of each text and status color is measured against the background it is used on
- **THEN** body text reaches 4.5:1 and secondary text and status colors reach 3:1 in both themes

#### Scenario: Date picker in the light theme
- **WHEN** the light theme is active and a participant opens "Subir actividad"
- **THEN** the date input and the exercise select render with light native styling
