# HOPE Implementation Reference

Map of all HOPE-related code in the Rust backend. This document is for developers working on enabling or extending HOPE support.

## Status

HOPE is implemented and available as an opt-in path. The client only attempts the HOPE probe when the bookmark has `hope=true`, because sending a HOPE identification to a non-HOPE server poisons the connection and requires a reconnect before legacy login can proceed.

Current behavior:

- If `bookmark.hope` is `false`, the client uses legacy Hotline login.
- If `bookmark.hope` is `true`, the client sends the HOPE identification probe.
- If the probe fails or the server does not return a valid HOPE reply, the client reconnects and falls back to legacy login.
- If the probe succeeds, the client performs HOPE authenticated login and activates transport encryption when RC4 was negotiated.

See [HOPE_JANUS_INTEROP.md](HOPE_JANUS_INTEROP.md) for the step-by-step sequence that currently interoperates with Janus-family servers.

## File Overview

| File | Purpose |
|------|---------|
| `protocol/client/hope.rs` | MAC algorithms, encoding/decoding helpers, negotiation types |
| `protocol/client/hope_stream.rs` | RC4 cipher, HopeReader/HopeWriter transport wrappers |
| `protocol/client/mod.rs` | Login flow, HOPE probe, encryption activation, receive loop |
| `protocol/constants.rs` | HOPE field type IDs (0x0E01–0x0ECA) |
| `Cargo.toml` | Crypto dependencies (hmac, sha1, md-5) |

## Detailed Code Locations

### `protocol/constants.rs` — Field Type Definitions

Lines 221–235: Fourteen `FieldType` enum variants for HOPE protocol fields.

```
HopeAppId          = 3585  (0x0E01)   App identifier ("HTLN")
HopeAppString      = 3586  (0x0E02)   App name/version string
HopeSessionKey     = 3587  (0x0E03)   64-byte session key from server
HopeMacAlgorithm   = 3588  (0x0E04)   MAC algorithm list/selection
HopeServerCipher   = 3777  (0x0EC1)   Server→client cipher
HopeClientCipher   = 3778  (0x0EC2)   Client→server cipher
HopeServerCipherMode = 3779 (0x0EC3)  Server cipher mode
HopeClientCipherMode = 3780 (0x0EC4)  Client cipher mode
HopeServerIV       = 3781  (0x0EC5)   Server initialization vector
HopeClientIV       = 3782  (0x0EC6)   Client initialization vector
HopeServerChecksum = 3783  (0x0EC7)   Server checksum
HopeClientChecksum = 3784  (0x0EC8)   Client checksum
HopeServerCompression = 3785 (0x0EC9) Server compression algorithm
HopeClientCompression = 3786 (0x0ECA) Client compression algorithm
```

Lines 305–318: Matching `From<u16>` arms so these field IDs decode correctly instead of falling through to `ErrorText`.

### `protocol/client/hope.rs` — Crypto Module

- **`MacAlgorithm` enum** — `HmacSha1`, `Sha1`, `HmacMd5`, `Md5`, `Inverse`. Each has a `wire_name()` for protocol encoding and `supports_transport()` to indicate whether it can derive encryption keys (Inverse cannot).
- **`PREFERRED_MAC_ALGORITHMS`** — Ordered list sent during HOPE identification (strongest first).
- **`SUPPORTED_CIPHERS`** — Currently `["RC4"]`.
- **`compute_mac(algorithm, key, message) -> Vec<u8>`** — Dispatches to the appropriate crypto implementation. Used for password authentication (step 3), key derivation, and key rotation.
- **`encode_algorithm_list()` / `encode_cipher_list()`** — Encode lists into HOPE wire format: `<u16:count> [<u8:len> <str:name>]+`.
- **`decode_algorithm_selection()` / `decode_cipher_selection()`** — Parse the server's single-item reply.
- **`HopeNegotiation` struct** — Holds the result of steps 1+2: session key, selected MAC, cipher choices, compression choices, and whether the login name should be MAC'd.

Unit tests cover all MAC algorithms, encoding/decoding roundtrips, and edge cases.

### `protocol/client/hope_stream.rs` — Transport Encryption

- **`Rc4` struct** — Inline ARC4 stream cipher (~30 lines). `new(key)` initializes the permutation table; `process(data)` XORs data with the keystream in place.
- **`HopeCipherState`** — Wraps an `Rc4` instance with `current_key`, `session_key`, and `mac_algorithm`. Provides `process()` for encryption/decryption and `rotate_key()` for forward secrecy (`new_key = MAC(current_key, session_key)`, then re-init RC4).
- **`HopeWriter`** — Wraps `BoxedWrite`. Two modes:
  - `write_raw(data)` — Passthrough, used during handshake and HOPE negotiation before encryption is active.
  - `write_transaction(txn)` — Encodes the transaction, then if encryption is active: encrypts header (20 bytes), encrypts first 2 body bytes, optionally applies key rotation using the first header byte as the HOPE rotation counter, then encrypts the remaining body. Normal application traffic leaves the rotation counter at 0.
- **`HopeReader`** — Wraps `BoxedRead`. Two modes:
  - `read_raw(buf)` — Passthrough for handshake.
  - `read_transaction()` — Reads 20-byte header, decrypts if active, extracts rotation count from the first header byte, clears that byte back to 0 for normal Hotline decoding, reads body, decrypts first 2 body bytes, applies key rotations, decrypts rest, and assembles the full transaction.

Unit tests cover RC4 known vectors, encrypt/decrypt roundtrip, and key rotation.

### `protocol/client/mod.rs` — Login Flow & Integration

**Struct fields** (lines ~110–111):
- `hope_reader: Arc<Mutex<Option<HopeReader>>>` — Replaces old `read_half`
- `hope_writer: Arc<Mutex<Option<HopeWriter>>>` — Replaces old `write_half`

**`establish_connection()`** (line ~174):
Creates TCP/TLS connection, wraps halves in `HopeReader`/`HopeWriter`, performs Hotline handshake. Called by `connect()` and originally designed to be called again after a failed HOPE probe (reconnect).

**`send_transaction_raw()` / `read_transaction_raw()`** (lines ~275, ~288):
Low-level methods that bypass encryption — used only during the login sequence (before encryption is activated). Write raw encoded bytes / read raw transaction bytes.

**`send_transaction()`** (line ~726):
The public method all sub-modules use. Goes through `HopeWriter.write_transaction()`, which encrypts if encryption is active.

**`try_hope_probe()`** (line ~347):
Sends the HOPE identification transaction (Login with `UserLogin=0x00`, MAC algorithm list, app ID, cipher lists). Reads the reply and checks for `HopeSessionKey`. Returns `Some(HopeNegotiation)` on success, `None` on any failure. **Currently not called** — see disable point above.

**Login flow** (line ~464):
- Line 473: `let hope_negotiation: Option<hope::HopeNegotiation> = None;` — **the disable point**
- Lines 476–527: If `hope_negotiation` is `Some`, sends MAC'd credentials (HOPE step 3). Otherwise sends legacy XOR-encoded credentials.
- Lines 564–613: After successful login, if HOPE was negotiated and a cipher was agreed upon, derives encryption keys and calls `activate_encryption()` on both `HopeReader` and `HopeWriter`.

**Key derivation** (lines ~568–584):
```
password_mac = MAC(password_bytes, session_key)
encode_key   = MAC(password_bytes, password_mac)
decode_key   = MAC(password_bytes, encode_key)
```
Client reads with `encode_key`, writes with `decode_key` (reversed from server's perspective).

**Receive loop** (line ~745):
Uses `hope_reader.lock() → read_transaction()` which transparently handles decryption if active.

**Keepalive** (line ~1024):
Uses `hope_writer.lock() → write_transaction()` which transparently handles encryption if active.

### Sub-modules using `send_transaction()`

These files all call `self.send_transaction(&txn)` which routes through `HopeWriter`. They don't reference HOPE directly — encryption is transparent to them.

- **`client/chat.rs`** — `send_chat`, `send_broadcast`, `send_private_message`, `send_set_client_user_info`, `accept_agreement`
- **`client/users.rs`** — `get_user_list`, `disconnect_user`
- **`client/files.rs`** — `get_file_list`, `download_file`, `download_banner`, `upload_file`, `create_folder` (file transfer streams on port+1 are NOT encrypted)
- **`client/news.rs`** — All news transaction senders (~11 methods)

### `Cargo.toml` — Dependencies

```toml
hmac = "0.12"    # HMAC-SHA1 and HMAC-MD5
sha1 = "0.10"    # SHA1 and HMAC-SHA1
md-5 = "0.10"    # MD5 and HMAC-MD5
```

## Future Work

- **Enabling HOPE auto-negotiation** — Needs a detection mechanism (bookmark flag, server version, tracker metadata) before `try_hope_probe()` can be safely called.
- **Compression** — The spec supports zlib compression on transaction bodies (after encryption). `HopeReader`/`HopeWriter` have placeholder fields for this. Would use the `flate2` crate.
- **Blowfish-OFB cipher** — Second cipher option in the spec. Lower priority since RC4 is what most HOPE servers use.
