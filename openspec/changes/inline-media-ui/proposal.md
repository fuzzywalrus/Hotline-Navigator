## Why

`inline-media-protocol` adds the Rust wire layer for inline images. This change adds the React UX: attach controls, drag-drop integration, paste-to-attach, preflight size gate, placeholder-then-image rendering on receive, the `imageUploadSizeKb` preference, and the chat message struct refactor needed to carry media metadata alongside text.

v1 ships **without client-side resize**: if a user picks an image larger than their `imageUploadSizeKb` preference (default 256 KB, max 2 MB), Navigator rejects it locally with "image too large; pick a smaller one or change the limit in Preferences." Smart resize is the deliberate v2 follow-up (`inline-media-resize`) — shipping it later with usage data is cheaper than designing it speculatively.

## What Changes

### ChatMessage struct widening

Currently chat messages on the frontend are strings (or string-ish objects). Inline media forces them to become structured:

```ts
interface ChatMessage {
  id: string;
  text: string;
  authorUid: number;
  timestamp: Date;
  media?: {
    handle: string;       // hex-encoded MediaHandle
    mime: string;
    width: number;
    height: number;
    byteSize: number;
    bytesUrl?: string;    // lazy-resolved blob URL once download completes
    state: 'placeholder' | 'loading' | 'loaded' | 'failed';
  };
  // ...existing fields (color, options, etc.)
}
```

This refactor is the largest single piece of UI work. Every chat-rendering site touches the new struct.

### Attach UI

- Compose-bar attach button (paperclip icon) — opens native file picker via `tauri-plugin-fs`. Disabled when `inline_media_supported` is false or `can_send_media()` returns false; tooltip explains.
- Drag-drop via `<DropZone accept="image">` from `drop-zone-infrastructure` — wraps the chat input area
- Paste-to-attach — listen for `paste` events on chat input; if clipboard has an image, treat it as an attached file
- Once attached, show an inline chip above the text input:
  ```
  [📎 IMG_4231.jpeg · 240 KB · 1280×720  ✕]
  ```
- Caption: the regular text input. User types caption, hits Enter to send.

### Preflight size gate

```
on attach:
  read file → bytes, mime
  if bytes.length > pref.imageUploadSizeKb * 1024:
    show toast: "Image is X KB, exceeds your Y KB limit.
                 Pick a smaller image or adjust in Preferences."
    do NOT attach
  else:
    attach (show chip, await caption + send)
```

No silent rejection. No retry. User decides.

### Send flow

```
on send (with attached image):
  invoke('upload_media', { server_id, bytes, declared_mime })
    → returns { handle, mime, width, height, byte_size }
  invoke('send_chat', { server_id, text, media })
    → optimistic echo with state='loaded' (we have local bytes)
  on success: clear attach chip, clear input
  on error: keep chip + caption, show retry toast
```

### Receive flow

```
on chat-media-received event:
  - render placeholder with server-supplied dims (width × height)
  - placeholder shows: [📎 image/jpeg · 234 KB · 1920×1080] (filename if known — see note)
  - kick off download (Rust handles cache check + fetch automatically)
  - on chat-media-bytes event: replace placeholder with actual image
  - on download error: show fallback "image could not be loaded"
```

Filename caveat: spec doesn't carry filename. For sender-side display we know our own filename; for received messages we don't. Display `image/jpeg` in the metadata line. We're proposing a filename field upstream — if/when it lands, this gets a real filename for received images too.

### Preferences

Add an "Image attachments" section to the preferences UI:

```
Image attachments
─────────────────────────────────────────
[ ] Enable inline images
    (default: on. Off = bit 3 not advertised, no images sent or received)

Maximum upload size: [ 256 KB ▼ ]
                     ├── 256 KB  (Recommended)
                     ├── 512 KB
                     ├── 1 MB
                     └── 2 MB

Smaller is faster and works on more servers.
Images larger than this limit will be rejected when you try to attach.
```

Persist via the existing `preferencesStore`:

```ts
{
  inlineMediaEnabled: boolean;       // default true
  imageUploadSizeKb: 256 | 512 | 1024 | 2048;  // default 256
}
```

### Render integration

Two render contexts to update:
1. **Live chat / PMs** — `DiscordChatRenderer` and `ChatTab` paths
2. **Chat history** — when chat-history extension is active and we render historical messages, media handles may be expired. Display the metadata-only placeholder per spec's "metadata-only entry by default" guidance: `[image: image/jpeg, 234 KB, 1920×1080]`.

### Chat input enhancements

- Drop zone on the chat input area, accepting `image`
- Paste handler on the chat input, intercepting clipboard images
- Attach chip above the input when an image is staged
- Send button disabled until either text or image is present
- Privilege check disables attach affordances entirely when `can_send_media()` is false

## Capabilities

### New Capabilities

- `inline-media-ui`: User-facing inline-image attach and rendering — attach button, drag-drop integration, paste-to-attach, preflight size gate, placeholder-then-image render, media-aware ChatMessage struct, preferences for enable/disable and size limit, privilege-aware UI gating.

### Modified Capabilities

- `public-chat`: Document the rendering of inline images within the chat view, the send-side integration with the attach controls, and the placeholder-then-image flow.
- `private-messaging`: Same as above, in PM context.
- `private-chat-rooms`: Same as above, in chat-room context.
- `settings`: Add the "Image attachments" preferences section (`inlineMediaEnabled`, `imageUploadSizeKb`).

## Impact

- **Frontend**:
  - New `src/components/chat/AttachChip.tsx` — the inline chip showing a staged image
  - New `src/components/chat/MediaImage.tsx` — placeholder-then-image renderer with state machine
  - Modified `src/components/chat/ChatTab.tsx` — input bar with attach button + DropZone + paste handler
  - Modified `src/components/chat/DiscordChatRenderer.tsx` — render media alongside text
  - Modified `src/types/index.ts` — `ChatMessage` widened with `media?: ChatMessageMedia`
  - Modified `src/stores/preferencesStore.ts` — `inlineMediaEnabled`, `imageUploadSizeKb`
  - Modified `src/components/settings/` — new "Image attachments" section
  - Hook `src/hooks/useChatMediaDownload.ts` — subscribes to `chat-media-bytes-{server_id}-{handle}` events, manages blob URLs, cleans up on unmount
- **Backend (Rust)**: none in this change. All wire work is in `inline-media-protocol`.
- **Risk**: Medium. ChatMessage struct widening touches every chat render path — easy to break a small site. Mitigation: type the new field carefully, lean on TS to find call sites, review chat-history rendering as a separate pass.
- **Out of scope**:
  - Client-side resize/recompress (deferred → `inline-media-resize`)
  - Multi-image attachments per message (spec is one-per-message)
  - Image gallery / lightbox click-to-zoom UX (defer to a follow-up if requested)
  - Editing or replacing an attached image after send
  - Image gateway URL handling on the receive side (server-side feature, no special client work — the URL just appears as text)

## Dependencies

- **Requires `capabilities-hardening`** (transitively, via `inline-media-protocol`)
- **Requires `inline-media-protocol`** — the Rust wire layer must exist
- **Requires `drop-zone-infrastructure`** — for drag-drop image attach

## Future follow-ups

- `inline-media-resize` — smart auto-resize before upload (presets: Auto / 720p / 1080p / 1440p / 4K, byte budget aware)
- `inline-media-filename` — pending fogWraith spec extension to carry filename on the wire
- `inline-media-gallery` — click-to-zoom lightbox
