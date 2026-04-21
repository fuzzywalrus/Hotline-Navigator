## ADDED Requirements

### Requirement: Nickname color picker

The system SHALL allow the user to set a global nickname color via a color picker control in General Settings, presented alongside the username and icon controls. The chosen color SHALL be persisted in preferences as a 32-bit unsigned value in `0x00RRGGBB` form (or null when no color is set) and applied uniformly across all server connections — no per-bookmark color identity is supported.

The picker SHALL provide a way to clear the selected color back to the "no color" state. The "no color" state SHALL persist as null in preferences and SHALL cause the client to omit field 0x0500 from outbound SetClientUserInfo (304) transactions, matching 1.9.x client behavior. The system SHALL NOT expose the protocol sentinel value 0xFFFFFFFF as a user-selectable state.

When the user changes the nickname color (including clearing it), the system SHALL broadcast the change to all connected servers by invoking the existing user-info update path with the new color value.

#### Scenario: Pick a nickname color

- **WHEN** the user selects a color in the nickname color picker
- **THEN** the system SHALL persist the color as a 0x00RRGGBB integer in preferences
- **THEN** the system SHALL broadcast the new color to all connected servers via SetClientUserInfo (304) with field 0x0500

#### Scenario: Clear nickname color

- **WHEN** the user clears the nickname color (returns to "no color" state)
- **THEN** the system SHALL persist null in preferences
- **THEN** the system SHALL broadcast the change to all connected servers via SetClientUserInfo (304) with field 0x0500 omitted

#### Scenario: Color persists across restarts

- **WHEN** the user previously set a nickname color and restarts the application
- **THEN** the system SHALL load the persisted color and use it on next connection


### Requirement: Display received user colors toggle

The system SHALL provide a "Display username colors" preference toggle (default: on). When the toggle is on, the system SHALL apply received user colors to user names in the user list, public chat, private chat, private chat rooms, and any other site that renders a user name. When the toggle is off, the system SHALL render all user names in the default theme color, ignoring any color value received from the server. The toggle SHALL affect rendering only — the system SHALL continue to parse and store received color values regardless, so toggling the preference back on takes effect immediately without requiring reconnection.

This toggle SHALL NOT affect system-defined colors used for app chrome (e.g., admin red, self green, broadcast blue). Those colors remain visible regardless of the toggle state.

#### Scenario: Toggle off hides user colors

- **WHEN** the user disables "Display username colors"
- **THEN** the system SHALL render all user names in the default theme color
- **THEN** any cached user colors SHALL remain in state and become visible immediately if the toggle is re-enabled

#### Scenario: Toggle does not affect system message colors

- **WHEN** the user disables "Display username colors"
- **THEN** admin users' names in chat SHALL still render in red
- **THEN** the user's own name in chat SHALL still render in green
- **THEN** broadcast messages SHALL still render with their themed color


### Requirement: Enforce color legibility toggle

The system SHALL provide an "Enforce legibility" preference toggle (default: on). When the toggle is on, the system SHALL adjust any rendered name color (both received user colors and system-defined colors such as admin red and self green) whose HSL lightness falls within a minimum delta of the current theme background lightness. The system SHALL push the color's lightness away from the background lightness by at least the minimum delta, preserving hue and saturation. When the toggle is off, the system SHALL render colors verbatim without adjustment.

The minimum lightness delta is an internal constant intended to ensure colors remain visually distinguishable from the background — not WCAG AA contrast — and may be tuned over time. The adjustment SHALL be computed at render time so that toggling the system theme automatically reflows colors without invalidation logic.

#### Scenario: Legibility on, color too close to dark background

- **WHEN** "Enforce legibility" is on, the theme is dark, and a received color has HSL lightness within the minimum delta of the dark background lightness
- **THEN** the system SHALL render the color with its lightness pushed toward white by at least the minimum delta
- **THEN** the original color value SHALL remain unchanged in state

#### Scenario: Legibility on, color is already legible

- **WHEN** "Enforce legibility" is on and a received color's HSL lightness already differs from the theme background lightness by at least the minimum delta
- **THEN** the system SHALL render the color verbatim

#### Scenario: Legibility off

- **WHEN** "Enforce legibility" is off
- **THEN** the system SHALL render all colors verbatim regardless of contrast against the background

#### Scenario: Theme switch reflows adjusted colors

- **WHEN** "Enforce legibility" is on and the user switches between light and dark themes
- **THEN** the system SHALL recompute any adjusted colors against the new theme background on the next render
