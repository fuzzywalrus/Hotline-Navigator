## ADDED Requirements

### Requirement: Display user icon by numeric ID

Each user SHALL have a numeric icon ID. The system SHALL display the corresponding icon next to the user's name in both the chat view and the user list.

#### Scenario: User with icon ID appears in chat

- **WHEN** a user with icon ID 191 sends a chat message
- **THEN** the system SHALL display the icon for ID 191 next to the user's name in the chat view

#### Scenario: User with icon ID appears in user list

- **WHEN** a user with icon ID 191 is present in the server's user list
- **THEN** the system SHALL display the icon for ID 191 next to the user's name in the user list

---

### Requirement: Bundled classic Hotline icons

The system SHALL include 631 bundled classic Hotline icons located in public/icons/classic/, each named by its numeric ID (e.g., 191.png). All bundled icons SHALL be 16x16 PNGs.

#### Scenario: Load a bundled icon by ID

- **WHEN** the system needs to display icon ID 191
- **THEN** the system SHALL attempt to load /icons/classic/191.png from the bundled assets

---

### Requirement: Pixel art rendering for icons

All icons SHALL be rendered with `image-rendering: pixelated` to preserve the pixel art aesthetic of the original classic Hotline icons.

#### Scenario: Render a 16x16 icon

- **WHEN** a 16x16 icon PNG is displayed
- **THEN** the system SHALL apply pixelated image rendering so that upscaled pixels remain sharp without anti-aliasing

---

### Requirement: Icon fallback chain

The system SHALL resolve icons using a three-step fallback chain: (1) try local bundled icon at /icons/classic/{id}.png, (2) if the local icon is not found and the Remote Icons preference is enabled, try the remote source at https://hlwiki.com/ik0ns/{id}.png, (3) if the remote source also fails or Remote Icons is disabled, display a gray placeholder box showing the numeric ID.

#### Scenario: Icon found locally

- **WHEN** the system resolves icon ID 191 and /icons/classic/191.png exists
- **THEN** the system SHALL display the local bundled icon

#### Scenario: Icon not found locally, remote enabled and available

- **WHEN** the system resolves an icon ID that has no local file, and the useRemoteIcons preference is true, and the remote source returns an image
- **THEN** the system SHALL display the image fetched from https://hlwiki.com/ik0ns/{id}.png

#### Scenario: Icon not found locally, remote disabled

- **WHEN** the system resolves an icon ID that has no local file, and the useRemoteIcons preference is false
- **THEN** the system SHALL display a gray placeholder box containing the numeric icon ID

#### Scenario: Icon not found locally or remotely

- **WHEN** the system resolves an icon ID that has no local file, and the useRemoteIcons preference is true, but the remote source fails to return an image
- **THEN** the system SHALL display a gray placeholder box containing the numeric icon ID

---

### Requirement: Banner icon support

Some icon IDs available from hlwiki correspond to wide "banner" images (232x18 pixels). The UserBanner component SHALL probe whether an icon exists locally; if the icon is NOT local and remote icons are enabled, it SHALL fetch the image from hlwiki and render it at its native size with 80% opacity behind the username row.

#### Scenario: Banner icon rendered behind username

- **WHEN** a user's icon ID is not found locally, remote icons are enabled, and the fetched image is a wide banner (232x18)
- **THEN** the system SHALL render the banner image at its native dimensions with 80% opacity behind the user's name row

#### Scenario: Icon exists locally, no banner probe

- **WHEN** a user's icon ID is found in the local bundled icons
- **THEN** the UserBanner component SHALL NOT attempt to fetch a remote banner for that icon ID

---

### Requirement: Show Banners preference

The system SHALL provide a "Show Banners" preference (showRemoteBanners). When this preference is off, remote icon images SHALL still load but MUST be clipped to the normal icon display size rather than displayed at banner dimensions.

#### Scenario: Show Banners enabled

- **WHEN** showRemoteBanners is true and a banner image is fetched for a user
- **THEN** the system SHALL display the banner at its full native size behind the username row

#### Scenario: Show Banners disabled

- **WHEN** showRemoteBanners is false and a remote icon image is fetched for a user
- **THEN** the system SHALL clip the image to the standard icon container size instead of displaying it as a full banner

---

### Requirement: Remote icon rendering without scaling

Remote icon images SHALL be rendered at their natural size and clipped to the icon container boundaries. The system MUST NOT scale remote images to fit the container.

#### Scenario: Remote image larger than icon container

- **WHEN** a remote icon image has dimensions larger than the standard icon container
- **THEN** the system SHALL render it at natural size and clip any overflow, without scaling the image down

---

### Requirement: User icon selection

The system SHALL allow the user to select their own icon from an icon library. The selected icon ID SHALL be persisted in preferences and sent to the server upon connection.

#### Scenario: User selects a new icon

- **WHEN** the user selects icon ID 42 from the icon library
- **THEN** the system SHALL persist icon ID 42 in preferences and use it for future server connections

#### Scenario: Selected icon sent on connect

- **WHEN** the user connects to a server with icon ID 42 saved in preferences
- **THEN** the system SHALL send icon ID 42 to the server as part of the connection handshake

---

### Requirement: Remote icon preferences with defaults

The system SHALL provide two preferences in Settings > General: useRemoteIcons (default true) and showRemoteBanners (default true). These preferences SHALL control remote icon fetching and banner display respectively.

#### Scenario: Default preference values on first launch

- **WHEN** the application launches for the first time with no saved preferences
- **THEN** useRemoteIcons SHALL be true and showRemoteBanners SHALL be true

#### Scenario: User disables remote icons

- **WHEN** the user sets useRemoteIcons to false in Settings > General
- **THEN** the system SHALL stop fetching icons from the remote source and rely only on local icons or the gray placeholder fallback

---

### Requirement: Adding bundled icons

New bundled icons SHALL be added by placing a PNG file named {id}.png into the public/icons/classic/ directory. Local bundled icons SHALL always take priority over remote icons for the same ID.

#### Scenario: New local icon overrides remote

- **WHEN** a PNG file named 999.png is added to public/icons/classic/ and a user has icon ID 999
- **THEN** the system SHALL display the local file and SHALL NOT fetch the remote version
