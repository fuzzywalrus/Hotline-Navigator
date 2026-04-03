## MODIFIED Requirements

### Requirement: Tracker Connection via HTRK Protocol

The system SHALL connect to Hotline tracker servers using the HTRK protocol to discover available Hotline servers.

The default tracker port SHALL be 5498.

The system SHALL attempt a v3 handshake first by sending 8 bytes: the magic "HTRK", version 0x0003, and a 2-byte feature flags bitmask. The system SHALL then read 6 bytes from the tracker. If the version in the response is 0x0003, the system SHALL read 2 additional bytes for the tracker's feature flags and proceed with v3 listing. If the version is 0x0001 or 0x0002, the system SHALL fall back to v1 parsing.

The negotiated feature set SHALL be the bitwise AND of the client's and tracker's feature flags.

#### Scenario: v3 handshake with v3 tracker

- **WHEN** the client sends an 8-byte v3 handshake and the tracker responds with version 0x0003
- **THEN** the client SHALL read 2 more bytes for feature flags, compute negotiated features as bitwise AND, and proceed with v3 listing request

#### Scenario: v3 handshake with v1 tracker (fallback)

- **WHEN** the client sends an 8-byte v3 handshake and the tracker responds with version 0x0001
- **THEN** the client SHALL fall back to v1 batch parsing (the extra 2 bytes sent by the client remain harmlessly in the TCP buffer)

#### Scenario: v3 handshake with v2 tracker (fallback)

- **WHEN** the client sends an 8-byte v3 handshake and the tracker responds with version 0x0002
- **THEN** the client SHALL fall back to v2 parsing

#### Scenario: Connection timeout

- **WHEN** the client attempts to connect to a tracker server and the connection is not established within 10 seconds
- **THEN** the client SHALL abort the connection attempt and report a timeout error

#### Scenario: Response timeout

- **WHEN** the client has connected to a tracker but the full server list response is not received within 30 seconds
- **THEN** the client SHALL abort the read and report a timeout error

### Requirement: v3 Listing Request

After a successful v3 handshake, the system SHALL send a listing request before reading the server list.

The listing request SHALL consist of: request type (u16, value 0x0001), field count (u16), and optional TLV fields for search text and pagination.

In v1 mode, no listing request is sent — the tracker streams the server list immediately after the handshake.

#### Scenario: Send listing request without search

- **WHEN** a v3 handshake succeeds and no search query is provided
- **THEN** the client SHALL send a listing request with request type 0x0001 and field count 0

#### Scenario: Send listing request with search text

- **WHEN** a v3 handshake succeeds and a search query is provided
- **THEN** the client SHALL send a listing request with a SEARCH_TEXT TLV field (ID 0x1001) containing the search string

#### Scenario: Send listing request with pagination

- **WHEN** a v3 handshake succeeds and pagination parameters are provided
- **THEN** the client SHALL include PAGE_OFFSET (ID 0x1010) and/or PAGE_LIMIT (ID 0x1011) TLV fields in the listing request

### Requirement: v3 Listing Response Parsing

The system SHALL parse v3 listing responses.

The response header SHALL contain: response type (u16), total size (u32), total servers (u16), and record count (u16). The system SHALL then parse record_count server records.

#### Scenario: Parse v3 listing response header

- **WHEN** the tracker sends a v3 listing response
- **THEN** the client SHALL read 10 bytes: response type (u16), total size (u32), total servers (u16), record count (u16)

#### Scenario: Total servers vs record count for pagination awareness

- **WHEN** total_servers exceeds record_count in the response header
- **THEN** the client SHALL understand that additional pages exist but SHALL return only the records received in this response

### Requirement: v3 Server Record Parsing

The system SHALL parse v3 server records with variable-length address types, 2-byte length-prefixed UTF-8 strings, and per-record TLV metadata.

#### Scenario: Parse IPv4 server record

- **WHEN** a server record has address type 0x04
- **THEN** the client SHALL read 4 bytes as an IPv4 address in dotted notation

#### Scenario: Parse IPv6 server record

- **WHEN** a server record has address type 0x06
- **THEN** the client SHALL read 16 bytes as an IPv6 address and format it using standard IPv6 notation

#### Scenario: Parse hostname server record

- **WHEN** a server record has address type 0x48
- **THEN** the client SHALL read a 2-byte length prefix (u16) followed by that many bytes of UTF-8 hostname string

#### Scenario: Parse server name and description

- **WHEN** parsing a v3 server record after the address and port fields
- **THEN** the client SHALL read name as a 2-byte length-prefixed UTF-8 string, then description as a 2-byte length-prefixed UTF-8 string

#### Scenario: Parse per-record TLV metadata

- **WHEN** a v3 server record includes a TLV count > 0
- **THEN** the client SHALL parse each TLV field (ID u16, length u16, value bytes) and extract known metadata fields

#### Scenario: Ignore unknown TLV field IDs

- **WHEN** a TLV field has an unrecognized field ID
- **THEN** the client SHALL skip the field by advancing past its declared length without error

### Requirement: v3 TLV Metadata Extraction

The system SHALL extract and surface the following TLV metadata fields from v3 server records when present:

| Field ID | Name | Type | Description |
|----------|------|------|-------------|
| 0x0200 | SERVER_SOFTWARE | string | Server software name and version |
| 0x0201 | COUNTRY_CODE | string | ISO 3166-1 alpha-2 country code |
| 0x0204 | MAX_USERS | u16 | Maximum user capacity |
| 0x0208 | BANNER_URL | string | URL to server banner image |
| 0x0209 | ICON_URL | string | URL to server icon |
| 0x0301 | SUPPORTS_HOPE | bool | Server supports HOPE encryption |
| 0x0302 | SUPPORTS_TLS | bool | Server supports TLS connections |
| 0x0303 | TLS_PORT | u16 | Dedicated TLS port |
| 0x0310 | TAGS | string | Comma-separated tags |

#### Scenario: Extract TLS support metadata

- **WHEN** a v3 server record contains SUPPORTS_TLS (0x0302) with value true
- **THEN** the TrackerServer result SHALL include supports_tls: true

#### Scenario: Extract TLS port metadata

- **WHEN** a v3 server record contains TLS_PORT (0x0303)
- **THEN** the TrackerServer result SHALL include the tls_port value so the client can connect directly via TLS

#### Scenario: Extract HOPE support metadata

- **WHEN** a v3 server record contains SUPPORTS_HOPE (0x0301) with value true
- **THEN** the TrackerServer result SHALL include supports_hope: true

#### Scenario: Extract server software metadata

- **WHEN** a v3 server record contains SERVER_SOFTWARE (0x0200)
- **THEN** the TrackerServer result SHALL include the server_software string

#### Scenario: Extract tags metadata

- **WHEN** a v3 server record contains TAGS (0x0310)
- **THEN** the TrackerServer result SHALL include the tags string

#### Scenario: No TLV metadata present

- **WHEN** a v3 server record has TLV count 0
- **THEN** all optional metadata fields SHALL be None/null in the TrackerServer result

### Requirement: Tracker Server List Parsing (v1 fallback)

The system SHALL parse v1 batches of server entries when the tracker responds with version 0x0001.

Each batch begins with a header containing message_type (u16), data_len (u16), count (u16), and count2 (u16). Following the header, each server entry consists of: IP address (4 bytes), port (u16), user count (u16), 2 unused bytes, name (Pascal string), and description (Pascal string).

#### Scenario: Parse a single batch of servers (v1)

- **WHEN** the client reads a v1 batch header followed by server entries
- **THEN** the client SHALL parse each entry and extract: IPv4 address (dotted notation), port, user count, name, and description

#### Scenario: Parse multiple batches until complete (v1)

- **WHEN** the initial batch header indicates a total count of servers
- **THEN** the client SHALL continue reading subsequent batches until the total number of entries parsed is greater than or equal to the initial count

#### Scenario: Safety limit on batch reads (v1)

- **WHEN** the client has read 100 batches without reaching the expected total count
- **THEN** the client SHALL stop reading and return the servers parsed so far

### Requirement: Tracker Entry Filtering

The system SHALL filter out separator entries from the tracker server list.

#### Scenario: Filter separator entries

- **WHEN** a server entry has a name consisting entirely of dash characters (e.g., "-------")
- **THEN** the system SHALL exclude that entry from the returned server list

### Requirement: String Encoding

In v3 mode, all strings SHALL be decoded as UTF-8. In v1 mode, server names and descriptions SHALL be decoded from MacOS Roman encoding to UTF-8.

#### Scenario: Decode UTF-8 text in v3 mode

- **WHEN** the tracker responds with v3 and a server record contains UTF-8 encoded name and description
- **THEN** the system SHALL decode those strings as UTF-8

#### Scenario: Decode MacOS Roman text in v1 mode

- **WHEN** the tracker responds with v1 and a server entry contains MacOS Roman encoded text
- **THEN** the system SHALL decode those bytes to their correct UTF-8 equivalents

### Requirement: Extended TrackerServer Result Format

The system SHALL return tracker results as a list of TrackerServer entries with both v1 core fields and optional v3 metadata fields.

Each TrackerServer entry SHALL contain: address (string — IPv4 dotted, IPv6 notation, or hostname), port, users (connected user count), name, description, and optional v3 metadata: supports_tls, supports_hope, tls_port, server_software, tags, max_users, country_code, banner_url, icon_url.

#### Scenario: Return v1 tracker server (no metadata)

- **WHEN** the tracker responded with v1 format
- **THEN** the TrackerServer entries SHALL have address, port, users, name, description populated and all v3 metadata fields SHALL be None/null

#### Scenario: Return v3 tracker server (with metadata)

- **WHEN** the tracker responded with v3 format and server records include TLV metadata
- **THEN** the TrackerServer entries SHALL include both core fields and populated v3 metadata fields

### Requirement: Tracker Bookmark Storage

Tracker servers SHALL be stored as bookmarks with a bookmark_type of Tracker.

#### Scenario: Save tracker as bookmark

- **WHEN** a user saves a tracker server address
- **THEN** the system SHALL persist it as a bookmark with bookmark_type set to Tracker

#### Scenario: Display tracker bookmarks

- **WHEN** the bookmark list is displayed
- **THEN** tracker bookmarks SHALL be distinguishable from regular server bookmarks by their bookmark_type

### Requirement: v3 Metadata Display in UI

The system SHALL display v3 metadata in tracker server list rows when available.

#### Scenario: Display TLS badge on server row

- **WHEN** a tracker server has supports_tls: true
- **THEN** the UI SHALL display a TLS indicator badge on the server row

#### Scenario: Display HOPE badge on server row

- **WHEN** a tracker server has supports_hope: true
- **THEN** the UI SHALL display a HOPE indicator badge on the server row

#### Scenario: Display tags on server row

- **WHEN** a tracker server has tags metadata
- **THEN** the UI SHALL display the tags (e.g., as pill badges) on the server row

#### Scenario: Display server software

- **WHEN** a tracker server has server_software metadata
- **THEN** the UI SHALL display the software name in the server info or tooltip

#### Scenario: Connect with TLS port from metadata

- **WHEN** a user connects to a server that has supports_tls: true and tls_port metadata
- **THEN** the system SHALL use the tls_port and enable TLS for the connection

#### Scenario: No v3 metadata available

- **WHEN** a tracker server was retrieved from a v1 tracker and has no v3 metadata
- **THEN** the UI SHALL display the server row without metadata badges (same as current behavior)

### Requirement: Feature Flags

The client SHALL send feature flags in the v3 handshake to advertise its capabilities.

The client SHALL set FEAT_IPV6 (bit 0, mask 0x0001) to indicate IPv6 address support. The client SHALL set FEAT_QUERY (bit 1, mask 0x0002) when search or pagination is requested.

#### Scenario: Default feature flags

- **WHEN** the client initiates a v3 handshake
- **THEN** the client SHALL send feature flags with at least FEAT_IPV6 set (0x0001)

#### Scenario: Feature flags with search

- **WHEN** the client initiates a v3 handshake with a search query
- **THEN** the client SHALL send feature flags with FEAT_IPV6 | FEAT_QUERY (0x0003)
