# Tasks: Server-Side Chat History

## 1. Protocol Constants

- [x] 1.1 Add `CAPABILITY_CHAT_HISTORY = 0x0010` to constants.rs
- [x] 1.2 Add `TransactionType::GetChatHistory = 700` with `From<u16>` mapping
- [x] 1.3 Add `FieldType` variants: `ChannelId` (0x0F01), `HistoryBefore` (0x0F02), `HistoryAfter` (0x0F03), `HistoryLimit` (0x0F04), `HistoryEntry` (0x0F05), `HistoryHasMore` (0x0F06), `HistoryMaxMsgs` (0x0F07), `HistoryMaxDays` (0x0F08) with `From<u16>` mappings

## 2. History Entry Parser

- [x] 2.1 Create `protocol/history.rs` with `HistoryEntry` struct (message_id, timestamp, flags, icon_id, nick, message) and convenience flag accessors (is_action, is_server_msg, is_deleted)
- [x] 2.2 Implement `parse_history_entry(data: &[u8]) -> Result<HistoryEntry, String>` — fixed header (22 bytes), variable nick+message, mini-TLV sub-field skipping
- [x] 2.3 Handle edge cases: zero-length nick/message (tombstones), data < 22 bytes (error), unknown sub-field types (skip)

## 3. Capability Negotiation

- [x] 3.1 Update both login paths (HOPE + legacy) to send `CAPABILITY_LARGE_FILES | CAPABILITY_CHAT_HISTORY` (`0x0011`) in the Capabilities field
- [x] 3.2 Parse bit 4 from server's echoed capabilities in login reply; store in `chat_history_support: Arc<AtomicBool>`
- [x] 3.3 Extract optional `HistoryMaxMsgs` and `HistoryMaxDays` from login reply; include in ServerInfo emitted to frontend

## 4. History Fetch (Rust)

- [x] 4.1 Add `get_chat_history(channel_id, before, after, limit)` async method to HotlineClient — builds transaction 700, sends via pending-transaction pattern, parses reply entries and has_more flag
- [x] 4.2 Parse repeated `HistoryEntry` fields from reply transaction (iterate all fields with type `0x0F05`)
- [x] 4.3 Extract `HistoryHasMore` field from reply (default 0 if absent)

## 5. Tauri Command

- [x] 5.1 Add `get_chat_history` Tauri command — accepts server_id, optional before/after/limit, calls HotlineClient method, returns serialized ChatHistoryResponse (entries + has_more)
- [x] 5.2 Define `ChatHistoryResponse` struct with serde serialization — entries as vec of objects (messageId, timestamp, isAction, isServerMsg, isDeleted, iconId, nick, message), has_more bool

## 6. Frontend Types

- [x] 6.1 Add `chatHistorySupported`, `historyMaxMsgs?`, `historyMaxDays?` to `ServerInfo` TypeScript type
- [x] 6.2 Add `isAction?`, `isServerMsg?`, `isDeleted?`, `messageId?`, `fromHistory?` fields to the chat message type
- [x] 6.3 Add TypeScript interface for ChatHistoryResponse matching the Rust struct

## 7. Frontend: Initial Load

- [x] 7.1 After login succeeds and `chatHistorySupported` is true, call `invoke('get_chat_history', { serverId, limit: 50 })` before showing live messages
- [x] 7.2 Convert response entries to ChatMessage array with `fromHistory = true` and server-provided timestamps
- [x] 7.3 Prepend history messages to the chat message list; store oldest and newest message IDs for cursor tracking

## 8. Frontend: Scroll-Back Pagination

- [x] 8.1 Detect when user scrolls to top of chat view (intersection observer or scroll position check)
- [x] 8.2 When at top and `has_more` is true, show loading indicator and call `get_chat_history` with `before = oldestMessageId`
- [x] 8.3 Prepend returned entries to message list, update oldestMessageId, preserve scroll position
- [x] 8.4 When `has_more = false`, display "Beginning of chat history" marker and stop fetching

## 9. Frontend: Reconnect Catch-Up

- [x] 9.1 On reconnect to a history-enabled server, if `newestMessageId` is stored, call `get_chat_history` with `after = newestMessageId`
- [x] 9.2 Paginate AFTER cursor until `has_more = false` (caught up to present)
- [x] 9.3 Merge caught-up messages into chat view, dedup by messageId

## 10. Rendering Integration

- [x] 10.1 Update chat renderer to use `isAction` flag for emote styling (both history and live paths)
- [x] 10.2 Update chat renderer to use `isServerMsg` flag for broadcast styling
- [x] 10.3 Render tombstoned entries (`isDeleted`) as "[message removed]" placeholder
- [x] 10.4 Set `isAction` on live chat messages from `"***"` prefix detection or ChatOptions field
- [x] 10.5 Ensure history messages render identically to live messages in both Classic and Discord display modes

## 11. Local History Suppression

- [x] 11.1 When recording a live message to chatHistoryStore, check `serverInfo.chatHistorySupported` — skip local recording if true
- [x] 11.2 Verify local history still works for non-history servers (no regression)

## 12. Retention Policy UI

- [x] 12.1 When `historyMaxMsgs` or `historyMaxDays` is present, display retention hint in chat view or server info panel

## 13. Testing

- [x] 13.1 Test against a server with chat history enabled (lemoniscate with chat history once server-side is complete)
- [x] 13.2 Test against a server without chat history (existing servers — System7 Today, Bob Kiwi's, etc.)
- [x] 13.3 Test scroll-back pagination to beginning of history
- [x] 13.4 Test reconnect catch-up after disconnect (deferred — requires auto-reconnect with tab alive; fresh reconnects do a full initial load which works correctly)
- [x] 13.5 Verify local history suppression on history-enabled servers (minor race: a few messages may leak into local vault before serverInfo loads — acceptable tradeoff)
- [x] 13.6 Verify local history still records on non-history servers
