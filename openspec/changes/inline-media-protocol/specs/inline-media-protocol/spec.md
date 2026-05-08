## ADDED Requirements

### Requirement: Capability bit 3 negotiation

The client SHALL advertise `CAPABILITY_INLINE_MEDIA` (bit 3, mask `0x0008`) in `DATA_CAPABILITIES` whenever the user's `inlineMediaEnabled` preference is on (default: on). The client SHALL parse the server's echoed `DATA_CAPABILITIES` to determine whether bit 3 is active for the session, and store the result as `inline_media_supported`.

When `inline_media_supported` is false, the client SHALL NOT send `TranUploadMedia` or `TranDownloadMedia` transactions, and SHALL ignore any `MEDIA_ID` / `MEDIA_TYPE` fields received on chat transactions (treating them as if the server had stripped them).

#### Scenario: Server confirms bit 3

- **WHEN** the server's login reply contains `DATA_CAPABILITIES` with bit 3 set
- **THEN** `HotlineClient::inline_media_supported()` SHALL return `true` and the UI SHALL be permitted to enable inline-media features

#### Scenario: Server omits bit 3

- **WHEN** the server's login reply contains `DATA_CAPABILITIES` without bit 3 (or omits the field entirely)
- **THEN** `HotlineClient::inline_media_supported()` SHALL return `false` and any later attempt to upload media SHALL fail with a clear "server does not support inline media" error

### Requirement: AccessSendMedia privilege bit

The client SHALL parse bit 57 of `FieldUserAccess` (110) from the login reply as the `AccessSendMedia` privilege. The client SHALL expose `HotlineClient::can_send_media() -> bool`. The client SHALL refuse to send any chat transaction containing `MEDIA_ID` / `MEDIA_TYPE` companion fields when `can_send_media()` returns false.

#### Scenario: Account has AccessSendMedia

- **WHEN** the user logs in with an account whose `FieldUserAccess` has bit 57 set
- **THEN** `can_send_media()` SHALL return `true` and the UI SHALL show the attach control as enabled

#### Scenario: Account lacks AccessSendMedia

- **WHEN** the user logs in with an account whose `FieldUserAccess` has bit 57 unset
- **THEN** `can_send_media()` SHALL return `false` and any attempt to send a chat transaction with media SHALL fail locally before transmission

### Requirement: Single-shot media upload

The client SHALL support uploading media bytes in a single `TranUploadMedia` transaction when the bytes fit within the 60 KB chunk threshold. The transaction SHALL contain `DATA_CHAT_MEDIA_PAYLOAD`, optionally `DATA_CHAT_MEDIA_DECLARED_TYPE`, and `DATA_CHAT_MEDIA_PART_FINAL` set to a non-zero value.

The client SHALL parse the reply for `DATA_CHAT_MEDIA_ID`, `DATA_CHAT_MEDIA_TYPE`, `DATA_CHAT_MEDIA_WIDTH`, `DATA_CHAT_MEDIA_HEIGHT`, and `DATA_CHAT_MEDIA_BYTES`. On error, the client SHALL surface a generic error message to the caller.

#### Scenario: Successful single-shot upload

- **WHEN** the client uploads a 40 KB image with declared MIME `image/jpeg`
- **THEN** the client SHALL send one `TranUploadMedia` (750) transaction containing PAYLOAD, DECLARED_TYPE, PART_FINAL=1, and SHALL receive a reply containing the media handle and canonical metadata

#### Scenario: Server rejects single-shot upload

- **WHEN** the client uploads bytes the server rejects (e.g., unsupported format)
- **THEN** the client SHALL receive an error transaction and SHALL surface "Media rejected" (or the server's error text) to the caller

### Requirement: Chunked media upload

The client SHALL support uploading media bytes that exceed the 60 KB single-field threshold by splitting them into ≤60 KB chunks and sending a sequence of `TranUploadMedia` transactions.

The first chunk SHALL include `DATA_CHAT_MEDIA_PAYLOAD`, `DATA_CHAT_MEDIA_PART_COUNT` (total chunk count), and optionally `DATA_CHAT_MEDIA_DECLARED_TYPE`. Subsequent chunks SHALL include `DATA_CHAT_MEDIA_UPLOAD_TOKEN` (echoed from the first reply), `DATA_CHAT_MEDIA_PAYLOAD`, and `DATA_CHAT_MEDIA_PART_INDEX`. The final chunk SHALL additionally set `DATA_CHAT_MEDIA_PART_FINAL` to a non-zero value.

The client SHALL extract the upload token from the first reply, thread it through subsequent chunks, and extract the media handle plus canonical metadata from the final reply.

If the server rejects chunked uploads (e.g., responds with an error on a first chunk where `PART_COUNT > 1`), the client SHALL surface the error to the caller. v1 does not implement automatic resize-and-retry; the UI layer decides how to communicate the failure.

The client SHALL fail an in-flight chunked upload with a timeout error if any chunk reply takes longer than 30 seconds (matching the spec's recommended idle timeout).

#### Scenario: Successful 3-chunk upload

- **WHEN** the client uploads a 150 KB image with declared MIME `image/jpeg`
- **THEN** the client SHALL send chunk 0 with PART_COUNT=3, DECLARED_TYPE; receive a reply containing UPLOAD_TOKEN; send chunks 1 and 2 with the token and incrementing PART_INDEX; the final chunk SHALL have PART_FINAL=1; the final reply SHALL contain MEDIA_ID and canonical metadata

#### Scenario: Server refuses chunking

- **WHEN** the client sends a first chunk with `PART_COUNT > 1` and the server responds with an error
- **THEN** the upload SHALL fail; the client SHALL surface the server's error text to the caller; the client SHALL NOT automatically retry with a smaller payload (deferred to v2)

#### Scenario: Token expiry mid-upload

- **WHEN** more than 30 seconds elapse between sending a chunk and receiving the server's reply
- **THEN** the client SHALL abandon the upload and return a timeout error

### Requirement: Media handle download

The client SHALL fetch media bytes by sending a `TranDownloadMedia` (751) transaction containing `DATA_CHAT_MEDIA_ID` for the requested handle. Replies of `PART_COUNT == 1` (or with `PART_COUNT` absent) SHALL be treated as single-shot. Replies with `PART_COUNT > 1` SHALL be assembled by sending subsequent `TranDownloadMedia` transactions with `MEDIA_ID + PART_INDEX` for each remaining chunk.

The client SHALL validate the assembled bytes' magic bytes against the canonical MIME from `DATA_CHAT_MEDIA_TYPE`:

- `image/jpeg` → starts with `FF D8 FF`
- `image/png` → starts with `89 50 4E 47 0D 0A 1A 0A`
- `image/gif` → starts with `47 49 46 38 37 61` or `47 49 46 38 39 61`

If the magic bytes do not match the declared MIME, the client SHALL discard the bytes, NOT cache them, and surface an error.

#### Scenario: Single-shot download

- **WHEN** the client requests a media handle and the server replies with PART_COUNT=1 (or no PART_COUNT) and a single PAYLOAD
- **THEN** the client SHALL validate magic bytes, cache the entry, and return it to the caller

#### Scenario: Chunked download

- **WHEN** the client requests a media handle and the server replies with PART_COUNT=3
- **THEN** the client SHALL send `TranDownloadMedia` for PART_INDEX=1 and PART_INDEX=2, concatenate the PAYLOAD fields, validate magic bytes, cache, and return

#### Scenario: Magic byte mismatch

- **WHEN** the assembled bytes start with `89 50 4E 47 ...` but the declared MIME is `image/jpeg`
- **THEN** the client SHALL discard the bytes and return an error; the UI SHALL display a fallback "image could not be loaded" placeholder

### Requirement: Session-scoped media cache

The client SHALL maintain a per-connection `HashMap<MediaHandle, MediaEntry>` cache. Cached entries SHALL include the canonical bytes, MIME type, dimensions, byte size, and last-accessed timestamp.

The cache SHALL be cleared on disconnect. The cache SHALL NOT be persisted to disk across application sessions (per the fogWraith spec: "Clients MUST NOT cache media handles across sessions").

The cache SHALL enforce a configurable total-bytes cap (default 64 MB). When inserting an entry would push total cached bytes above the cap, the cache SHALL evict entries in least-recently-accessed order until under the cap.

A `download_media` request SHALL check the cache first; on hit, update `last_accessed` and return the entry without contacting the server.

#### Scenario: Cache hit avoids server roundtrip

- **WHEN** the client has previously downloaded a handle and the entry is still in the cache
- **THEN** a subsequent `download_media` for the same handle SHALL NOT send `TranDownloadMedia`; it SHALL return the cached bytes

#### Scenario: Cache eviction on cap

- **WHEN** the cache is at 63 MB and a 4 MB entry is inserted
- **THEN** the cache SHALL evict least-recently-accessed entries until total bytes ≤ 64 MB; the new entry SHALL be present after eviction

#### Scenario: Cache cleared on disconnect

- **WHEN** the client disconnects from a server (graceful or error)
- **THEN** the media cache SHALL be cleared; reconnection SHALL start with an empty cache

### Requirement: Companion-fields invariant on receive

When parsing an incoming chat transaction (106 / 104 / 106-with-ChatID), the client SHALL validate that `DATA_CHAT_MEDIA_ID` and `DATA_CHAT_MEDIA_TYPE` are either both present or both absent. If exactly one is present, the client SHALL log a warning, drop both fields from the transaction's parsed view, and process the transaction as text-only. The text SHALL still be rendered.

#### Scenario: Both companion fields present

- **WHEN** an incoming chat transaction includes both `MEDIA_ID` and `MEDIA_TYPE`
- **THEN** the client SHALL extract the media metadata, kick off a background download, and emit a `chat-media-received` event alongside the text

#### Scenario: Only MEDIA_ID present

- **WHEN** an incoming chat transaction includes `MEDIA_ID` but not `MEDIA_TYPE`
- **THEN** the client SHALL log a warning, ignore the `MEDIA_ID` field, and emit the chat as text-only

#### Scenario: Neither field present

- **WHEN** an incoming chat transaction has neither `MEDIA_ID` nor `MEDIA_TYPE`
- **THEN** the client SHALL render the transaction as a normal text-only chat message

### Requirement: Send-side integration

The client SHALL allow sending chat transactions (105 / 108 / 105-with-ChatID) with an optional media handle. When the caller supplies a handle, the client SHALL include `DATA_CHAT_MEDIA_ID` and the canonical `DATA_CHAT_MEDIA_TYPE` from the upload reply as companion fields. The text content (`DATA_DATA`) SHALL still be carried; it serves as a caption or fallback.

The client SHALL refuse to send a media-bearing chat transaction when `can_send_media()` is false; the failure SHALL surface to the caller before any bytes are placed on the wire.

#### Scenario: Send chat with media

- **WHEN** the user attaches an image, the upload completes successfully, and the user sends "look at this", the client SHALL send a TranChatSend (105) with DATA_DATA="look at this", DATA_CHAT_MEDIA_ID, DATA_CHAT_MEDIA_TYPE
- **THEN** the server SHALL relay to capable peers with the media fields and to legacy peers with text only

#### Scenario: Send blocked by privilege

- **WHEN** `can_send_media()` is false and the caller invokes `send_chat` with a media handle
- **THEN** the call SHALL fail with "media send not permitted" before any transaction is sent
