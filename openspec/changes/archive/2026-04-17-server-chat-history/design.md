# Design: Server-Side Chat History

## Overview

Implement the Hotline Chat History Extension in Hotline Navigator. Negotiate capability bit 4 during login, send `TRAN_GET_CHAT_HISTORY` (700) requests, parse packed binary history entries, and integrate them into the existing chat rendering pipeline. Server history replaces local Stronghold persistence when available.

## Components

### 1. Protocol Constants (constants.rs)

Add `CAPABILITY_CHAT_HISTORY = 0x0010`, `TransactionType::GetChatHistory = 700`, and eight new `FieldType` variants (`ChannelId` through `HistoryMaxDays`, `0x0F01`–`0x0F08`). Extend `From<u16>` impls for both enums.

### 2. History Entry Parser (new: protocol/history.rs)

New module with `parse_history_entry(data: &[u8]) -> Result<HistoryEntry, String>`. Parses the packed binary format: fixed header (22 bytes), variable nick + message, optional mini-TLV sub-fields (skip unknown types).

Returns a `HistoryEntry` struct:
```rust
pub struct HistoryEntry {
    pub message_id: u64,
    pub timestamp: i64,      // Unix epoch seconds
    pub flags: u16,
    pub icon_id: u16,
    pub nick: String,
    pub message: String,
    // Convenience flag accessors
}
```

The parser must handle:
- Zero-length nick/message (tombstoned entries)
- Unknown sub-field types (skip using sub-length)
- Data shorter than minimum (22 bytes) → error
- Text encoding: UTF-8 (since we negotiate CAPABILITY_TEXT_ENCODING)

### 3. Capability Negotiation (protocol/client/mod.rs)

**Login path** — both HOPE and legacy login branches already send `Capabilities` field. Change from `CAPABILITY_LARGE_FILES` to `CAPABILITY_LARGE_FILES | CAPABILITY_CHAT_HISTORY` (value `0x0011`).

**Login reply** — after extracting `server_capabilities`, check bit 4. Store result in a new `Arc<AtomicBool>` field `chat_history_support`. Also extract optional `HistoryMaxMsgs` and `HistoryMaxDays` fields from the reply and include them in the `ServerInfo` emitted to the frontend.

### 4. History Fetch API (protocol/client/chat.rs or new history.rs)

New async method on `HotlineClient`:

```rust
pub async fn get_chat_history(
    &self,
    channel_id: u32,
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<u16>,
) -> Result<(Vec<HistoryEntry>, bool), String>  // (entries, has_more)
```

Builds a transaction 700 with the appropriate fields, sends via pending-transaction pattern (request/reply with 10s timeout), parses repeated `HistoryEntry` fields from the reply, and returns entries oldest-first with the `has_more` flag.

### 5. Tauri Command (commands/mod.rs)

New command `get_chat_history` exposed to the frontend:

```rust
#[tauri::command]
pub async fn get_chat_history(
    server_id: String,
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<u16>,
    state: State<'_, AppState>,
) -> Result<ChatHistoryResponse, String>
```

Returns a `ChatHistoryResponse` with serialized entries (message_id, timestamp, flags as booleans, icon_id, nick, message) and `has_more`. Channel ID is always 0 (public chat) for now.

### 6. Frontend: ServerInfo Extension (types/index.ts)

Add to `ServerInfo`:
- `chatHistorySupported: boolean`
- `historyMaxMsgs?: number`
- `historyMaxDays?: number`

### 7. Frontend: Chat Message Normalization

Add explicit flags to the chat message type:

```typescript
interface ChatMessage {
  // existing fields...
  isAction?: boolean;       // /me emote
  isServerMsg?: boolean;    // server broadcast
  isDeleted?: boolean;      // tombstoned (history only)
  messageId?: number;       // server-assigned ID (history only)
  fromHistory?: boolean;    // distinguish history vs live
}
```

**Live path**: set `isAction` from `"***"` prefix detection (existing logic), set `isServerMsg` from userId=0 check (existing logic).

**History path**: set flags from entry `flags` field. Set `fromHistory = true`.

Renderer checks `isAction` / `isServerMsg` / `isDeleted` flags instead of re-parsing text.

### 8. Frontend: Initial Load on Connect

When `chatHistorySupported` is true, after login succeeds:
1. Call `get_chat_history(serverId, null, null, 50)` — fetch 50 most recent messages
2. Convert entries to `ChatMessage[]` with `fromHistory = true`
3. Prepend to the message list before any live messages arrive
4. Store `oldestMessageId` and `newestMessageId` for cursor tracking
5. If `has_more`, note that scroll-back is available

### 9. Frontend: Scroll-Back Pagination

When user scrolls to the top of the chat view and `has_more` is true:
1. Show loading indicator at top
2. Call `get_chat_history(serverId, oldestMessageId, null, 50)`
3. Prepend returned entries to message list
4. Update `oldestMessageId` from oldest returned entry
5. If `has_more = false`, show "Beginning of chat history" marker
6. Preserve scroll position (don't jump to top)

### 10. Frontend: Reconnect Catch-Up

On reconnect to a history-enabled server:
1. If we have a `newestMessageId` from the previous session, call `get_chat_history(serverId, null, newestMessageId, 50)`
2. Paginate with AFTER cursor until `has_more = false` (caught up)
3. Merge into existing message list (dedup by messageId)
4. Resume live message display

### 11. Local History Toggle

When connected to a history-enabled server, skip calling `chatHistoryStore.addMessage()` for live messages. The store continues to operate normally for non-history servers.

Detection: check `serverInfo.chatHistorySupported` before writing to local store.

## Key Decisions

- **Single parser module** — `protocol/history.rs` owns the binary format, returns clean Rust structs
- **Pending-transaction pattern** — reuse existing request/reply mechanism (mpsc channel with 10s timeout), same as file list, user info, etc.
- **Channel 0 hardcoded** — only public chat for now, named channels are future work
- **No local cache of server history** — history lives on the server, we fetch on demand. Deferred: optional local backup
- **Scroll preservation** — prepending history entries must not disrupt the user's scroll position
- **Tombstones** — display `[message removed]` placeholder, don't attempt to recover content

## Implementation Notes

### Message ID Precision (u64 → JavaScript)

Message IDs are `u64` on the wire, but JavaScript's `Number` only safely represents integers up to 2^53. If a server uses snowflake-style IDs or high counters, precision would be lost. The Rust→JS serialization in `ChatHistoryResponse` must serialize message IDs as **strings**, not numbers. On the TypeScript side, `messageId` should be typed as `string` and cursor values passed back to `get_chat_history` as strings (converted back to `u64` in the Tauri command). This avoids any silent truncation regardless of the server's ID generation scheme.

### Text Encoding

The spec says history entries are transcoded to the client's negotiated text encoding. Currently we only advertise `CAPABILITY_LARGE_FILES` (bit 0) — we do **not** send `CAPABILITY_TEXT_ENCODING` (bit 1). This means history entries arrive as Mac Roman, not UTF-8. The existing `to_string()` method on `TransactionField` handles Mac Roman decoding, and the history entry parser should use the same decoding path for nick and message fields.

If we later add `CAPABILITY_TEXT_ENCODING` (bit 1) to the capability bitmask, the server would send history entries as UTF-8 instead. The parser should be encoding-aware — or at minimum use `String::from_utf8_lossy` which handles both gracefully.
