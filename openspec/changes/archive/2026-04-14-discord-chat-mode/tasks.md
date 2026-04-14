## Stage 1: Foundation (Data Model, Preferences, Settings UI)

### 1. Message Data Model

- [x] 1.1 Add `iconId?: number` to `ChatMessage` interface in `serverTypes.ts`
- [x] 1.2 Add `iconId?: number` to `StoredChatMessage` interface in `serverTypes.ts`
- [x] 1.3 Add `iconId?: number` to `ChatMessage` interface in `ChatTab.tsx`
- [x] 1.4 Capture sender's `iconId` from `usersRef` when processing chat messages in `useServerEvents.ts`
- [x] 1.5 Persist `iconId` to chat history store when saving messages
- [x] 1.6 Pass `iconId` through when loading history in `ServerWindow.tsx`

### 2. Preferences

- [x] 2.1 Add `chatDisplayMode: 'retro' | 'discord'` preference (default: `'discord'`)
- [x] 2.2 (Existing) `showInlineImages` and `mentionPopup` already handle inline images and mentions in retro mode
- [x] 2.3 Add Chat Display Mode selector to Settings UI
- [x] 2.4 Grey out retro-specific toggles (timestamps, clickable links) when Discord mode selected

## Stage 2: Discord Renderer

- [x] 3.1 Create `DiscordChatRenderer` component with message batching, user icons, and grouped timestamps
- [x] 3.2 Implement message batching logic: break on different sender, system messages, server history, or 5+ minute gap
- [x] 3.3 Render user icons (UserIcon component, 32px) on first message of each batch
- [x] 3.4 Render username + timestamp header on first message, continuation messages indented without header
- [x] 3.5 Inline images always on via MarkdownText with hideImageUrls (URL hidden when image renders)
- [x] 3.6 Clickable links always on in Discord mode
- [x] 3.7 Server history messages render retro-style (no icon, no batching)
- [x] 3.8 Wire `chatDisplayMode` toggle to switch between retro and Discord renderers in ChatTab
- [x] 3.9 Strip username prefix from message text in Discord renderer
- [x] 3.10 Resolve user icon by userName fallback when userId is 0
- [x] 3.11 Deduplicate join/leave system messages
- [x] 3.12 Tested against Hotline Central Hub and Apple Media Archive
