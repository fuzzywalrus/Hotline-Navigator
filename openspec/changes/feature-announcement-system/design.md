## Context

The app currently uses a one-off `SearchFeaturePrompt` component hardcoded into `TrackerWindow.tsx` to notify upgrading users about Mnemosyne search. It checks three conditions via `useEffect` (existing install, seen flag, feature already present), shows a modal, and on accept adds a mnemosyne bookmark. The dismissed state lives in a dedicated localStorage key (`mnemosyne-search-prompt-seen`).

With v3 tracker support landing, we need the same pattern for announcing new default trackers. Rather than copy-pasting another one-off, we're building a reusable registry-based system.

The Rust backend in `state/mod.rs` defines default trackers and servers that auto-populate on first launch (empty bookmarks.json). The frontend manages its own state via Zustand stores with localStorage persistence.

## Goals / Non-Goals

**Goals:**
- Reusable announcement infrastructure: adding a future announcement should require only a new registry entry
- Migrate the existing search prompt into the new system with zero UX change for users who already dismissed it
- Add `track.bigredh.com` and `tracker.vespernet.net` as default trackers for new installs (Rust side)
- Announce v3 trackers to upgrading users via the new system (frontend side)
- Condition evaluation waits for bookmarks to load (avoids false positives)

**Non-Goals:**
- Rich announcement content (images, multi-step wizards) — these are simple text + action modals
- Server-driven announcements (fetched from a remote endpoint) — registry is local/compiled-in
- Undo/re-show dismissed announcements — once dismissed, it stays dismissed
- Analytics or tracking of announcement interactions

## Decisions

### 1. Registry-based architecture over individual components

Each announcement is a plain object in a registry array (`registry.ts`), not a separate React component. The `FeatureAnnouncement` component is a single reusable modal that renders any entry.

**Why over individual components:** One-off components (like `SearchFeaturePrompt`) duplicate the modal styling, animation, dismiss logic, and localStorage management. A registry centralizes all of that. Adding a new announcement is a data change, not a component change.

**Why over a store-based approach:** Announcements are static declarations with dynamic conditions — they don't need reactive state management. A simple array with condition functions is sufficient.

### 2. AnnouncementManager mounted in TrackerWindow

The `AnnouncementManager` component mounts inside `TrackerWindow` (replacing the old `SearchFeaturePrompt` usage). It evaluates conditions via `useEffect` that depends on `bookmarks` and `mnemosyneBookmarks` from the app store, ensuring conditions aren't checked until data has loaded.

**Why TrackerWindow:** This is where announcements are contextually relevant (trackers, search, server features). It's also where the old prompt lived, so the mount point is proven.

**Why useEffect with store dependencies:** Matches the existing pattern that works. Bookmarks load from Rust on app start and populate the Zustand store; the useEffect fires once that data is available.

### 3. Single localStorage key for all dismissed state

All dismissed announcement IDs are stored in one JSON array under `feature-announcements-dismissed`. 

**Why over per-announcement keys:** Scales cleanly. One read on mount, one write on dismiss. No key proliferation in localStorage.

**Migration:** On first run of the new system, check for the legacy `mnemosyne-search-prompt-seen` key. If it exists (set to `'true'`), pre-seed the dismissed array with `'mnemosyne-search'`. This runs once in the manager's initialization.

### 4. Condition functions run on every mount, not at registration time

Each registry entry has a `condition` function that returns `boolean`. The manager evaluates these on mount (after bookmarks load), not when the registry is defined.

**Why:** Conditions depend on runtime state (bookmarks list, mnemosyne bookmarks). They can't be evaluated at import time.

### 5. Accept action uses callbacks with access to store/invoke

Each registry entry has an `onAccept` async function. For the search announcement, it calls `addMnemosyneBookmark` from the app store. For v3 trackers, it calls `invoke('save_bookmark', ...)` to add tracker bookmarks to the Rust backend.

**Why async:** The Tauri `invoke` call for adding bookmarks is async. Making all `onAccept` handlers async keeps the interface uniform.

### 6. Show all pending in sequence, cap at 5

When multiple announcements are pending, they show one at a time. Dismissing or accepting one shows the next. Maximum 5 pending announcements to prevent overwhelming the user after many skipped updates.

**Why sequential in one session:** Gets them all out of the way. With the cap at 5 and the lightweight modal design, this won't feel burdensome.

**Why cap at 5:** Safety valve. In practice, we'll rarely have more than 2-3 total announcements registered. The cap prevents a theoretical edge case.

### 7. New installs detected via localStorage, not bookmarks

A new install is detected by checking `localStorage.getItem('hotline-preferences') === null`. This matches the existing `SearchFeaturePrompt` logic exactly.

**Why not check bookmarks:** A new install will have default bookmarks populated by Rust, so bookmarks.length > 0 isn't a reliable signal. The preferences key is only set after the user has actually used the app.

### 8. Default trackers added in Rust `default_trackers` vec

Both `track.bigredh.com` and `tracker.vespernet.net` are added to the `default_trackers` vec in `state/mod.rs` with standard port 5498. This ensures new installs get them automatically with no frontend involvement.

**Why not frontend-only:** Tracker bookmarks live in `bookmarks.json` managed by the Rust backend. Adding them server-side on first launch is consistent with how all other default bookmarks work.

## Risks / Trade-offs

**[Risk] Legacy migration key left orphaned** → The old `mnemosyne-search-prompt-seen` key remains in localStorage after migration. Mitigation: This is harmless (a few bytes) and cleaning it up would add complexity for no user-visible benefit.

**[Risk] Condition evaluation timing** → If bookmarks haven't loaded from Rust when the manager first evaluates, conditions could incorrectly pass. Mitigation: The useEffect depends on store state (`bookmarks`, `mnemosyneBookmarks`), so it re-evaluates when data arrives — matching the proven pattern from the existing search prompt.

**[Risk] v3 tracker accept fails silently** → If the `save_bookmark` invoke fails (Rust error, disk full), the user thinks they added trackers but didn't. Mitigation: The `onAccept` handler should still mark the announcement as dismissed (so they don't get stuck in a loop), but could surface an error toast via the existing notification system. Keep it simple for now — the invoke is the same one used throughout the app and is well-tested.

**[Trade-off] No granular dismiss per tracker** → If a user wants only one of the two v3 trackers, the popup adds both or neither. Mitigation: They can delete the unwanted one from the bookmark list afterward. Keeping the popup simple (one action) is more important than handling edge cases.
