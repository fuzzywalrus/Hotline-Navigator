## Purpose

Defines tracker server discovery via the HTRK protocol, including connection, batch parsing, encoding, and filtering.

## Requirements

### Requirement: Tracker Connection via HTRK Protocol

The system SHALL connect to Hotline tracker servers using the HTRK protocol to discover available Hotline servers.

The default tracker port SHALL be 5498.

#### Scenario: Initiate tracker connection

- **WHEN** the client connects to a tracker server at a given address and port
- **THEN** the client SHALL send the magic bytes "HTRK" followed by a version field (u16, value 0x0001)
- **THEN** the client SHALL read a 6-byte magic response from the tracker

#### Scenario: Connection timeout

- **WHEN** the client attempts to connect to a tracker server and the connection is not established within 10 seconds
- **THEN** the client SHALL abort the connection attempt and report a timeout error

#### Scenario: Response timeout

- **WHEN** the client has connected to a tracker but the full server list response is not received within 30 seconds
- **THEN** the client SHALL abort the read and report a timeout error


### Requirement: Tracker Server List Parsing

The system SHALL parse batches of server entries from the tracker response.

Each batch begins with a header containing message_type (u16), data_len (u16), count (u16), and count2 (u16). Following the header, each server entry consists of: IP address (4 bytes), port (u16), user count (u16), 2 unused bytes, name (Pascal string), and description (Pascal string).

#### Scenario: Parse a single batch of servers

- **WHEN** the client reads a batch header followed by server entries
- **THEN** the client SHALL parse each entry and extract: IPv4 address (dotted notation), port, user count, name, and description

#### Scenario: Parse multiple batches until complete

- **WHEN** the initial batch header indicates a total count of servers
- **THEN** the client SHALL continue reading subsequent batches until the total number of entries parsed is greater than or equal to the initial count

#### Scenario: Safety limit on batch reads

- **WHEN** the client has read 100 batches without reaching the expected total count
- **THEN** the client SHALL stop reading and return the servers parsed so far


### Requirement: Tracker Entry Filtering

The system SHALL filter out separator entries from the tracker server list.

#### Scenario: Filter separator entries

- **WHEN** a server entry has a name consisting entirely of dash characters (e.g., "-------")
- **THEN** the system SHALL exclude that entry from the returned server list


### Requirement: MacOS Roman Decoding

Server names and descriptions from tracker responses SHALL be decoded from MacOS Roman encoding to UTF-8.

#### Scenario: Decode MacOS Roman text

- **WHEN** a server name or description contains bytes in the MacOS Roman character set
- **THEN** the system SHALL decode those bytes to their correct UTF-8 equivalents


### Requirement: Tracker Server Result Format

The system SHALL return tracker results as a list of TrackerServer entries.

Each TrackerServer entry SHALL contain: address (IPv4 dotted string), port, users (count of connected users), name, and description.

#### Scenario: Return well-formed tracker server list

- **WHEN** the tracker response has been fully parsed and filtered
- **THEN** the system SHALL return a list of TrackerServer entries with address, port, users, name, and description fields populated


### Requirement: Tracker Bookmark Storage

Tracker servers SHALL be stored as bookmarks with a bookmark_type of Tracker.

#### Scenario: Save tracker as bookmark

- **WHEN** a user saves a tracker server address
- **THEN** the system SHALL persist it as a bookmark with bookmark_type set to Tracker

#### Scenario: Display tracker bookmarks

- **WHEN** the bookmark list is displayed
- **THEN** tracker bookmarks SHALL be distinguishable from regular server bookmarks by their bookmark_type
