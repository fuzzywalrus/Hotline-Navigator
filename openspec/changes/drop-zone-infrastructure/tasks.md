## Tasks

### 1. Spike — confirm Tauri v2 drag-drop event shape
- [ ] Add a temporary listener for `tauri://drag-drop`, `tauri://drag-over`, `tauri://drag-leave` events
- [ ] Log the event payload: file paths, position (window-relative? window+screen?), modifier keys
- [ ] Confirm coordinates can be hit-tested against `getBoundingClientRect()` of React elements without transformation; document if not

### 2. DropManager singleton
- [ ] Create `src/dropZone/DropManager.ts` with `init()`, `registerZone(id, ref, accept, onDrop)`, `unregisterZone(id)`
- [ ] Listen for the three Tauri drag-drop events; track current state (over which zone, drag active)
- [ ] On `drag-drop`: hit-test cursor position against registered zones (innermost match wins for nested zones), filter paths by `accept`, call `onDrop(matched_paths)` with only the matching subset
- [ ] On `drag-over`: emit a `drag-state` change to the matched zone (so the zone can highlight); on leave, clear
- [ ] Idempotent `init()` — calling twice is a no-op
- [ ] No-op on mobile: detect via Tauri `platform()`; if `ios` or `android`, return early from `init()`

### 3. DropZone component + hook
- [ ] Create `src/dropZone/DropZone.tsx`:
  - Props: `accept: AcceptFilter`, `onDrop: (files: DroppedFile[]) => void`, `children: ReactNode | ((state: { isDragOver }) => ReactNode)`, optional `className`, `disabled`
  - Generates a stable internal id, registers with DropManager on mount, unregisters on unmount
  - Renders a wrapper `div` that captures `getBoundingClientRect()` for hit-testing
- [ ] Create `src/dropZone/useDropZone.ts` — hook variant taking a `ref` and options, returns `{ isDragOver }`
- [ ] Define `AcceptFilter = 'image' | 'file' | 'any' | string[]` in `types.ts`
- [ ] `'image'` matches MIME prefixes `image/*` or extensions `.png .jpg .jpeg .gif .webp .bmp .tiff .heic`
- [ ] `'file'` matches anything (alias for `'any'`); kept distinct for semantic clarity
- [ ] `string[]` allows custom MIME or extension lists

### 4. File reading
- [ ] Tauri v2 drag-drop events provide file *paths*, not bytes. Add a helper `readDroppedFile(path: string): Promise<Uint8Array>` that uses `@tauri-apps/plugin-fs` (or invoke a Rust command) to read the bytes.
- [ ] Consumers receive paths in `onDrop`; reading is on-demand to avoid loading large files into memory unnecessarily.

### 5. Boot integration
- [ ] Call `DropManager.init()` in [src/App.tsx](hotline-tauri/src/App.tsx) (or wherever app-level effects live)
- [ ] Verify single registration across React strict-mode double-mount (idempotent init handles this)

### 6. First consumer — file browser
- [ ] Identify the file browser upload entry point ([src/components/files/FilesTab.tsx](hotline-tauri/src/components/files/FilesTab.tsx) area)
- [ ] Wrap the file list / upload region in `<DropZone accept="any" onDrop={...}>`
- [ ] On drop, kick off the existing upload flow with the dropped paths
- [ ] Visual: subtle highlight on drag-over (border + background tint), no layout shift
- [ ] Manual test: drag a file from Finder onto the file browser; confirm upload starts

### 7. Mobile no-op verification
- [ ] On iOS or Android build (or Tauri mobile dev), confirm `DropManager.init()` returns immediately and no listeners are attached
- [ ] Confirm `<DropZone>` still renders its children correctly without erroring

### 8. Spec doc
- [ ] Create `openspec/specs/drop-zones/spec.md` documenting the abstraction, the API surface, and platform behavior
- [ ] Update [openspec/specs/file-browsing/spec.md](openspec/specs/file-browsing/spec.md) to reference the drop-zone primitive for upload

### 9. Cleanup
- [ ] Remove the spike-listener code from step 1 once the proper manager is in place
