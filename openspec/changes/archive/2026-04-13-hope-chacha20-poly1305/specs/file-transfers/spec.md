## MODIFIED Requirements

### Requirement: Download a file via HTXF protocol

The system SHALL download files using a multi-step HTXF protocol:

1. Send a TransactionType::DownloadFile request to obtain a reference_number from the server.
2. Open a separate TCP connection to the server on port+1 (one above the main connection port).
3. Send a 16-byte HTXF handshake containing the magic bytes "HTXF", the reference number, a transfer size of 0, and flags.
4. If the control connection uses AEAD mode, derive a per-transfer ChaCha20-Poly1305 key and wrap the transfer socket in AEAD framing after the handshake.
5. Receive the FILP stream containing the file data (through AEAD framing if applicable, otherwise plaintext).

#### Scenario: Successful file download

- **WHEN** the user initiates a download for a file
- **THEN** the system SHALL request a download reference number, open a TCP connection to the transfer port (server port + 1), send the HTXF handshake with the reference number and transfer size 0, and write the received FILP stream contents to the local download folder

#### Scenario: Download connection timeout

- **WHEN** the transfer TCP connection cannot be established within 10 seconds
- **THEN** the system SHALL mark the transfer as failed and report the timeout to the user

#### Scenario: AEAD-encrypted file download

- **WHEN** the user initiates a download on a connection with active AEAD transport
- **THEN** the system SHALL send the HTXF handshake in plaintext, derive the per-transfer key using HKDF-SHA256 with the reference number as salt, and decrypt the incoming FILP stream using AEAD framing

### Requirement: Upload a file via HTXF protocol

The system SHALL upload files using the HTXF protocol:

1. Send a TransactionType::UploadFile request with the reference number and file size.
2. Open a separate TCP connection to the server on port+1.
3. Send the 16-byte HTXF handshake with the magic bytes "HTXF", the reference number, the transfer size, and flags.
4. If the control connection uses AEAD mode, derive a per-transfer ChaCha20-Poly1305 key and wrap the transfer socket in AEAD framing after the handshake.
5. Send the FILP stream containing the file data (through AEAD framing if applicable, otherwise plaintext).

#### Scenario: Successful file upload

- **WHEN** the user initiates an upload for a local file
- **THEN** the system SHALL request an upload reference, open a TCP connection to the transfer port, send the HTXF handshake with the file size, and transmit the FILP stream to the server

#### Scenario: AEAD-encrypted file upload

- **WHEN** the user initiates an upload on a connection with active AEAD transport
- **THEN** the system SHALL send the HTXF handshake in plaintext, derive the per-transfer key using HKDF-SHA256 with the reference number as salt, and encrypt the outgoing FILP stream using AEAD framing
