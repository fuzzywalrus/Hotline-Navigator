## Tasks

### 1. Add TextEncoding enum and Bookmark field (Rust)
- [ ] Define `TextEncoding` enum (`Macintosh`, `Utf8`) in `protocol/types.rs` with serde support
- [ ] Add `encoding: TextEncoding` to `Bookmark` struct with `#[serde(default)]` defaulting to `Macintosh`
- [ ] Add `decode_bytes(data: &[u8], encoding: TextEncoding) -> String` helper (shared utility for raw byte parsers)

### 2. Encoding-aware TransactionField methods (Rust)
- [ ] Add `to_string_with(encoding: TextEncoding)` — decodes bytes using specified encoding
- [ ] Add `from_string_with(field_type, value, encoding: TextEncoding)` — encodes string using specified encoding
- [ ] Update existing `to_string()` / `from_string()` to delegate to the new methods with `Macintosh` default
- [ ] Add tests: roundtrip for both encodings, UTF-8 passthrough, MacRoman decode of 0x80+ bytes

### 3. Effective encoding resolution on HotlineClient (Rust)
- [ ] Add `effective_encoding: TextEncoding` field on `HotlineClient`
- [ ] Add `CAPABILITY_TEXT_ENCODING: u64 = 0x0002` constant in [protocol/constants.rs](hotline-tauri/src-tauri/src/protocol/constants.rs)
- [ ] Update `client_capability_bits()` helper (introduced by `capabilities-hardening`) to OR in bit 1 when `bookmark.encoding == Utf8` OR HOPE is active
- [ ] Resolve `effective_encoding` after HOPE negotiation AND capability echo in `connect()`:
  - HOPE active → `Utf8`
  - else server echoed bit 1 → `Utf8`
  - else → `bookmark.encoding`
- [ ] Expose via accessor method for `&self` call sites
- [ ] Unit test: each of the three branches yields the expected encoding

### 4. Thread encoding through receive path (Rust)
- [ ] Pass `effective_encoding` into the receive loop as a captured variable
- [ ] Add `encoding: TextEncoding` parameter to `handle_server_event`
- [ ] Update all `field.to_string()` calls in `handle_server_event` to `field.to_string_with(encoding)`

### 5. Fix from_utf8_lossy call sites (Rust)
- [ ] `client/users.rs:44` — username parsing → `decode_bytes(data, encoding)`
- [ ] `client/users.rs:201,207` — admin user list login/name → `decode_bytes(data, encoding)`
- [ ] `client/files.rs:576` — file name in directory listings → `decode_bytes(data, encoding)`
- [ ] `history.rs:78` — `decode_text()` → `decode_bytes(data, encoding)`
- [ ] `news.rs:451` — category name → `encoding_rs::MACINTOSH.decode` (align with rest of news.rs)

### 6. Thread encoding through outbound path (Rust)
- [ ] Update `send_chat`, `send_pm`, `post_news`, etc. to use `from_string_with(encoding)` where they currently use `from_string`
- [ ] Verify `from_path` encoding for file operations

### 7. Add encoding to TypeScript types and UI
- [ ] Add `encoding?: 'macintosh' | 'utf8'` to `Bookmark` interface in `types/index.ts`
- [ ] Add encoding dropdown to `EditBookmarkDialog.tsx` (Mac OS Roman / UTF-8)
- [ ] Disable dropdown and show "(auto: UTF-8 via HOPE)" when HOPE is enabled on the bookmark
- [ ] Wire formData through to bookmark save

### 8. Testing
- [ ] Test MacRoman roundtrip: send åäö from Navigator, verify on classic client (or vice versa)
- [ ] Test HOPE auto-detection: connect to HOPE server, confirm UTF-8 is used regardless of bookmark setting
- [ ] Test backward compat: existing bookmarks without `encoding` field load correctly as MacRoman
- [ ] Test CJK fallback: with UTF-8 encoding set, Japanese text passes through correctly
- [ ] Test bit-1 negotiation: against a fogWraith-spec server that confirms bit 1, confirm `effective_encoding` resolves to UTF-8 on a non-HOPE bookmark with `bookmark.encoding == Macintosh` IF the server echoes bit 1 — verify against expectation (per spec, server only echoes bits the client advertised, so this scenario shouldn't occur; but verify the resolution order is correct under each combination)
- [ ] Test bit-1 advertisement: bookmark with `encoding == Utf8`, non-HOPE → confirm bit 1 set in advertised capabilities. Bookmark with `encoding == Macintosh`, non-HOPE → confirm bit 1 NOT set
