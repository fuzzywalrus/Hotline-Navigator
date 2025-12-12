# Hotline macOS feature map (Swift reference)

This document maps the existing Swift/macOS Hotline client features and their primary source files so the Tauri port can mirror the behavior. iOS/iPadOS code is intentionally ignored.

- **App shell & windows** – `MacApp.swift` wires the main Tracker window, Server windows, About box, and Update window; also manages CloudKit availability and scene commands.
- **Updates** – `State/AppUpdate.swift` handles GitHub release checks, downloads, and reminder logic; `macOS/AppUpdateView.swift` renders the update UI shown from the “New Update” window.
- **Trackers & bookmarks** – `macOS/Trackers/TrackerView.swift` shows tracker/server bookmarks, expansion, search, drag-reorder, delete, context menus, and file drop import; `macOS/Trackers/TrackerBookmarkSheet.swift` / `ServerBookmarkSheet.swift` provide edit sheets; `Models/Bookmark.swift` defines bookmark types, defaults, parsing/export, and tracker fetch; `macOS/Trackers/TrackerBookmarkServerView.swift` renders tracker server rows; `macOS/Trackers/TrackerItemView.swift` handles tracker list rows.
- **Bonjour discovery** – `State/BonjourState.swift` manages browse state; `macOS/Trackers/BonjourServerRow.swift` renders discovered servers; `TrackerView` includes the Bonjour section and browse toggle.
- **Connect dialog** – `macOS/ConnectView.swift` is the modal for entering server address/login/password and saving as a bookmark.
- **Server navigation & session** – `macOS/ServerView.swift` builds the server window with a `NavigationSplitView` sidebar for Chat, News, Message Board, Files, Users (DMs), and Transfer status; manages connection status, login trigger, and focused server state; hosts `ServerTransferRow` list.
- **Chat** – `macOS/Chat/ChatView.swift` renders chat history, joins/leaves/disconnect markers, search, banner handling, and input focus; `macOS/Chat/ServerMessageView.swift` shows server messages; `macOS/Chat/ServerAgreementView.swift` handles agreement display; `macOS/MessageView.swift` handles private messages per user.
- **Broadcasts** – `macOS/BroadcastMessageSheet.swift` provides the sheet for sending server-wide broadcasts when permitted.
- **Message Board** – `macOS/Board/MessageBoardView.swift` loads and displays the board with posting composer sheet (`MessageBoardEditorView.swift`).
- **News** – `macOS/News/NewsView.swift` lists categories/articles with split view; `NewsItemView.swift` renders items; `NewsEditorView.swift` handles posting/replying; uses MarkdownUI for rendering.
- **Files & transfers** – `macOS/Files/FilesView.swift` implements file browser (list, context menus, uploads/downloads); `FileDetailsSheet.swift`, `FilePreview*View.swift`, `FileItemView.swift`, `FolderItemView.swift`, `NewFolderPopover.swift` handle metadata, previews, and folder creation; `macOS/TransfersView.swift` displays active/completed transfers with cancel/open/finder actions; relies on `State/FilePreviewState.swift` and `AppState.transfers`.
- **Accounts & permissions** – `macOS/Accounts/AccountManagerView.swift` and `AccountDetailsView.swift` manage user accounts when access allows; driven by `HotlineState` account calls and permission flags.
- **Settings** – `macOS/Settings/SettingsView.swift` with tabs for `GeneralSettingsView.swift`, `IconSettingsView.swift`, and `SoundSettingsView.swift`; preferences stored via `State/Preferences.swift`.
- **About & branding** – `macOS/AboutView.swift` renders the Hotline-branded about window; `macOS/HotlinePanelView.swift` draws the banner panel used when enabled.
- **State & networking primitives** – `State/HotlineState.swift` and `State/ServerState.swift` hold session data (chat messages, users, files, news, board, transfers, permissions) and expose async actions; `State/AppState.swift` holds global UI+transfer state; protocol/client logic lives in `Hotline/HotlineClient.swift`, `Hotline/HotlineProtocol.swift`, and `Hotline/HotlineTrackerClient.swift`; `Library/NetSocket/NetSocket.swift` provides async socket utilities.

Use these references to prioritize feature parity when porting screens and behaviors into Tauri.***

## Roadmap for the Tauri port

- **Windowing & layout**
  - Recreate Tracker window navigation, About, and Update flows; mirror Mac banner panel toggle.
  - Add server window equivalents with sidebar (Chat/News/Board/Files/Users/Transfers).
- **Tracker/Bonjour parity**
  - Persist bookmarks (add/edit/delete/reorder, import/export); integrate Bonjour discovery UI and fetch loop.
  - Implement tracker fetch in Rust with cancel/refresh and surface loading states in UI.
- **Connect & session lifecycle**
  - Connect dialog: server address/login/password/icon, bookmark from connect form.
  - Full HotlineClient in Rust: handshake, login, keep-alive, event stream, reconnection, error states.
  - Session status indicator (connecting/connected/logged-in/failed) with retry.
- **Chat & messaging**
  - Global chat view with join/leave/disconnect markers, search, Markdown rendering, banner handling.
  - Private messages per user; broadcast sheet; server message handling.
- **Users list**
  - Live user list with idle/admin indicators, unread badge for DMs, context actions (DM, copy info).
- **Message Board & News**
  - Board view with permissions checks, post composer, lazy load; News split view with categories/articles, Markdown render, new/reply post.
- **Files & transfers**
  - File browser (list, context menu actions, upload/download, folder create/rename/delete, aliases).
  - File previews (text, image, QuickLook-equivalent), metadata sheet; transfer list window with cancel/open/finder equivalents.
- **Accounts & permissions**
  - Account manager UI gated by access rights; edit/create/delete users; reflect permission bits in UI affordances.
- **Settings & preferences**
  - General/Icon/Sound settings; store preferences (username/icon, sounds, banner visibility, etc.); apply to session defaults.
- **Updates & branding**
  - GitHub release check/download flow; About window styling and iconography.
- **Infrastructure**
  - Port state containers (HotlineState/ServerState/AppState analogues) to drive UI.
  - Error handling, toasts/banners for failures; logging hooks for protocol debug.
  - Packaging: cross-platform icon/bundle identifiers, auto-updates strategy for macOS/Windows/Linux.

## Porting notes & sequencing

- Start from state: recreate `HotlineState/ServerState/AppState` in TypeScript/React (or Rust-backed store) so views bind to a single source of truth. Model chat messages, users, files, news, board posts, transfers, permissions, connection status, and active server metadata.
- Protocol first: finish the Rust Hotline client (login, keep-alive, async receive loop, transaction send/await, event fan-out). Mirror Swift’s `HotlineClient` behaviors and error mapping. Expose commands/events to the frontend via Tauri emit/listen.
- Tracker/Bonjour: wire tracker fetch to persistent bookmarks; add Bonjour discovery (tokio + zeroconf equivalent) and feed into the same list shape the Swift UI uses.
- UI parity order (fast wins first):
  1) Tracker sidebar (bookmarks + Bonjour) with add/edit/delete/reorder/import/export.
  2) Server window shell (split view: Chat, Users, Board, News, Files, Transfers) with connection status bar.
  3) Chat + private messages + broadcasts; user list with idle/admin badges and unread dots.
  4) Message Board and News split views with post/reply.
  5) File browser, previews, and transfers list.
  6) Accounts manager gated by permissions; Settings tabs; About/update windows.
- UX constraints: prefer keyboard shortcuts mirroring macOS (cmd+R refresh, cmd+N new chat, etc.); keep alternating rows and badges for list readability; use banner panel when enabled.
- Persistence: mirror Swift defaults (e.g., default bookmarks, username/icon, banner toggle) using local storage or a small SQLite/JSON store. Consider cross-platform path differences for downloads.
- Media/sounds: map sound effect triggers from Swift to a cross-platform audio approach; align icon assets with `Assets.xcassets`.
- Testing: add protocol-level integration tests in Rust for handshake/login/transaction decode; unit-test bookmark parsing and tracker fetch; add UI smoke tests where feasible.
