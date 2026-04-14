## Why

The current chat UI is IRC-style (one line per message, no user icons, flat text). This works but feels dated compared to modern chat clients. Adding a Discord-style display mode gives users a richer chat experience with message grouping, user icons, inline images, and better visual hierarchy — while keeping the retro IRC look as the default for users who prefer it.

## What Changes

### Chat display mode preference

Add a `chatDisplayMode` preference: `"retro"` (default) or `"discord"`. This controls which chat renderer is used for live chat. Chat history loaded from storage always renders in retro mode.

### Retro mode (current behavior + new options)

The existing IRC-style chat, plus new optional features:

- **Clickable links** — existing, togglable
- **Show timestamps** — existing, togglable
- **Inline images** — new, togglable. When enabled, URLs ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` are rendered as inline image previews instead of text URLs
- **User mentions** — new, togglable. Highlight @username mentions in messages

All options are individually togglable in retro mode.

### Discord mode

A new chat renderer with Discord-style presentation:

- **Message batching** — consecutive messages from the same user are grouped under one header. A batch breaks when: the sender changes, a system message (join/leave) appears, or there's a 5+ minute time gap
- **User icons** — the sender's Hotline icon (from the icon system) rendered at ~32px, left-aligned, shown only on the first message of a batch
- **Username + timestamp header** — sender name in bold + timestamp to the right, shown only on the first message of a batch. Continuation messages are indented under the header with no name/timestamp
- **Inline images** — always on. Image URLs auto-expand as previews; the URL text is hidden when the image renders
- **Clickable links** — always on
- **User mentions** — always on

In Discord mode, the retro-specific toggles (clickable links, show timestamps, inline images, user mentions) are greyed out in settings since Discord mode controls them.

### Settings UI

The chat settings section becomes mode-aware:

```
Chat Display Mode: [Retro ▾] / [Discord ▾]

When Retro selected:
  ☑ Show Timestamps        (togglable)
  ☑ Clickable Links        (togglable)
  ☐ Inline Images          (togglable)
  ☐ User Mentions          (togglable)

When Discord selected:
  ☑ Show Timestamps        (greyed out — always on)
  ☑ Clickable Links        (greyed out — always on)
  ☑ Inline Images          (greyed out — always on)
  ☑ User Mentions          (greyed out — always on)
```

### Message data changes

Add `iconId` to `ChatMessage` when received, captured from the sender's current user entry. This ensures the correct icon is stored even if the user changes their icon mid-session.

## Capabilities

### New Capabilities
- `discord-chat-mode`: Discord-style chat renderer with message batching, user icons, inline images, and grouped timestamps

### Modified Capabilities
- `public-chat`: Add chat display mode toggle, inline image rendering, user mention highlighting
- `settings`: Add chat display mode selector and mode-aware option visibility

## Impact

- **ChatMessage interface**: Add `iconId?: number` field
- **useServerEvents**: Capture sender's `iconId` when processing chat messages
- **ChatTab.tsx**: Add Discord-mode renderer alongside existing retro renderer, selected by preference
- **Preferences store**: Add `chatDisplayMode`, `inlineImages`, `userMentions` preferences
- **Settings UI**: Add mode selector and conditional option visibility
- **UserIcon component**: Already exists, reuse for Discord mode message headers
- **Image detection**: Simple URL regex — no fetching or content-type checking
- **No backend changes** — purely frontend rendering
