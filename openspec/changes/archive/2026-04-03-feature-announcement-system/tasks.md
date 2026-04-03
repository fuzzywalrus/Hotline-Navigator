## 1. Rust: Add Default Trackers

- [x] 1.1 Add `("default-tracker-bigredh", "Big Red H", "track.bigredh.com", DEFAULT_TRACKER_PORT)` and `("default-tracker-vespernet", "Vespernet", "tracker.vespernet.net", DEFAULT_TRACKER_PORT)` to `default_trackers` vec in `src-tauri/src/state/mod.rs`

## 2. Announcement Infrastructure

- [x] 2.1 Create `src/components/announcements/registry.ts` with the `Announcement` type definition and registry array (initially empty entries — populated in step 3)
- [x] 2.2 Create `src/components/announcements/FeatureAnnouncement.tsx` — reusable modal component accepting title, body, acceptLabel, dismissLabel, onAccept, onClose props. Port animation and styling from `SearchFeaturePrompt.tsx` (fade-in/out, backdrop blur, Escape key, backdrop click)
- [x] 2.3 Create `src/components/announcements/AnnouncementManager.tsx` — mounts in TrackerWindow, handles: new-install detection (`hotline-preferences` localStorage check), legacy migration (`mnemosyne-search-prompt-seen` → dismissed array), load dismissed state from `feature-announcements-dismissed`, evaluate conditions after bookmarks/mnemosyneBookmarks load via useEffect, build queue (filter dismissed + condition-false, sort by order desc, cap at 5), show announcements sequentially via FeatureAnnouncement, persist dismiss on accept/dismiss

## 3. Registry Entries

- [x] 3.1 Add `mnemosyne-search` entry to registry: order 1, title "Enable Server Search", body about Mnemosyne indexes, acceptLabel "Add Search", condition checks `mnemosyneBookmarks.length === 0`, onAccept calls `addMnemosyneBookmark` with id `default-mnemosyne-vespernet`, name `vespernet.net`, url `http://tracker.vespernet.net:8980`
- [x] 3.2 Add `v3-trackers` entry to registry: order 2, title "V3 Trackers Available!", body "Hotline Navigator now supports V3 Trackers! These allow servers to broadcast features like TLS + HOPE (encryption) and domain names instead of IPs. Start experiencing the future!", acceptLabel "Add V3 Trackers", condition checks neither `track.bigredh.com` nor `tracker.vespernet.net` exists in bookmarks by address, onAccept calls `invoke('save_bookmark', ...)` for both trackers with type Tracker and port 5498

## 4. Wire Up and Migrate

- [x] 4.1 Update `TrackerWindow.tsx`: replace `SearchFeaturePrompt` import and all related state/effects/handlers (`showSearchPrompt`, `dismissSearchPrompt`, `acceptSearchPrompt`, `SEARCH_PROMPT_SEEN_KEY`, `SEARCH_BOOKMARK_URL`, the useEffect that checks conditions, the `window.__triggerSearchFeaturePrompt` setup) with a single `<AnnouncementManager />` mount
- [x] 4.2 Delete `src/components/tracker/SearchFeaturePrompt.tsx`
- [x] 4.3 Remove the `__triggerSearchFeaturePrompt` declaration from `src/vite-env.d.ts`

## 5. Verify

- [x] 5.1 Test new install path: clear localStorage and bookmarks.json, launch app — both v3 trackers should appear as default bookmarks, no announcement popup shown
- [x] 5.2 Test upgrade path: set `hotline-preferences` in localStorage, ensure no v3 tracker bookmarks exist — v3-trackers announcement should appear; clicking "Add V3 Trackers" should add both tracker bookmarks
- [x] 5.3 Test legacy migration: set `mnemosyne-search-prompt-seen` to `'true'` in localStorage — mnemosyne-search announcement should not appear; the dismissed array should contain `mnemosyne-search`
- [x] 5.4 Test dismiss persistence: dismiss an announcement, reload — it should not reappear
