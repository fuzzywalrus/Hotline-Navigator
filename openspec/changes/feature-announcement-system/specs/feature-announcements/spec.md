## ADDED Requirements

### Requirement: Announcement registry

The system SHALL maintain a registry of feature announcements as a static array. Each announcement entry SHALL contain:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (kebab-case, e.g., `mnemosyne-search`, `v3-trackers`) |
| `order` | number | Sort priority (higher = newer/more important) |
| `title` | string | Modal header text |
| `body` | string | Modal body text (plain text or simple inline markup) |
| `acceptLabel` | string | Text for the accept/action button |
| `dismissLabel` | string | Text for the dismiss button (defaults to "Not Now") |
| `onAccept` | async function | Action to perform when user clicks accept |
| `condition` | function | Returns true if this announcement should be shown (checked at runtime after data loads) |

#### Scenario: Registry defines mnemosyne-search entry

- **WHEN** the announcement registry is loaded
- **THEN** it SHALL contain an entry with id `mnemosyne-search`, order `1`, title "Enable Server Search", and a condition that returns true only when no mnemosyne bookmarks exist

#### Scenario: Registry defines v3-trackers entry

- **WHEN** the announcement registry is loaded
- **THEN** it SHALL contain an entry with id `v3-trackers`, order `2`, title "V3 Trackers Available!", body containing "Hotline Navigator now supports V3 Trackers! These allow servers to broadcast features like TLS + HOPE (encryption) and domain names instead of IPs. Start experiencing the future!", acceptLabel "Add V3 Trackers", and a condition that returns true only when neither `track.bigredh.com` nor `tracker.vespernet.net` exists in the bookmarks list

### Requirement: Announcement dismissed state persistence

The system SHALL persist dismissed announcement IDs in localStorage under the key `feature-announcements-dismissed` as a JSON-serialized array of strings.

#### Scenario: Dismiss an announcement

- **WHEN** a user dismisses or accepts an announcement with id `v3-trackers`
- **THEN** the system SHALL add `v3-trackers` to the `feature-announcements-dismissed` array in localStorage

#### Scenario: Load dismissed state on startup

- **WHEN** the announcement manager initializes
- **THEN** the system SHALL read the `feature-announcements-dismissed` key from localStorage and parse it as a JSON array of strings; if the key does not exist or contains invalid JSON, the system SHALL treat the dismissed list as empty

#### Scenario: Previously dismissed announcement stays dismissed

- **WHEN** the announcement manager evaluates announcements and `mnemosyne-search` is in the dismissed array
- **THEN** the `mnemosyne-search` announcement SHALL NOT be shown regardless of its condition result

### Requirement: Legacy search prompt migration

The system SHALL migrate the legacy `mnemosyne-search-prompt-seen` localStorage key into the new dismissed state format on first run.

#### Scenario: Migrate existing dismissed search prompt

- **WHEN** the announcement manager initializes and `mnemosyne-search-prompt-seen` is set to `'true'` in localStorage
- **THEN** the system SHALL add `mnemosyne-search` to the `feature-announcements-dismissed` array if not already present

#### Scenario: No legacy key present

- **WHEN** the announcement manager initializes and `mnemosyne-search-prompt-seen` does not exist in localStorage
- **THEN** the system SHALL not modify the dismissed array for the `mnemosyne-search` entry

### Requirement: New install detection

The system SHALL detect new installations and skip all announcements for them. A new install is defined as one where `localStorage.getItem('hotline-preferences')` returns `null`.

#### Scenario: New install sees no announcements

- **WHEN** the announcement manager initializes and `hotline-preferences` does not exist in localStorage
- **THEN** the system SHALL NOT show any announcements, regardless of registry conditions

#### Scenario: Existing install evaluates announcements

- **WHEN** the announcement manager initializes and `hotline-preferences` exists in localStorage
- **THEN** the system SHALL proceed to evaluate announcement conditions

### Requirement: Announcement queue evaluation

The system SHALL evaluate the announcement queue after bookmarks have loaded from the backend. The evaluation SHALL filter the registry to only pending announcements (not dismissed, condition returns true), sort by order descending (newest first), and cap at a maximum of 5 pending announcements.

#### Scenario: Filter dismissed and condition-false announcements

- **WHEN** the registry contains 3 announcements, 1 is dismissed and 1 has a condition returning false
- **THEN** the queue SHALL contain only the 1 remaining announcement

#### Scenario: Cap at 5 pending announcements

- **WHEN** the registry contains 8 announcements and all are pending (not dismissed, conditions true)
- **THEN** the queue SHALL contain only the 5 with the highest order values

#### Scenario: Evaluation waits for bookmarks to load

- **WHEN** the announcement manager mounts but bookmarks have not yet loaded from the Rust backend
- **THEN** the system SHALL NOT evaluate conditions until the bookmarks store state updates with loaded data

### Requirement: Sequential announcement display

The system SHALL show pending announcements one at a time. When the user dismisses or accepts the current announcement, the next one in the queue SHALL be shown.

#### Scenario: Show first announcement

- **WHEN** the queue contains announcements [v3-trackers, mnemosyne-search] (sorted by order descending)
- **THEN** the system SHALL show the v3-trackers announcement first

#### Scenario: Advance to next after dismiss

- **WHEN** the user clicks "Not Now" on the current announcement and more announcements remain in the queue
- **THEN** the system SHALL mark the current announcement as dismissed and show the next one

#### Scenario: Advance to next after accept

- **WHEN** the user clicks the accept button on the current announcement and more announcements remain in the queue
- **THEN** the system SHALL run the onAccept handler, mark the announcement as dismissed, and show the next one

#### Scenario: Queue exhausted

- **WHEN** the user dismisses or accepts the last announcement in the queue
- **THEN** the system SHALL close the modal and not show any further announcements

### Requirement: Announcement modal UI

The system SHALL render announcements as a modal overlay with fade-in/fade-out animation, matching the visual style of the existing app modals.

#### Scenario: Modal displays announcement content

- **WHEN** an announcement is shown
- **THEN** the modal SHALL display the announcement's title in the header, body text in the content area, the dismiss button (using dismissLabel) on the left of the footer, and the accept button (using acceptLabel) on the right of the footer

#### Scenario: Modal dismiss via Escape key

- **WHEN** the user presses Escape while an announcement modal is visible
- **THEN** the system SHALL dismiss the current announcement (same as clicking the dismiss button)

#### Scenario: Modal dismiss via backdrop click

- **WHEN** the user clicks the backdrop (outside the modal content) while an announcement modal is visible
- **THEN** the system SHALL dismiss the current announcement

### Requirement: v3 trackers accept action

When the user accepts the v3-trackers announcement, the system SHALL add both `track.bigredh.com` and `tracker.vespernet.net` as tracker bookmarks via the Tauri `save_bookmark` command.

#### Scenario: Add both v3 tracker bookmarks

- **WHEN** the user clicks "Add V3 Trackers" on the v3-trackers announcement
- **THEN** the system SHALL invoke `save_bookmark` for each tracker: `track.bigredh.com` on port 5498 with bookmark_type Tracker and id `default-tracker-bigredh`, and `tracker.vespernet.net` on port 5498 with bookmark_type Tracker and id `default-tracker-vespernet`

#### Scenario: Skip tracker that already exists

- **WHEN** the user accepts the v3-trackers announcement but `track.bigredh.com` was manually added since the condition was evaluated
- **THEN** the system SHALL still invoke save_bookmark for both (the backend handles upsert by ID)

### Requirement: Mnemosyne search accept action

When the user accepts the mnemosyne-search announcement, the system SHALL add the vespernet.net mnemosyne bookmark via the app store.

#### Scenario: Add mnemosyne search bookmark

- **WHEN** the user clicks "Add Search" on the mnemosyne-search announcement
- **THEN** the system SHALL call `addMnemosyneBookmark` with id `default-mnemosyne-vespernet`, name `vespernet.net`, and url `http://tracker.vespernet.net:8980`
