## Purpose

Defines server-side chat history retrieval, including capability negotiation, history fetching with cursor-based pagination, binary entry parsing, initial load on connect, scroll-back, reconnect catch-up, and integration with the existing chat rendering pipeline.

## Requirements

### Requirement: Capability Negotiation

The client SHALL advertise `CAPABILITY_CHAT_HISTORY` (bit 4, mask `0x0010`) in the `DATA_CAPABILITIES` field during Login (107). If the server echoes bit 4 in the login reply, server-side chat history is available. If the server does not echo bit 4, the client MUST NOT send `TRAN_GET_CHAT_HISTORY` (700) transactions.

The capability bit stacks with existing capabilities (e.g., large files bit 0, text encoding bit 1). The combined bitmask is sent as a single u16 field.

#### Scenario: Server supports chat history

- **WHEN** the client sends Login with `DATA_CAPABILITIES = 0x0011` (bits 0 + 4)
- **AND** the server replies with `DATA_CAPABILITIES = 0x0011`
- **THEN** `chatHistorySupported` is set to true on the server info
- **AND** the client may send `TRAN_GET_CHAT_HISTORY` requests

#### Scenario: Server does not support chat history

- **WHEN** the client sends Login with `DATA_CAPABILITIES = 0x0011`
- **AND** the server replies with `DATA_CAPABILITIES = 0x0001` (bit 4 not echoed)
- **THEN** `chatHistorySupported` is set to false
- **AND** the client falls back to local history behavior

#### Scenario: Retention policy advertisement

- **WHEN** the server includes `DATA_HISTORY_MAX_MSGS` (`0x0F07`) and/or `DATA_HISTORY_MAX_DAYS` (`0x0F08`) in the login reply
- **THEN** the client stores these values on `ServerInfo` as `historyMaxMsgs` and `historyMaxDays`
- **AND** MAY display a retention hint in the chat UI (e.g., "This server keeps 30 days of chat history")

### Requirement: Fetch Chat History

The client SHALL request chat history by sending `TRAN_GET_CHAT_HISTORY` (700) with `DATA_CHANNEL_ID = 0` (public chat), optional cursor fields (`DATA_HISTORY_BEFORE`, `DATA_HISTORY_AFTER`), and an optional `DATA_HISTORY_LIMIT`.

The server replies with zero or more `DATA_HISTORY_ENTRY` fields (one per message, packed binary) and a `DATA_HISTORY_HAS_MORE` flag.

#### Scenario: Fetch most recent messages (no cursors)

- **WHEN** the client sends transaction 700 with `channel_id = 0` and `limit = 50`, no cursors
- **THEN** the server returns up to 50 most recent messages, oldest-first
- **AND** `has_more = 1` if older messages exist beyond this batch

#### Scenario: Scroll-back with BEFORE cursor

- **WHEN** the client sends transaction 700 with `before = <oldest_known_id>` and `limit = 50`
- **THEN** the server returns up to 50 messages with IDs strictly less than the cursor, oldest-first
- **AND** `has_more = 0` when no older messages exist (beginning of history)

#### Scenario: Catch-up with AFTER cursor

- **WHEN** the client sends transaction 700 with `after = <last_known_id>` and `limit = 50`
- **THEN** the server returns up to 50 messages with IDs strictly greater than the cursor, oldest-first
- **AND** `has_more = 1` if more recent messages exist beyond this batch (paginate until caught up)

#### Scenario: Empty history

- **WHEN** the server has no messages matching the query
- **THEN** the reply contains zero `DATA_HISTORY_ENTRY` fields and `has_more = 0`

#### Scenario: Access denied

- **WHEN** the user lacks `accessReadChatHistory` (bit 56) permission
- **THEN** the server replies with an error
- **AND** the client displays the chat history UI in a disabled state with a message indicating permission is required

### Requirement: Parse History Entries

The client SHALL parse each `DATA_HISTORY_ENTRY` (`0x0F05`) field as a packed binary structure with a fixed header (22 bytes minimum), variable-length nick and message, and optional mini-TLV sub-fields.

#### Scenario: Normal message entry

- **WHEN** a history entry is received with `message_id`, `timestamp`, `flags = 0`, `icon_id`, nick, and message
- **THEN** the entry is parsed into a `HistoryEntry` struct with all fields populated
- **AND** the message is converted to a `ChatMessage` with `fromHistory = true`

#### Scenario: Emote entry (is_action flag)

- **WHEN** a history entry has flags bit 0 set (`0x0001`)
- **THEN** the parsed entry has `isAction = true`
- **AND** the renderer displays it as an emote (e.g., `*** nick does something`)

#### Scenario: Server message entry

- **WHEN** a history entry has flags bit 1 set (`0x0002`)
- **THEN** the parsed entry has `isServerMsg = true`
- **AND** the renderer displays it with server broadcast styling

#### Scenario: Tombstoned entry (is_deleted flag)

- **WHEN** a history entry has flags bit 2 set (`0x0004`)
- **THEN** the parsed entry has `isDeleted = true`
- **AND** the renderer displays `[message removed]` as a placeholder
- **AND** the message_id and timestamp are preserved (cursor stability)

#### Scenario: Unknown sub-fields

- **WHEN** a history entry contains sub-fields after the message body with unrecognized sub-type values
- **THEN** the parser skips each unknown sub-field using its sub-length
- **AND** parsing completes successfully (forward compatibility)

#### Scenario: Malformed entry

- **WHEN** a history entry is shorter than 22 bytes or has inconsistent length fields
- **THEN** the parser returns an error for that entry
- **AND** the client skips the malformed entry and continues processing remaining entries

### Requirement: Initial Load on Connect

When connected to a server that supports chat history, the client SHALL fetch the most recent messages before showing the chat view. This provides a Discord-style experience where chat opens with history already visible.

#### Scenario: History loaded on connect

- **WHEN** the login reply confirms `chatHistorySupported = true`
- **THEN** the client sends `TRAN_GET_CHAT_HISTORY` with `channel_id = 0`, no cursors, `limit = 50`
- **AND** the returned entries are displayed in the chat view with server-provided timestamps
- **AND** live messages that arrive subsequently are appended below the history

#### Scenario: Server history available but empty

- **WHEN** the initial history fetch returns zero entries
- **THEN** the chat view opens empty (same as current behavior)
- **AND** live messages appear as they arrive

### Requirement: Scroll-Back Pagination

When the user scrolls to the top of the chat view and more history is available, the client SHALL fetch older messages using the BEFORE cursor.

#### Scenario: User scrolls to top

- **WHEN** the user scrolls to the top of the chat view
- **AND** `has_more` was true from the last history fetch
- **THEN** a loading indicator is shown at the top of the chat
- **AND** the client fetches older messages with `before = <oldest_message_id>`
- **AND** the returned entries are prepended to the chat view
- **AND** the scroll position is preserved (user doesn't jump to top)

#### Scenario: Beginning of history reached

- **WHEN** a history fetch returns `has_more = 0`
- **THEN** a "Beginning of chat history" marker is displayed at the top of the chat
- **AND** no further scroll-back fetches are attempted

### Requirement: Reconnect Catch-Up

When the client reconnects to a history-enabled server and has a previous session's newest message ID, it SHALL fetch missed messages using the AFTER cursor.

#### Scenario: Reconnect with known last message

- **WHEN** the client reconnects to a server where `chatHistorySupported = true`
- **AND** the client has a stored `newestMessageId` from the previous session
- **THEN** the client sends `TRAN_GET_CHAT_HISTORY` with `after = <newestMessageId>`
- **AND** paginates until `has_more = 0` (fully caught up)
- **AND** the missed messages are merged into the chat view

#### Scenario: Reconnect without previous session data

- **WHEN** the client reconnects but has no stored `newestMessageId`
- **THEN** the client performs a normal initial load (no cursors, most recent messages)

### Requirement: Local History Suppression

When connected to a server that supports chat history, the client SHALL skip recording live messages to the local Stronghold vault. Local history continues to operate for servers without chat history support.

#### Scenario: Server supports history — local recording skipped

- **WHEN** a live chat message is received on a server with `chatHistorySupported = true`
- **THEN** the message is NOT written to the local Stronghold vault
- **AND** the message is displayed in the chat view normally

#### Scenario: Server does not support history — local recording active

- **WHEN** a live chat message is received on a server with `chatHistorySupported = false`
- **AND** the `enableChatHistory` preference is true
- **THEN** the message IS written to the local Stronghold vault (current behavior)

### Requirement: Retention Policy Display

When the server provides retention policy hints in the login reply, the client MAY display them as informational UI hints.

#### Scenario: Retention policy available

- **WHEN** `historyMaxMsgs` or `historyMaxDays` is present in the server info
- **THEN** the client displays a hint such as "This server keeps up to 10,000 messages / 30 days of chat history"
- **AND** these values are informational only — the authoritative "no more messages" signal is `has_more = 0`
