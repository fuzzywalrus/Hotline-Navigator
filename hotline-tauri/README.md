# Hotline Tauri

A modern cross-platform Hotline client built with Tauri, React, TypeScript, and Rust.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **State Management**: Zustand
- **Backend**: Rust (async with Tokio)
- **Framework**: Tauri v2

## Project Structure

```
hotline-tauri/
├── src/                          # Frontend React app
│   ├── components/               # React components
│   │   ├── tracker/             # Tracker window components
│   │   ├── server/              # Server window components
│   │   ├── chat/                # Chat components
│   │   ├── files/               # File browser components
│   │   ├── news/                # News components
│   │   ├── board/               # Message board components
│   │   ├── users/               # Users list components
│   │   ├── settings/            # Settings components
│   │   └── common/              # Shared components
│   ├── stores/                   # Zustand state stores
│   │   ├── appStore.ts          # Global app state
│   │   └── serverStore.ts       # Per-server state
│   ├── types/                    # TypeScript type definitions
│   │   └── index.ts             # Hotline protocol types
│   └── lib/                      # Utility functions
│
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── protocol/            # Hotline protocol implementation
│       │   ├── mod.rs           # Protocol module
│       │   ├── client.rs        # HotlineClient implementation
│       │   └── types.rs         # Rust protocol types
│       ├── state/               # Backend state management
│       │   └── mod.rs           # AppState
│       ├── commands/            # Tauri commands (frontend ↔ backend)
│       │   └── mod.rs           # Command handlers
│       └── lib.rs               # Main entry point
│
└── PORTING-GUIDE.md             # Feature map from Swift app
```

## Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- System dependencies for Tauri (varies by platform)

### Running the app

```bash
npm install
npm run tauri dev
```

The app will open in a native window with hot reload enabled for both Rust and React changes.

### Building for production

```bash
npm run tauri build
```

## Current Status

### ✅ Completed

- [x] Project scaffolding with Tauri + React + TypeScript
- [x] Tailwind CSS configured
- [x] Zustand state management set up
- [x] Basic project structure (frontend & backend)
- [x] TypeScript types for Hotline protocol
- [x] Rust module structure (protocol, state, commands)
- [x] Tauri commands for bookmarks and connections
- [x] Basic Tracker window UI
- [x] Connect dialog component
- [x] Bookmark persistence (JSON storage in app data dir)
- [x] Edit bookmarks with dialog
- [x] Delete bookmarks with confirmation
- [x] Auto-load bookmarks on startup

### 🚧 In Progress / Next Steps

Based on the porting guide (`PORTING-GUIDE.md`), the implementation roadmap is:

1. **Tracker & Bookmarks** (Priority 1) - ✅ **CORE COMPLETE**
   - [x] Bookmark persistence (save/load from disk)
   - [x] Bookmark management (edit, delete)
   - [ ] Bookmark reordering (drag & drop) - *future enhancement*
   - [ ] Import/export bookmarks - *future enhancement*
   - [ ] Bonjour/mDNS server discovery - *future enhancement*
   - [ ] Tracker server fetch - *future enhancement*

2. **Protocol Implementation** (Priority 1)
   - [ ] TCP socket connection
   - [ ] Hotline handshake
   - [ ] Login sequence
   - [ ] Keep-alive mechanism
   - [ ] Event receive loop
   - [ ] Transaction send/await
   - [ ] Protocol parsing/serialization

3. **Server Connection** (Priority 2)
   - [ ] Connection status management
   - [ ] Server info display
   - [ ] Agreement handling
   - [ ] Permission parsing

4. **Chat** (Priority 2)
   - [ ] Global chat view
   - [ ] Join/leave/disconnect markers
   - [ ] Private messaging
   - [ ] Broadcast messages
   - [ ] Chat search

5. **Users List** (Priority 3)
   - [ ] Live user list
   - [ ] Idle/admin indicators
   - [ ] Unread DM badges
   - [ ] User context menu

6. **Files & Transfers** (Priority 3)
   - [ ] File browser
   - [ ] Upload/download
   - [ ] Folder operations
   - [ ] File previews
   - [ ] Transfer progress UI

7. **News & Message Board** (Priority 4)
   - [ ] News category/article view
   - [ ] Post/reply to news
   - [ ] Message board view
   - [ ] Post to board

8. **Settings & Polish** (Priority 5)
   - [ ] Preferences UI
   - [ ] Icon selector
   - [ ] Sound settings
   - [ ] Auto-updates
   - [ ] About window

## Architecture Notes

### State Management

- **App-level state** (`appStore.ts`): Bookmarks, trackers, active servers, UI state
- **Per-server state** (`serverStore.ts`): Chat, users, files, news, transfers - one store instance per connected server
- **Rust state** (`state/mod.rs`): Active connections, persistent bookmarks

### Frontend ↔ Backend Communication

- **Commands**: Frontend calls Rust via `invoke('command_name', { args })`
- **Events**: Rust emits events to frontend via `emit('event_name', payload)`
- See `src-tauri/src/commands/mod.rs` for available commands

### Protocol Implementation Strategy

We're building the Hotline protocol fresh in Rust while referencing the Swift implementation from the main `Hotline` directory. This avoids awkward translation issues and lets us design optimally for Tauri's async event system.

## Reference

- Original Swift app: `../Hotline/`
- Porting guide: `PORTING-GUIDE.md`
- Tauri docs: https://tauri.app
- Zustand docs: https://zustand-demo.pmnd.rs

## License

[Same as parent project]
