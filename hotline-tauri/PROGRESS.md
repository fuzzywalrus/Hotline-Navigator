# Hotline Tauri - Implementation Progress Log

This file tracks completed features and implementation notes for the Tauri port.

## Port Sequence (from PORTING-GUIDE.md)

1. ✅ State foundations & project structure
2. ✅ Tracker sidebar (bookmarks + persistence)
3. ✅ Protocol implementation (Complete: connect, handshake, login, events, keep-alive, chat send)
4. ✅ Server window shell (basic UI with chat input)
5. ✅ Chat receive & display
6. ✅ User list
7. ✅ Message Board & News (get/post boards, browse categories, view/post articles)
8. ✅ Files & transfers (browse, download with progress)
9. ⏸️ File uploads
10. ⏸️ Accounts, Settings, About

---

## Completed Features

### 2025-12-11: Project Foundation

**What was completed:**
- Initial Tauri v2 project scaffolding with React + TypeScript
- Tailwind CSS integration for styling
- Zustand state management setup
- Complete project structure (frontend & Rust backend modules)
- TypeScript type definitions for Hotline protocol
- Rust module structure: `protocol/`, `state/`, `commands/`
- Basic Tauri commands for bookmarks and connections
- Initial UI components: TrackerWindow, ConnectDialog, BookmarkList

**Files created/modified:**
- `src/types/index.ts` - All core Hotline type definitions
- `src/stores/appStore.ts` - Global app state with Zustand
- `src/stores/serverStore.ts` - Per-server state management
- `src/components/tracker/*` - Tracker window components
- `src-tauri/src/protocol/*` - Protocol module structure
- `src-tauri/src/state/mod.rs` - AppState for connection management
- `src-tauri/src/commands/mod.rs` - Tauri command handlers
- `tailwind.config.js`, `postcss.config.js` - Tailwind setup
- `src-tauri/Cargo.toml` - Added tokio dependency

**Next task:** Bookmark persistence (save/load to disk)

### 2025-12-11: Bookmark Management & Persistence

**What was completed:**
- Bookmark persistence using JSON storage in app data directory
- Auto-load bookmarks on app startup
- Edit bookmark functionality with dialog
- Delete bookmark with confirmation dialog
- Hover-to-reveal action buttons in bookmark list
- Complete CRUD operations for bookmarks

**Files created/modified:**
- `src-tauri/src/state/mod.rs` - Added persistence layer with load/save to disk
- `src-tauri/src/lib.rs` - Setup hook to initialize AppState with app data directory
- `src/components/tracker/TrackerWindow.tsx` - Added useEffect to load bookmarks on mount
- `src/components/tracker/BookmarkList.tsx` - Added edit/delete UI with confirmation
- `src/components/tracker/EditBookmarkDialog.tsx` - NEW: Edit bookmark dialog component

**Implementation details:**
- Bookmarks stored at: `[app-data-dir]/bookmarks.json`
- Pretty-printed JSON for human readability
- Synchronous disk writes on save/delete operations
- Error handling with console logging
- Frontend state stays in sync with Rust backend

**Next task:** Protocol implementation (TCP socket, handshake, login)

### 2025-12-11: Hotline Protocol Implementation

**What was completed:**
- Complete Hotline protocol data structures in Rust
- Transaction encoding/decoding with field support
- TCP socket connection with tokio
- Hotline handshake (TRTP/HOTL protocol negotiation)
- Login sequence with encoded credentials
- Connection status tracking
- Transaction ID generation
- All protocol constants and enums (transaction types, field types)

**Files created/modified:**
- `src-tauri/src/protocol/constants.rs` - NEW: Protocol constants, transaction types, field types
- `src-tauri/src/protocol/transaction.rs` - NEW: Transaction and field structures with encode/decode
- `src-tauri/src/protocol/client.rs` - Complete rewrite: TCP connection, handshake, login
- `src-tauri/src/protocol/mod.rs` - Updated module exports

**Implementation details:**
- **Handshake**: 12-byte packet (TRTP+HOTL+version+subversion), validates 8-byte response
- **Login**: Transaction type 107 with encoded username/password (XOR 0xFF obfuscation)
- **Transaction format**: 20-byte header + field count + fields (type+size+data)
- **Async design**: All I/O operations use tokio for async/await
- **Status tracking**: Disconnected → Connecting → Connected → LoggingIn → LoggedIn
- Uses Arc<Mutex<>> for thread-safe shared state
- Transaction IDs auto-increment with atomic counter

**Next task:** Event receive loop and keep-alive mechanism

### 2025-12-11: Event Loop, Keep-Alive & Chat

**What was completed:**
- Background event receive loop with tokio spawn
- Keep-alive mechanism (60-second ping)
- Send chat message functionality
- Event handling for server messages (chat, user join/leave, server messages, agreement)
- Request/reply pattern with pending transactions map
- Event channel for frontend (mpsc unbounded)
- Clean disconnect with task abort

**Files modified:**
- `src-tauri/src/protocol/client.rs` - Added event loop, keep-alive, chat send, event handling

**Implementation details:**
- **Receive loop**: Background tokio task that continuously reads transactions
- **Event types**: ChatMessage, ServerMessage, UserJoined, UserLeft, UserChanged, AgreementRequired
- **Keep-alive**: Sends empty transaction every 60 seconds to maintain connection
- **Transaction routing**: Replies go to pending_transactions, events go to event_tx channel
- **Graceful shutdown**: Tasks abort on disconnect, resources properly cleaned up
- **Chat send**: Transaction type 105 with Data field containing message text

**Status:** Protocol implementation feature-complete! Ready for testing with real server.

**Next task:** Test with real Hotline server

---

## In Progress

_No features currently in progress._

---

## Completed Features (continued)

### 2025-12-11: File Download Implementation

**What was completed:**
- Download button in file list UI (hover to reveal)
- DownloadFile transaction (type 202) to request file and get reference number
- File transfer protocol implementation with separate TCP connection
- File transfer handshake (TRTP+HTXF+reference number)
- Fork-based file data reception (FILP format with DATA/MACR forks)
- Automatic saving to user's Downloads folder
- Success/error notifications in UI

**Files created/modified:**
- `src-tauri/src/protocol/constants.rs` - Added FILE_TRANSFER_ID constant ("HTXF")
- `src-tauri/src/protocol/client.rs` - Added perform_file_transfer() method
- `src-tauri/src/state/mod.rs` - Updated download_file() to perform full transfer and save
- `src-tauri/src/commands/mod.rs` - Updated command to pass file_size parameter
- `src/components/server/ServerWindow.tsx` - Added success/error alerts for downloads

**Implementation details:**
- **DownloadFile transaction**: Sends path + filename, receives reference number from server
- **File transfer connection**: Opens new TCP connection for actual data transfer
- **Handshake format**: TRTP (4) + HTXF (4) + ref_num (4) + data_size (4) + reserved (4) = 20 bytes
- **File format**: FILP header (16 bytes) + fork count + fork headers (16 bytes each) + fork data
- **Fork types**: DATA fork (actual file content) and MACR fork (resource fork, ignored for now)
- **File saving**: Uses Tauri's download_dir() API to save files to user's Downloads folder
- **User feedback**: Alert dialogs show download success with file path or error messages

**Testing status:**
- Ready for testing with real server

**Next task:** Test file downloads, add progress indicator for large files (future enhancement)

### 2025-12-11: Transaction Fix & Server Window UI

**What was completed:**
- Fixed critical bug in transaction encoding (totalSize/dataSize were incorrectly calculated)
- Successfully tested connection to live server (hotline.semihosted.xyz:5500)
- Implemented Server Window UI with chat interface
- Wired up Connect button in bookmark list to open server windows
- Added server state management (activeServers, serverInfo map)
- Implemented chat message sending

**Bug Fix Details:**
- **Problem**: Login transaction was hanging - server wasn't responding
- **Root Cause**: Transaction header had `totalSize = HEADER_SIZE + data_size` when it should be `totalSize = data_size`
- **Fix**: Both `totalSize` and `dataSize` fields now correctly contain only the length of field data (not including the 20-byte header)
- **File**: `src-tauri/src/protocol/transaction.rs:127-128`

**Connection Flow:**
1. User clicks "Connect" on bookmark in TrackerWindow
2. `connect_to_server` command creates HotlineClient and calls `connect()`
3. Client performs TCP handshake (TRTP+HOTL) then login transaction
4. On success, server ID added to activeServers and ServerWindow opens
5. User can send chat messages via the chat input

**Files created/modified:**
- `src-tauri/src/protocol/transaction.rs` - Fixed totalSize calculation
- `src/components/server/ServerWindow.tsx` - NEW: Chat UI with send functionality
- `src/components/tracker/BookmarkList.tsx` - Added connect handler
- `src/stores/appStore.ts` - Added serverInfo Map for tracking server details
- `src/App.tsx` - Routes between TrackerWindow and ServerWindow

**Testing Status:**
- ✅ Connection to hotline.semihosted.xyz:5500 successful
- ✅ Handshake and login working
- ✅ Server window opens and displays
- ✅ Chat messages can be sent
- ✅ Chat message receiving implemented (see next section)

**Next task:** ~~Implement chat message receiving with Tauri events~~ (Completed)

### 2025-12-11: Chat Message Receiving & Display

**What was completed:**
- Event forwarding from Rust backend to frontend via Tauri events
- Chat message receiving and display in real-time
- Visual distinction between own messages (green) and others (blue)
- Auto-scroll to latest message
- Message timestamp tracking

**Files modified:**
- `src-tauri/src/state/mod.rs` - Added event forwarding task that emits Tauri events
- `src/components/server/ServerWindow.tsx` - Added event listeners and message display

**Implementation details:**
- Backend spawns tokio task to forward HotlineClient events to frontend
- Uses Tauri's `app_handle.emit()` to send events with server-specific channels
- Frontend listens to `chat-message-{serverId}` events
- Messages stored in component state and displayed in scrollable list
- Own messages added immediately on send (server doesn't echo back)

**Next task:** Fix chat message sending (messages were hanging)

### 2025-12-11: TCP Stream Splitting Fix

**What was completed:**
- Fixed critical deadlock issue where chat messages would hang
- Split TcpStream into separate read/write halves for concurrent access
- Updated all client methods to use split streams
- Messages now send immediately without blocking

**Bug Fix Details:**
- **Problem**: Chat messages would hang when sent, only appearing after disconnect
- **Root Cause**: Receive loop held stream lock while blocked on read, preventing send from acquiring lock
- **Solution**: Split TcpStream using `into_split()` to create OwnedReadHalf and OwnedWriteHalf
- **Impact**: Send and receive operations can now happen concurrently

**Files modified:**
- `src-tauri/src/protocol/client.rs` - Complete refactor of stream management
  - Changed from `stream: Arc<Mutex<Option<TcpStream>>>`
  - To `read_half` and `write_half` as separate Arc<Mutex<>> fields
  - Updated all methods: connect, handshake, login, disconnect, receive_loop, keepalive, send_chat

**Next task:** Implement user list

### 2025-12-11: User List Implementation

**What was completed:**
- GetUserNameList transaction to request connected users
- UserNameWithInfo field parsing (user ID, icon ID, username)
- Real-time user list display in sidebar
- User join/leave/change event handling
- User count display in header

**Files modified:**
- `src/components/server/ServerWindow.tsx` - Added User interface, state, and event listeners
- `src-tauri/src/protocol/client.rs` - Added get_user_list() method and parse_user_info() helper
- `src-tauri/src/state/mod.rs` - Added event forwarding for UserJoined, UserLeft, UserChanged

**Implementation details:**
- GetUserNameList (transaction type 300) sent after login
- Server replies with UserNameWithInfo fields containing 8-byte header + username
- Each user parsed and emitted as UserJoined event
- Frontend displays users with icon IDs and names in sidebar
- Real-time updates as users join, leave, or change info

**Next task:** File browsing

### 2025-12-11: File Browsing Implementation

**What was completed:**
- Tabbed interface (Chat / Files) in ServerWindow
- GetFileNameList transaction (type 200)
- FileNameWithInfo field parsing (20-byte header format)
- File and folder display with icons
- Breadcrumb path navigation
- Double-click folder navigation
- FilePath encoding for nested folder access

**Files created/modified:**
- `src/components/server/ServerWindow.tsx` - Added Files tab, file list UI, breadcrumb navigation
- `src-tauri/src/protocol/client.rs` - Added get_file_list(), parse_file_info(), FileInfo struct, FileList event
- `src-tauri/src/state/mod.rs` - Added get_file_list() method and FileList event forwarding
- `src-tauri/src/commands/mod.rs` - Added get_file_list command
- `src-tauri/src/lib.rs` - Registered get_file_list command

**Implementation details:**
- FileNameWithInfo format: 4 bytes type + 4 bytes creator + 4 bytes size + 4 bytes reserved + 2 bytes flags + 2 bytes name_len + name
- FilePath encoding: 2 bytes count + for each: [0x00, 0x00] separator + 1 byte length + name
- Files vs folders detected by type field "fldr"
- Real-time file list updates on path changes
- Breadcrumb navigation for easy path traversal

**Bug fixes:**
- Fixed FilePath encoding (needed separator bytes and single-byte length)
- Fixed React duplicate key warning (using file.name instead of index)
- Fixed double-click event propagation

**Testing:**
- Successfully navigated Apple Archive → 1980s → '80 → video files
- File sizes correctly displayed
- Folder navigation working smoothly

**Next task:** File downloads or other features

### 2025-12-11: Tailwind CSS v3 Integration

**What was completed:**
- Fixed Tailwind CSS not rendering (downgraded from v4 to v3)
- Configured PostCSS with CommonJS module format
- All UI styles now rendering correctly

**Bug Fix Details:**
- **Problem**: Tailwind classes attached but CSS not rendering
- **Root Cause**: Tailwind v4 has different PostCSS integration requirements
- **Solution**: Downgraded to Tailwind v3, renamed postcss.config.js to .cjs, added CSS import to main.tsx

**Files modified:**
- `package.json` - Downgraded tailwindcss to v3
- `postcss.config.cjs` - Renamed from .js, uses module.exports
- `src/main.tsx` - Added `import "./App.css"`

### 2025-12-11: File Download Fixes & Progress Indicator

**What was completed:**
- Fixed FILP header parsing (corrected to 24 bytes from incorrect 16 bytes)
- Fixed file transfer port (using port+1 as per protocol spec)
- Fixed file transfer handshake format (HTXF + ref_num + 0 + 0 = 16 bytes)
- Fixed DATA fork size handling (use file list size when fork header shows 0)
- Implemented download progress indicator with throttled updates
- Support for multiple simultaneous file downloads

**Bug Fix Details:**
- **FILP Header Structure**: Format (4) + version (2) + reserved (16) + fork count (2) = 24 bytes total
  - Previously was reading only 16 bytes, causing fork headers to be read 8 bytes too early
  - Fork type "INFO" was appearing in wrong position
- **File Transfer Port**: File transfers use server port + 1 (e.g., 5501 for main port 5500)
  - Discovered from Swift reference code (HotlineFileDownloadClient.swift:138)
- **Handshake Format**: HTXF (4) + referenceNumber (4) + 0 (4) + 0 (4) = 16 bytes
  - Not 20 bytes as initially attempted
- **DATA Fork Size**: Some servers send DATA fork with size=0 in header
  - Fall back to file list size (from FileNameWithInfo) when fork header shows 0
  - Log warning when sizes don't match for debugging

**Files modified:**
- `src-tauri/src/protocol/client.rs` - Fixed FILP header (24 bytes), added chunked reading with progress callback
- `src-tauri/src/state/mod.rs` - Added progress event emission with filename
- `src/components/server/ServerWindow.tsx` - Added progress bar UI with per-file tracking

**Implementation details:**
- **Progress tracking**: Reads data in 64KB chunks, emits progress every 2% to avoid UI stuttering
- **Multiple downloads**: Each file tracked independently by filename in Map
- **Progress events**: Emit `download-progress-{serverId}` with fileName, bytesRead, totalBytes, progress%
- **UI feedback**: Progress bar appears inline, replaces Download button during transfer
- **Fork handling**: INFO fork read and skipped, DATA fork saved to Downloads folder, MACR fork skipped

**Testing status:**
- ✅ Successfully downloaded multiple files (24MB and 31MB video files tested)
- ✅ Progress indicator shows smooth 0-100% progress
- ✅ Multiple simultaneous downloads work independently
- ✅ Files saved to Downloads folder and playable

**Next task:** Choose next feature from porting guide

### 2025-12-12: Message Board & News Implementation

**What was completed:**
- Message Board: Get and post message board with MacOS Roman encoding support
- News: Complete category/article browsing and posting system
- MacOS Roman text encoding/decoding (including carriage return to line feed conversion)
- Board tab UI with post viewer and composer
- News tab UI with two-panel layout (categories/articles + viewer/composer)
- Hierarchical news category navigation with breadcrumbs
- Article viewer with monospace font for ASCII art
- Reply to articles (parent_id support)

**Files created/modified:**
- `src-tauri/Cargo.toml` - Added encoding_rs dependency for MacOS Roman support
- `src-tauri/src/protocol/types.rs` - Added NewsCategory and NewsArticle types
- `src-tauri/src/protocol/transaction.rs` - Added from_path() method, fixed MacOS Roman encoding + \r→\n conversion
- `src-tauri/src/protocol/client.rs` - Added get_message_board(), post_message_board(), get_news_categories(), get_news_articles(), get_news_article_data(), post_news_article()
- `src-tauri/src/state/mod.rs` - Added state methods for message board and news
- `src-tauri/src/commands/mod.rs` - Added Tauri commands for board and news
- `src-tauri/src/lib.rs` - Registered new commands
- `src/components/server/ServerWindow.tsx` - Added Board and News tabs with full UI

**Implementation details:**
- **Message Board**: Transaction 101 (get), 102 (new message event), 103 (post)
  - Returns single Data field with all posts as concatenated string
  - Posts separated by divider lines in the text
- **News Categories**: Transaction 370 (get categories)
  - Returns NewsCategoryListData15 fields
  - Type 2 = bundle (folder), Type 3 = category
  - Hierarchical navigation using path arrays
- **News Articles**: Transaction 371 (get articles), 400 (get article data), 410 (post article)
  - Binary parsing of article list with metadata (id, parent_id, title, poster, etc.)
  - Support for threaded discussions via parent_id
  - Article content stored as plain text
- **Text Encoding**: MacOS Roman (MACINTOSH encoding) with fallback to UTF-8
  - Classic Mac OS used \r (carriage return) for line breaks, converted to \n for HTML rendering
  - Preserves ASCII art formatting in message board and news articles
- **UI Design**:
  - Board: Single panel with posts list + composer
  - News: Two-panel split (left: categories/articles, right: viewer/composer)
  - Monospace font for proper ASCII art rendering
  - Breadcrumb navigation for news categories
  - Loading states and error handling for servers without news support

**Bug fixes:**
- Fixed infinite loading loop in news useEffect by removing loadingNews from dependencies
- Added proper error handling for servers that don't support News protocol

**Testing status:**
- ✅ Message board posts display with correct line breaks and ASCII art
- ✅ News category navigation working
- ✅ Article viewing and posting functional
- ⏸️ Needs testing with various servers to verify encoding edge cases

**Next task:** File uploads or other features from porting guide

### 2025-12-12: Private Messaging Implementation

**What was completed:**
- Private message sending to individual users (Transaction 108)
- Private message receiving via ServerMessage transaction (Transaction 104)
- MessageDialog component with chat-style UI
- Double-click user to open private message dialog
- Message history tracking (incoming/outgoing)
- Auto-scroll to latest message
- Per-user message filtering

**Files created/modified:**
- `src-tauri/src/protocol/client/mod.rs` - Added PrivateMessage event to HotlineEvent enum, updated ServerMessage handler to differentiate private vs broadcast
- `src-tauri/src/protocol/client/chat.rs` - Added send_private_message() method
- `src-tauri/src/state/mod.rs` - Added PrivateMessage event forwarding and send_private_message() state method
- `src-tauri/src/commands/mod.rs` - Added send_private_message Tauri command
- `src-tauri/src/lib.rs` - Registered send_private_message command
- `src/components/server/MessageDialog.tsx` - NEW: Private message dialog component
- `src/components/server/ServerWindow.tsx` - Added double-click handler on user list items and MessageDialog rendering

**Implementation details:**
- **SendInstantMessage (108)**: Sends private message with userID, options (1), and message data
- **ServerMessage (104)**: Receives both server broadcasts and private messages
  - Presence of userID field indicates private message from specific user
  - Absence of userID field indicates server broadcast message
- **Event filtering**: Frontend listens to `private-message-{serverId}` events and filters by userId
- **UI Design**: Modal dialog with chat bubbles (blue for outgoing, gray for incoming)
- **User interaction**: Double-click any user in user list to open message dialog
- **Message tracking**: Component state manages message history per conversation

**Protocol details:**
- Transaction 108 fields:
  - Field 103 (UserId): u16 target user ID
  - Field 113 (Options): u32 set to 1 for instant messages
  - Field 101 (Data): String message content
- Transaction 104 differentiation:
  - With Field 103: Private message from userId
  - Without Field 103: Server broadcast message

**Testing status:**
- ✅ Code compiles successfully
- ⏸️ Needs testing with real server and multiple users

**Next task:** Test private messaging functionality with live server

---

### Future: Tracker Features

**Todo (lower priority):**
- [ ] Import/export bookmarks (JSON file)
- [ ] Bookmark reordering (drag & drop)
- [ ] Bonjour/mDNS server discovery
- [ ] Tracker server fetch

---

## Future Feature Enhancements

### Private Messaging
- [x] Send private messages to specific users
- [x] Private message windows/dialogs
- [ ] Message notifications
- [ ] Private chat rooms
- [ ] Chat invitations

### User Interaction
- [ ] User info dialog (click user to view full details)
- [ ] User privileges/flags display
- [x] Send private message from user list
- [ ] Admin functions (kick, ban, disconnect users)
- [ ] User context menu (right-click actions)

### News & Message Board
- [x] News/message board reader UI
- [x] News category browsing
- [x] Read news articles
- [x] Post news articles (if privileges allow)
- [x] News article threading

### Server Features
- [ ] Server agreement dialog modal
- [ ] Server info display (name, description, user count)
- [ ] Server banner download and display
- [ ] Connection status indicators
- [ ] Server statistics

### UI/UX Improvements
- [ ] File preview (images, text files)
- [ ] Drag & drop file uploads
- [ ] Context menus throughout app
- [ ] Keyboard shortcuts
- [ ] Transfer progress indicators
- [ ] Multiple simultaneous server connections
- [ ] Tabbed interface for multiple servers
- [ ] Notification system
- [ ] Sound effects

### Advanced Features
- [ ] Tracker server support and browsing
- [ ] Server bookmarks cloud sync
- [ ] Connection history tracking
- [ ] Auto-reconnect on disconnect
- [ ] Encrypted file transfers
- [ ] Custom user icon support
- [ ] Auto-away status
- [ ] Message filtering/blocking

---

## Architecture Decisions

### State Management
- Using Zustand for frontend state (lightweight, good TypeScript support)
- Per-server state uses factory pattern: `createServerStore(serverId)`
- Rust backend manages active connections in AppState

### Styling
- Tailwind CSS for rapid UI development
- Dark mode support built-in

### Protocol Strategy
- Building Hotline protocol fresh in Rust (not direct Swift translation)
- Using Swift implementation as reference for protocol details
- Designed for Tauri's async event system from the start

---

## Notes

- Initial Rust build took ~40s (lots of dependencies)
- Hot reload working for both Rust and React changes
- Default port 5500 for Hotline servers
- Using crypto.randomUUID() for bookmark IDs
