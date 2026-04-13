# hope-chacha20-poly1305 Specification

## Purpose
TBD - created by archiving change hope-chacha20-poly1305. Update Purpose after archive.
## Requirements
### Requirement: ChaCha20-Poly1305 AEAD cipher negotiation

The system SHALL advertise `CHACHA20-POLY1305` as a supported cipher in both `HopeClientCipher` and `HopeServerCipher` fields during HOPE Step 1 (identification). The cipher name SHALL be listed alongside `RC4` in the cipher arrays.

When the server selects `CHACHA20-POLY1305`, the system SHALL expect the following fields in the Step 2 reply:
- `HopeServerCipherMode` (0x0EC3): `"AEAD"` (4 ASCII bytes)
- `HopeClientCipherMode` (0x0EC4): `"AEAD"` (4 ASCII bytes)
- `HopeServerChecksum` (0x0EC7): `"AEAD"` (4 ASCII bytes)
- `HopeClientChecksum` (0x0EC8): `"AEAD"` (4 ASCII bytes)

The system SHALL normalize cipher name variants `CHACHA20POLY1305` and `CHACHA20` to the canonical form `CHACHA20-POLY1305`.

#### Scenario: Server selects ChaCha20-Poly1305

- **WHEN** the server replies to the HOPE probe with `HopeServerCipher = "CHACHA20-POLY1305"` and `HopeClientCipher = "CHACHA20-POLY1305"`
- **THEN** the system SHALL activate AEAD transport encryption after Step 3 using ChaCha20-Poly1305 framing

#### Scenario: Server does not support ChaCha20-Poly1305

- **WHEN** the server selects `RC4` (ignoring `CHACHA20-POLY1305` from the client's list)
- **THEN** the system SHALL fall back to RC4 stream encryption as before

#### Scenario: Cipher name normalization

- **WHEN** the server sends a cipher name of `"CHACHA20POLY1305"` or `"CHACHA20"`
- **THEN** the system SHALL normalize it to `"CHACHA20-POLY1305"` and proceed with AEAD mode

### Requirement: HMAC-SHA256 MAC algorithm

The system SHALL support `HMAC-SHA256` as a MAC algorithm for HOPE. It SHALL be listed as the highest-preference algorithm in the identification, before HMAC-SHA1.

HMAC-SHA256 produces 32-byte outputs, which natively match the ChaCha20-Poly1305 key size without truncation.

The wire name SHALL be `"HMAC-SHA256"` (case-insensitive parsing).

#### Scenario: Server selects HMAC-SHA256

- **WHEN** the server selects `HMAC-SHA256` from the client's MAC algorithm list
- **THEN** the system SHALL use `hmac::Hmac<Sha256>` for all MAC computations, producing 32-byte outputs

#### Scenario: HMAC-SHA256 with RC4

- **WHEN** the server selects `HMAC-SHA256` as the MAC but `RC4` as the cipher
- **THEN** the system SHALL use HMAC-SHA256 for key derivation and RC4 for transport (HMAC-SHA256 is not exclusive to AEAD mode)

### Requirement: HKDF-SHA256 key expansion for AEAD

When ChaCha20-Poly1305 is negotiated, the system SHALL expand MAC-derived keys to 256-bit (32-byte) keys using HKDF-SHA256.

Key derivation:
1. `password_mac = MAC(key=password_bytes, msg=session_key)`
2. `encode_key = MAC(key=password_bytes, msg=password_mac)`
3. `decode_key = MAC(key=password_bytes, msg=encode_key)`
4. `encode_key_256 = HKDF-SHA256(ikm=encode_key, salt=session_key, info="hope-chacha-encode")`
5. `decode_key_256 = HKDF-SHA256(ikm=decode_key, salt=session_key, info="hope-chacha-decode")`

The server uses `encode_key_256` for its outbound traffic; the client uses `decode_key_256` for its outbound traffic. Each side decrypts with the other's key.

INVERSE MAC SHALL NOT be used with AEAD mode because it cannot produce cryptographic key material suitable for HKDF.

#### Scenario: HKDF key expansion with HMAC-SHA256

- **WHEN** AEAD mode is negotiated with HMAC-SHA256 as the MAC
- **THEN** the system SHALL derive 32-byte encode and decode keys using HKDF-SHA256 with `session_key` as salt and direction-specific info strings

#### Scenario: HKDF key expansion with HMAC-SHA1

- **WHEN** AEAD mode is negotiated with HMAC-SHA1 as the MAC (producing 20-byte keys)
- **THEN** the system SHALL expand the 20-byte MAC outputs to 32-byte keys using HKDF-SHA256

#### Scenario: INVERSE MAC with AEAD rejected

- **WHEN** the server selects `INVERSE` MAC and `CHACHA20-POLY1305` cipher
- **THEN** the system SHALL treat this as an invalid negotiation, log an error, and fall back to legacy login after reconnecting

### Requirement: AEAD framed transport

When ChaCha20-Poly1305 is the negotiated cipher, the system SHALL use length-prefixed AEAD frames for all transport after encryption is activated.

Frame structure:
```
+-------------------+-------------------------------+
| Length (4 bytes)   | Ciphertext + Tag             |
| big-endian uint32  | (variable + 16 bytes)        |
+-------------------+-------------------------------+
```

- The length field is a 4-byte big-endian unsigned integer encoding the size of the ciphertext including the 16-byte Poly1305 tag
- The length field itself is not encrypted and not authenticated
- Each Hotline transaction (header + body) SHALL be sealed as a single AEAD frame

The system SHALL enforce a maximum frame size of 16 MiB (16,777,216 bytes). Frames exceeding this limit SHALL cause the connection to be closed.

#### Scenario: Encrypt and send a transaction

- **WHEN** a transaction is sent through the AEAD writer
- **THEN** the system SHALL serialize the transaction (header + body), seal it with ChaCha20-Poly1305 producing ciphertext + 16-byte tag, write the 4-byte big-endian length prefix, then write the sealed ciphertext

#### Scenario: Receive and decrypt a transaction

- **WHEN** a frame is received through the AEAD reader
- **THEN** the system SHALL read the 4-byte length, read that many bytes of ciphertext + tag, open (decrypt + verify) the sealed data, and parse the resulting plaintext as a Hotline transaction

#### Scenario: Authentication tag verification failure

- **WHEN** a received frame fails Poly1305 tag verification (tampered or corrupted data)
- **THEN** the system SHALL close the connection and report a decryption error

#### Scenario: Oversized frame rejected

- **WHEN** a received frame has a length field exceeding 16 MiB
- **THEN** the system SHALL close the connection and report a protocol error

### Requirement: Deterministic nonce construction

The system SHALL construct 12-byte nonces for ChaCha20-Poly1305 using the following structure:

```
Byte:  0        1-3      4-11
      +--------+--------+------------------+
      |  dir   | 0x0000 | counter (BE u64) |
      +--------+--------+------------------+
```

- `dir`: `0x00` for server-to-client, `0x01` for client-to-server
- Bytes 1-3: zero padding
- Bytes 4-11: big-endian 64-bit unsigned counter, incrementing from 0

Each direction SHALL maintain its own counter. The direction byte prevents nonce reuse even if counters align.

#### Scenario: First client-to-server frame

- **WHEN** the client sends its first AEAD frame after encryption activation
- **THEN** the nonce SHALL be `[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]`

#### Scenario: Counter increment

- **WHEN** the client sends its second AEAD frame
- **THEN** the send counter SHALL increment to 1 and the nonce SHALL be `[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]`

#### Scenario: Independent direction counters

- **WHEN** the client has sent 5 frames and received 3 frames
- **THEN** the client's send counter SHALL be 5 and its receive counter SHALL be 3, each used independently for nonce construction

### Requirement: AEAD-encrypted HTXF file transfers

When the control connection uses AEAD mode, HTXF file transfers SHALL also use ChaCha20-Poly1305 encryption.

Base key derivation:
```
ft_base_key = HKDF-SHA256(
    ikm  = encode_key_256 || decode_key_256,
    salt = session_key,
    info = "hope-file-transfer"
)
```

Per-transfer key derivation:
```
transfer_key = HKDF-SHA256(
    ikm  = ft_base_key,
    salt = ref_number_bytes,     // 4 bytes, big-endian
    info = "hope-ft-ref"
)
```

The HTXF handshake (magic bytes, reference number, transfer size) SHALL remain in plaintext. Encryption SHALL begin immediately after handshake validation. Subsequent data (FFO headers, fork data, folder actions) SHALL use the same AEAD frame structure and nonce construction as control connections, with direction bytes following the same convention.

Both client and server SHALL derive the same `transfer_key` from the shared base key and the 4-byte reference number.

#### Scenario: Encrypted file download

- **WHEN** a file download is initiated on a connection with active AEAD transport
- **THEN** the system SHALL send the HTXF handshake in plaintext, derive the transfer key from the reference number, and decrypt the incoming FILP stream using AEAD framing with the transfer key

#### Scenario: Encrypted file upload

- **WHEN** a file upload is initiated on a connection with active AEAD transport
- **THEN** the system SHALL send the HTXF handshake in plaintext, derive the transfer key from the reference number, and encrypt the outgoing FILP stream using AEAD framing with the transfer key

#### Scenario: Non-AEAD connection file transfer

- **WHEN** a file transfer is initiated on a connection using RC4 or no HOPE transport
- **THEN** file transfers SHALL remain unencrypted (existing behavior unchanged)

