## Why

The fogWraith Hotline spec defines an inline-media extension that lets clients attach images to chat messages, with the server validating, canonicalizing, and re-encoding bytes before relaying. Janus has a server implementation. Adding it to Navigator unlocks image-sharing in chat — the dominant feature gap versus modern chat clients.

This change is the Rust wire layer only: capability negotiation, two new transactions (`TranUploadMedia`, `TranDownloadMedia`), 11 new field IDs, the chunked-upload state machine, the `AccessSendMedia` privilege gate, and the session-scoped media-handle cache. The React side (attach UI, drop-zone integration, placeholder rendering, ChatMessage struct widening, preferences) is a sibling change, `inline-media-ui`.

Splitting protocol from UI lets us validate the wire layer against Janus with packet-level tests before any UX work, and keeps each PR reviewable. v1 ships with **no client-side resize** — Navigator preflights against a user-configurable byte budget (256 KB default, 2 MB max) and rejects oversized images locally with a "pick a smaller one" message. Smart resize is a v2 follow-up.

## What Changes

### Capability negotiation (bit 3)

- Add `CAPABILITY_INLINE_MEDIA: u64 = 0x0008` constant
- Update `client_capability_bits()` (introduced by `capabilities-hardening`) to OR in bit 3 when:
  - The user's `inlineMediaEnabled` preference is on (default on), AND
  - The privilege check for sending will be deferred to the UI (we always advertise the bit; whether the user can *send* is gated by `AccessSendMedia` on the user's account, separate from advertising support for *receiving*)
- Parse server echo of bit 3; expose `inline_media_supported` accessor on `HotlineClient`
- If server echo is absent, suppress all inline-media UI for the session (no transactions sent, incoming media fields ignored)

### New transaction types

- `TranUploadMedia = 750` (0x02EE) — client → server
- `TranDownloadMedia = 751` (0x02EF) — client → server
- Extend `TransactionType` enum and the `from_u16` reverse mapping at [protocol/constants.rs](hotline-tauri/src-tauri/src/protocol/constants.rs)

### New field IDs (11)

| ID | Constant | Width | Notes |
|---|---|---|---|
| `0x0201` | `ChatMediaType` | string ≤64 | canonical MIME |
| `0x0202` | `ChatMediaId` | binary ≤64 | opaque handle |
| `0x0203` | `ChatMediaPayload` | binary | image bytes (upload/download only) |
| `0x0204` | `ChatMediaDeclaredType` | string ≤64 | sender hint, upload only |
| `0x0205` | `ChatMediaWidth` | u32 | server-supplied |
| `0x0206` | `ChatMediaHeight` | u32 | server-supplied |
| `0x0207` | `ChatMediaBytes` | u32 | server-supplied |
| `0x0208` | `ChatMediaUploadToken` | binary ≤64 | chunked-upload session |
| `0x0209` | `ChatMediaPartIndex` | u16 | chunk index |
| `0x020A` | `ChatMediaPartCount` | u16 | total chunks |
| `0x020B` | `ChatMediaPartFinal` | u8 | non-zero on final chunk |

### Upload state machine

```
single-shot path (bytes ≤ 60 KB):
  1. Build TranUploadMedia with PAYLOAD, DECLARED_TYPE, PART_FINAL=1
  2. Send; await reply
  3. Reply success: extract MEDIA_ID, MEDIA_TYPE, WIDTH, HEIGHT, BYTES
  4. Reply error: surface generic message; do not retry automatically

chunked path (bytes > 60 KB):
  1. Send TranUploadMedia with chunk 0, PART_COUNT=N, DECLARED_TYPE
  2. Reply: extract UPLOAD_TOKEN
  3. For chunk in 1..N-1:
       send TranUploadMedia with UPLOAD_TOKEN, PAYLOAD, PART_INDEX
  4. Send final chunk with UPLOAD_TOKEN, PAYLOAD, PART_INDEX=N-1, PART_FINAL=1
  5. Final reply: extract MEDIA_ID + canonical metadata

graceful fallback:
  - If server rejects PART_COUNT > 1 (chunking refused), the upload fails.
    The client returns "server does not support large uploads" to the caller;
    the UI layer decides what to do (resize is out of scope for v1, so it
    just surfaces the error to the user)
```

### Download state machine

```
1. On incoming chat (106/104) with both MEDIA_ID and MEDIA_TYPE:
     - Validate companion-fields invariant (both present XOR neither)
     - If exactly one is present: log warning, drop the media fields, render text only
2. If session cache has the bytes: emit to UI immediately
3. Else: send TranDownloadMedia with MEDIA_ID
4. Single-shot reply (PART_COUNT=1): cache + emit
5. Chunked reply (PART_COUNT>1):
     a. Receive chunks 0..N-1 in order
     b. For chunks > 0: send TranDownloadMedia with MEDIA_ID + PART_INDEX
     c. Concatenate, cache, emit
6. Error reply: surface "media not found / unauthorized" to UI
```

### Session-scoped media cache

- Per-`HotlineClient` `HashMap<MediaHandle, MediaEntry>` where `MediaEntry { bytes: Vec<u8>, mime: String, width: u32, height: u32 }`
- Cache lives for the connection lifetime; cleared on disconnect
- **Never persisted to disk** (per spec: "Clients MUST NOT cache media handles across sessions")
- Bounded — drop oldest entries when total cached bytes exceed a configurable cap (e.g. 64 MB) to prevent runaway memory in heavy chat rooms

### Privilege check

- After login reply, parse bit 57 of `FieldUserAccess` (110): `let can_send_media = (user_access & (1u64 << 57)) != 0;`
- Expose via `HotlineClient::can_send_media()` for the UI layer
- Note: bit 57 is the spec's `AccessSendMedia`. Receiving media has no privilege gate — any client that negotiated bit 3 can be a recipient.

### Send-side hooks for chat transactions

- Extend the existing `send_chat`, `send_pm`, and chat-room send paths to optionally include `MEDIA_ID` and `MEDIA_TYPE` companion fields
- Extend the parser path that handles incoming chat (106 / 104 / 106-with-ChatID) to extract media fields when present and surface them via a new event payload (e.g. `chat-message-with-media`) consumed by the UI

### Decoder safety (defense-in-depth)

- The Rust side does NOT decode image bytes for display (that's the WebView's job)
- The Rust side DOES validate received bytes have plausible structure (magic-byte sniff matching the canonical MIME) before passing to UI; reject if mismatch
- Hard size cap on received chunks: any single field's PAYLOAD > 256 KB is rejected (spec recommends 256 KB total payload; per-field 65,535 due to wire encoding, but defensive cap)
- No image decoding in Rust → no decoder-bomb risk on Rust side

## Capabilities

### New Capabilities

- `inline-media-protocol`: Wire-level support for the fogWraith inline-media extension — capability negotiation (bit 3), two new transactions (750/751), 11 new field IDs, upload/download state machines (single-shot and chunked), session-scoped handle cache, `AccessSendMedia` privilege gate, send/receive integration with chat transactions (105/106/108/104), and event bridge to the UI layer.

### Modified Capabilities

- `server-connection`: Document bit 3 advertisement and parsing; document the new `inline_media_supported` and `can_send_media` accessors on `HotlineClient`.
- `public-chat`, `private-messaging`, `private-chat-rooms`: Document optional companion fields `MEDIA_ID` (0x0202) and `MEDIA_TYPE` (0x0201) on chat transactions and the companion-fields invariant.

## Impact

- **Backend (Rust)**:
  - [protocol/constants.rs](hotline-tauri/src-tauri/src/protocol/constants.rs) — 1 capability constant, 2 transaction types, 11 field IDs
  - [protocol/types.rs](hotline-tauri/src-tauri/src/protocol/types.rs) — `MediaHandle`, `MediaEntry`, `MediaUploadState` types
  - [protocol/client/mod.rs](hotline-tauri/src-tauri/src/protocol/client/mod.rs) — login-reply parsing for bit 3 + bit 57; new `inline_media_supported`, `can_send_media` accessors; media cache; receive-loop dispatch for media fields on chat
  - New `protocol/client/media.rs` — upload state machine, download state machine, cache management
  - [protocol/client/chat.rs](hotline-tauri/src-tauri/src/protocol/client/chat.rs) — extend send paths to take optional `media_handle: Option<MediaHandle>`
  - Tauri commands — `upload_media(server_id, bytes, declared_mime) -> Result<MediaHandle>`, `download_media(server_id, handle) -> Result<MediaEntry>` (the latter primarily for explicit fetches; most downloads happen automatically on chat receive)
  - Tauri events — `chat-media-received` carries metadata; UI subscribes
- **Frontend**: none in this change. `inline-media-ui` consumes the commands/events.
- **Wire compatibility**:
  - Servers without bit 3 don't echo the bit → client suppresses everything → no behavior change.
  - Servers that support bit 3 but reject chunking → client surfaces error; `inline-media-ui` decides UX. v1 = error message; v2 = resize.
  - Companion-fields invariant prevents silent partial data.
- **Risk**: Medium. The upload state machine is non-trivial; chunked upload is the bulk of the complexity. Mitigation: integration test against Janus before merging; unit tests with mocked transport for each state-machine path.
- **Out of scope**:
  - Any UI work (in `inline-media-ui`)
  - Client-side resize/recompress (deferred to v2 — `inline-media-resize`)
  - Media gateway URL handling (legacy public-chat fallback; spec says we do nothing on the receive side beyond rendering the text)
  - Persistent media cache across sessions (spec forbids)

## Dependencies

- **Requires `capabilities-hardening`** — uses `client_capability_bits()` helper and u64 wire field
- **Sibling**: `inline-media-ui` — consumes the Tauri commands and events
