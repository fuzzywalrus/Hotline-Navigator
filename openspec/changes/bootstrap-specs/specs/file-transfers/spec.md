## ADDED Requirements

### Requirement: Download a file via HTXF protocol

The system SHALL download files using a multi-step HTXF protocol:

1. Send a TransactionType::DownloadFile request to obtain a reference_number from the server.
2. Open a separate TCP connection to the server on port+1 (one above the main connection port).
3. Send a 16-byte HTXF handshake containing the magic bytes "HTXF", the reference number, a transfer size of 0, and flags.
4. Receive the FILP stream containing the file data.

#### Scenario: Successful file download

- **WHEN** the user initiates a download for a file
- **THEN** the system SHALL request a download reference number, open a TCP connection to the transfer port (server port + 1), send the HTXF handshake with the reference number and transfer size 0, and write the received FILP stream contents to the local download folder

#### Scenario: Download connection timeout

- **WHEN** the transfer TCP connection cannot be established within 10 seconds
- **THEN** the system SHALL mark the transfer as failed and report the timeout to the user

---

### Requirement: Upload a file via HTXF protocol

The system SHALL upload files using the HTXF protocol:

1. Send a TransactionType::UploadFile request with the reference number and file size.
2. Open a separate TCP connection to the server on port+1.
3. Send the 16-byte HTXF handshake with the magic bytes "HTXF", the reference number, the transfer size, and flags.
4. Send the FILP stream containing the file data.

#### Scenario: Successful file upload

- **WHEN** the user initiates an upload for a local file
- **THEN** the system SHALL request an upload reference, open a TCP connection to the transfer port, send the HTXF handshake with the file size, and transmit the FILP stream to the server

---

### Requirement: FILP stream structure

The FILP stream SHALL wrap file data in typed forks. Each fork has a 16-byte header containing the fork type and size. The supported fork types are:

- **DATA** fork: the file content bytes
- **INFO** fork: file metadata
- **MACR** fork: classic Macintosh resource fork data

#### Scenario: Receive a file with DATA and INFO forks

- **WHEN** the system receives a FILP stream during download
- **THEN** the system SHALL parse each fork header, extract the DATA fork as the file content, and extract the INFO fork as metadata

#### Scenario: Send a file with DATA fork

- **WHEN** the system sends a FILP stream during upload
- **THEN** the system SHALL construct the stream with a DATA fork containing the file content and the appropriate 16-byte fork header

---

### Requirement: Transfer progress tracking

The system SHALL track and display progress for each file transfer, including percentage complete and transfer speed. Each transfer SHALL have one of the following states: active, completed, failed, or cancelled.

#### Scenario: Display progress during download

- **WHEN** a download is in progress
- **THEN** the system SHALL display the current percentage complete and the transfer speed

#### Scenario: Transfer completes successfully

- **WHEN** all bytes of a transfer have been received or sent
- **THEN** the system SHALL mark the transfer state as completed

#### Scenario: Transfer fails

- **WHEN** a transfer encounters a network error or per-chunk data timeout
- **THEN** the system SHALL mark the transfer state as failed and report the error

---

### Requirement: Large file support (greater than 4 GB)

The system SHALL support files larger than 4 GB through capability negotiation during login. The client advertises large file support via the DATA_CAPABILITIES field (0x01F0) with bit 0 set. When both client and server agree on large file support:

- FileSize64 fields SHALL be used for file sizes.
- The HTXF handshake flags SHALL include HTXF_FLAG_LARGE_FILE (0x01) and HTXF_FLAG_SIZE64 (0x02), with 8 extra bytes appended for the 64-bit length.
- Fork headers in large mode SHALL reinterpret bytes 4-7 as the high 32 bits and bytes 12-15 as the low 32 bits of the 64-bit fork size.

#### Scenario: Negotiate large file support

- **WHEN** the client connects and both client and server advertise large file capability (DATA_CAPABILITIES bit 0)
- **THEN** the system SHALL use 64-bit file sizes and the extended HTXF handshake format for all subsequent transfers

#### Scenario: Fall back to 32-bit mode with legacy server

- **WHEN** the client connects to a server that does not advertise large file capability
- **THEN** the system SHALL use standard 32-bit file sizes and the original HTXF handshake format, maintaining backward compatibility

#### Scenario: Download a file larger than 4 GB

- **WHEN** large file support is negotiated and the user downloads a file exceeding 4 GB
- **THEN** the system SHALL use the extended handshake with HTXF_FLAG_LARGE_FILE and HTXF_FLAG_SIZE64 flags, and correctly parse 64-bit fork sizes from the FILP stream

---

### Requirement: TLS on transfer port

When the main server connection uses TLS, the transfer connection SHALL also use TLS with the same TLS and legacy-TLS settings as the main connection.

#### Scenario: Transfer over TLS

- **WHEN** the main connection to the server is TLS-encrypted
- **THEN** the system SHALL establish the transfer TCP connection on port+1 and wrap it with TLS using the same configuration as the main connection

#### Scenario: Transfer over plain TCP

- **WHEN** the main connection to the server is unencrypted
- **THEN** the system SHALL establish the transfer TCP connection on port+1 as a plain TCP connection

---

### Requirement: Transfer list UI

The system SHALL display a list of all file transfers across all connected servers. The user SHALL be able to view active, completed, failed, and cancelled transfers, and clear completed transfers from the list.

#### Scenario: View all transfers

- **WHEN** the user opens the transfer list
- **THEN** the system SHALL display all transfers from all connected servers with their current state

#### Scenario: Clear completed transfers

- **WHEN** the user requests to clear completed transfers
- **THEN** the system SHALL remove all transfers in the completed state from the list

---

### Requirement: Cancel in-progress transfers

The system SHALL allow the user to cancel any transfer that is currently in the active state.

#### Scenario: Cancel a download

- **WHEN** the user cancels an active download
- **THEN** the system SHALL close the transfer connection and mark the transfer state as cancelled

#### Scenario: Cancel an upload

- **WHEN** the user cancels an active upload
- **THEN** the system SHALL close the transfer connection and mark the transfer state as cancelled
