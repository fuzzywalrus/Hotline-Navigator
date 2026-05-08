## Why

Inline-media (the next change in line) needs drag-and-drop image attach. Other near-future features want the same primitive: drag a file onto the file browser to upload it; drag an image onto a PM compose window; drag an image onto the avatar picker. Building drag-drop ad-hoc inside the chat compose component would solve the immediate need but force every later consumer to reinvent it.

Tauri v2 emits drag-drop events at the window level, not the React component level. There's no built-in routing layer that hands a drop to the right component based on cursor position. We need that routing layer once, then `<DropZone>` becomes a component anyone can wrap around their target.

iOS and Android don't support drag-and-drop in the conventional sense. Mobile inputs are file pickers, share sheets, and (camera) capture. The abstraction must be no-op-friendly on mobile so consumers don't have to platform-fork.

## What Changes

- Add a frontend `DropManager` singleton, registered once at app boot. It listens to Tauri's window-level `tauri://drag-drop` events (and `tauri://drag-over`, `tauri://drag-leave`), tracks registered drop zones with their bounding rects and accept-filters, and routes drop events to the deepest matching zone under the cursor.
- Add a `<DropZone accept={...} onDrop={...}>` React component (and matching `useDropZone(ref, options)` hook for cases where wrapping is awkward). Zones register on mount, unregister on unmount, and provide their bounding rect via a `ref` plus `getBoundingClientRect()` queried at hit-test time.
- The component renders its children plus an optional drag-over visual treatment (configurable via render-prop or className). No layout changes when no drag is active.
- Accept-filters: `'image' | 'file' | 'any' | string[]` (MIME types or extensions). The manager filters paths by extension/MIME on the Rust side before emitting, so consumers only see drops that match their filter.
- Mobile platform handling: on iOS/Android, `DropManager` registers no listeners and the `<DropZone>` component renders as a transparent passthrough. Consumers SHOULD pair drop zones with explicit attach buttons that work on all platforms; the drop layer is a desktop affordance, not a primary input.
- A simple test consumer in the codebase: wire one `<DropZone>` into the file browser upload flow as a smoke test of the abstraction. (Currently the file browser uses an explicit upload button — adding drag-drop here is the proof that the abstraction works for non-chat consumers.)

## Capabilities

### New Capabilities

- `drop-zones`: A reusable cross-platform drop-zone primitive — manager singleton routing window-level Tauri drag-drop events to the deepest matching React component zone, with accept-filters for image/file/any/MIME, mobile no-op handling, and a hook + component API.

### Modified Capabilities

- `file-browsing`: Adopts the new `<DropZone>` primitive for upload (replacing or augmenting the existing explicit upload button). This serves as the abstraction's first non-chat consumer and validates that the API works outside the inline-media use case.

## Impact

- **Frontend (new files)**:
  - `src/dropZone/DropManager.ts` — the singleton, Tauri event listener, registration API, hit-testing
  - `src/dropZone/DropZone.tsx` — React component
  - `src/dropZone/useDropZone.ts` — hook variant
  - `src/dropZone/types.ts` — shared types (`DropEvent`, `AcceptFilter`, etc.)
- **Frontend (modified)**:
  - `src/App.tsx` (or top-level provider) — initialize `DropManager` once at boot
  - File browser upload path — wrap the upload area in `<DropZone>`
- **Backend (Rust)**:
  - Tauri capabilities config — ensure drag-drop events are exposed (Tauri v2 has these enabled by default in the dev profile but verify production)
  - Optional: Tauri command to read dropped file bytes if not directly available on the JS side (depends on Tauri v2's drop event payload shape)
- **No protocol code changes.**
- **Mobile (Tauri iOS/Android)**:
  - `DropManager.init()` becomes a no-op when `platform()` reports mobile
  - `<DropZone>` is still rendered (so consumers don't need to platform-fork their tree) but the listener tree is empty
- **Risk**: Low. New code, no protocol surface. Main risk is Tauri v2's drag-drop event API not behaving as expected (e.g. event coordinates not being window-relative). Mitigation: spike the listener first, confirm event shape before building the routing layer.
- **Out of scope**:
  - Drag-and-drop *out* of the app (drag a file from chat to desktop). Different mechanism, not needed for inline-media.
  - Reordering drag-drop within lists (e.g. reorder bookmarks). Different problem, separate library.
  - Native share-sheet integration on mobile (camera capture, photo library). That's a separate per-platform plugin story handled at the consumer level (image attach button uses `tauri-plugin-fs` or similar to open native picker).
