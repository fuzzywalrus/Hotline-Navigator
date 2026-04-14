## Why

Some Hotline servers (notably Janus) replay chat history to clients on connect. When a client with persisted chat history reconnects, the replayed messages duplicate what's already stored — the user sees the same conversation twice. Additionally, the chat UI currently shows no timestamps, making it hard to distinguish when messages arrived.

## What Changes

### 1. Server replay deduplication

On reconnect, suppress duplicate messages from the server's chat replay. The client enters a REPLAY_FILTER mode after login and compares each incoming chat message against the last 200 stored messages for that server. Duplicates are silently dropped. Messages from the replay that the client doesn't have (from while the user was offline) are added but flagged as "Server History."

The replay window ends when no chat message arrives for 3 seconds (the server replay sends lines at ~0.5s intervals), or after a 60-second safety timeout.

```
On logged-in:
  → enter REPLAY_FILTER mode
  → start 60-second safety timeout

During REPLAY_FILTER:
  each incoming chat message:
    matches last 100 stored? → skip (duplicate)
    doesn't match?           → add, flag as "Server History"
    reset 3-second gap timer

  gap timer fires (no message for 3 sec)?  → transition to LIVE
  200+ messages processed in filter mode?  → transition to LIVE
  safety timeout (60 sec)?                 → transition to LIVE

During LIVE:
  all messages added normally, no dedup, no flags
```

### 2. Client-side timestamps in chat

Add optional timestamps to chat messages, controlled by a user preference ("Show Timestamps" toggle in Settings). When enabled, timestamps are rendered in the chat as time separators between message groups. The timestamp is the client's local time when the message was received.

Messages flagged as "Server History" display a "Server History" label instead of a timestamp, since their original receive time is unknown.

```
 Server History
  fogWraith: Hello there, if you get this message...
  Ashburn: That is pretty cool, how far back does it go?
  fogWraith: Well, the default is 30 lines...

 14:32
  dmg: Hey everyone, just reconnected
  fogWraith: Welcome back!
```

### 3. Timestamp preference

Add a "Show Timestamps" boolean preference (default: false) to the preferences store. When off, no timestamps or "Server History" labels are shown — chat looks identical to today.

## Capabilities

### Modified Capabilities
- `public-chat`: Add replay deduplication on reconnect, "Server History" message tagging, and optional client-side timestamp display
- `settings`: Add "Show Timestamps" toggle

## Impact

- **Chat message model**: Add optional `isServerHistory` flag to `ChatMessage` and `StoredChatMessage` interfaces
- **useServerEvents.ts**: Add replay filter state machine — compare incoming messages against stored history tail during the replay window
- **Chat UI component**: Render timestamps and "Server History" labels between message groups when preference is enabled
- **Preferences store**: Add `showTimestamps` boolean
- **Settings UI**: Add toggle
- **No backend changes** — all logic is client-side
- **No protocol changes** — the Hotline ChatMessage transaction has no timestamp field; client-side timestamps are generated on receipt
