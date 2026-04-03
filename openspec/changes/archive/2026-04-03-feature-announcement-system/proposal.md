## Why

The app currently uses a one-off `SearchFeaturePrompt` component to alert upgrading users about Mnemosyne search. With v3 tracker support landing and two new default trackers (`track.bigredh.com`, `tracker.vespernet.net`), we need the same pattern again. Rather than duplicating the one-off approach, we should build a reusable feature announcement system that any future release can hook into.

## What Changes

- **New reusable announcement system**: A registry-based approach where each announcement is a declarative entry (id, title, body, accept label, condition, action). An `AnnouncementManager` evaluates conditions after bookmarks load, filters dismissed entries, caps at 5 pending, and shows them in sequence.
- **Migrate existing search prompt**: The current `SearchFeaturePrompt.tsx` one-off is retired. Its behavior becomes the first entry in the announcement registry (`mnemosyne-search`). Existing users who already dismissed the old prompt get auto-migrated via the legacy `mnemosyne-search-prompt-seen` localStorage key.
- **Add v3 tracker announcement**: Second registry entry (`v3-trackers`) tells upgrading users about v3 tracker support and offers to add `track.bigredh.com` and `tracker.vespernet.net` as tracker bookmarks.
- **Add new default trackers (Rust)**: `track.bigredh.com` and `tracker.vespernet.net` are added to the `default_trackers` list in `state/mod.rs` so new installs get them automatically without any popup.
- **New installs never see announcements**: The system detects new installs (no existing localStorage preferences) and skips all announcements — defaults already include everything.

## Capabilities

### New Capabilities
- `feature-announcements`: Registry-based one-time feature announcement system with dismissible modals, condition evaluation, queuing (max 5), and localStorage persistence for dismissed state.

### Modified Capabilities
- `bookmarks`: Adding two new default tracker entries (`track.bigredh.com`, `tracker.vespernet.net`) to the Rust-side default trackers list for new installs.

## Impact

- **Frontend**: New `src/components/announcements/` directory with `FeatureAnnouncement.tsx`, `AnnouncementManager.tsx`, and `registry.ts`. `SearchFeaturePrompt.tsx` deleted. `TrackerWindow.tsx` updated to mount `AnnouncementManager` instead of the old prompt logic.
- **Rust backend**: `src-tauri/src/state/mod.rs` — two new entries in `default_trackers` vec.
- **localStorage**: New key `feature-announcements-dismissed` (JSON array of IDs). Legacy key `mnemosyne-search-prompt-seen` read once for migration then ignored.
