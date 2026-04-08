## 1. Dependencies and Foundation

- [ ] 1.1 Add `chacha20poly1305`, `hkdf`, and `sha2` crates to `Cargo.toml`
- [ ] 1.2 Add `HmacSha256` MAC algorithm variant to `MacAlgorithm` enum in `hope.rs` with wire name `"HMAC-SHA256"`, `from_name` parsing, and `compute_mac` implementation
- [ ] 1.3 Update MAC algorithm preference list to include HMAC-SHA256 as highest priority (before HMAC-SHA1)
- [ ] 1.4 Implement `expand_key_for_aead(ikm, salt, info) -> [u8; 32]` HKDF-SHA256 function in `hope.rs`

## 2. AEAD Transport Module

- [ ] 2.1 Create `hope_aead.rs` module with `HopeAeadReader` and `HopeAeadWriter` structs holding ChaCha20Poly1305 cipher, direction-specific nonce counters, and 32-byte keys
- [ ] 2.2 Implement deterministic 12-byte nonce construction: direction byte + 3 zero bytes + big-endian u64 counter
- [ ] 2.3 Implement `HopeAeadWriter::write_transaction()` — serialize transaction, seal with ChaCha20-Poly1305, write 4-byte BE length prefix + ciphertext + tag, increment counter
- [ ] 2.4 Implement `HopeAeadReader::read_transaction()` — read 4-byte BE length, enforce 16 MiB max, read ciphertext + tag, open (decrypt + verify), parse transaction, increment counter
- [ ] 2.5 Add unit tests: encrypt/decrypt round-trip, nonce counter increment, tag verification failure, oversized frame rejection

## 3. Cipher Negotiation

- [ ] 3.1 Update HOPE Step 1 identification to advertise `["CHACHA20-POLY1305", "RC4"]` in both `HopeClientCipher` and `HopeServerCipher` fields
- [ ] 3.2 Add cipher name normalization: map `CHACHA20POLY1305` and `CHACHA20` to canonical `CHACHA20-POLY1305`
- [ ] 3.3 Parse `HopeServerCipherMode` / `HopeClientCipherMode` fields from Step 2 reply to detect `"AEAD"` vs `"STREAM"` mode
- [ ] 3.4 Detect and reject invalid INVERSE MAC + AEAD combination during negotiation

## 4. Connection Integration

- [ ] 4.1 Add `HopeCipherMode` enum to represent Rc4 vs Aead transport state
- [ ] 4.2 After HOPE Step 3, branch on cipher mode: derive HKDF-expanded keys and activate `HopeAeadReader`/`HopeAeadWriter` for AEAD, or activate existing `HopeReader`/`HopeWriter` for RC4
- [ ] 4.3 Wire `HopeCipherMode` into the connection's read/write paths so all subsequent transactions route through the correct transport
- [ ] 4.4 Verify encrypted login reply is read through the AEAD reader when AEAD mode is active

## 5. Encrypted File Transfers

- [ ] 5.1 Implement `derive_ft_base_key(encode_key_256, decode_key_256, session_key) -> [u8; 32]` using HKDF-SHA256 with info `"hope-file-transfer"`
- [ ] 5.2 Implement `derive_transfer_key(ft_base_key, ref_number) -> [u8; 32]` using HKDF-SHA256 with ref number as salt and info `"hope-ft-ref"`
- [ ] 5.3 Store AEAD state (ft_base_key + session_key) on the client connection so transfer tasks can derive per-transfer keys
- [ ] 5.4 Wrap HTXF download socket in AEAD framing after handshake when AEAD mode is active
- [ ] 5.5 Wrap HTXF upload socket in AEAD framing after handshake when AEAD mode is active
- [ ] 5.6 Add unit tests for file transfer key derivation chain

## 6. Testing and Validation

- [ ] 6.1 Add known-answer tests for HKDF-SHA256 key expansion with direction-specific info strings
- [ ] 6.2 Add known-answer tests for HMAC-SHA256 MAC computation
- [ ] 6.3 Add integration test: full HOPE AEAD negotiation + encrypted transaction round-trip (mock server)
- [ ] 6.4 Verify RC4 path is unaffected — existing HOPE tests still pass
