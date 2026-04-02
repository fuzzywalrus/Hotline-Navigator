## Purpose

Defines user preferences and app configuration, including display options, connection settings, sound toggles, chat history, and persistent storage.

## Requirements

### Requirement: Settings organized into tabs

The system SHALL present user preferences in a tabbed interface with the following tabs: General, Icon, Sound, Shortcuts, About, and Updates.

#### Scenario: Navigate between settings tabs

- **WHEN** the user opens Settings and selects the Sound tab
- **THEN** the system SHALL display the sound-related preferences and hide other tab contents

#### Scenario: All tabs accessible

- **WHEN** the user opens Settings
- **THEN** the system SHALL display tabs for General, Icon, Sound, Shortcuts, About, and Updates


### Requirement: Username customization

The system SHALL allow the user to set a custom username. The username SHALL be persisted in preferences and sent to the server upon connection.

#### Scenario: Set a username

- **WHEN** the user enters "Gregg" as their username in Settings
- **THEN** the system SHALL persist "Gregg" and use it when connecting to any server

#### Scenario: Username sent on connect

- **WHEN** the user connects to a server with username "Gregg" saved in preferences
- **THEN** the system SHALL send "Gregg" as the username during the connection handshake


### Requirement: Download folder selection

The system SHALL allow the user to select a download folder using a native file picker dialog. On mobile platforms, this option MUST NOT be available.

#### Scenario: Select download folder on desktop

- **WHEN** the user clicks the download folder selector in Settings on a desktop platform
- **THEN** the system SHALL open a native file picker dialog and persist the chosen folder path

#### Scenario: Download folder option hidden on mobile

- **WHEN** the user opens Settings on a mobile platform
- **THEN** the download folder selection option SHALL NOT be displayed


### Requirement: Theme selection

The system SHALL support three theme modes: light, dark, and system (auto-detection). The selected theme SHALL be persisted across sessions.

#### Scenario: Set theme to dark

- **WHEN** the user selects "dark" theme in Settings
- **THEN** the system SHALL apply the dark theme and persist the selection

#### Scenario: System theme auto-detection

- **WHEN** the user selects "system" theme and the operating system is using dark mode
- **THEN** the system SHALL apply the dark theme automatically

#### Scenario: Theme persists across restarts

- **WHEN** the user previously selected "light" theme and restarts the application
- **THEN** the system SHALL apply the light theme on launch


### Requirement: Chat display options

The system SHALL provide the following display toggles for the chat view: show timestamps, show inline images, enable markdown rendering, and enable clickable links. Each toggle SHALL independently control its respective feature.

#### Scenario: Enable timestamps in chat

- **WHEN** the user enables the show timestamps option
- **THEN** the system SHALL display a timestamp next to each chat message

#### Scenario: Disable inline images

- **WHEN** the user disables the show inline images option
- **THEN** the system SHALL NOT render image URLs as inline images in chat

#### Scenario: Enable markdown rendering

- **WHEN** the user enables the markdown rendering option
- **THEN** the system SHALL render markdown syntax (e.g., bold, italic, code) in chat messages

#### Scenario: Enable clickable links

- **WHEN** the user enables the clickable links option
- **THEN** the system SHALL render URLs in chat messages as clickable hyperlinks


### Requirement: TLS connection options

The system SHALL provide the following connection toggles: auto-detect TLS, allow legacy TLS, and auto-reconnect. The auto-reconnect option SHALL include configurable interval (in minutes) and maximum retries.

#### Scenario: Enable auto-detect TLS

- **WHEN** the user enables the auto-detect TLS toggle
- **THEN** the system SHALL attempt TLS negotiation automatically when connecting to servers

#### Scenario: Enable allow legacy TLS

- **WHEN** the user enables the allow legacy TLS toggle
- **THEN** the system SHALL accept connections using older TLS protocol versions

#### Scenario: Configure auto-reconnect

- **WHEN** the user enables auto-reconnect with an interval of 2 minutes and max retries of 5
- **THEN** the system SHALL attempt reconnection every 2 minutes up to 5 times after an unexpected disconnection

#### Scenario: Disable auto-reconnect

- **WHEN** the user disables the auto-reconnect toggle
- **THEN** the system SHALL NOT attempt automatic reconnection after a disconnection


### Requirement: Chat history with encrypted vault storage

The system SHALL store chat history in an encrypted vault. The system SHALL retain a maximum of 1000 messages per server. Chat history SHALL be auto-saved with debouncing to avoid excessive write operations.

#### Scenario: Chat messages saved to vault

- **WHEN** new chat messages are received on a server
- **THEN** the system SHALL auto-save them to the encrypted vault after a debounce interval

#### Scenario: Maximum messages per server

- **WHEN** the stored chat history for a server reaches 1000 messages and a new message arrives
- **THEN** the system SHALL discard the oldest message to maintain the 1000-message limit

#### Scenario: Chat history restored on reconnect

- **WHEN** the user reconnects to a server that has stored chat history
- **THEN** the system SHALL load and display the persisted messages from the vault


### Requirement: Clear chat history

The system SHALL allow the user to clear chat history for a single server or for all servers.

#### Scenario: Clear history for one server

- **WHEN** the user clears chat history for a specific server
- **THEN** the system SHALL remove all stored messages for that server from the vault

#### Scenario: Clear all chat history

- **WHEN** the user clears all chat history
- **THEN** the system SHALL remove all stored messages for every server from the vault


### Requirement: Muted users management

The system SHALL allow the user to manage a list of muted users. The user SHALL be able to add and remove users from the muted list. Messages from muted users SHALL be suppressed from display.

#### Scenario: Add a user to muted list

- **WHEN** the user adds "TrollUser" to the muted users list
- **THEN** messages from "TrollUser" SHALL no longer be displayed in chat

#### Scenario: Remove a user from muted list

- **WHEN** the user removes "TrollUser" from the muted users list
- **THEN** messages from "TrollUser" SHALL be displayed in chat again


### Requirement: Icon selection with preview

The system SHALL provide an icon selection interface in the Icon settings tab. The interface SHALL display available icons from the icon library and show a preview of the currently selected icon.

#### Scenario: Browse icon library

- **WHEN** the user opens the Icon tab in Settings
- **THEN** the system SHALL display the available icons from the icon library

#### Scenario: Preview selected icon

- **WHEN** the user hovers over or selects an icon in the library
- **THEN** the system SHALL display a preview of that icon

#### Scenario: Confirm icon selection

- **WHEN** the user confirms selection of icon ID 42
- **THEN** the system SHALL persist icon ID 42 as the user's icon in preferences


### Requirement: Remote icons toggle

The system SHALL provide a useRemoteIcons preference (default true) in the settings interface. When enabled, the system SHALL fetch icons from the remote source for icon IDs not found locally. When disabled, the system SHALL rely only on local icons.

#### Scenario: Enable remote icons

- **WHEN** the user enables the useRemoteIcons preference
- **THEN** the system SHALL fetch icons from the remote source when not available locally

#### Scenario: Disable remote icons

- **WHEN** the user disables the useRemoteIcons preference
- **THEN** the system SHALL NOT fetch icons from the remote source and SHALL fall back to the gray placeholder for missing local icons


### Requirement: Show banners toggle

The system SHALL provide a showRemoteBanners preference (default true) in the settings interface. When enabled, banner-sized remote icons SHALL be displayed at full size behind username rows. When disabled, remote icons SHALL be clipped to normal icon dimensions.

#### Scenario: Enable show banners

- **WHEN** the user enables the showRemoteBanners preference
- **THEN** remote banner images SHALL render at full native size behind username rows

#### Scenario: Disable show banners

- **WHEN** the user disables the showRemoteBanners preference
- **THEN** remote images SHALL be clipped to the standard icon container size


### Requirement: Preferences persisted via Zustand store

All user preferences SHALL be persisted in localStorage under the key "hotline-preferences" using a Zustand store with persistence middleware. Preferences SHALL survive application restarts.

#### Scenario: Preferences survive restart

- **WHEN** the user changes preferences and restarts the application
- **THEN** all changed preferences SHALL be restored from localStorage on launch

#### Scenario: Preferences stored under correct key

- **WHEN** the user modifies any preference
- **THEN** the updated state SHALL be written to localStorage under the "hotline-preferences" key


### Requirement: Settings accessible via menu bar

The system SHALL provide access to the Settings interface through the application menu bar.

#### Scenario: Open settings from menu bar

- **WHEN** the user selects the Settings option from the application menu bar
- **THEN** the system SHALL open the Settings interface
