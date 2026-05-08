## Context

The fogWraith inline-media spec ([Capabilities-Inline-Media.md](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Inline-Media.md)) defines a self-contained sub-protocol layered on top of `DATA_CAPABILITIES` bit 3:

- 2 new transactions for upload/download
- 11 new field IDs
- Chunked upload via in-band token-handshake (NOT HTXF)
- Server validates and re-encodes bytes; client only ever sees canonical bytes
- Handle-based authorization model (download set captured at relay time)
- Session-scoped client cache (no cross-session persistence)

Janus has a server implementation, giving us a real target for integration testing. The spec is currently labeled "draft; subject to refinement" — there are real gaps we've identified (no filename field, no server-limit advertisement on the wire) that we'll feed back upstream separately. This change implements against the spec as written.

The chunked-upload state machine is the largest single piece of new complexity. It is structurally simpler than HTXF (no separate TCP, no transfer reference, no resume) but adds a session token that must thread through every chunk after the first.

Constraints shaping the decisions below:

- **No client-side image decoding in Rust.** WebView handles rendering. Rust handles bytes only. This dodges decoder-bomb risk on the protocol side.
- **No persistent cache.** Spec is explicit. Memory only, dropped at disconnect.
- **Per-field 16-bit length cap.** Hotline fields use u16 length encoding → 65,535-byte ceiling per field. This is what forces chunking for any image larger than ~60 KB even when the server allows up to 256 KB total.
- **Companion-fields invariant.** `MEDIA_ID` and `MEDIA_TYPE` always appear together or not at all. Receivers must enforce this on the parse side, not just on the send side.

## Goals / Non-Goals

**Goals:**
- Capability negotiation: advertise bit 3 by default; parse echo; expose `inline_media_supported`
- Two new transactions wired into the existing transaction dispatcher
- Single-shot upload (≤ ~60 KB raw bytes) — the simple path
- Chunked upload state machine — handles arbitrary sizes up to a defensive cap
- Handle-based download flow (single-shot and chunked) on incoming chat
- Session-scoped `HashMap<MediaHandle, MediaEntry>` cache, bounded total memory
- `AccessSendMedia` privilege bit (57) parsing, exposed to UI
- Send-side integration: extend existing chat send paths to take optional `Option<MediaHandle>`
- Receive-side integration: extract media fields from incoming chat and emit Tauri events to UI
- Companion-fields invariant enforced on receive
- Defense-in-depth on bytes: magic-byte sniff matches declared canonical MIME

**Non-Goals:**
- Any React/UI work (lives in `inline-media-ui`)
- Client-side resize, recompress, or quality adjustment (deferred to `inline-media-resize` v2)
- Media gateway URL handling (legacy public-chat fallback) — server only feature; client renders the substituted URL as plain text the same way it would render any chat text
- Persistent storage of media bytes
- Image rendering / decoding in Rust
- Multi-image attachments per message (spec says one image per message)

## Decisions

### 1. State machine representation

The upload state lives in a `MediaUploadSession` struct held in a `HashMap<TransactionId, MediaUploadSession>` on the client. The first `TranUploadMedia` reply triggers state transition based on whether `UPLOAD_TOKEN` is present (chunked) or `MEDIA_ID` is present (single-shot complete).

```rust
enum MediaUploadState {
    AwaitingFirstReply { total_chunks: u16 },
    AwaitingChunkAck { token: Vec<u8>, next_index: u16, total: u16 },
    AwaitingFinalReply { token: Vec<u8> },
    Complete(MediaHandle),
    Failed(String),
}
```

Transactions correlate via `TransactionId`. Each chunk gets a fresh transaction ID (it's a fresh `TranUploadMedia` request); the upload session is keyed by a logical session ID we generate client-side and bundle into the upload future returned to the caller.

Rationale: matches Hotline's existing one-reply-per-transaction model. Avoids inventing parallel correlation outside the protocol's existing primitives.

### 2. Chunk size

Hotline's per-field length is 16-bit (max 65,535 bytes). Practical chunk size: **60 KB** (`60 * 1024 = 61_440 bytes`). Leaves headroom for the rest of the transaction (header, other fields, etc.) without bumping against the 65,535 cap.

Total upload budget: 2 MB (matches user-pref ceiling). At 60 KB per chunk, that's ~35 chunks max. Reasonable.

Rationale: round number, well under field cap, matches typical upload behaviors in similar protocols.

### 3. Cache eviction

Bounded LRU keyed by access time (last fetched, not last received). Total-bytes cap of 64 MB. When over cap, evict oldest until under. Per-handle entries cap at the canonical byte size from server (≤ server's max payload).

Rationale: 64 MB covers a busy chat session (~100+ images at typical chat sizes). LRU prevents unbounded growth in long-lived connections.

### 4. Bit 3 advertisement policy

Always advertise bit 3 by default (controlled by a `inlineMediaEnabled` user preference, default on). Two reasons:

- Receiving images doesn't require any privilege; the cost of advertising is minimal even on accounts that can't send.
- The check for *sending* lives on the privilege bit (57), not on capability negotiation. The capability bit is "I understand the protocol"; the privilege bit is "I'm allowed to send."

A user who wants to opt out of inline media entirely (e.g. low-bandwidth, bandwidth-metered connection) can flip the preference off. Then the bit isn't advertised, the server strips media fields from anything it relays to us, and no images are downloaded.

### 5. Companion-fields enforcement

On receive, we validate the invariant before any other processing:

```rust
let has_id = tx.has_field(FieldType::ChatMediaId);
let has_type = tx.has_field(FieldType::ChatMediaType);
if has_id != has_type {
    log_warn("Chat transaction has exactly one of MEDIA_ID/MEDIA_TYPE; dropping media fields");
    // Continue processing as text-only; do NOT reject the whole transaction
}
```

We don't reject the whole transaction — text content may still be valid. We just don't surface the half-media. This matches the spec's intent (companion fields are advisory; text is the primary content).

### 6. Privilege bit parsing — bit 57

Already storing `user_access: u64` ([client/mod.rs:219](hotline-tauri/src-tauri/src/protocol/client/mod.rs#L219)). Bit 57 fits comfortably:

```rust
const ACCESS_SEND_MEDIA: u64 = 1u64 << 57;
let can_send = (user_access & ACCESS_SEND_MEDIA) != 0;
```

Bit 57 is the spec's `AccessSendMedia`. We expose this as `HotlineClient::can_send_media() -> bool`. UI uses this to enable/disable the attach button.

Defensive note: legacy account stores might not have bit 57 set. Spec says servers MUST treat absence as "not granted" and MUST NOT silently widen. We trust the server's `FieldUserAccess` value as authoritative.

### 7. Magic-byte sniff on download

Even though the server canonicalizes, we sanity-check incoming bytes match the declared canonical MIME:

| Canonical MIME | Magic bytes |
|---|---|
| `image/jpeg` | `FF D8 FF` |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| `image/gif` | `47 49 46 38 [37/39] 61` |

If mismatch, log + emit error event; UI shows "image could not be loaded" placeholder. We do NOT pass mismatched bytes to the WebView.

This is paranoid but cheap. If a server is compromised or misbehaves, we don't render whatever they sent.

### 8. Tauri command surface

Two commands:

```rust
#[tauri::command]
async fn upload_media(
    server_id: String,
    bytes: Vec<u8>,
    declared_mime: String,
) -> Result<MediaHandleDto, String>

#[tauri::command]
async fn download_media(
    server_id: String,
    handle: Vec<u8>,
) -> Result<MediaBytesDto, String>
```

Plus events:
- `chat-media-received-{server_id}` — fired when a chat transaction with media metadata arrives; payload includes the handle so UI can subscribe and call `download_media` for the bytes
- `chat-media-bytes-{server_id}-{handle_hex}` — fired when bytes are available (via cache or freshly downloaded)

Rationale: explicit `download_media` command lets the UI control timing (e.g., lazy-load images that scrolled into view). Cache-hit-or-fetch logic lives in Rust.

### 9. Why not reuse HTXF?

Spec note we'll feed upstream: HTXF doesn't fit because (a) byte-exact transfer can't satisfy the re-encode requirement, (b) authorization model is path-based vs handle-based, (c) opening a side-channel TCP for a 150 KB chat image is overkill. We implement the spec's in-band chunking as written.

## Risks

- **State machine bugs.** Chunked upload has many failure modes (token expiry, out-of-order, mismatched count). Mitigation: explicit unit tests for each state transition with mocked transport; integration test against Janus.
- **Cache memory growth.** A user in a busy room could accumulate hundreds of MB if eviction is buggy. Mitigation: hard cap + LRU + audit.
- **Companion-fields edge case.** Spec says "MUST reject" but we chose "drop media fields, keep text." Justified per goal #5 above. If interop testing reveals server expects rejection, revisit.
- **Server limits unknown.** Without `DATA_MEDIA_MAX_BYTES` advertised, we can't preflight against server limits. We optimistically attempt upload; failures surface to UI. v1 ships with this; we propose the field upstream.
