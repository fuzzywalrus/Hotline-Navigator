## Purpose

Defines file directory navigation, file listing, file info retrieval, search, and path encoding for the Hotline file system.

## Requirements

### Requirement: List files at a path

The system SHALL request a file listing from the server for a given directory path using TransactionType::GetFileNameList. The server response SHALL include each entry's name, size, type code, creator code, and an isFolder flag indicating whether the entry is a directory.

The file list request is asynchronous: the client sends the request and awaits a FileList event response from the server.

#### Scenario: Request root directory listing

- **WHEN** the user opens the file browser without navigating to any subfolder
- **THEN** the system SHALL send a GetFileNameList transaction with an empty path (the FilePath field is omitted entirely) and display the returned entries with their name, size, type, creator, and folder indicator

#### Scenario: Request subfolder listing

- **WHEN** the user navigates into a subfolder
- **THEN** the system SHALL send a GetFileNameList transaction with the encoded path of that subfolder and display the returned entries

#### Scenario: Await async file list response

- **WHEN** a GetFileNameList request has been sent
- **THEN** the system SHALL wait for the corresponding FileList event response before populating the file list UI


### Requirement: Navigate folder hierarchy

The system SHALL allow the user to navigate into subfolders by clicking on a folder entry, and navigate back up via breadcrumb controls or a back action.

#### Scenario: Enter a subfolder

- **WHEN** the user clicks on an entry that has the isFolder flag set
- **THEN** the system SHALL request the file listing for that subfolder path and display the results

#### Scenario: Navigate up via breadcrumb

- **WHEN** the user clicks a parent segment in the breadcrumb path
- **THEN** the system SHALL request the file listing for that ancestor path and display the results

#### Scenario: Navigate up via back action

- **WHEN** the user triggers the back/up navigation action from a subfolder
- **THEN** the system SHALL request the file listing for the parent directory and display the results


### Requirement: File info dialog

The system SHALL retrieve detailed file information from the server using TransactionType::GetFileInfo. The returned information SHALL include creator, modifier dates, comments, size, and type.

#### Scenario: View file info

- **WHEN** the user requests info for a specific file entry
- **THEN** the system SHALL send a GetFileInfo transaction and display the returned creator, modifier dates, comments, size, and type in a dialog


### Requirement: Update file info

The system SHALL allow updating a file's name and comment on the server using TransactionType::SetFileInfo.

#### Scenario: Rename a file

- **WHEN** the user changes the file name in the file info dialog and confirms
- **THEN** the system SHALL send a SetFileInfo transaction with the new name and refresh the file listing

#### Scenario: Update a file comment

- **WHEN** the user changes the comment field in the file info dialog and confirms
- **THEN** the system SHALL send a SetFileInfo transaction with the updated comment


### Requirement: Search files across cached directories

The system SHALL support searching for files by name across all directory paths that have been previously fetched and cached.

#### Scenario: Search with matching results

- **WHEN** the user enters a search query that matches one or more cached file names
- **THEN** the system SHALL display all matching entries from the cached directory listings

#### Scenario: Search with no results

- **WHEN** the user enters a search query that matches no cached file names
- **THEN** the system SHALL display an empty result set


### Requirement: Path encoding

The system SHALL encode folder path components using MacRoman encoding (via encoding_rs). Characters that cannot be mapped to MacRoman SHALL fall back to UTF-8 encoding.

The wire format for a path SHALL be: a u16 count of path components, followed by each component encoded as 2 bytes of zero padding, 1 byte for the data length, and then the encoded data bytes.

#### Scenario: Encode a path with MacRoman-compatible characters

- **WHEN** a folder path contains characters representable in MacRoman
- **THEN** the system SHALL encode each path component using MacRoman and assemble the wire format with the correct count, padding, length, and data

#### Scenario: Encode a path with non-MacRoman characters

- **WHEN** a folder path contains characters not representable in MacRoman
- **THEN** the system SHALL fall back to UTF-8 encoding for those path components

#### Scenario: Truncate overlong folder names

- **WHEN** a folder name exceeds 255 bytes after encoding
- **THEN** the system SHALL truncate the encoded name to 255 bytes

#### Scenario: Encode root path

- **WHEN** the target path is the root directory
- **THEN** the system SHALL omit the FilePath field entirely from the transaction


### Requirement: Custom download folder selection

The system SHALL allow the user to choose a custom download folder via the native OS file picker. This capability is not available on mobile platforms.

#### Scenario: Select custom download folder on desktop

- **WHEN** the user activates the download folder selection on a desktop platform
- **THEN** the system SHALL open the native file picker dialog and persist the selected folder as the download destination

#### Scenario: Download folder selection unavailable on mobile

- **WHEN** the user is on a mobile platform
- **THEN** the system SHALL NOT offer the custom download folder selection option
