## Tasks

### 1. ChatMessage struct widening
- [ ] Define `ChatMessageMedia` interface in `src/types/index.ts`:
  ```ts
  interface ChatMessageMedia {
    handle: string;       // hex-encoded
    mime: string;
    width: number;
    height: number;
    byteSize: number;
    bytesUrl?: string;
    state: 'placeholder' | 'loading' | 'loaded' | 'failed';
    failureReason?: string;
  }
  ```
- [ ] Add `media?: ChatMessageMedia` to `ChatMessage`
- [ ] Audit all `ChatMessage` consumers via TS — fix breaks, ensure none assume the shape excludes `media`
- [ ] Update message stores (live chat, PMs, chat rooms, history) to thread `media` through

### 2. Preferences
- [ ] Add to `preferencesStore.ts`:
  - `inlineMediaEnabled: boolean` (default `true`)
  - `imageUploadSizeKb: 256 | 512 | 1024 | 2048` (default `256`)
- [ ] Add migration for existing persisted prefs (defaults applied via Zustand persist `merge` callback)
- [ ] Add "Image attachments" section to preferences UI:
  - Toggle: "Enable inline images"
  - Dropdown: "Maximum upload size" with the four presets
  - Helper text under each (recommended for most servers / etc.)

### 3. AttachChip component
- [ ] Create `src/components/chat/AttachChip.tsx`:
  - Props: `filename?, mime, byteSize, dims, onRemove`
  - Renders: paperclip icon + filename (or `image/jpeg`) + size + dims + remove (×) button
  - Compact horizontal layout, sits above the text input

### 4. MediaImage component
- [ ] Create `src/components/chat/MediaImage.tsx`:
  - Props: `media: ChatMessageMedia`, optional `maxDisplayWidth`
  - State machine on `media.state`:
    - `placeholder`: shows aspect-ratio box at server-supplied dims with shimmer/skeleton
    - `loading`: same placeholder + spinner
    - `loaded`: `<img src={media.bytesUrl}>` with intrinsic dims, capped to `maxDisplayWidth`
    - `failed`: fallback "image could not be loaded · [reason]"
  - Click to expand (defer to a follow-up; for v1, no zoom)

### 5. useChatMediaDownload hook
- [ ] Create `src/hooks/useChatMediaDownload.ts`:
  - Listens to `chat-media-bytes-{serverId}-{handle}` events
  - Converts received bytes to a blob URL via `URL.createObjectURL`
  - Returns `{ bytesUrl, state, failureReason }`
  - On unmount or handle change, revoke the blob URL via `URL.revokeObjectURL`
  - Handles cache hits (event fires immediately if Rust cache has the bytes)

### 6. Chat input wiring
- [ ] Add attach button to chat compose bar (paperclip icon)
- [ ] Wire attach button to `tauri-plugin-fs` `open` dialog with image filter
- [ ] Wrap chat input area in `<DropZone accept="image" onDrop={handleDrop}>`
- [ ] Add paste handler on chat input — if `event.clipboardData.files` contains an image, treat as attached
- [ ] All three input paths (button, drop, paste) feed into a single `attachImage(file)` function
- [ ] State: `attachedImage: { file: File, bytes: Uint8Array, mime: string } | null` in component or chat store
- [ ] Render `<AttachChip>` above the input when `attachedImage !== null`
- [ ] Send button enabled when `text.length > 0 || attachedImage !== null`
- [ ] Disable attach affordances when `inline_media_supported === false || can_send_media === false`; tooltip explains

### 7. Preflight gate
- [ ] In `attachImage(file)`:
  - Read file as bytes
  - Compare `bytes.length` to `pref.imageUploadSizeKb * 1024`
  - If over: show toast (use existing toast system) with message "Image is X KB, exceeds your Y KB limit. Pick a smaller image or adjust in Preferences."
  - If under: stash in `attachedImage` state, show chip
- [ ] Toast SHALL include a "Open Preferences" action that jumps to the Image attachments section

### 8. Send flow
- [ ] On send with `attachedImage`:
  1. `await invoke('upload_media', { server_id, bytes, declared_mime })` → `{ handle, mime, width, height, byte_size }`
  2. `await invoke('send_chat', { server_id, text, media: { handle, mime } })` (Rust will add the canonical fields from upload reply)
  3. Clear `attachedImage`, clear text input
  4. Optimistic echo: append the message locally with `media.state = 'loaded'` and `bytesUrl` from a freshly-created blob URL of the local bytes
- [ ] On upload failure (server rejects, network error): keep `attachedImage`, show error toast with "Retry" / "Remove" actions
- [ ] On send failure after upload succeeded: same — image is stored on server, chip stays so user can retry the send

### 9. Receive flow
- [ ] Listen for `chat-media-received-{server_id}` event in the existing chat receive path
- [ ] When event arrives, append `ChatMessage` with `media: { ..., state: 'placeholder' }`
- [ ] `MediaImage` component automatically transitions through `loading` → `loaded` via `useChatMediaDownload`
- [ ] Render media inline alongside the text in `DiscordChatRenderer`

### 10. Render integration
- [ ] Update `DiscordChatRenderer` to render `<MediaImage>` when `message.media` is present, alongside the text bubble
- [ ] Update PM rendering similarly
- [ ] Update chat-room rendering similarly
- [ ] Update chat-history rendering: show metadata-only placeholder (no fetch attempt) — `[image: image/jpeg, 234 KB, 1920×1080]`. Spec recommends history is "metadata-only by default."

### 11. Privilege-aware UI gating
- [ ] Subscribe to `inline_media_supported` and `can_send_media` from `HotlineClient` (via existing user-access subscription mechanism)
- [ ] Disable attach button when either is false
- [ ] Tooltip on hover explains why ("This server does not support inline images" / "Your account is not permitted to send images")
- [ ] Even when send is disabled, receive still works — `MediaImage` renders incoming images regardless

### 12. Spec docs
- [ ] Create `openspec/specs/inline-media-ui/spec.md` documenting the UX, the preferences, the privilege gating, and the placeholder-then-image render flow
- [ ] Update `openspec/specs/public-chat/spec.md`, `private-messaging/spec.md`, `private-chat-rooms/spec.md` to document the inline-media render integration
- [ ] Update `openspec/specs/settings/spec.md` to document the new preferences

### 13. Manual testing
- [ ] Connect to Janus (or another bit-3 server); confirm attach button enables
- [ ] Attach a 100 KB JPEG via file picker; send with caption; verify inline render in own message
- [ ] Verify peer client (another Navigator instance) receives the image
- [ ] Drag a 200 KB PNG into chat; same flow
- [ ] Paste a screenshot from clipboard; same flow
- [ ] Try to attach a 3 MB image with default 256 KB limit → confirm preflight rejects with toast
- [ ] Bump preference to 2 MB; retry → confirm upload begins (chunked path, may fail if Janus refuses chunking)
- [ ] Connect to a server without bit 3 → confirm attach button disabled with appropriate tooltip
- [ ] Connect with an account lacking `AccessSendMedia` → confirm attach button disabled with privilege tooltip; verify receive still works
- [ ] Disconnect mid-download → confirm placeholder shows fallback, no crash
- [ ] Disable `inlineMediaEnabled` preference → reconnect → verify bit 3 not advertised, no media in incoming chat

### 14. Cleanup
- [ ] Audit blob URL lifecycle: every `URL.createObjectURL` paired with `URL.revokeObjectURL` on unmount or handle change
- [ ] Verify `media_cache` does not grow unbounded — check via debug protocol log
- [ ] Remove any temporary debug renders (e.g., raw handle hex shown in UI)
