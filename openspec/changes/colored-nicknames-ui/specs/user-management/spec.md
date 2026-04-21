## MODIFIED Requirements

### Requirement: Custom User Nick Colors

The client SHALL support custom nickname colors per the fogWraith DATA_COLOR extension. Color is delivered via a 32-bit unsigned value in `0x00RRGGBB` format (network byte order, upper byte zero, lower three bytes RGB). The sentinel value `0xFFFFFFFF` means "no color" and is treated as None.

The client SHALL accept color via two delivery forms on inbound transactions:

1. **Standalone field 0x0500 (DATA_COLOR — fogWraith canonical)**: an optional field in transactions Notify Change User (301), Notify Chat User Change (117), and any user self-info reply.
2. **Trailing 4 bytes appended to UserNameWithInfo (legacy Mobius convention)**: present in user list entries returned by Get User Name List (300) and may also appear alongside form 1 in change notifications from transitional servers.

When both forms are present in a single packet for the same user, **field 0x0500 takes priority** and the trailing-bytes value SHALL be ignored. When only one form is present, that form is used. When neither is present, the user has no color.

The client SHALL render colored nicknames in the user list, public chat, private chat, private chat rooms, and any other site that displays a user's name, subject to the receiver-side preferences defined in the `settings` capability.

#### Scenario: Color delivered via field 0x0500

- **WHEN** a Notify Change User (301) or Notify Chat User Change (117) transaction includes field 0x0500 with a value other than 0xFFFFFFFF
- **THEN** the user's color property is set to the parsed 0x00RRGGBB value and used for name rendering

#### Scenario: Color delivered via trailing bytes on UserNameWithInfo

- **WHEN** a UserNameWithInfo entry in a Get User Name List reply has 4 trailing bytes after the username and the value is not 0xFFFFFFFF
- **THEN** the user's color property is set to the parsed 0x00RRGGBB value

#### Scenario: Both forms present, 0x0500 wins

- **WHEN** a transaction carries both field 0x0500 and trailing bytes on UserNameWithInfo for the same user, with different values
- **THEN** the value from field 0x0500 SHALL be used and the trailing-bytes value SHALL be ignored

#### Scenario: User has no custom nick color

- **WHEN** neither field 0x0500 nor trailing bytes are present, or any present value is 0xFFFFFFFF
- **THEN** the user's color property is None and the default theme color is used


### Requirement: Update Own Username and Icon

The client SHALL allow the user to update their display username, icon, and nickname color via TransactionType::SetClientUserInfo (304). The transaction includes UserName, UserIconId, and Options (set to 0) fields. When the user has a nickname color set, the client SHALL include field 0x0500 (DATA_COLOR) carrying the chosen color in `0x00RRGGBB` form. When the user has no nickname color set ("no color" state), field 0x0500 SHALL be omitted entirely from the transaction (matching 1.9.x client behavior — the client SHALL NOT send the sentinel value 0xFFFFFFFF as a substitute for omission).

After sending, the client SHALL update its local username, user_icon_id, and nick_color state. Changes are broadcast by the server to all connected users.

#### Scenario: User updates username and icon

- **WHEN** the user changes their username or icon in settings
- **THEN** the client sends a SetClientUserInfo transaction with the new UserName and UserIconId
- **THEN** the local username and user_icon_id state are updated to reflect the new values

#### Scenario: User sets a nickname color

- **WHEN** the user picks a nickname color in settings
- **THEN** the client sends a SetClientUserInfo transaction including field 0x0500 with the chosen color in 0x00RRGGBB form
- **THEN** the local nick_color state is updated

#### Scenario: User clears their nickname color

- **WHEN** the user clears their nickname color in settings (returns to "no color" state)
- **THEN** the client sends a SetClientUserInfo transaction with field 0x0500 omitted entirely
- **THEN** the local nick_color state is set to None

## ADDED Requirements

### Requirement: Implicit color opt-in

The client SHALL signal color awareness to the server by including field 0x0500 in its first SetClientUserInfo (304) transaction whenever the user has a nickname color set. Per the fogWraith specification, servers in `auto` delivery mode use this signal to decide whether to echo other users' colors back to this client. As a consequence, if the user has no nickname color set, the client will never opt in via this mechanism and `auto`-mode servers will not send other users' colors. This is the documented and intended behavior of the extension.

The client SHALL NOT use any out-of-band capability negotiation for color — the field-presence signal is the entire opt-in mechanism.

#### Scenario: Client with a color opts in

- **WHEN** the user connects to a server with a nickname color set
- **THEN** the client sends SetClientUserInfo (304) including field 0x0500
- **THEN** an `auto`-mode server marks the session color-aware and includes field 0x0500 in subsequent user notifications to this client

#### Scenario: Client without a color does not opt in

- **WHEN** the user connects to a server with no nickname color set
- **THEN** the client sends SetClientUserInfo (304) without field 0x0500
- **THEN** an `auto`-mode server does not mark the session color-aware, and other users' colors are not sent to this client

#### Scenario: Server in always mode sends colors regardless

- **WHEN** the server is configured in `always` delivery mode and the client has not opted in
- **THEN** the client SHALL still parse and render any field 0x0500 received in user notifications
