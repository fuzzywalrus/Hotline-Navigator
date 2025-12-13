# Hotline Tauri

Tauri-based port of the modern Hotline client so the SwiftUI macOS build can reach macOS, Windows, and Linux with one codebase. Frontend is React + TypeScript (Vite), backend is Rust + Tokio within Tauri 1.x. This doc tracks the `hotline-tauri/` work and the macOS reference we’re mirroring.

## Current implementation

- React shell with macOS-inspired window layout (sidebar for trackers/bookmarks + Bonjour placeholder, center server list, utility panel with credentials).
- Default Hotline bookmarks and manual tracker fetch UI.
- Rust tracker client command (`tracker_servers`) for live tracker listings.
- Rust Hotline connect/login command (`connect_hotline_server`) with TRTP/HOTL handshake and credential obfuscation, returning server name/version.
- Credentials form (login/password/username/icon) feeding Connect actions.
- Build validated via `npm run build`.

## Project structure (actual)

```
hotline-tauri/
├── src/               # React app (Vite)
│   ├── App.tsx        # Main UI (tracker + server list + credentials)
│   ├── App.css        # Layout/styling
│   ├── styles.css     # Base styles
│   └── main.tsx       # Entry point
├── src-tauri/
│   ├── src/
│   │   ├── hotline_protocol.rs  # Protocol types + parsing helpers
│   │   ├── tracker_client.rs    # Tracker fetch over TCP
│   │   ├── hotline_client.rs    # Handshake/login client
│   │   └── main.rs              # Tauri commands wiring
│   └── tauri.conf.json          # Tauri config
├── package.json
├── Cargo.toml
├── README.md (this file)
└── PROGRESS.md / PORTING-GUIDE.md (planning/notes)
```

## Development

Prereqs: Node.js 18+, Rust stable, Tauri system deps.

Run dev (with Tauri IPC):
```
npm install
npm run tauri dev
```

Build:
```
npm run build                    # frontend only
npm run tauri build              # full bundle (default target)
npm run build:macos              # macOS universal binary (Intel + Apple Silicon)
npm run build:macos-intel        # macOS Intel (x86_64) only
npm run build:macos-silicon      # macOS Apple Silicon (aarch64) only
npm run build:macos-universal    # macOS universal binary (same as build:macos)
```

**macOS Architecture Support:**
- Universal binaries work on both Intel (x86_64) and Apple Silicon (aarch64) Macs
- Both Rust targets must be installed: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- Universal builds are recommended for distribution as they work on all Macs

## Swift/macOS feature map (reference)

This maps the existing Swift/macOS Hotline client features and their primary source files so we can mirror behavior (iOS/iPadOS ignored):

- **App shell & windows** – `MacApp.swift` wires Tracker/Server/Update/About windows, banner panel toggle, CloudKit readiness.
- **Updates** – `State/AppUpdate.swift` (GitHub releases, download/remind), `macOS/AppUpdateView.swift` UI.
- **Trackers & bookmarks** – `macOS/Trackers/TrackerView.swift` (list, expand, search, reorder, delete, context menus, drop import); sheets in `TrackerBookmarkSheet.swift` / `ServerBookmarkSheet.swift`; row views in `TrackerBookmarkServerView.swift` / `TrackerItemView.swift`; data in `Models/Bookmark.swift`.
- **Bonjour** – `State/BonjourState.swift` browse state; `macOS/Trackers/BonjourServerRow.swift`; Bonjour section inside `TrackerView`.
- **Connect dialog** – `macOS/ConnectView.swift` address/login/password entry + bookmark save.
- **Server navigation** – `macOS/ServerView.swift` `NavigationSplitView` hosting Chat/News/Board/Files/Users/Transfers, connection status, login trigger, transfer rows.
- **Chat** – `macOS/Chat/ChatView.swift` (history, markers, search, banners); `ServerMessageView.swift`, `ServerAgreementView.swift`; `MessageView.swift` for DMs.
- **Broadcasts** – `macOS/BroadcastMessageSheet.swift`.
- **Message Board** – `macOS/Board/MessageBoardView.swift` + composer `MessageBoardEditorView.swift`.
- **News** – `macOS/News/NewsView.swift` split list/view; `NewsItemView.swift`; `NewsEditorView.swift` for posts/replies.
- **Files & transfers** – `macOS/Files/FilesView.swift` browser/actions; previews (`FilePreview*View.swift`), metadata sheet (`FileDetailsSheet.swift`), folder/new popover; transfers window `macOS/TransfersView.swift`; state in `State/FilePreviewState.swift` and `AppState.transfers`.
- **Accounts & permissions** – `macOS/Accounts/AccountManagerView.swift` / `AccountDetailsView.swift`; driven by permission flags in `HotlineState`.
- **Settings** – `macOS/Settings/SettingsView.swift` with tabs (`GeneralSettingsView.swift`, `IconSettingsView.swift`, `SoundSettingsView.swift`); prefs in `State/Preferences.swift`.
- **About & branding** – `macOS/AboutView.swift`, `macOS/HotlinePanelView.swift`.
- **State & networking** – `State/HotlineState.swift`, `State/ServerState.swift`, `State/AppState.swift`; protocol/client in `Hotline/HotlineClient.swift`, `Hotline/HotlineProtocol.swift`, `Hotline/HotlineTrackerClient.swift`; sockets in `Library/NetSocket/NetSocket.swift`.

## Tauri port roadmap

- **Windowing & layout**: Mirror Tracker window, About, Update, and banner panel behaviors; add server window split view (Chat/News/Board/Files/Users/Transfers).
- **Tracker/Bonjour parity**: Persist bookmarks (add/edit/delete/reorder/import/export), integrate Bonjour discovery, keep tracker refresh/cancel states.
- **Connect & session lifecycle**: Full Hotline client in Rust (handshake/login/keep-alive/event stream/reconnect/errors); connect dialog/bookmark save; session status bar.
- **Chat & messaging**: Chat timeline with markers, search, Markdown, server messages; DMs; broadcasts; agreements.
- **Users list**: Live list with idle/admin indicators and DM unread badges, context actions.
- **Message Board & News**: Board view with post composer and permissions; News categories/articles split view with post/reply.
- **Files & transfers**: File browser actions, previews, metadata, uploads/downloads, transfer list UI.
- **Accounts & permissions**: Account manager gated by access bits; reflect permissions in affordances.
- **Settings & branding**: Preferences UI (general/icon/sound), About window styling, app icons/bundle IDs, update flow.
- **Infrastructure**: Port `HotlineState/ServerState/AppState` analogues; error toasts/banners; logging; cross-platform packaging and auto-update strategy.

## Porting notes

- Start with state: recreate Hotline/App/Server state in TypeScript (or Rust-backed store) so views bind to a single source of truth.
- Protocol first: finish Rust Hotline client (transaction send/await, receive loop, keep-alive) and emit events to the frontend via Tauri.
- Tracker/Bonjour: wire tracker fetch to persisted bookmarks; add Bonjour (zeroconf) and surface in the same list model.
- UI sequencing: sidebar tracker/Bonjour → server window shell → chat/DMs/broadcasts → board/news → files/transfers → accounts/settings → about/update polish.
- UX: keep macOS-like keyboard shortcuts (cmd+R refresh, etc.), alternating rows, badges; include banner panel toggle when implemented.
- Persistence: store defaults (bookmarks, username/icon, banner flag) locally; mind download paths per OS.
- Media: map sound effects/icon assets from Swift assets.
- Testing: add Rust protocol integration tests; unit-test bookmark parsing/tracker fetch; UI smoke tests where practical.
