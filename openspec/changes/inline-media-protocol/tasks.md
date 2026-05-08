## Tasks

### 1. Constants and types
- [ ] Add `CAPABILITY_INLINE_MEDIA: u64 = 0x0008` in [protocol/constants.rs](hotline-tauri/src-tauri/src/protocol/constants.rs)
- [ ] Add `ACCESS_SEND_MEDIA: u64 = 1u64 << 57` constant
- [ ] Add 2 new variants to `TransactionType` enum: `UploadMedia = 750`, `DownloadMedia = 751`; update `from_u16` reverse mapping
- [ ] Add 11 new variants to `FieldType` enum (0x0201–0x020B); update `from_u16` reverse mapping
- [ ] Add types in [protocol/types.rs](hotline-tauri/src-tauri/src/protocol/types.rs):
  - `pub type MediaHandle = Vec<u8>;`
  - `pub struct MediaEntry { bytes: Vec<u8>, mime: String, width: u32, height: u32, byte_size: u32, last_accessed: Instant }`
  - `pub struct MediaMetadata { handle: MediaHandle, mime: String, width: u32, height: u32, byte_size: u32 }`
- [ ] Unit test: round-trip encode/decode for each new field type

### 2. Capability negotiation
- [ ] Add `inline_media_supported: AtomicBool` on `HotlineClient`
- [ ] Update `client_capability_bits()` to OR in bit 3 when user pref `inlineMediaEnabled` is on (or always-on for v1; preference is a UI concern)
- [ ] Parse bit 3 in login reply at [client/mod.rs:1048-1051](hotline-tauri/src-tauri/src/protocol/client/mod.rs#L1048-L1051); store result in `inline_media_supported`
- [ ] Add `can_send_media: AtomicBool`; compute from `(user_access & ACCESS_SEND_MEDIA) != 0` after login reply
- [ ] Expose accessors: `pub fn inline_media_supported(&self) -> bool`, `pub fn can_send_media(&self) -> bool`

### 3. Media cache
- [ ] Create `protocol/client/media.rs` module
- [ ] Add `media_cache: Arc<Mutex<MediaCache>>` field on `HotlineClient`
- [ ] `MediaCache`:
  - `entries: HashMap<MediaHandle, MediaEntry>`
  - `total_bytes: u64`
  - `cap_bytes: u64` (configurable, default 64 MB)
  - methods: `insert(handle, entry)`, `get(handle) -> Option<MediaEntry>` (updates `last_accessed`), `evict_to_cap()`, `clear()` (called on disconnect)
- [ ] LRU eviction by `last_accessed`
- [ ] Unit test: insert above cap → evicts oldest; get updates last_accessed

### 4. Upload state machine
- [ ] In `media.rs`, define:
  ```rust
  enum MediaUploadState {
      AwaitingFirstReply { total_chunks: u16 },
      AwaitingChunkAck { token: Vec<u8>, next_index: u16, total: u16 },
      AwaitingFinalReply { token: Vec<u8> },
      Complete(MediaMetadata),
      Failed(String),
  }
  ```
- [ ] Implement `pub async fn upload_media(client: &HotlineClient, bytes: Vec<u8>, declared_mime: String) -> Result<MediaMetadata, String>`
- [ ] Single-shot path: if `bytes.len() <= 60 * 1024`, build one `TranUploadMedia` with `PAYLOAD`, `DECLARED_TYPE`, `PART_FINAL=1`; await reply; extract metadata
- [ ] Chunked path: split bytes into 60 KB chunks; send first chunk with `PART_COUNT=N`, `DECLARED_TYPE`; await `UPLOAD_TOKEN`; send subsequent chunks with `UPLOAD_TOKEN` + `PART_INDEX`; final chunk has `PART_FINAL=1`
- [ ] Handle server rejection of chunked upload (`PART_COUNT > 1` rejected) by surfacing the error to caller — caller decides what to do (UI shows error in v1)
- [ ] Unit tests against a mocked transport:
  - single-shot success
  - single-shot server-error
  - chunked success (3 chunks)
  - chunked server-error mid-stream
  - chunked rejected (server returns error on first chunk with PART_COUNT > 1)
- [ ] Token expiry: if a chunk reply doesn't arrive within 30s, fail the upload with timeout error

### 5. Download state machine
- [ ] Implement `pub async fn download_media(client: &HotlineClient, handle: MediaHandle) -> Result<MediaEntry, String>`
- [ ] Cache check first: if hit, update `last_accessed`, return entry
- [ ] Else: send `TranDownloadMedia` with `MEDIA_ID`; await reply
- [ ] If `PART_COUNT == 1` (or absent): single-shot reply; cache + return
- [ ] If `PART_COUNT > 1`: receive chunks 0..N-1 by sending subsequent `TranDownloadMedia` with `MEDIA_ID + PART_INDEX`
- [ ] Concatenate, validate magic bytes against declared MIME, cache, return
- [ ] Magic-byte validation:
  - `image/jpeg` → starts with `FF D8 FF`
  - `image/png` → starts with `89 50 4E 47 0D 0A 1A 0A`
  - `image/gif` → starts with `47 49 46 38 (37|39) 61`
  - Mismatch → return error, do NOT cache
- [ ] Unit tests: single-shot, chunked, mismatched magic bytes (rejected), unauthorized error

### 6. Companion-fields invariant
- [ ] Add helper `fn validate_chat_media_invariant(tx: &Transaction) -> Result<(), &'static str>` returning Ok if both ID+TYPE present or both absent; Err otherwise
- [ ] In incoming chat handlers (106 / 104 / 106-with-ChatID), call the helper:
  - If invariant violated: log warning, drop media fields from the transaction's parsed view, continue with text-only
  - If both present: extract media metadata into a `MediaMetadata` struct alongside the text

### 7. Send-side integration with chat
- [ ] Extend [client/chat.rs](hotline-tauri/src-tauri/src/protocol/client/chat.rs) `send_chat`, `send_pm`, and chat-room send to accept optional `media: Option<MediaMetadata>`
- [ ] When `media.is_some()`, add `MEDIA_ID` and `MEDIA_TYPE` companion fields to the outgoing transaction
- [ ] Privilege check: if attempting to send with `media.is_some()` and `!can_send_media()`, return error before sending

### 8. Receive-side integration
- [ ] In the receive-loop dispatch for incoming chat, after companion-field validation, kick off `download_media(handle)` in the background
- [ ] Emit Tauri event `chat-media-received-{server_id}` with: chat metadata + media metadata (handle, mime, width, height, byte_size). UI can render placeholder using server-supplied dims.
- [ ] When download completes (or cache-hits), emit `chat-media-bytes-{server_id}-{handle_hex}` with the bytes (or path-to-bytes for large payloads — see decision)
- [ ] If download fails, emit error event; UI shows fallback

### 9. Tauri commands
- [ ] Add `upload_media` command in [commands/mod.rs](hotline-tauri/src-tauri/src/commands/mod.rs):
  ```rust
  #[tauri::command]
  pub async fn upload_media(
      server_id: String,
      bytes: Vec<u8>,
      declared_mime: String,
      state: State<'_, AppState>,
  ) -> Result<MediaMetadataDto, String>
  ```
- [ ] Add `download_media` command (mirrors signature)
- [ ] Add DTOs: `MediaMetadataDto`, `MediaBytesDto` (the latter may use base64 or a transient file path depending on size)

### 10. Cleanup on disconnect
- [ ] On disconnect (graceful or error), call `media_cache.clear()` to release memory
- [ ] Cancel any in-flight uploads; surface as failed to the UI

### 11. Spec docs
- [ ] Create `openspec/specs/inline-media-protocol/spec.md` with the full requirement set (see specs/ folder of this change)
- [ ] Update [openspec/specs/server-connection/spec.md](openspec/specs/server-connection/spec.md) to mention bit 3 advertisement
- [ ] Update [openspec/specs/public-chat/spec.md](openspec/specs/public-chat/spec.md), [openspec/specs/private-messaging/spec.md](openspec/specs/private-messaging/spec.md), [openspec/specs/private-chat-rooms/spec.md](openspec/specs/private-chat-rooms/spec.md) to document optional MEDIA_ID/MEDIA_TYPE companion fields

### 12. Integration testing against Janus
- [ ] Set up Janus dev server with bit 3 enabled (instructions to TBD; coordinate with the Janus operator)
- [ ] Single-shot upload + immediate download — verify byte-exact (modulo server canonicalization differences)
- [ ] Chunked upload (e.g., 200 KB image) — verify Janus accepts the chunking handshake
- [ ] Confirm Janus echoes bit 3 in login reply
- [ ] Confirm Janus's `AccessSendMedia` configuration: with bit set → upload allowed; without → server returns error and we surface it
- [ ] Test cross-client receive: upload from Navigator, fetch from another Navigator instance — verify both see canonical bytes and metadata

### 13. Cleanup
- [ ] Remove any debug logging from the upload/download paths once Janus interop is verified; keep `emit_protocol_log("info", ...)` for high-level transitions only
