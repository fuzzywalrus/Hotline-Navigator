## ADDED Requirements

### Requirement: DropZone component and routing manager

The system SHALL provide a cross-platform drag-and-drop primitive for receiving files dropped onto specific regions of the UI. The primitive consists of a singleton `DropManager` that listens to window-level Tauri drag-drop events and routes them to registered zones, plus a `<DropZone>` React component (and matching `useDropZone` hook) that consumers wrap around drop targets.

The system SHALL hit-test the cursor position against registered zones at drop time, selecting the innermost zone whose bounding rect contains the cursor and whose `accept` filter matches the dropped content.

The `accept` filter SHALL support: `'image'` (MIME prefix `image/*` or known image extensions), `'file'` and `'any'` (any file), or a `string[]` of MIME types or extensions.

The system SHALL pass file *paths* to `onDrop` callbacks, not bytes. Consumers MAY use a helper to read bytes on demand.

The system SHALL support drag-over visual feedback: zones receive a state update when the cursor enters their bounds with a matching drag, and another when it leaves.

#### Scenario: Drop on a registered image zone

- **WHEN** a user drags a `.png` file from the OS and drops it onto a `<DropZone accept="image">`
- **THEN** the zone's `onDrop` SHALL be called with the file's path

#### Scenario: Drop on a non-matching zone

- **WHEN** a user drops a `.txt` file onto a `<DropZone accept="image">`
- **THEN** the zone's `onDrop` SHALL NOT be called (the manager filters by accept)

#### Scenario: Drop on overlapping zones

- **WHEN** zones A and B both register, A is the parent and B is nested inside A, both accept the dropped file, and the cursor at drop time is within B's bounds
- **THEN** only B's `onDrop` SHALL be called (innermost wins)

#### Scenario: Drop with no matching zone

- **WHEN** a file is dropped on a window region with no registered zone or no matching accept filter
- **THEN** no `onDrop` SHALL be called and the drop is silently ignored

### Requirement: Mobile platform behavior

On iOS and Android, the system SHALL NOT register window-level drag-drop event listeners. `DropManager.init()` SHALL be a no-op when `platform()` reports a mobile platform.

The `<DropZone>` component SHALL still render its children correctly on mobile so consumers do not need to platform-fork their component tree. Consumers SHOULD pair drop zones with explicit attach buttons that work on all platforms.

#### Scenario: Mobile boot

- **WHEN** the app initializes on iOS or Android
- **THEN** `DropManager.init()` SHALL return without registering Tauri event listeners

#### Scenario: DropZone on mobile

- **WHEN** a `<DropZone>` is rendered on iOS or Android
- **THEN** the component SHALL render its children normally and SHALL NOT throw

### Requirement: Idempotent initialization

`DropManager.init()` SHALL be safe to call multiple times. Subsequent calls SHALL NOT register additional listeners or create duplicate state.

#### Scenario: React strict-mode double mount

- **WHEN** the app's root effect runs twice (React strict-mode dev behavior)
- **THEN** `DropManager.init()` SHALL only attach listeners on the first call
