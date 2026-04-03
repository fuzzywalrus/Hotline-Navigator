## Purpose

Defines in-app file preview for images, audio, and text files. The current implementation downloads the selected file through the normal transfer path, then reads the downloaded local file back into an inline preview.

## Requirements

### Requirement: Preview image files in-app

The system SHALL display image files of supported formats (PNG, JPG, GIF, BMP, TIFF, WebP, SVG) directly within the application after downloading the selected file to local storage.

#### Scenario: Preview a PNG image

- **WHEN** the user requests a preview of a file detected as PNG
- **THEN** the system SHALL render the image inline in the preview panel

#### Scenario: Preview a GIF image

- **WHEN** the user requests a preview of a file detected as GIF
- **THEN** the system SHALL render the image inline in the preview panel, preserving animation if present


### Requirement: Preview audio files in-app

The system SHALL allow playback of audio files in supported formats (MP3, WAV, OGG/OGA, FLAC, M4A, AAC) directly within the application.

#### Scenario: Play an MP3 file

- **WHEN** the user requests a preview of a file detected as MP3
- **THEN** the system SHALL present an audio player and begin playback

#### Scenario: Play a WAV file

- **WHEN** the user requests a preview of a file detected as WAV
- **THEN** the system SHALL present an audio player and begin playback


### Requirement: Preview text files in-app

The system SHALL display text files in supported formats (TXT, JSON, XML, HTML, CSS, JS) as UTF-8 text within the application.

#### Scenario: Preview a JSON file

- **WHEN** the user requests a preview of a file detected as JSON
- **THEN** the system SHALL display the file contents as UTF-8 text in the preview panel

#### Scenario: Preview a plain text file

- **WHEN** the user requests a preview of a file detected as TXT
- **THEN** the system SHALL display the file contents as UTF-8 text in the preview panel


### Requirement: MIME type detection

The system SHALL detect file types by inspecting magic bytes first. If magic byte detection is inconclusive, the system SHALL fall back to the file extension for type determination.

#### Scenario: Detect type via magic bytes

- **WHEN** a file's leading bytes match a known magic byte signature (e.g., PNG header, JFIF/Exif for JPG)
- **THEN** the system SHALL classify the file by its magic byte match, regardless of file extension

#### Scenario: Fall back to file extension

- **WHEN** a file's magic bytes do not match any known signature
- **THEN** the system SHALL classify the file based on its file extension


### Requirement: Encoding of preview content

Text files SHALL be returned as UTF-8 strings. Binary files (images, audio) SHALL be returned as base64-encoded data.

#### Scenario: Return text file as UTF-8

- **WHEN** the system previews a text-type file
- **THEN** the preview content SHALL be a UTF-8 encoded string

#### Scenario: Return binary file as base64

- **WHEN** the system previews a binary-type file (image or audio)
- **THEN** the preview content SHALL be a base64-encoded string


### Requirement: Navigate between preview images

The system SHALL allow the user to navigate to the previous or next previewable file in the current directory listing while in preview mode.

#### Scenario: Navigate to next previewable file

- **WHEN** the user is previewing a supported file and requests the next item
- **THEN** the system SHALL display the next previewable file in the current directory listing

#### Scenario: Navigate to previous previewable file

- **WHEN** the user is previewing a supported file and requests the previous item
- **THEN** the system SHALL display the previous previewable file in the current directory listing


### Requirement: Error handling for preview

The system SHALL handle missing or corrupt files gracefully during preview.

#### Scenario: Preview a missing file

- **WHEN** the user requests a preview of a file that no longer exists on disk
- **THEN** the system SHALL display an error message indicating the file is unavailable

#### Scenario: Preview a corrupt file

- **WHEN** the user requests a preview of a file whose contents cannot be decoded
- **THEN** the system SHALL display an error message indicating the file could not be previewed


### Requirement: Preview caching

The system SHALL cache previewed file content in memory within the current file browser session so that repeated views of the same file do not require another download or disk read.

#### Scenario: View a previously previewed file

- **WHEN** the user requests a preview of a file that has already been previewed in the current session
- **THEN** the system SHALL serve the preview from cache without re-reading the file


### Requirement: Path validation for preview

The system SHALL only allow previewing files located within permitted directories: the Downloads folder, AppData directory, Home/Downloads, and Documents directory. Files outside these directories MUST be rejected.

#### Scenario: Preview a file in the Downloads directory

- **WHEN** the user requests a preview of a file located in the Downloads directory
- **THEN** the system SHALL allow the preview and display the file content

#### Scenario: Reject preview of a file outside permitted directories

- **WHEN** the user requests a preview of a file located outside all permitted directories
- **THEN** the system SHALL reject the request and display an error indicating the path is not allowed


### Requirement: Preview file reads use direct local I/O

The system SHALL read the downloaded preview file directly from local storage using synchronous file I/O after validating that the path is within an allowed directory. The current implementation does not apply a separate preview-read timeout.

#### Scenario: Preview file is read from an allowed path

- **WHEN** the user previews a file that has been downloaded to an allowed directory
- **THEN** the system SHALL read the file from disk, detect its MIME type, and return either UTF-8 text or base64-encoded binary content
