## Phase 1: AEAD Control Connection

### 1. Dependencies and Foundation

- [x] 1.1 Add `chacha20poly1305`, `hkdf`, and `sha2` crates to `Cargo.toml`
- [x] 1.2 Add `HmacSha256` MAC algorithm variant to `MacAlgorithm` enum in `hope.rs` with wire name `"HMAC-SHA256"`, `from_name` parsing, and `compute_mac` implementation
- [x] 1.3 Update MAC algorithm preference list to include HMAC-SHA256 as highest priority (before HMAC-SHA1)
- [x] 1.4 Implement `expand_key_for_aead(ikm, salt, info) -> [u8; 32]` HKDF-SHA256 function in `hope.rs`

### 2. AEAD Transport Module

- [x] 2.1 Create `hope_aead.rs` module with `HopeAeadReader` and `HopeAeadWriter` structs holding ChaCha20Poly1305 cipher, direction-specific nonce counters, and 32-byte keys
- [x] 2.2 Implement deterministic 12-byte nonce construction: direction byte + 3 zero bytes + big-endian u64 counter
- [x] 2.3 Implement `HopeAeadWriter::write_transaction()` — serialize transaction, seal with ChaCha20-Poly1305, write 4-byte BE length prefix + ciphertext + tag, increment counter
- [x] 2.4 Implement `HopeAeadReader::read_transaction()` — read 4-byte BE length, enforce 16 MiB max, read ciphertext + tag, open (decrypt + verify), parse transaction, increment counter
- [x] 2.5 Add unit tests: encrypt/decrypt round-trip, nonce counter increment, tag verification failure, oversized frame rejection

### 3. Cipher Negotiation

- [x] 3.1 Update HOPE Step 1 identification to advertise `["CHACHA20-POLY1305", "RC4"]` in both `HopeClientCipher` and `HopeServerCipher` fields
- [x] 3.2 Add cipher name normalization: map `CHACHA20POLY1305` and `CHACHA20` to canonical `CHACHA20-POLY1305`
- [x] 3.3 Parse `HopeServerCipherMode` / `HopeClientCipherMode` fields from Step 2 reply to detect `"AEAD"` vs `"STREAM"` mode
- [x] 3.4 Detect and reject invalid INVERSE MAC + AEAD combination during negotiation

### 4. Connection Integration

- [x] 4.1 Add `TransportReader`/`TransportWriter` enums to represent Stream (RC4) vs Aead transport state
- [x] 4.2 After HOPE Step 3, branch on cipher mode: derive HKDF-expanded keys and activate `HopeAeadReader`/`HopeAeadWriter` for AEAD, or activate existing `HopeReader`/`HopeWriter` for RC4
- [x] 4.3 Wire `TransportReader`/`TransportWriter` into the connection's read/write paths so all subsequent transactions route through the correct transport
- [x] 4.4 Verify encrypted login reply is read through the AEAD reader when AEAD mode is active

### 5. Testing and Validation

- [x] 5.1 Add known-answer tests for HKDF-SHA256 key expansion with direction-specific info strings
- [x] 5.2 Add known-answer tests for HMAC-SHA256 MAC computation
- [x] 5.4 Verify RC4 path is unaffected — existing HOPE tests still pass
- [x] 5.5 Test against Hotline Central Hub server (HOPE active, fell back to non-AEAD — graceful fallback confirmed)
- [x] 5.6 Test against Vespernet server (full AEAD negotiation + encrypted traffic confirmed working)

---

## Phase 2: AEAD File Transfers

- [x] 6.1 Implement `derive_ft_base_key(encode_key_256, decode_key_256, session_key) -> [u8; 32]` using HKDF-SHA256 with info `"hope-file-transfer"`
- [x] 6.2 Implement `derive_transfer_key(ft_base_key, ref_number) -> [u8; 32]` using HKDF-SHA256 with ref number as salt and info `"hope-ft-ref"`
- [x] 6.3 Store AEAD state (ft_base_key) on the client connection so transfer tasks can derive per-transfer keys
- [x] 6.4 Wrap HTXF download socket in AEAD framing after handshake when AEAD mode is active
- [x] 6.5 Wrap HTXF upload socket in AEAD framing after handshake when AEAD mode is active
- [x] 6.6 Wrap banner download in AEAD framing after handshake when AEAD mode is active
- [x] 6.7 Test file download against VesperNet (7.2 MB file, 221 AEAD frames, verified)
- [x] 6.8 Test banner download against VesperNet (18 KB, single AEAD frame, verified)
- [ ] 6.9 Test file upload against server with AEAD (no upload folder available on VesperNet — deferred)
