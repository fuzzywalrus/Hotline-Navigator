## ADDED Requirements

### Requirement: Connect to a server

The system SHALL allow the user to connect to a Hotline server by providing a server address, port, and optional username/password credentials. A `Bookmark` object drives the connection and carries the address, port, login, password, TLS flag, HOPE flag, and bookmark type. The `connect_to_server` command accepts the bookmark along with the user's display name, icon ID, and optional TLS preferences (auto-detect TLS, allow legacy TLS).

The system MUST NOT allow connecting to a bookmark whose type is `Tracker`. Trackers use a separate protocol and are not connectable as servers.

#### Scenario: Successful connection with default credentials

- **WHEN** the user invokes `connect_to_server` with a valid server bookmark (address: `hotline.system7today.com`, port: `5500`, login: `guest`, password: empty)
- **THEN** the system SHALL establish a TCP connection, perform the Hotline protocol handshake, send a Login transaction, receive a successful login reply, start the background receive loop and keepalive task, request the initial user list, and return a `ConnectResult` containing the `server_id`, `tls` status, and final `port`

#### Scenario: Connection with username and password

- **WHEN** the user invokes `connect_to_server` with a bookmark that has a non-empty login (`admin`) and password (`secret123`)
- **THEN** the system SHALL encode the login and password using XOR encoding (legacy login) and include them in the Login transaction

#### Scenario: Attempt to connect to a tracker bookmark

- **WHEN** the user invokes `connect_to_server` with a bookmark whose `bookmark_type` is `Tracker`
- **THEN** the system SHALL reject the connection immediately with an error: "Cannot connect to tracker. Trackers are used to browse servers, not to connect directly."

---

### Requirement: Connection status transitions

The system SHALL track connection status for each server independently. The status MUST transition through a defined set of states during the connection lifecycle.

Valid states: `Disconnected`, `Connecting`, `Connected`, `LoggingIn`, `LoggedIn`, `Failed`.

The system SHALL emit a `StatusChanged` event to the frontend each time the status transitions.

#### Scenario: Normal connection lifecycle

- **WHEN** the user initiates a connection to a server
- **THEN** the status SHALL transition: `Disconnected` -> `Connecting` (TCP connect begins) -> `Connected` (handshake complete) -> `LoggingIn` (Login transaction sent) -> `LoggedIn` (login reply received with no error)

#### Scenario: Connection failure at TCP level

- **WHEN** a TCP connection attempt times out after 10 seconds or the server is unreachable
- **THEN** the status SHALL remain at `Connecting` and the system SHALL return an error message to the caller

#### Scenario: Login failure

- **WHEN** the server replies to the Login transaction with a non-zero error code
- **THEN** the system SHALL resolve the error code to a human-readable message (using server-provided ErrorText if available, or a default message for known codes) and return it as an error

#### Scenario: Status event emission on LoggedIn

- **WHEN** the status transitions to `LoggedIn`
- **THEN** the system SHALL also emit a `user-access-{server_id}` event carrying the user's access permissions from the login reply

---

### Requirement: Login handshake

The system SHALL perform a two-phase connection: first a protocol handshake, then a login transaction.

The handshake sends a 12-byte packet: protocol ID (`TRTP`), sub-protocol ID (`HOTL`), protocol version (0x0001), and sub-version. The server replies with 8 bytes containing the protocol ID and an error code.

If the server rejects the handshake with a non-zero error code (indicating it does not support the requested sub-version), the system SHALL reconnect and retry with sub-version 1 for legacy compatibility.

#### Scenario: Handshake with modern sub-version succeeds

- **WHEN** the system sends a handshake with the current protocol sub-version and the server replies with error code 0
- **THEN** the handshake is considered successful and the system proceeds to login

#### Scenario: Handshake sub-version fallback

- **WHEN** the system sends a handshake with the current sub-version and the server replies with a non-zero error code
- **THEN** the system SHALL reconnect (open a new TCP/TLS connection) and retry the handshake with sub-version 1 (0x0001) for compatibility with 1990s-era servers

#### Scenario: Login transaction contents

- **WHEN** the system sends a Login transaction (legacy, non-HOPE)
- **THEN** the transaction SHALL include: XOR-encoded `UserLogin`, XOR-encoded `UserPassword`, `UserIconId`, `UserName`, `VersionNumber` (255), and `Capabilities` (with the large-files bit set)

---

### Requirement: Login reply processing

The system SHALL extract server information from a successful login reply and store it for the lifetime of the connection.

#### Scenario: Server info extracted from login reply

- **WHEN** the login reply has error code 0
- **THEN** the system SHALL extract and store: `ServerName`, server `VersionNumber`, server description (from the `Data` field), `UserAccess` permissions, and server `Capabilities` (including large-file support negotiation)

#### Scenario: Agreement present in login reply

- **WHEN** the server sends an `AgreementRequired` event after login
- **THEN** the system SHALL store the agreement text in `pending_agreements` keyed by `server_id`, emit an `agreement-required-{server_id}` event, and wait for the user to accept before the session is fully interactive

---

### Requirement: Login error codes

The system SHALL recognize the following Hotline error codes from login replies and provide human-readable messages when the server does not include an ErrorText field:

| Code | Name | Default Message |
|------|------|----------------|
| 1000 | LoginFailed | "Invalid login credentials" |
| 1001 | AlreadyLoggedIn | "Already logged in to this server" |
| 1002 | AccessDenied | "Access denied -- you lack the required permissions" |
| 1003 | UserBanned | "Banned from this server" |
| 1004 | ServerFull | "Server is full" |

The system SHALL prefer server-provided ErrorText over these defaults when available.

#### Scenario: Known error code without server text

- **WHEN** the login reply has error code 1003 and no ErrorText field
- **THEN** the system SHALL return the error: "Login failed: Banned from this server"

#### Scenario: Known error code with server text

- **WHEN** the login reply has error code 1000 and an ErrorText field containing "Account disabled"
- **THEN** the system SHALL return the error: "Login failed: Account disabled"

#### Scenario: Unknown error code

- **WHEN** the login reply has error code 9999 and no ErrorText field
- **THEN** the system SHALL return the error: "Login failed: Unknown error (code 9999)"

---

### Requirement: Generation-based connection cancellation

The system SHALL maintain an atomic generation counter (`connect_generation`) for connection attempts. Each call to `connect_server` increments the generation. An in-flight connection checks at multiple points whether its generation still matches the current value; if another connection was started (generation mismatch), the in-flight connection MUST abort with "Connection cancelled".

#### Scenario: New connection supersedes in-flight connection

- **WHEN** a connection to Server A is in progress (generation = 5) and the user initiates a connection to Server B (generation becomes 6)
- **THEN** the in-flight connection to Server A SHALL detect the generation mismatch at its next checkpoint and abort with "Connection cancelled"

#### Scenario: Generation check points

- **WHEN** a connection is in progress
- **THEN** the system SHALL check the generation counter after: TLS auto-detect attempt, before calling `client.connect()`, after connect completes, and before storing the client in the clients map

---

### Requirement: Cancel in-flight connection

The system SHALL provide a `cancel_connection` command that bumps the generation counter, causing any in-flight connection attempt to detect the mismatch and abort.

#### Scenario: User cancels while connecting

- **WHEN** a connection is in progress and the user invokes `cancel_connection`
- **THEN** the system SHALL increment the `connect_generation` counter, and the in-flight connection SHALL abort at its next generation check with "Connection cancelled"

---

### Requirement: Disconnect from server

The system SHALL provide a `disconnect_from_server` command that takes a `server_id`, calls `disconnect()` on the corresponding `HotlineClient`, and removes it from the active clients map.

#### Scenario: Disconnect from a connected server

- **WHEN** the user invokes `disconnect_from_server` with a valid `server_id`
- **THEN** the system SHALL stop the client's background tasks (receive loop, keepalive), update the status to `Disconnected`, emit a `StatusChanged(Disconnected)` event, and remove the client from the clients map

#### Scenario: Disconnect from unknown server

- **WHEN** the user invokes `disconnect_from_server` with a `server_id` that is not in the clients map
- **THEN** the system SHALL return an error: "Server not found"

---

### Requirement: Multiple simultaneous server connections

The system SHALL support multiple concurrent server connections, each with independent state. Connections are stored in a `HashMap<String, HotlineClient>` keyed by `server_id` (the bookmark ID). Each client has its own event channel, transaction counter, connection status, and background tasks.

#### Scenario: Connect to two servers simultaneously

- **WHEN** the user connects to Server A and then to Server B
- **THEN** both connections SHALL exist independently in the clients map, each with their own receive loop, keepalive, and event forwarding task; events from Server A SHALL be emitted with `{event}-{server_a_id}` and events from Server B SHALL use `{event}-{server_b_id}`

---

### Requirement: ConnectResult

The system SHALL return a `ConnectResult` upon successful connection. This struct contains:
- `server_id`: the bookmark ID used to identify this connection
- `tls`: whether the final connection uses TLS (may differ from bookmark if auto-detect was used)
- `port`: the actual port connected to (may differ from bookmark if TLS auto-detection changed it)

#### Scenario: ConnectResult after TLS auto-detection

- **WHEN** the user connects with a bookmark on port 5500 and auto-detect TLS succeeds on port 5600
- **THEN** the `ConnectResult` SHALL have `tls: true` and `port: 5600`

#### Scenario: ConnectResult for plain connection

- **WHEN** the user connects with a bookmark on port 5500, TLS disabled, no auto-detect
- **THEN** the `ConnectResult` SHALL have `tls: false` and `port: 5500`

---

### Requirement: Auto-reconnect on unexpected disconnect

The system SHALL support automatic reconnection when a server connection is lost unexpectedly. Auto-reconnect is driven entirely by the frontend (`useAutoReconnect` hook) and is configurable via user preferences.

Configuration options (all persisted in `preferencesStore`):
- `autoReconnect`: enable/disable (default: `false`)
- `autoReconnectInterval`: base interval in minutes (default: `3`, range: 1-999)
- `autoReconnectMaxRetries`: maximum attempts (default: `10`, range: 1-99)
- `autoReconnectSliding`: enable exponential backoff (default: `false`)

When sliding window is enabled, each retry interval doubles: `base * 2^attempt`, capped at 720 minutes (12 hours).

#### Scenario: Auto-reconnect triggered on unexpected disconnect

- **WHEN** a server connection drops unexpectedly (status becomes `disconnected` and a `disconnectMessage` is present) and `autoReconnect` is enabled
- **THEN** the system SHALL enter the `waiting` state, start a countdown timer of `autoReconnectInterval` minutes (converted to seconds), and attempt reconnection when the countdown reaches zero

#### Scenario: Reconnect attempt succeeds

- **WHEN** an auto-reconnect attempt succeeds (the `connect_to_server` invoke completes without error)
- **THEN** the system SHALL reset the reconnect state to `idle`, clear the disconnect message, and the `connectionStatus` SHALL transition back to `logged-in`

#### Scenario: Reconnect attempt fails with retries remaining

- **WHEN** an auto-reconnect attempt fails and the current attempt count is less than `maxAttempts`
- **THEN** the system SHALL increment the attempt counter, calculate the next interval (applying sliding window if enabled), and enter the `waiting` state with the new countdown

#### Scenario: All retries exhausted

- **WHEN** the attempt count reaches `maxAttempts` and the latest reconnect attempt fails
- **THEN** the reconnect status SHALL become `exhausted` and no further automatic attempts SHALL be made

#### Scenario: Sliding window backoff

- **WHEN** `autoReconnectSliding` is enabled with a base interval of 3 minutes
- **THEN** retry intervals SHALL be: 3, 6, 12, 24, 48, 96, 192, 384, 720, 720 minutes (capped at 720)

#### Scenario: User cancels auto-reconnect

- **WHEN** the user invokes `cancelReconnect` during an active reconnect cycle
- **THEN** the countdown timer SHALL be cleared, the reconnect state SHALL reset to `idle`, and no further attempts SHALL be made

#### Scenario: User triggers immediate retry

- **WHEN** the user invokes `retryNow` while in the `waiting` state
- **THEN** the system SHALL clear the countdown and immediately attempt reconnection

---

### Requirement: Auto-connect bookmarks on app launch

The system SHALL support an `auto_connect` flag on each bookmark. On application launch, the frontend SHALL iterate over all bookmarks and invoke `connect_to_server` for each bookmark where `autoConnect` is `true`.

#### Scenario: Multiple auto-connect bookmarks

- **WHEN** the app launches and bookmarks A (autoConnect: true), B (autoConnect: false), and C (autoConnect: true) exist
- **THEN** the system SHALL automatically connect to bookmarks A and C, but not B

#### Scenario: Auto-connect with TLS auto-detection

- **WHEN** an auto-connect bookmark has `tls: false` and the user's `autoDetectTls` preference is `true`
- **THEN** the connection SHALL follow the normal TLS auto-detection logic (try port+100 with TLS first, fall back to plain)

---

### Requirement: Keepalive

The system SHALL start a background keepalive task after a successful login. This task periodically sends a keepalive transaction to prevent the server from dropping idle connections.

#### Scenario: Keepalive runs while connected

- **WHEN** a connection enters the `LoggedIn` state
- **THEN** the system SHALL start a keepalive task that periodically sends a transaction to the server for the lifetime of the connection

#### Scenario: Keepalive stops on disconnect

- **WHEN** the user disconnects or the connection drops
- **THEN** the keepalive task SHALL be stopped

---

### Requirement: Unexpected disconnect detection

The system SHALL detect when a server connection drops unexpectedly (socket read error, EOF) during the receive loop. When detected, the system SHALL emit a `StatusChanged(Disconnected)` event and optionally a `DisconnectMessage` event if the server sent a disconnect reason.

#### Scenario: Server closes connection

- **WHEN** the server closes the TCP connection while the receive loop is running
- **THEN** the system SHALL detect the EOF, set the status to `Disconnected`, emit `StatusChanged(Disconnected)`, and stop background tasks

#### Scenario: Server sends disconnect message before closing

- **WHEN** the server sends a `DisconnectMessage` transaction followed by closing the connection
- **THEN** the system SHALL emit a `disconnect-message-{server_id}` event with the message text, then transition to `Disconnected`
