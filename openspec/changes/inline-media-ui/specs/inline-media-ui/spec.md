## ADDED Requirements

### Requirement: Attach controls in chat compose

The client SHALL provide three input methods for attaching an image to a chat message:

1. An attach button (paperclip icon) in the chat compose bar that opens a native file-picker dialog filtered to image extensions.
2. A drop zone covering the chat input area that accepts dropped image files (via the `drop-zones` primitive with `accept="image"`).
3. A paste handler on the chat input that intercepts clipboard images.

All three methods SHALL feed into a single staging path that performs the preflight size check and, on success, displays an attach chip showing filename (when known), MIME type, byte size, and pixel dimensions, plus a remove (×) control.

The attach controls SHALL be disabled when `inline_media_supported` is false (server didn't confirm bit 3) or `can_send_media` is false (account lacks `AccessSendMedia`). Disabled controls SHALL display a tooltip explaining the reason.

#### Scenario: User attaches via file picker

- **WHEN** the user clicks the attach button and selects `IMG_4231.jpeg` (240 KB) from the file dialog
- **THEN** the chat compose bar SHALL display an attach chip showing the filename, `240 KB`, and the image's pixel dimensions

#### Scenario: User drops an image

- **WHEN** the user drags a `.png` file from the OS onto the chat input area
- **THEN** the drop SHALL be accepted by the `<DropZone accept="image">` and the same staging path SHALL run

#### Scenario: User pastes a clipboard image

- **WHEN** the user takes a screenshot and pastes into the chat input (Cmd+V / Ctrl+V) with a focused chat input
- **THEN** the paste handler SHALL extract the image from `event.clipboardData.files`, treat it as attached, and display the chip

#### Scenario: Attach disabled — server lacks bit 3

- **WHEN** the user is connected to a server whose login reply did not echo bit 3
- **THEN** the attach button SHALL be disabled and SHALL display a tooltip: "This server does not support inline images"

#### Scenario: Attach disabled — account lacks AccessSendMedia

- **WHEN** the user's account does not have `AccessSendMedia` (bit 57)
- **THEN** the attach button SHALL be disabled and SHALL display a tooltip: "Your account is not permitted to send images"

### Requirement: Preflight upload size gate

When an image is staged for attach, the client SHALL compare its byte size to the user's `imageUploadSizeKb` preference. If the byte size exceeds the limit, the client SHALL reject the attach locally — the file SHALL NOT be uploaded — and SHALL display a toast notification explaining the limit and offering an "Open Preferences" action.

The preference SHALL support four values: 256 KB (default), 512 KB, 1 MB, 2 MB. The preference SHALL persist via the existing `preferencesStore` mechanism.

The client SHALL NOT automatically resize or recompress images in v1. Smart resize is deferred to a follow-up change (`inline-media-resize`).

#### Scenario: Image fits the limit

- **WHEN** the user attaches a 200 KB JPEG with the limit set to 256 KB
- **THEN** the attach SHALL proceed normally and the chip SHALL be displayed

#### Scenario: Image exceeds the limit

- **WHEN** the user attaches a 1.2 MB JPEG with the limit set to 256 KB
- **THEN** the attach SHALL be rejected and a toast SHALL display: "Image is 1.2 MB, exceeds your 256 KB limit. Pick a smaller image or adjust in Preferences." with an "Open Preferences" action that jumps to the Image attachments section

#### Scenario: User raises the limit

- **WHEN** the user changes the limit to 2 MB and re-attaches the 1.2 MB image
- **THEN** the attach SHALL proceed; on send, the upload SHALL use the chunked path

### Requirement: Send flow with image

When the user sends a chat message with a staged image, the client SHALL:

1. Invoke the `upload_media` Tauri command with the bytes and declared MIME, await the canonical metadata.
2. Invoke `send_chat` with the chat text and the resulting media handle.
3. On success: clear the chip and text input, optimistically render the message with `media.state = 'loaded'` using a blob URL of the local bytes (the user already has the bytes; no need to re-download).
4. On upload failure: retain the chip and text input, display an error toast with "Retry" and "Remove" actions.
5. On send failure after upload succeeded: retain the chip and text input — the upload is server-side already; the user can retry sending.

#### Scenario: Successful send

- **WHEN** the user attaches a valid image, types "look at this", and clicks send
- **THEN** `upload_media` SHALL be invoked, then `send_chat`, the chip SHALL clear, and the message SHALL appear in the user's own chat view with the image rendered inline

#### Scenario: Upload fails

- **WHEN** the user clicks send and `upload_media` returns an error
- **THEN** the chip and text SHALL be retained, a toast SHALL show the error with "Retry" / "Remove" actions

### Requirement: Receive and render media

When the client receives a `chat-media-received` event for a chat message, the client SHALL append a `ChatMessage` with `media.state = 'placeholder'` and the server-supplied dimensions, MIME, and byte size. The placeholder SHALL be rendered inline using the dimensions to allocate UI space before bytes arrive.

The client SHALL automatically subscribe to `chat-media-bytes-{server_id}-{handle}` for that handle. When bytes arrive, the client SHALL convert them to a blob URL and transition `media.state` to `'loaded'`. The image SHALL be rendered inline at its intrinsic dimensions, capped to a reasonable display width (e.g., 480 px on chat).

If the download fails, `media.state` SHALL transition to `'failed'` and the placeholder SHALL display a fallback "image could not be loaded" with the failure reason.

The client SHALL revoke blob URLs via `URL.revokeObjectURL` when the message scrolls out of view, the chat is closed, or the component unmounts, to prevent memory growth.

#### Scenario: Placeholder before bytes

- **WHEN** a chat-media-received event arrives with width=1920, height=1080, byteSize=234000
- **THEN** the chat view SHALL render an aspect-ratio-correct skeleton block at the dimensions immediately, before the bytes arrive

#### Scenario: Bytes arrive

- **WHEN** the chat-media-bytes event fires for a handle currently rendered as placeholder
- **THEN** the placeholder SHALL be replaced with `<img src={blobUrl}>` showing the actual image

#### Scenario: Download fails

- **WHEN** the download for a handle fails (server returns "Media not found" or bytes fail magic-byte validation)
- **THEN** the placeholder SHALL transition to a fallback rendering: "Image could not be loaded · [reason]"

### Requirement: Sender-side filename display

When the user attaches an image via file picker or drag-drop, the client SHALL retain the original filename and display it on the attach chip and on the user's own outgoing message bubble. When an image is pasted from the clipboard, no filename is available; the chip and bubble SHALL display the canonical MIME type instead (e.g., `image/png`).

For received messages, the client SHALL display the canonical MIME type rather than a filename, because the spec does not carry filename across the wire. (A future spec extension may add a filename field; if added, this requirement updates to use it.)

#### Scenario: File picker attach

- **WHEN** the user attaches `IMG_4231.jpeg` from the file picker
- **THEN** the attach chip SHALL show "IMG_4231.jpeg" and the user's own message bubble SHALL show the filename in the metadata line

#### Scenario: Pasted image

- **WHEN** the user pastes an image from the clipboard with no filename
- **THEN** the attach chip SHALL show the canonical MIME type (e.g., `image/png`) instead of a filename

#### Scenario: Received image

- **WHEN** the client receives a chat message with an inline image
- **THEN** the metadata line SHALL show the canonical MIME, byte size, and pixel dimensions; no filename SHALL be shown (no field carries it)

### Requirement: Chat-history rendering

When the chat-history extension is active and the client renders historical messages, the client SHALL render media handles as a metadata-only placeholder without attempting to fetch bytes (because handles expire and historical fetches will fail). The placeholder format: `[image: <mime>, <bytes>, <width>×<height>]`.

#### Scenario: Render historical message with media

- **WHEN** chat-history returns a historical message with media metadata
- **THEN** the client SHALL render the placeholder string `[image: image/jpeg, 234 KB, 1920×1080]` inline, with no fetch attempt

### Requirement: Inline-media preferences

The client SHALL expose two preferences in the settings UI under an "Image attachments" section:

1. `inlineMediaEnabled` (boolean, default `true`) — when off, the client SHALL NOT advertise capability bit 3 on the next connection, SHALL hide attach controls, and SHALL ignore inbound media fields.
2. `imageUploadSizeKb` — a discrete dropdown of `256 | 512 | 1024 | 2048`, default `256`. Used by the preflight gate.

#### Scenario: Disable inline media

- **WHEN** the user toggles `inlineMediaEnabled` off
- **THEN** the next connection SHALL NOT include bit 3 in advertised capabilities, the attach button SHALL be hidden, and incoming chat media metadata SHALL be ignored (text-only render)

#### Scenario: Change upload size limit

- **WHEN** the user changes `imageUploadSizeKb` from 256 to 1024
- **THEN** the preference SHALL persist immediately and subsequent attach attempts SHALL allow images up to 1 MB
