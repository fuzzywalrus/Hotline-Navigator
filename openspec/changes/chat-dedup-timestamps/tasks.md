## 1. Chat Message Model Updates

- [x] 1.1 Add `isServerHistory?: boolean` flag to `ChatMessage` interface in `serverTypes.ts`
- [x] 1.2 Add `isServerHistory?: boolean` flag to `StoredChatMessage` interface in `serverTypes.ts`
- [x] 1.3 Add `isServerHistory?: boolean` flag to `ChatMessage` interface in `ChatTab.tsx`

## 2. Replay Deduplication

- [x] 2.1 Add replay filter state ref to `useServerEvents` — track mode (`idle` / `replay_filter` / `live`), gap timer, safety timeout, message counter, and stored message tail
- [x] 2.2 On `logged-in` status, enter `replay_filter` mode: load last 200 stored messages, start 3-second gap timer and 60-second safety timeout
- [x] 2.3 During `replay_filter`, compare each incoming chat message text against stored tail — skip duplicates, add non-matches with `isServerHistory: true`
- [x] 2.4 Transition to `live` mode when gap timer fires (3s), count limit reached (200), or safety timeout expires (60s)
- [x] 2.5 Reset replay filter state on disconnect/failed
- [x] 2.6 Skip chat sound for server history messages
- [x] 2.7 Skip persisting server history messages to chat history store (they're from replay, not new)

## 3. Timestamp Preference

- [x] 3.1 `showTimestamps` preference already exists (default: true) — no changes needed
- [x] 3.2 Settings toggle already exists — no changes needed

## 4. Chat UI Rendering

- [x] 4.1 Render "Server History" divider label before the first server history message (when `showTimestamps` enabled)
- [x] 4.2 Render time divider with `formatTime()` when transitioning from server history back to live messages
- [x] 4.3 Dividers applied to all message types (broadcast, join/leave, regular)
- [ ] 4.4 Test against VesperNet: reconnect and verify dedup + Server History label
