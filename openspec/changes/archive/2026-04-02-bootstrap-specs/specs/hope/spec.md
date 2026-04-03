## ADDED Requirements

### Requirement: HOPE opt-in via bookmark

HOPE (Hotline One-time Password Extension) MUST be opt-in on a per-bookmark basis via the `hope` boolean field. The system SHALL NOT auto-probe for HOPE support on unknown servers.

The reason HOPE MUST be opt-in: sending a Login transaction with `UserLogin = 0x00` (the HOPE identification signal) to a non-HOPE server causes that server to treat it as a failed login. Some servers will reject or ban the connecting IP address. This makes blind probing dangerous.

#### Scenario: HOPE enabled on bookmark

- **WHEN** the user enables "Use HOPE" on a bookmark and connects
- **THEN** the system SHALL attempt the HOPE identification probe before falling back to legacy login

#### Scenario: HOPE disabled on bookmark (default)

- **WHEN** the user connects with a bookmark that has `hope: false` (the default)
- **THEN** the system SHALL skip the HOPE probe entirely and proceed directly with legacy XOR-encoded login

#### Scenario: HOPE toggle available in bookmark editors

- **WHEN** the user opens the Edit Bookmark or Add Bookmark dialog
- **THEN** the dialog SHALL include a "Use HOPE" toggle that sets the `hope` field on the bookmark

---

### Requirement: HOPE three-step login protocol

The HOPE secure login consists of three steps performed over the existing connection after the Hotline protocol handshake is complete.

**Step 1 (Client -> Server): HOPE Identification**
The client sends a Login transaction containing:
- `UserLogin` field with a single null byte (`0x00`) to signal HOPE identification
- `HopeMacAlgorithm` field with the client's supported MAC algorithms (encoded as: `<u16:count> [<u8:len> <str:name>]+`)
- `HopeAppId` field: `"HTLN"`
- `HopeAppString` field: `"Hotline Navigator {version}"`
- `HopeClientCipher` field with supported ciphers (currently `["RC4"]`)
- `HopeServerCipher` field with supported ciphers (currently `["RC4"]`)

**Step 2 (Server -> Client): Session Key + Algorithm Selection**
The server replies with:
- `HopeSessionKey` field: exactly 64 bytes of random session key
- `HopeMacAlgorithm` field: the server's chosen MAC algorithm (single selection from the client's list)
- `UserLogin` field: non-empty if the server wants the login to be MAC'd
- `HopeServerCipher` field: the server's chosen cipher for its outbound traffic
- `HopeClientCipher` field: the server's chosen cipher for the client's outbound traffic
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

---

### Requirement: HOPE probe failure and reconnection

If the HOPE probe fails (server does not reply, replies with an error, or returns an invalid session key), the system MUST reconnect to the server before falling back to legacy login. This is because the HOPE identification (sending `UserLogin = 0x00`) poisons the connection on non-HOPE servers -- they treat it as a failed login and consider the connection tainted.

#### Scenario: HOPE probe fails, reconnect and legacy login

- **WHEN** the `try_hope_probe()` returns `None` (server doesn't support HOPE or probe failed)
- **THEN** the system SHALL log a warning ("HOPE probe failed or unsupported, reconnecting for legacy login"), wait 2 seconds (to avoid rate-limiting by the server), call `establish_connection()` to open a fresh TCP/TLS connection and redo the protocol handshake, and then proceed with legacy XOR-encoded login

#### Scenario: HOPE probe send fails

- **WHEN** sending the HOPE identification transaction fails (network error)
- **THEN** the probe SHALL return `None` and the system SHALL reconnect before legacy login

#### Scenario: HOPE probe read fails

- **WHEN** reading the server's HOPE reply fails (server closed connection, timeout)
- **THEN** the probe SHALL return `None` and the system SHALL reconnect before legacy login

---

### Requirement: Supported MAC algorithms

The system SHALL support the following MAC algorithms for HOPE, listed in preference order (strongest to weakest):

1. **HMAC-SHA1** -- HMAC using SHA-1 (output: 20 bytes)
2. **SHA1** -- Bare `SHA1(key + message)` concatenation (output: 20 bytes)
3. **HMAC-MD5** -- HMAC using MD5 (output: 16 bytes)
4. **MD5** -- Bare `MD5(key + message)` concatenation (output: 16 bytes)
5. **INVERSE** -- Returns each byte of the key bitwise-NOT'd (ignores message; authentication-only, cannot derive transport keys)

The client sends all five algorithms in the identification. The server selects one.

Algorithm names are case-insensitive on the wire. The system SHALL parse them by uppercasing before matching.

#### Scenario: Server selects HMAC-SHA1

- **WHEN** the server selects `HMAC-SHA1` from the client's list
- **THEN** the system SHALL use `hmac::Hmac<Sha1>` for MAC computation, producing 20-byte outputs

#### Scenario: Server selects INVERSE

- **WHEN** the server selects `INVERSE`
- **THEN** the system SHALL compute the MAC as `key.iter().map(|b| !b).collect()`, ignoring the message; transport encryption SHALL NOT be activated (INVERSE does not support key derivation)

#### Scenario: Server selects unknown algorithm

- **WHEN** the server's chosen MAC algorithm name does not match any known algorithm
- **THEN** the probe SHALL fail (return `None`) and the system SHALL fall back to legacy login after reconnecting

---

### Requirement: RC4 transport encryption

After a successful HOPE login, if both client and server agreed on the `RC4` cipher, the system SHALL activate packet-aware RC4 transport encryption for the remainder of the connection.

Key derivation:
- `encode_key = MAC(password_bytes, password_mac)` (used by the server to encrypt its outbound packets)
- `decode_key = MAC(password_bytes, encode_key)` (used by the client to encrypt its outbound packets)

The reader is initialized with `encode_key` (to decrypt server traffic) and the writer with `decode_key` (to encrypt client traffic).

#### Scenario: RC4 transport activated after HOPE login

- **WHEN** HOPE negotiation results in `server_cipher = "RC4"` or `client_cipher = "RC4"`, and the MAC algorithm supports transport (`supports_transport()` is true)
- **THEN** the system SHALL derive encode/decode keys, activate encryption on the HopeReader and HopeWriter, and read the login reply through the encrypted reader

#### Scenario: No transport encryption (auth only)

- **WHEN** HOPE negotiation results in both ciphers being `"NONE"`, or the MAC algorithm is `INVERSE`
- **THEN** the system SHALL NOT activate transport encryption; the login reply SHALL be read through the raw (unencrypted) reader; the protocol log SHALL indicate "HOPE secure login active (no transport encryption)"

#### Scenario: RC4 cipher name normalization

- **WHEN** the server sends a cipher name of `"RC4"`, `"RC4-128"`, or `"ARCFOUR"`
- **THEN** the system SHALL normalize all of these to `"RC4"`

---

### Requirement: Key rotation (forward secrecy)

After each encrypted packet, the cipher key MUST be rotated: `new_key = MAC(current_key, session_key)`, and the RC4 cipher MUST be re-initialized with the new key.

The rotation count for a packet is carried in the `flags` field of the transaction (lower 6 bits). Between encrypting/decrypting the first 2 body bytes and the remaining body bytes, the cipher rotates `rotation_count` times.

#### Scenario: Key rotation after each packet

- **WHEN** an encrypted packet is sent or received
- **THEN** the system SHALL apply `rotation_count` key rotations (from the flags byte) between the first 2 body bytes and the remaining body, where each rotation computes `new_key = MAC(current_key, session_key)` and re-initializes RC4

#### Scenario: Key rotation changes RC4 keystream

- **WHEN** the key is rotated
- **THEN** the new key SHALL differ from the previous key, and its length SHALL match the MAC output size (e.g., 20 bytes for HMAC-SHA1)

---

### Requirement: HopeReader and HopeWriter packet-aware encryption

The system SHALL use `HopeReader` and `HopeWriter` wrappers that handle both encrypted and unencrypted communication on the same connection. Before encryption is activated, these wrappers pass bytes through unchanged (`write_raw` / `read_raw`). After activation, they encrypt/decrypt at the transaction (packet) level.

Encryption layout for each transaction:
1. Encrypt/decrypt the 20-byte header
2. Encrypt/decrypt the first 2 bytes of the body
3. Apply key rotation(s) per the rotation count
4. Encrypt/decrypt the remaining body bytes

This is NOT a byte-stream cipher -- each transaction is processed as a discrete unit.

#### Scenario: Encrypted transaction round-trip

- **WHEN** a transaction is written through HopeWriter with encryption active and read through HopeReader with the same key material
- **THEN** the decoded transaction SHALL have the same transaction type, ID, and field data as the original

#### Scenario: Pre-encryption communication

- **WHEN** the connection is in the handshake or HOPE negotiation phase (before encryption is activated)
- **THEN** `write_raw` and `read_raw` SHALL pass bytes through without any transformation

#### Scenario: Rotation count carried in flags

- **WHEN** a transaction with `flags = 1` is encrypted
- **THEN** the writer SHALL apply 1 key rotation between the first 2 body bytes and the rest; the reader SHALL clear the rotation byte from the flags field (reader returns `flags = 0`)

---

### Requirement: Encrypted login reply timing

The authenticated login (Step 3) is sent in plaintext. Transport encryption keys are activated immediately after sending the authenticated login but before reading the server's reply. The server encrypts its login reply.

#### Scenario: Login reply read through encrypted reader

- **WHEN** RC4 transport is negotiated and the authenticated login has been sent
- **THEN** the system SHALL activate encryption on the reader (with `encode_key`) and writer (with `decode_key`) before reading the login reply; the login reply SHALL be read using `self.read_transaction().await` (the encrypted path), not `read_transaction_raw()`

#### Scenario: Login reply read without encryption

- **WHEN** HOPE auth-only mode is active (no RC4 transport)
- **THEN** the login reply SHALL be read using `self.read_transaction_raw().await` (the unencrypted path)

---

### Requirement: File transfers are not HOPE-encrypted

File transfers (HTXF protocol on port+1) use separate TCP connections and are NOT encrypted by HOPE. Only the control-plane transactions on the main connection go through the HOPE-encrypted stream.

#### Scenario: File download on HOPE-encrypted connection

- **WHEN** a file transfer is initiated on a server with active HOPE transport encryption
- **THEN** the transfer control transactions (request/reply) SHALL go through the encrypted main connection, but the actual file data transfer on port+1 SHALL use a separate plain TCP (or TLS, if the bookmark has `tls: true`) connection without HOPE encryption
