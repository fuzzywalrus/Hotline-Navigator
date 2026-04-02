## Purpose

Defines bookmark management for saved server and tracker connections, including CRUD operations, ordering, default bookmarks, and persistent storage.

## Requirements

### Requirement: Bookmark data model

Each bookmark SHALL be represented by a `Bookmark` struct with the following fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | String | Yes | -- | Unique identifier (UUID for user bookmarks, prefixed ID for defaults) |
| `name` | String | Yes | -- | Display name |
| `address` | String | Yes | -- | Server hostname or IP address |
| `port` | u16 | Yes | -- | Server port number |
| `login` | String | Yes | `"guest"` | Login username |
| `password` | Option\<String\> | No | `None` | Login password (omitted from JSON if None) |
| `icon` | Option\<u16\> | No | `None` | User icon ID override |
| `auto_connect` | bool | No | `false` | Connect automatically on app launch |
| `tls` | bool | No | `false` | Use TLS encryption |
| `hope` | bool | No | `false` | Use HOPE secure login |
| `bookmark_type` | Option\<BookmarkType\> | No | `None` | `Server` or `Tracker` (serialized as `"type"` in JSON) |

`BookmarkType` is an enum with variants: `Server`, `Tracker`.

The `tls`, `hope`, and `auto_connect` fields use `#[serde(default)]` to ensure backward compatibility when loading bookmarks saved before these fields existed.

#### Scenario: Bookmark serialization round-trip

- **WHEN** a bookmark with all fields set is serialized to JSON and deserialized back
- **THEN** all field values SHALL be preserved, with `password` and `icon` omitted from JSON when they are `None`

#### Scenario: Deserialize legacy bookmark without TLS field

- **WHEN** a bookmark JSON object lacks the `tls` field
- **THEN** deserialization SHALL succeed with `tls` defaulting to `false`

#### Scenario: Deserialize legacy bookmark without HOPE field

- **WHEN** a bookmark JSON object lacks the `hope` field
- **THEN** deserialization SHALL succeed with `hope` defaulting to `false`

### Requirement: Create bookmark

The system SHALL allow creating a new bookmark via the `save_bookmark` command. If the bookmark ID does not exist in the current bookmarks list, it is appended. The frontend presents an "Add Bookmark" dialog where the user fills in: name, address, port, login, password, TLS toggle, HOPE toggle, and auto-connect toggle.

If the user does not provide a name, the system SHALL auto-generate one as `"{address}:{port}"`.

#### Scenario: Add a new server bookmark

- **WHEN** the user submits the Add Bookmark form with name "My Server", address "example.com", port 5500, login "guest", tls false
- **THEN** the system SHALL create a Bookmark with a unique ID, persist it to bookmarks.json, and add it to the in-memory bookmarks list

#### Scenario: Add bookmark with auto-generated name

- **WHEN** the user submits the Add Bookmark form with an empty name, address "example.com", and port 5500
- **THEN** the bookmark name SHALL be set to "example.com:5500"

### Requirement: Edit bookmark

The system SHALL allow editing an existing bookmark via the `save_bookmark` command. The frontend presents an "Edit Bookmark" dialog pre-populated with the bookmark's current values. On save, the system updates the bookmark in the list and persists to disk.

#### Scenario: Edit bookmark name and port

- **WHEN** the user changes a bookmark's name from "Old Name" to "New Name" and port from 5500 to 5600
- **THEN** the system SHALL update the bookmark in the in-memory list, persist the updated list to bookmarks.json, and the changes SHALL be visible in the bookmark list UI

#### Scenario: Edit bookmark preserves type

- **WHEN** the user edits a tracker bookmark
- **THEN** the bookmark's `type` field SHALL remain `"tracker"` after saving

### Requirement: Delete bookmark

The system SHALL allow deleting a bookmark via the `delete_bookmark` command, which takes a bookmark `id`. The bookmark is removed from the in-memory list and the change is persisted to bookmarks.json.

#### Scenario: Delete an existing bookmark

- **WHEN** the user invokes `delete_bookmark` with a valid bookmark ID
- **THEN** the system SHALL remove the bookmark from the in-memory list and persist the updated list to disk

#### Scenario: Delete bookmark that does not exist

- **WHEN** the user invokes `delete_bookmark` with an ID that is not in the bookmarks list
- **THEN** the system SHALL still succeed (no-op) and persist the unchanged list

### Requirement: Reorder bookmarks

The system SHALL allow reordering bookmarks via the `reorder_bookmarks` command. The frontend supports drag-and-drop reordering and sends the complete reordered list to the backend.

The system MUST validate that the reordered list contains exactly the same bookmark IDs as the current list (no additions or removals) to prevent data loss.

#### Scenario: Successful reorder

- **WHEN** the user reorders bookmarks [A, B, C] to [C, A, B] and submits
- **THEN** the system SHALL replace the bookmark list with the new order and persist to disk

#### Scenario: Reorder with mismatched IDs

- **WHEN** the `reorder_bookmarks` command receives a list with different bookmark IDs than the current list
- **THEN** the system SHALL reject the reorder with error: "Bookmark reorder failed: bookmark count or IDs don't match"

### Requirement: Persistent storage in bookmarks.json

Bookmarks SHALL be persisted to a `bookmarks.json` file in the application's data directory (`app_data_dir`). The file uses JSON array format with pretty-printing.

The system SHALL load bookmarks from this file on startup. If the file does not exist, an empty list is used and default bookmarks are populated.

#### Scenario: Bookmarks loaded on startup

- **WHEN** the application starts and bookmarks.json exists with valid JSON
- **THEN** the system SHALL deserialize the JSON array into the in-memory bookmarks list

#### Scenario: Bookmarks file does not exist

- **WHEN** the application starts and bookmarks.json does not exist
- **THEN** the system SHALL start with an empty list and populate it with default bookmarks

#### Scenario: Bookmarks file is corrupt

- **WHEN** the application starts and bookmarks.json contains invalid JSON
- **THEN** the system SHALL return a parse error and start with an empty bookmarks list

#### Scenario: Persist after modification

- **WHEN** any bookmark operation (create, edit, delete, reorder) completes
- **THEN** the system SHALL serialize the full bookmarks list to pretty-printed JSON and write it to bookmarks.json

### Requirement: Default bookmarks

The system SHALL define a set of default trackers and servers that are populated on first launch (when bookmarks.json is empty) and can be restored via the `add_default_bookmarks` command.

Default trackers (all on port 5498):
| ID | Name | Address |
|----|------|---------|
| `default-tracker-hltracker` | Featured Servers | `hltracker.com` |
| `default-tracker-mainecyber` | Maine Cyber | `tracked.mainecyber.com` |
| `default-tracker-preterhuman` | Preterhuman | `tracker.preterhuman.net` |

Default servers:
| ID | Name | Address | Port | TLS |
|----|------|---------|------|-----|
| `default-server-bigredh` | Hotline Central Hub | `server.bigredh.com` | 5500 | false |
| `default-server-system7` | System7 Today | `hotline.system7today.com` | 5500 | false |
| `default-server-macdomain` | MacDomain | `62.116.228.143` | 5500 | false |
| `default-server-applearchive` | Apple Media Archive & Hotline Navigator | `hotline.semihosted.xyz` | 5600 | true |

All default bookmarks use login `"guest"`, no password, no icon, `auto_connect: false`, and `hope: false`.

#### Scenario: First launch populates defaults

- **WHEN** the application launches for the first time (bookmarks.json is empty or does not exist)
- **THEN** the system SHALL populate the bookmarks list with all default trackers and servers, in the order listed above, and persist to bookmarks.json

#### Scenario: Defaults not duplicated on subsequent launches

- **WHEN** the application launches and bookmarks.json already contains bookmarks
- **THEN** the system SHALL NOT add duplicate default bookmarks

### Requirement: Add default bookmarks (restore factory defaults)

The `add_default_bookmarks` command SHALL add any missing default bookmarks to the existing list. It checks for duplicates by matching on `address` (and `port` for trackers, `bookmark_type` for servers) before adding.

#### Scenario: Restore defaults after user deleted some

- **WHEN** the user has deleted the "System7 Today" default server and invokes `add_default_bookmarks`
- **THEN** the system SHALL add back "System7 Today" but not duplicate any default bookmarks that are still present

#### Scenario: All defaults already present

- **WHEN** the user invokes `add_default_bookmarks` and all default bookmarks are already in the list
- **THEN** the system SHALL not add any new bookmarks and return the current list

### Requirement: Auto-migration on bookmark load

When loading bookmarks from disk, the system SHALL perform auto-migration to fix inconsistencies in existing bookmarks. This runs on every load, not just first launch.

Migrations:
1. **Fix missing bookmark_type for default trackers**: If a bookmark matches a default tracker by address and port but lacks `bookmark_type: Tracker`, set it to `Tracker` and update its ID and name to the canonical defaults
2. **Fix missing bookmark_type for default servers**: If a bookmark matches a default server by address but lacks `bookmark_type: Server`, set it to `Server` and update its ID and name
3. **Update TLS settings for default servers**: If a default server's TLS setting has changed in the code (e.g., a server moved from plain to TLS), update the bookmark's `tls` flag and port accordingly

If any migration changes were made, the system SHALL persist the updated bookmarks to disk.

#### Scenario: Tracker bookmark missing type

- **WHEN** bookmarks.json contains a bookmark with address `hltracker.com`, port 5498, but no `bookmark_type`
- **THEN** the system SHALL set `bookmark_type` to `Tracker`, set the ID to `default-tracker-hltracker`, set the name to "Featured Servers", and persist the change

#### Scenario: Default server TLS setting updated

- **WHEN** the code changes a default server from `tls: false` to `tls: true`, and an existing bookmark matches that server by address
- **THEN** the system SHALL update the bookmark's `tls` flag and port (to `DEFAULT_TLS_PORT` or `DEFAULT_SERVER_PORT`) and persist the change

#### Scenario: No migrations needed

- **WHEN** all bookmarks are already consistent with the current defaults
- **THEN** the system SHALL not write to bookmarks.json

### Requirement: TLS toggle auto-switches port

When the user toggles the TLS checkbox in the bookmark editor (both Edit Bookmark and Connect dialogs), the system SHALL automatically switch the port between the standard values:
- TLS enabled and current port is `5500` -> change to `5600`
- TLS disabled and current port is `5600` -> change to `5500`
- Non-standard ports are left unchanged

#### Scenario: Enable TLS on default port

- **WHEN** the user toggles TLS on in the bookmark editor while the port is `5500`
- **THEN** the port field SHALL automatically update to `5600`

#### Scenario: Disable TLS on default TLS port

- **WHEN** the user toggles TLS off in the bookmark editor while the port is `5600`
- **THEN** the port field SHALL automatically update to `5500`

#### Scenario: Toggle TLS on custom port

- **WHEN** the user toggles TLS on in the bookmark editor while the port is `7000`
- **THEN** the port field SHALL remain `7000`

### Requirement: Bookmark type switching in Connect dialog

The Connect dialog allows the user to switch between "Server" and "Tracker" types. Switching the type SHALL automatically adjust the default port.

#### Scenario: Switch to Tracker type

- **WHEN** the user changes the type to "Tracker" in the Connect dialog
- **THEN** the port SHALL automatically change to `5498` and the TLS toggle SHALL be set to `false`

#### Scenario: Switch to Server type

- **WHEN** the user changes the type from "Tracker" to "Server" in the Connect dialog
- **THEN** the port SHALL automatically change to `5500` (or `5600` if TLS is enabled)

### Requirement: Search and filter bookmarks

The bookmark list UI SHALL support filtering bookmarks by a search query. The search is performed client-side on the current bookmark list.

#### Scenario: Filter bookmarks by name

- **WHEN** the user types a search query in the bookmark list search field
- **THEN** the bookmark list SHALL show only bookmarks whose name or address matches the query (case-insensitive)

#### Scenario: Clear search shows all bookmarks

- **WHEN** the user clears the search query
- **THEN** the bookmark list SHALL show all bookmarks in their current order

### Requirement: Auto-connect flag

Each bookmark has an `autoConnect` boolean field (default: `false`). On application launch, the frontend SHALL iterate all bookmarks and connect to each one where `autoConnect` is `true`.

#### Scenario: Bookmark with auto-connect enabled

- **WHEN** the application launches and a server bookmark has `autoConnect: true`
- **THEN** the system SHALL automatically invoke `connect_to_server` for that bookmark

#### Scenario: Tracker bookmarks ignore auto-connect

- **WHEN** the application launches and a tracker bookmark has `autoConnect: true`
- **THEN** the system SHALL filter on `type !== 'tracker'` before auto-connecting, so tracker bookmarks are not auto-connected as servers

### Requirement: Hotline URL parsing

The Connect dialog SHALL support pasting hotline URLs in the format `hotline://address:port/path`. The system parses the URL to extract the server address, port, and infers TLS from the port.

#### Scenario: Parse hotline URL with port

- **WHEN** the user pastes `hotline://server.example.com:5500` into the address field
- **THEN** the system SHALL set address to `server.example.com`, port to `5500`, and TLS to `false`

#### Scenario: Parse hotline URL with TLS port

- **WHEN** the user pastes `hotline://server.example.com:5600`
- **THEN** the system SHALL set address to `server.example.com`, port to `5600`, and TLS to `true` (inferred because port is 5600)

#### Scenario: Parse hotline URL without port

- **WHEN** the user pastes `hotline://server.example.com`
- **THEN** the system SHALL set address to `server.example.com`, port to `5500` (default), and TLS to `false`

#### Scenario: Parse hotline URL with file path

- **WHEN** the user pastes `hotline://server.example.com:5500/folder/subfolder`
- **THEN** the system SHALL extract the address and port, and parse the path components as a file path for navigation after connection
