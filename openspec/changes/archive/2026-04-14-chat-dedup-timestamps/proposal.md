## Why

Some Hotline servers (notably Janus) replay chat history to clients on connect. When a client with persisted chat history reconnects, the replayed messages duplicate what's already stored — the user sees the same conversation twice. Additionally, messages from server replay should be clearly labeled to distinguish them from client-stored history and live messages.

## What Changed

### Server replay deduplication

On reconnect, a replay filter suppresses duplicate messages from server chat replay. The filter activates lazily on the first incoming chat message if there are displayed messages to compare against. It compares each incoming message against the last 200 displayed messages. Duplicates are silently dropped. Non-matching messages (from while the user was offline) are added but flagged as "Server History."

The filter ends when: no chat message arrives for 3 seconds, 200+ messages are processed, or a 60-second safety timeout expires.

### Server History labeling

Messages flagged as server history display under a "Server History" divider in the chat UI. These messages do not show timestamps (since the original receive time is unknown). A time divider appears when transitioning from server history back to live messages.

### No sound for replay

Server history messages do not play the chat notification sound and are not persisted to the client's encrypted chat history (they're replayed, not new).
