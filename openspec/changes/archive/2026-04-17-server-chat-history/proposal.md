# Server-Side Chat History

## Problem

Hotline Navigator currently stores chat history locally in an encrypted Stronghold vault. This works for a single device, but:
- History is invisible to other clients, other devices, and new installations
- No shared record of conversation — connect to a busy server and see nothing before your arrival
- Disconnect and reconnect: the conversation is gone (from the server's perspective)
- Local-only history can't benefit from server retention policies or admin moderation

The Hotline protocol treats chat as a real-time stream — messages are broadcast and forgotten. The [Chat History Extension](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Chat-History.md) adds server-side persistence with cursor-based pagination, allowing clients to scroll back through history, catch up after being offline, and present chat as a continuous conversation.

## Proposal

Implement the Chat History Extension (capability bit 4, transaction 700) in Hotline Navigator. When connected to a server that supports chat history, the client will:

1. **Negotiate** — advertise `CAPABILITY_CHAT_HISTORY` (bit 4) during login, detect server support from the echoed capability
2. **Initial load** — on connect, fetch the most recent messages via `TRAN_GET_CHAT_HISTORY` (700) and display them in the chat view with server-provided timestamps before showing live messages
3. **Scroll-back** — when the user scrolls up, fetch older messages using BEFORE cursors, until "beginning of chat history" is reached
4. **Reconnect catch-up** — on reconnect, use an AFTER cursor from the last known message ID to fetch everything missed while offline
5. **Disable local recording** — when server history is available, skip writing to the local Stronghold vault (local history remains the fallback for non-history servers)

## Architecture

```
LOGIN NEGOTIATION
┌────────────────┐                    ┌────────────────┐
│     Client     │── Login(107) ─────▶│     Server     │
│  caps = 0x0011 │   bit 0 + bit 4    │                │
│                │◀── Reply ──────────│  caps = 0x0011 │
│                │   + MaxMsgs hint   │  + retention   │
│                │   + MaxDays hint   │    policy      │
└────────────────┘                    └────────────────┘
       │
       ▼  bit 4 echoed? → server_chat_history = true
       
INITIAL LOAD (on connect, before showing chat)
┌────────────────┐                    ┌────────────────┐
│     Client     │── 700 ────────────▶│     Server     │
│  channel=0     │   no cursors       │                │
│  limit=50      │                    │  query storage │
│                │◀── Reply ──────────│                │
│                │   N entries        │                │
│                │   + has_more flag  │                │
└────────────────┘                    └────────────────┘
       │
       ▼  render history entries → then show live messages

SCROLL-BACK (user scrolls up)
┌────────────────┐                    ┌────────────────┐
│     Client     │── 700 ────────────▶│     Server     │
│  channel=0     │                    │                │
│  before=<oldest_id>                 │                │
│  limit=50      │                    │                │
│                │◀── Reply ──────────│                │
│                │   older entries    │                │
│                │   has_more=0?      │                │
└────────────────┘   → "beginning     └────────────────┘
                       of history"

RECONNECT CATCH-UP
┌────────────────┐                    ┌────────────────┐
│     Client     │── 700 ────────────▶│     Server     │
│  channel=0     │                    │                │
│  after=<last_known_id>              │                │
│  limit=50      │                    │                │
│                │◀── Reply ──────────│  (paginate     │
│                │   missed msgs     │   until        │
│                │   has_more=1?     │   caught up)   │
│                │   → fetch more    │                │
└────────────────┘                    └────────────────┘
```

### Local History Coexistence

```
Server negotiated bit 4?
├── YES → Use server history for scrollback, catch-up, initial load
│         Skip local Stronghold recording for this server
│         (Future: optional local backup toggle — deferred)
│
└── NO  → Current behavior unchanged
          Local Stronghold vault records messages
          No scrollback beyond current session
          No catch-up on reconnect
```

## Protocol Details

Reference: [Capabilities-Chat-History.md](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Chat-History.md)

### New Constants

| Type | Name | Value | Description |
|------|------|-------|-------------|
| Capability | `CAPABILITY_CHAT_HISTORY` | `0x0010` (bit 4) | Client supports server-side chat history |
| Transaction | `GetChatHistory` | 700 | Request a batch of historical messages |
| Field | `ChannelId` | `0x0F01` (3841) | Persistent channel ID. 0 = public chat |
| Field | `HistoryBefore` | `0x0F02` (3842) | Cursor: messages with IDs < this value |
| Field | `HistoryAfter` | `0x0F03` (3843) | Cursor: messages with IDs > this value |
| Field | `HistoryLimit` | `0x0F04` (3844) | Max messages to return |
| Field | `HistoryEntry` | `0x0F05` (3845) | Packed binary history entry |
| Field | `HistoryHasMore` | `0x0F06` (3846) | 1 = more messages available |
| Field | `HistoryMaxMsgs` | `0x0F07` (3847) | Server retention: max messages |
| Field | `HistoryMaxDays` | `0x0F08` (3848) | Server retention: max days |
| Access | `accessReadChatHistory` | bit 56 | Permission to request chat history |

### Binary Entry Format (DATA_HISTORY_ENTRY)

Each `0x0F05` field contains a packed binary struct — not standard TLV:

```
Offset  Size  Field
──────  ────  ─────────────────────────────
0       8     message_id    (uint64 BE)
8       8     timestamp     (int64 BE, Unix epoch seconds)
16      2     flags         (uint16 BE)
18      2     icon_id       (uint16 BE)
20      2     nick_len      (uint16 BE)
22      N     nick          (nick_len bytes)
22+N    2     msg_len       (uint16 BE)
24+N    M     message       (msg_len bytes)
24+N+M  ...   sub-fields    (mini-TLV, skip unknown types)
```

Flag bits: `0x0001` = is_action (emote), `0x0002` = is_server_msg, `0x0004` = is_deleted (tombstone)

## Rendering Integration

### Normalized Message Flags

Both live and history messages converge into the same message struct with explicit flags:

| Flag | History source | Live source |
|------|---------------|-------------|
| `isAction` | Entry flags bit 0 | ChatOptions = 1 or `"***"` prefix detection |
| `isServerMsg` | Entry flags bit 1 | userId = 0 / "Server" username |
| `isDeleted` | Entry flags bit 2 | N/A (live messages aren't tombstoned) |

The renderer checks these flags instead of parsing message text format. Both paths converge.

### Discord Mode

Server-side history is a natural fit for Discord mode — chat opens with history already loaded, timestamps come from the server, scroll-back loads older messages. The "beginning of chat history" marker replaces the current empty state.

### Retention Policy Display

When the server provides `HistoryMaxMsgs` / `HistoryMaxDays` in the login reply, display an informational hint in the chat UI (e.g., "This server keeps 30 days of chat history").

## What This Does NOT Change

- Live chat broadcast path (`TRAN_CHAT_MSG` 106) is completely unchanged
- Private chat rooms remain ephemeral (no server-side history per spec)
- Local Stronghold vault still used for servers without chat history support
- Bookmark structure unchanged
- HOPE/TLS negotiation unchanged (capability bits stack: `0x0011` → `0x0013` etc.)

## Future Work (Deferred)

- Optional local backup of server history (toggle in settings to record locally even when server provides history)
- Named channels (channel IDs 1+, reserved in spec for future Discord-style `#channel` support)
- Reply-to threading (mini-TLV sub-field `0x0002`, reserved in spec)

## Decisions

- [x] Server history replaces local persistence when available (not additive)
- [x] Initial load fetches recent messages on connect (Discord-style, not lazy)
- [x] Normalize emote/server-msg detection via flags on message struct (both live and history paths)
- [x] Optional local backup deferred to future work
- [x] Named channels deferred (channel 0 only for now)
