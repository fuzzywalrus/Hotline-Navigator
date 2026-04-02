## ADDED Requirements

### Requirement: Mnemosyne Instance Bookmarks

Mnemosyne search instances SHALL be stored as bookmarks and displayed in the tracker list with a purple search icon.

#### Scenario: Display Mnemosyne bookmark in tracker list

- **WHEN** the tracker/bookmark list is rendered and a Mnemosyne instance bookmark exists
- **THEN** the system SHALL display it with a purple search icon to distinguish it from tracker and server bookmarks

#### Scenario: Default Mnemosyne instance on new installation

- **WHEN** the application is installed for the first time with no existing bookmarks
- **THEN** a default Mnemosyne instance for vespernet.net SHALL be pre-configured

#### Scenario: Persist Mnemosyne bookmarks

- **WHEN** Mnemosyne bookmarks are created or removed
- **THEN** the system SHALL persist them in localStorage under the mnemosyne-bookmarks key

---

### Requirement: Mnemosyne Bookmark Management

The system SHALL support adding and removing Mnemosyne instance bookmarks.

#### Scenario: Add a Mnemosyne instance

- **WHEN** the user adds a new Mnemosyne instance by providing a name and URL
- **THEN** the system SHALL save the instance as a bookmark and display it in the tracker list

#### Scenario: URL normalization on add

- **WHEN** the user provides a URL without a protocol prefix (e.g., "vespernet.net" instead of "http://vespernet.net")
- **THEN** the system SHALL prepend http:// to the URL before saving

#### Scenario: Connection health check on add

- **WHEN** the user adds a new Mnemosyne instance via the Add dialog
- **THEN** the system SHALL send a GET request to /api/v1/health to verify the instance is reachable before saving

#### Scenario: Remove a Mnemosyne instance

- **WHEN** the user removes a Mnemosyne instance bookmark
- **THEN** the system SHALL delete it from the persisted bookmark list

---

### Requirement: Search Tab Activation

The search header button SHALL open a Mnemosyne search tab. The button SHALL be hidden when no Mnemosyne instances are configured.

#### Scenario: Show search button when instances exist

- **WHEN** at least one Mnemosyne instance bookmark exists
- **THEN** the system SHALL display the search button in the header

#### Scenario: Hide search button when no instances exist

- **WHEN** no Mnemosyne instance bookmarks are configured
- **THEN** the system SHALL hide the search button in the header

#### Scenario: Open search tab

- **WHEN** the user clicks the search button for a Mnemosyne instance
- **THEN** the system SHALL open a tab with type 'mnemosyne' and a mnemosyneId field identifying the instance

#### Scenario: Tab deduplication

- **WHEN** the user attempts to open a search tab for a Mnemosyne instance that already has an open tab
- **THEN** the system SHALL focus the existing tab instead of opening a duplicate

---

### Requirement: Mnemosyne Empty State

When the search tab is opened without a query, the system SHALL display aggregate statistics from the Mnemosyne instance.

#### Scenario: Fetch and display stats on empty state

- **WHEN** a Mnemosyne search tab is opened and no search query has been entered
- **THEN** the system SHALL send GET /api/v1/stats and display the indexed server count, file count, post count, and article count

---

### Requirement: Mnemosyne Search Execution

The system SHALL support searching across indexed Hotline servers via the Mnemosyne API.

Search queries SHALL be submitted only when the user presses Enter, not on each keystroke.

#### Scenario: Execute search on Enter

- **WHEN** the user types a query in the search field and presses Enter
- **THEN** the system SHALL send GET /api/v1/search?q=...&type=...&limit=20 and display the results

#### Scenario: No search on keystroke

- **WHEN** the user types characters in the search field without pressing Enter
- **THEN** the system SHALL NOT send a search request

#### Scenario: Display search results

- **WHEN** search results are returned from the API
- **THEN** each result SHALL display a type label (File, Board, or News), a content preview, the source server name, and relevant metadata

---

### Requirement: Search Result Filtering

The system SHALL support filtering search results by content type.

#### Scenario: Filter by type

- **WHEN** the user selects a type filter (All, Board, News, or Files) using the toggle buttons
- **THEN** the system SHALL display only results matching the selected type, or all results if "All" is selected

---

### Requirement: Connect to Source Server from Results

The system SHALL allow the user to connect to the source Hotline server of a search result.

#### Scenario: Reveal Connect button on hover

- **WHEN** the user hovers over a search result entry
- **THEN** the system SHALL reveal a Connect button

#### Scenario: Connect to server as guest

- **WHEN** the user clicks the Connect button on a search result
- **THEN** the system SHALL initiate a connection to the source Hotline server as a guest

---

### Requirement: CORS Bypass via Tauri Command

All Mnemosyne HTTP requests SHALL be routed through the Rust-side mnemosyne_fetch Tauri command to bypass CORS restrictions.

The mnemosyne_fetch command SHALL use reqwest with a 10-second timeout.

#### Scenario: HTTP request via backend

- **WHEN** the frontend needs to make an HTTP request to a Mnemosyne API endpoint
- **THEN** the system SHALL invoke the mnemosyne_fetch Tauri command, which performs the request server-side using reqwest

#### Scenario: Request timeout

- **WHEN** a Mnemosyne API request does not complete within 10 seconds
- **THEN** the mnemosyne_fetch command SHALL abort the request and return a timeout error

---

### Requirement: Rate Limiting

The Mnemosyne API enforces a rate limit of 120 requests per minute per IP address. The system SHALL handle rate limit responses gracefully.

#### Scenario: Rate limit exceeded

- **WHEN** the Mnemosyne API returns HTTP 429 (Too Many Requests)
- **THEN** the system SHALL display a user-friendly rate limit error message and a retry button

#### Scenario: Retry after rate limit

- **WHEN** the user clicks the retry button after a rate limit error
- **THEN** the system SHALL re-send the previous request
