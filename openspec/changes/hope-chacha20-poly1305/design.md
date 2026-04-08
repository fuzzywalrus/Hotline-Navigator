## Context

The Hotline Tauri client (Navigator) implements the HOPE secure login extension with RC4 stream encryption. The transport layer is handled by `HopeReader`/`HopeWriter` in `hope_stream.rs`, which wrap raw TCP reads/writes with per-packet RC4 encryption and key rotation. The HOPE negotiation lives in `mod.rs` (login flow) and `hope.rs` (MAC algorithms). File transfers (HTXF) on port+1 are currently always unencrypted under HOPE.

The fogWraith Hotline community has specified a ChaCha20-Poly1305 AEAD extension that replaces RC4 stream encryption with modern authenticated encryption. This design covers adding that cipher as a negotiable option alongside the existing RC4 path.

## Goals / Non-Goals

**Goals:**
- Negotiate ChaCha20-Poly1305 when offered by the server, with graceful RC4 fallback
- Implement AEAD framed transport (length-prefixed sealed frames)
- Add HKDF-SHA256 key expansion for 256-bit key derivation
- Add HMAC-SHA256 as a MAC algorithm
- Encrypt HTXF file transfers when AEAD mode is active
- Zero changes to existing RC4 behavior — both paths coexist

**Non-Goals:**
- Replacing RC4 or removing it — legacy servers only support RC4
- Server-side implementation (mobius-c is out of scope)
- AEAD for folder transfers (complex multi-action protocol; can be added later)
- Compression (the spec mentions `HopeServerCompression`/`HopeClientCompression` but these are orthogonal)

## Decisions

### Decision 1: Separate AEAD module alongside RC4

Create a new `hope_aead.rs` module with `HopeAeadReader`/`HopeAeadWriter` rather than modifying `hope_stream.rs`.

**Rationale:** The RC4 stream cipher and AEAD framing have fundamentally different packet structures. RC4 encrypts in-place over a continuous keystream with per-packet key rotation. AEAD uses length-prefixed sealed frames with nonce counters. Mixing both into one module creates confusing branching. Separate modules keep each path clean and testable.

**Alternative considered:** A unified `HopeTransport` trait with RC4 and AEAD implementations. Rejected because the two share almost no logic — the abstraction would be thin and artificial.

### Decision 2: Enum-based cipher mode in connection state

After HOPE negotiation, store the active cipher mode as an enum:
```rust
enum HopeCipherMode {
    Rc4 { reader: HopeReader, writer: HopeWriter },
    Aead { reader: HopeAeadReader, writer: HopeAeadWriter },
}
```

The login flow in `mod.rs` branches once at activation time and the rest of the connection uses the appropriate variant.

**Rationale:** Avoids runtime checks on every read/write. The cipher mode is fixed for the lifetime of a connection.

### Decision 3: HKDF key derivation in hope.rs

Add an `expand_key_for_aead()` function to `hope.rs` next to the existing `compute_mac()`. This keeps all key material derivation in one place.

```rust
pub fn expand_key_for_aead(ikm: &[u8], salt: &[u8], info: &str) -> [u8; 32] {
    // HKDF-SHA256 extract + expand
}
```

**Rationale:** `hope.rs` already owns MAC computation and key derivation logic. Adding HKDF here keeps a single module responsible for all cryptographic key operations.

### Decision 4: File transfer key derivation at transfer initiation

When a file transfer is initiated and the control connection is in AEAD mode, derive the per-transfer key immediately using the reference number. Pass the key (or an `Option<[u8; 32]>`) to the transfer task.

**Rationale:** The reference number is known at transfer initiation. Computing the key upfront avoids threading the entire HOPE state into the transfer task. The transfer task only needs the 32-byte key.

### Decision 5: chacha20poly1305 crate for AEAD

Use the `chacha20poly1305` crate from RustCrypto for the AEAD implementation, `hkdf` + `sha2` for key expansion.

**Rationale:** These are the standard RustCrypto crates, well-audited, pure Rust, and already widely used. No C FFI or OpenSSL dependency needed.

## Risks / Trade-offs

**[Risk] No servers to test against initially** -> Test with known test vectors from the spec. The AEAD framing is deterministic (nonce = direction + counter), so we can construct expected ciphertext for given keys. Unit tests can verify encrypt/decrypt round-trips and known-answer tests. Integration testing requires a HOPE-AEAD-capable server (Janus or similar).

**[Risk] INVERSE MAC + AEAD negotiation edge case** -> If a server somehow selects INVERSE MAC with ChaCha20-Poly1305, the HKDF step will fail because INVERSE produces non-cryptographic output. Mitigation: detect this combination and reject it during negotiation, falling back to legacy login.

**[Risk] Increased binary size from new crypto crates** -> `chacha20poly1305`, `hkdf`, and `sha2` add some binary weight. Mitigation: these are pure Rust with no heavy dependencies. The increase is modest (~100-200KB).

**[Trade-off] HTXF encryption adds latency** -> Each file transfer chunk requires AEAD seal/open operations. For large files this is negligible relative to I/O, but it's a nonzero cost. Accepted because the security benefit outweighs the performance cost.

**[Trade-off] No key rotation in AEAD mode** -> Unlike RC4 which rotates keys per-packet, ChaCha20-Poly1305 relies on unique nonces. This is standard AEAD practice and is safe as long as nonces are never reused, which the monotonic counter guarantees.
