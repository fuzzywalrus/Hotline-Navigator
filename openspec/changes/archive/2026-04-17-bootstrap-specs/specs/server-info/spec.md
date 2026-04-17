## ADDED Requirements

### Requirement: Server Agreement Display and Acceptance

The server SHALL send an agreement text to the client upon login. The client MUST display the agreement and require the user to accept or decline before any other operations are permitted.

#### Scenario: Server sends agreement on login

- **WHEN** the client successfully logs in to a Hotline server that has an agreement configured
- **THEN** the server SHALL send a ShowAgreement transaction (TransactionType::ShowAgreement) containing the agreement text

#### Scenario: Agreement displayed to user

- **WHEN** the client receives a ShowAgreement transaction
- **THEN** the system SHALL display the agreement text to the user with accept and decline options

#### Scenario: Markdown rendering in agreement

- **WHEN** the agreement text is displayed and the user has Markdown rendering enabled in preferences
- **THEN** the system SHALL render the agreement text using Markdown formatting

#### Scenario: Operations blocked until agreement accepted

- **WHEN** the user has not yet accepted the server agreement
- **THEN** the system SHALL block all other operations until the agreement is accepted or declined

#### Scenario: User accepts agreement

- **WHEN** the user clicks the accept button on the agreement dialog
- **THEN** the client SHALL send an Agreed transaction (TransactionType::Agreed) to the server and proceed with the session

#### Scenario: User declines agreement

- **WHEN** the user clicks the decline button on the agreement dialog
- **THEN** the client SHALL disconnect from the server

---

### Requirement: Agreement State Management

Pending agreements SHALL be stored in AppState until resolved. Agreement events SHALL be emitted for frontend handling.

#### Scenario: Store pending agreement

- **WHEN** the client receives a ShowAgreement transaction for a server
- **THEN** the system SHALL store the agreement text in AppState.pending_agreements keyed by server

#### Scenario: Emit agreement event

- **WHEN** a pending agreement is stored
- **THEN** the system SHALL emit an agreement-required-{server_id} event so the frontend can display the agreement dialog

#### Scenario: Cached agreement text

- **WHEN** the agreement text is re-requested for a server that has already sent its agreement
- **THEN** the system SHALL return the cached agreement text without re-fetching from the server

---

### Requirement: Server Banner Display

The system SHALL support receiving and displaying server banners.

#### Scenario: Receive banner with image data

- **WHEN** the server sends a ServerBanner transaction (TransactionType::ServerBanner) with a BannerType and no URL field
- **THEN** the client SHALL download the banner image via HTXF (a separate file transfer connection)

#### Scenario: Skip banner with promotional URL

- **WHEN** the server sends a ServerBanner transaction that includes a URL field
- **THEN** the client SHALL skip the banner and not display it

#### Scenario: Detect banner MIME type

- **WHEN** the banner image data is received
- **THEN** the system SHALL detect the MIME type by inspecting magic bytes (supporting PNG, JPEG, and GIF formats)

#### Scenario: Encode banner for display

- **WHEN** the banner MIME type has been detected
- **THEN** the system SHALL encode the image as a base64 data URL for display in the UI

#### Scenario: Banner display preference toggle

- **WHEN** the user has disabled banner display in preferences
- **THEN** the system SHALL not display the server banner even if one is received

#### Scenario: Failed banner load

- **WHEN** the banner download fails or the image data is invalid
- **THEN** the system SHALL handle the failure gracefully without crashing or displaying a broken image

---

### Requirement: Server Info on Login

The login response SHALL include server metadata that the system displays to the user.

#### Scenario: Receive server info on login

- **WHEN** the client successfully logs in to a Hotline server
- **THEN** the login response SHALL include the server name, description, and version

#### Scenario: Populate ServerInfo struct

- **WHEN** server metadata is received
- **THEN** the system SHALL populate a ServerInfo struct containing: name, description, version, hope_enabled, hope_transport, and agreement fields

#### Scenario: Display HOPE support status

- **WHEN** the server indicates HOPE protocol support in its login response
- **THEN** the system SHALL reflect the HOPE support status in the ServerInfo

#### Scenario: Display TLS usage status

- **WHEN** the connection to the server is established over TLS
- **THEN** the system SHALL indicate that the connection is encrypted

---

### Requirement: Connection Status Display

The system SHALL display the current connection status for each server in the tab bar.

#### Scenario: Show disconnected status

- **WHEN** the client is not connected to a server
- **THEN** the tab bar SHALL display a disconnected status indicator

#### Scenario: Show connecting status

- **WHEN** the client is in the process of establishing a connection to a server
- **THEN** the tab bar SHALL display a connecting status indicator

#### Scenario: Show logged-in status

- **WHEN** the client has successfully logged in and the session is active
- **THEN** the tab bar SHALL display a logged-in status indicator

#### Scenario: Show failed status

- **WHEN** the connection attempt to a server has failed
- **THEN** the tab bar SHALL display a failed status indicator
