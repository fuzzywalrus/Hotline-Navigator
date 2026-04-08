## MODIFIED Requirements

### Requirement: Supported MAC algorithms

The system SHALL support the following MAC algorithms for HOPE, listed in preference order (strongest to weakest):

1. **HMAC-SHA256** -- HMAC using SHA-256 (output: 32 bytes)
2. **HMAC-SHA1** -- HMAC using SHA-1 (output: 20 bytes)
3. **SHA1** -- Bare `SHA1(key + message)` concatenation (output: 20 bytes)
4. **HMAC-MD5** -- HMAC using MD5 (output: 16 bytes)
5. **MD5** -- Bare `MD5(key + message)` concatenation (output: 16 bytes)
6. **INVERSE** -- Returns each byte of the key bitwise-NOT'd (ignores message; authentication-only, cannot derive transport keys or AEAD key material)

The client sends all six algorithms in the identification. The server selects one.

Algorithm names are case-insensitive on the wire. The system SHALL parse them by uppercasing before matching.

#### Scenario: Server selects HMAC-SHA256

- **WHEN** the server selects `HMAC-SHA256` from the client's list
- **THEN** the system SHALL use `hmac::Hmac<Sha256>` for MAC computation, producing 32-byte outputs

#### Scenario: Server selects HMAC-SHA1

- **WHEN** the server selects `HMAC-SHA1` from the client's list
- **THEN** the system SHALL use `hmac::Hmac<Sha1>` for MAC computation, producing 20-byte outputs

#### Scenario: Server selects INVERSE

- **WHEN** the server selects `INVERSE`
- **THEN** the system SHALL compute the MAC as `key.iter().map(|b| !b).collect()`, ignoring the message; transport encryption SHALL NOT be activated (INVERSE does not support key derivation); AEAD mode SHALL NOT be activated

#### Scenario: Server selects unknown algorithm

- **WHEN** the server's chosen MAC algorithm name does not match any known algorithm
- **THEN** the probe SHALL fail (return `None`) and the system SHALL fall back to legacy login after reconnecting

### Requirement: HOPE three-step login protocol

The HOPE secure login SHALL consist of three steps performed over the existing connection after the Hotline protocol handshake is complete.

**Step 1 (Client -> Server): HOPE Identification**
The client sends a Login transaction containing:
- `UserLogin` field with a single null byte (`0x00`) to signal HOPE identification
- `HopeMacAlgorithm` field with the client's supported MAC algorithms (encoded as: `<u16:count> [<u8:len> <str:name>]+`)
- `HopeAppId` field: `"HTLN"`
- `HopeAppString` field: `"Hotline Navigator {version}"`
- `HopeClientCipher` field with supported ciphers (`["CHACHA20-POLY1305", "RC4"]`)
- `HopeServerCipher` field with supported ciphers (`["CHACHA20-POLY1305", "RC4"]`)

**Step 2 (Server -> Client): Session Key + Algorithm Selection**
The server replies with:
- `HopeSessionKey` field: exactly 64 bytes of random session key
- `HopeMacAlgorithm` field: the server's chosen MAC algorithm (single selection from the client's list)
- `UserLogin` field: non-empty if the server wants the login to be MAC'd
- `HopeServerCipher` field: the server's chosen cipher for its outbound traffic
- `HopeClientCipher` field: the server's chosen cipher for the client's outbound traffic
- `HopeServerCipherMode` / `HopeClientCipherMode` fields: `"AEAD"` when ChaCha20-Poly1305, `"STREAM"` when RC4
- `HopeServerChecksum` / `HopeClientChecksum` fields: `"AEAD"` when ChaCha20-Poly1305
- `HopeServerCompression` / `HopeClientCompression` fields (optional)

**Step 3 (Client -> Server): Authenticated Login**
The client sends a Login transaction containing:
- `UserLogin`: MAC'd login (if server requested) or XOR-inverted login (if not)
- `UserPassword`: MAC'd password (MAC computed over password bytes using session key)
- `UserIconId`, `UserName`, `VersionNumber` (255), `Capabilities`

This transaction is sent in plaintext. Transport encryption activates immediately after.

#### Scenario: Successful HOPE login with MAC'd credentials

- **WHEN** the HOPE probe succeeds and the server's reply includes a non-empty `UserLogin` field (indicating MAC login is required)
- **THEN** the system SHALL compute `MAC(login_bytes, session_key)` for the login field and `MAC(password_bytes, session_key)` for the password field, using the server's chosen MAC algorithm

#### Scenario: HOPE login without MAC'd login field

- **WHEN** the HOPE probe succeeds but the server's reply has an empty or absent `UserLogin` field
- **THEN** the system SHALL send the login as XOR-inverted bytes (`!byte` for each byte) and the password as `MAC(password_bytes, session_key)`

#### Scenario: HOPE session key wrong size

- **WHEN** the server's HOPE reply contains a `HopeSessionKey` field that is not exactly 64 bytes
- **THEN** the system SHALL treat this as "HOPE not supported" and return `None` from the probe

### Requirement: File transfers are not HOPE-encrypted

File transfers (HTXF protocol on port+1) SHALL use separate TCP connections. When the control connection uses RC4 stream encryption or no HOPE transport, file transfers SHALL NOT be encrypted by HOPE. When the control connection uses AEAD mode (ChaCha20-Poly1305), file transfers SHALL use AEAD encryption as specified in the `hope-chacha20-poly1305` capability.

#### Scenario: File download on RC4 HOPE-encrypted connection

- **WHEN** a file transfer is initiated on a server with active RC4 HOPE transport encryption
- **THEN** the transfer control transactions (request/reply) SHALL go through the encrypted main connection, but the actual file data transfer on port+1 SHALL use a separate plain TCP (or TLS, if the bookmark has `tls: true`) connection without HOPE encryption

#### Scenario: File download on AEAD HOPE-encrypted connection

- **WHEN** a file transfer is initiated on a server with active AEAD HOPE transport encryption
- **THEN** the transfer control transactions SHALL go through the encrypted main connection, and the file data transfer on port+1 SHALL use AEAD encryption with a per-transfer derived key
