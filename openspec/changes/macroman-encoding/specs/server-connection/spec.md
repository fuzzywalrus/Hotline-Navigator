## ADDED Requirements

### Requirement: Capability bit 1 (CAPABILITY_TEXT_ENCODING) negotiation

The client SHALL advertise `CAPABILITY_TEXT_ENCODING` (bit 1, mask `0x0002`) in `DATA_CAPABILITIES` when the bookmark's `encoding` field is `Utf8` OR when HOPE transport encryption is active. The client SHALL NOT advertise bit 1 when the bookmark's encoding is `Macintosh` and HOPE is not active.

The client SHALL parse the server's echoed `DATA_CAPABILITIES` to determine whether bit 1 is active for the session. The result SHALL contribute to the effective-encoding resolution defined in the user-management capability.

The advertised bits computation SHALL flow through the `client_capability_bits()` helper introduced by the `capabilities-hardening` change. This change adds bit 1 to that helper's output under the conditions above.

#### Scenario: HOPE bookmark advertises bit 1

- **WHEN** the client connects to a bookmark with HOPE enabled
- **THEN** the login transaction's `DATA_CAPABILITIES` field SHALL include bit 1 set, regardless of the bookmark's `encoding` value

#### Scenario: UTF-8 bookmark on plain TLS advertises bit 1

- **WHEN** the client connects to a bookmark with HOPE disabled, TLS optionally on, and `encoding == Utf8`
- **THEN** the login transaction's `DATA_CAPABILITIES` field SHALL include bit 1 set

#### Scenario: MacRoman bookmark on plain transport does NOT advertise bit 1

- **WHEN** the client connects to a bookmark with HOPE disabled and `encoding == Macintosh`
- **THEN** the login transaction's `DATA_CAPABILITIES` field SHALL NOT include bit 1

#### Scenario: Server confirms bit 1

- **WHEN** the server's login reply echoes `DATA_CAPABILITIES` with bit 1 set
- **THEN** the client SHALL store this fact and use it as one input to effective-encoding resolution: HOPE active → UTF-8; else server-confirmed bit 1 → UTF-8; else bookmark.encoding

### Requirement: Effective text encoding resolution

The client SHALL resolve a single `effective_encoding` value per connection, after HOPE negotiation and after parsing the server's echoed `DATA_CAPABILITIES`. The resolution order SHALL be:

1. If HOPE transport encryption is active → `Utf8`
2. Else if the server echoed `CAPABILITY_TEXT_ENCODING` (bit 1) → `Utf8`
3. Otherwise → the bookmark's `encoding` field (default `Macintosh`)

The resolved encoding SHALL be stored on the `HotlineClient` for the lifetime of the connection and used by all text decode/encode call sites.

#### Scenario: HOPE wins over bookmark setting

- **WHEN** a bookmark has `encoding == Macintosh` and `hope == true` and the connection establishes HOPE successfully
- **THEN** `effective_encoding` SHALL be `Utf8` for the session, overriding the bookmark setting

#### Scenario: Server bit-1 echo wins over bookmark setting

- **WHEN** a bookmark has `encoding == Macintosh` and `hope == false`, the client somehow advertises bit 1 (e.g., the user manually toggled UTF-8 in this session, or a future preference enables it), and the server echoes bit 1 in its login reply
- **THEN** `effective_encoding` SHALL be `Utf8` for the session

#### Scenario: Bookmark setting used absent other signals

- **WHEN** a bookmark has `encoding == Utf8`, `hope == false`, and the server does NOT echo bit 1 (older server)
- **THEN** `effective_encoding` SHALL be `Utf8` based on the bookmark setting; the client uses UTF-8 even though the server hasn't confirmed support — text from the client may render incorrectly on classic peers, which is the user's choice
