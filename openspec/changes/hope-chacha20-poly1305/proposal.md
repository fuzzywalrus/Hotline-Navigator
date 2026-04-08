## Why

The current HOPE implementation only supports RC4 for transport encryption. RC4 is cryptographically broken — it has known key-stream biases and is prohibited by RFC 7465 for TLS. Servers that implement the HOPE ChaCha20-Poly1305 extension (documented in the fogWraith Hotline spec) offer a modern AEAD cipher, but Navigator cannot negotiate it. Adding ChaCha20-Poly1305 support gives users authenticated encryption with integrity guarantees that RC4 cannot provide, and enables encrypted file transfers — something the current RC4-only HOPE path does not support.

## What Changes

- Add `CHACHA20-POLY1305` as a negotiable cipher alongside `RC4` in the HOPE handshake
- Add `HMAC-SHA256` as a supported MAC algorithm (its 32-byte output natively fits ChaCha20's key size)
- Implement HKDF-SHA256 key expansion to derive 256-bit keys from shorter MAC outputs
- Implement AEAD framed transport: length-prefixed frames with 16-byte Poly1305 authentication tags, replacing per-packet RC4 stream encryption when this cipher is negotiated
- Implement deterministic 12-byte nonces with direction byte and monotonic counter
- Implement encrypted HTXF file transfers when AEAD mode is active on the control connection, with per-transfer keys derived from the HTXF reference number
- Add `chacha20poly1305`, `hkdf`, and `sha2` crate dependencies

## Capabilities

### New Capabilities
- `hope-chacha20-poly1305`: ChaCha20-Poly1305 AEAD cipher negotiation, HKDF key derivation, framed AEAD transport, encrypted file transfers, and HMAC-SHA256 MAC support for HOPE connections

### Modified Capabilities
- `hope`: Update cipher advertisement to include CHACHA20-POLY1305 alongside RC4; add HMAC-SHA256 to the MAC algorithm preference list; update file transfer behavior to support AEAD-encrypted HTXF when negotiated
- `file-transfers`: When the control connection uses HOPE AEAD mode, HTXF file transfers use ChaCha20-Poly1305 encryption with per-transfer derived keys (previously always unencrypted under HOPE)

## Impact

- **Crate dependencies**: New deps `chacha20poly1305`, `hkdf`, `sha2` added to `Cargo.toml`
- **Protocol layer**: `hope.rs` gains HMAC-SHA256 + HKDF; new `hope_aead.rs` module for AEAD reader/writer; `hope_stream.rs` (RC4) unchanged
- **Connection logic**: `mod.rs` login flow branches on negotiated cipher mode (`AEAD` vs `STREAM`) to select the appropriate transport wrapper
- **File transfers**: HTXF transfer initiation must check whether AEAD mode is active and derive per-transfer keys; the transfer socket gets wrapped in AEAD framing when applicable
- **Backward compatibility**: No breaking changes. RC4-only servers continue to work. CHACHA20-POLY1305 is simply added to the advertised cipher list; servers that don't support it select RC4 as before. INVERSE MAC remains incompatible with AEAD (cannot derive HKDF key material).
