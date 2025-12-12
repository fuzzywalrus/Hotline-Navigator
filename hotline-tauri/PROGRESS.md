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
9. ✅ Settings & Preferences (username, icon selection, persistent storage)
10. ✅ Server Agreement & Banner (agreement dialog, banner download and display)
11. ⏸️ File uploads
12. ⏸️ Accounts, About

---

## Development Goals

### High Priority Features
- [x] Server agreement dialog and acceptance
- [x] Server banner download and display
- [ ] File uploads (complement to downloads)
- [ ] Connection status indicators (connecting/connected/logged-in states)
- [ ] Server info display (name, description, user count)

### Medium Priority Features
- [ ] Broadcast messages (server-wide announcements)
- [ ] Sound settings tab (add to Settings)
- [ ] About window
- [ ] File preview (images, text files)
- [ ] Transfer list window (active/completed transfers)

### Lower Priority Features
- [x] Tracker server fetch (COMPLETED)
- [ ] Bonjour/mDNS server discovery
- [ ] Bookmark import/export
- [ ] Bookmark reordering (drag & drop)
- [ ] Server agreement persistence (remember accepted agreements)
- [ ] Keyboard shortcuts
- [ ] Context menus
- [ ] Notification system

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

### 2025-12-12: Private Message Enhancements & Component Refactoring

**What was completed:**
- **Persistent Chat History**: Messages now stored in ServerWindow for duration of connection
- **Unread Message Badges**: Red circular badges with count next to users with unread messages
- **Single-Click to Message**: Changed from double-click to single-click for opening message dialogs
- **Component Refactoring**: Extracted large ServerWindow into smaller, domain-organized components
- **Clean Architecture**: Reorganized components into feature-based folders

**Chat History Implementation:**
- Moved message storage from MessageDialog to ServerWindow (src/components/server/ServerWindow.tsx:83, 211-247)
- Messages persist when closing and reopening dialog
- Each user has separate message history in `Map<userId, PrivateMessage[]>`
- MessageDialog now receives messages and send handler as props

**Unread Badges:**
- Track unread count per user in `Map<userId, count>`
- Increment on incoming messages when dialog closed
- Reset to zero when opening dialog for that user
- Red badge with count appears next to user in list

**Component Organization:**
Created domain-specific components in proper folders:
- `src/components/chat/ChatTab.tsx` - Public chat interface
- `src/components/chat/MessageDialog.tsx` - Private message dialog
- `src/components/board/BoardTab.tsx` - Message board interface
- `src/components/files/FilesTab.tsx` - File browser interface
- `src/components/news/NewsTab.tsx` - News reader interface
- `src/components/users/UserList.tsx` - User sidebar component

**Files created/modified:**
- `src/components/chat/ChatTab.tsx` - NEW: Extracted from ServerWindow
- `src/components/chat/MessageDialog.tsx` - MOVED from server/, updated props
- `src/components/board/BoardTab.tsx` - NEW: Extracted message board
- `src/components/files/FilesTab.tsx` - NEW: Extracted file browser
- `src/components/news/NewsTab.tsx` - NEW: Extracted news reader
- `src/components/users/UserList.tsx` - MOVED from server/, user list with badges
- `src/components/server/ServerWindow.tsx` - REFACTORED: Reduced from ~1000 to ~655 lines (35% reduction)

**Architecture Benefits:**
- Clear separation of concerns
- Components grouped by feature domain (chat, files, news, users, board)
- Reusable, testable components
- Much easier to maintain and extend
- Follows project's existing folder structure

**Testing status:**
- ✅ All code compiles successfully
- ✅ Message history persists during connection
- ✅ Unread badges appear and update correctly
- ✅ Single-click opens message dialog
- ⏸️ Needs testing with live server

**Next task:** Continue with remaining features from porting guide

### 2025-12-12: User Info Dialog & User Flags Implementation

**What was completed:**
- **User Flags Parsing**: Backend now parses and forwards user flags (admin, idle status)
- **User Info Dialog**: Click user to view detailed information in modal dialog
- **Visual Status Indicators**: Admin badge and idle styling in user list
- **Protocol Completion**: Implemented full UserNameWithInfo structure parsing

**Backend Implementation:**
- Updated `parse_user_info()` to extract flags field (src-tauri/src/protocol/client/users.rs:36-60)
  - Previously skipped bytes 4-5, now correctly parses user flags
  - Returns (user_id, username, icon_id, flags) tuple
- Added flags to HotlineEvent enum (src-tauri/src/protocol/client/mod.rs:424-549)
  - UserJoined event now includes flags
  - UserChanged event now includes flags
  - NotifyUserChange handler extracts UserFlags field
- Updated event payloads to forward flags to frontend (src-tauri/src/state/mod.rs:90-113)

**Frontend Implementation:**
- Extended User interface with flags, isAdmin, isIdle (src/components/server/ServerWindow.tsx:28-35)
- Created parseUserFlags() helper function (src/components/server/ServerWindow.tsx:14-19)
  - Parses 0x0001 bit for admin status
  - Parses 0x0002 bit for idle status
- Updated event listeners to parse and store user flags (src/components/server/ServerWindow.tsx:187-232)
- Updated UserList with status indicators (src/components/users/UserList.tsx)
  - Yellow "A" badge for admin users
  - Italic, dimmed text for idle users
  - Updated tooltips to show status
- Created UserInfoDialog component (src/components/users/UserInfoDialog.tsx)
  - Displays username, user ID, icon ID
  - Shows status badges (Administrator, Idle, Active)
  - Displays raw flags in hex format
  - "Send Message" button to open private message dialog
  - Clean, modal design matching app style

**User Experience:**
- Click user in list → User Info Dialog opens
- User Info Dialog shows all details and status
- "Send Message" button → Opens private message dialog
- Visual indicators in user list:
  - Admin users have yellow "A" badge
  - Idle users shown in italic with reduced opacity
  - Tooltip shows admin/idle status

**Files created/modified:**
- `src/components/users/UserInfoDialog.tsx` - NEW: User information modal
- `src/components/users/UserList.tsx` - UPDATED: Added flags interface, admin/idle indicators
- `src/components/server/ServerWindow.tsx` - UPDATED: User interface, flag parsing, dialog integration
- `src-tauri/src/protocol/client/users.rs` - UPDATED: Parse user flags from protocol
- `src-tauri/src/protocol/client/mod.rs` - UPDATED: Added flags to events
- `src-tauri/src/state/mod.rs` - UPDATED: Forward flags to frontend

**Testing status:**
- ✅ All code compiles successfully
- ✅ User flags parsed from protocol correctly
- ✅ User Info Dialog displays properly
- ✅ Status indicators show in user list
- ⏸️ Needs testing with live server (admin users, idle detection)

**Next task:** File upload functionality or server info display

### 2025-12-12: UI Improvements, Bug Fixes & Settings System

**What was completed:**
- **React Key Warnings Fixed**: Replaced all non-unique `key={index}` with unique composite keys
- **Bookmark Stability**: Fixed duplicate bookmarks and glitchy deletion behavior
- **Connection Error Handling**: Inline error messages with user-friendly formatting
- **User Icons Imported**: Copied 629 classic icons from Swift codebase, created UserIcon component
- **Settings/Preferences System**: Username and icon selection with persistent storage
- **Bookmark vs Username Fix**: Separated bookmark name (display) from username (login)

**React Key Fixes:**
- ChatTab: Unique keys from userId + timestamp + message content + index
- BoardTab: Unique keys from post content hash + index
- MessageDialog: Unique keys from timestamp + direction + content + index
- NewsTab: Unique keys for categories (path + name + index) and articles (article.id)
- FilesTab: Unique keys for files (path + name + index) and breadcrumbs (path segment + position)
- All components now maintain proper identity across updates

**Bookmark Stability Improvements:**
- Added `setBookmarks()` action to replace entire array (prevents duplicates on reload)
- Added duplicate check in `addBookmark()` to prevent accidental duplicates
- Changed TrackerWindow to use `setBookmarks()` when loading from disk
- Bookmarks now load once without duplicates, state stays in sync with disk

**Connection Error Handling:**
- Inline error messages appear below each bookmark (replaces alert popups)
- User-friendly error messages for common connection failures:
  - DNS resolution failures: "Unable to resolve server address..."
  - Connection refused: "Connection refused. The server may be offline..."
  - Timeouts: "Connection timed out..."
- Dismissible errors with close button
- Errors auto-clear when retrying connection

**User Icons:**
- Copied 629 classic icons from `Hotline/Assets.xcassets/Classic/` to `public/icons/classic/`
- Created `UserIcon` component with fallback to icon ID if image fails to load
- Updated UserList and UserInfoDialog to display actual icons instead of numbers
- Icons use pixelated rendering to preserve classic look

**Settings/Preferences System:**
- Created `preferencesStore.ts` with Zustand persist middleware
  - Stores username (default: "guest") and userIconId (default: 191)
  - Persists to localStorage automatically
- Created Settings UI with tabbed interface:
  - **GeneralSettingsTab**: Username input field with auto-save
  - **IconSettingsTab**: Grid of 629 selectable classic icons with hover/selection states
- Added Settings button to TrackerWindow header
- Settings dialog matches app design with proper dark mode support

**Bookmark vs Username Separation:**
- **Before**: Bookmark name was incorrectly used as username when logging in
- **After**: 
  - Bookmark `name` field only used for server display in UI
  - Username comes from preferences store
  - Icon comes from preferences store
- Updated Rust backend:
  - `connect_to_server` command now accepts `username` and `userIconId` parameters
  - `HotlineClient` stores username and iconId separately from bookmark
  - Login transaction uses preferences, not bookmark name
- Updated frontend:
  - `BookmarkList` reads preferences and passes them when connecting
  - Server display name comes from `bookmark.name` (via `addActiveServer`)

**Files created/modified:**
- `src/stores/preferencesStore.ts` - NEW: Preferences store with persistence
- `src/components/settings/SettingsView.tsx` - NEW: Main settings dialog
- `src/components/settings/GeneralSettingsTab.tsx` - NEW: Username settings
- `src/components/settings/IconSettingsTab.tsx` - NEW: Icon selection grid
- `src/components/users/UserIcon.tsx` - NEW: Reusable icon component
- `src/components/tracker/TrackerWindow.tsx` - Added Settings button
- `src/components/tracker/BookmarkList.tsx` - Connection error handling, preferences integration
- `src/components/chat/ChatTab.tsx` - Fixed React keys
- `src/components/board/BoardTab.tsx` - Fixed React keys
- `src/components/chat/MessageDialog.tsx` - Fixed React keys
- `src/components/news/NewsTab.tsx` - Fixed React keys
- `src/components/files/FilesTab.tsx` - Fixed React keys
- `src/components/users/UserList.tsx` - Uses UserIcon component
- `src/components/users/UserInfoDialog.tsx` - Uses UserIcon component
- `src/stores/appStore.ts` - Added setBookmarks action, duplicate prevention
- `src-tauri/src/commands/mod.rs` - Updated connect_to_server to accept username/iconId
- `src-tauri/src/state/mod.rs` - Updated connect_server to pass user info
- `src-tauri/src/protocol/client/mod.rs` - Added username/iconId storage, set_user_info method
- `public/icons/classic/` - NEW: 629 classic user icons copied from Swift project

**Testing status:**
- ✅ All React key warnings resolved
- ✅ Bookmarks load without duplicates
- ✅ Connection errors display inline with helpful messages
- ✅ User icons display correctly (with fallback for missing icons)
- ✅ Settings persist across app restarts
- ✅ Username and icon from settings used when connecting
- ✅ Bookmark name only affects display, not login

**Next task:** File uploads, server info display, or other features from porting guide

### 2025-12-12: Server Agreement Dialog & Banner Display

**What was completed:**
- **Server Agreement Dialog**: Inline agreement display in chat view (matching Swift app behavior)
- **Agreement Acceptance Protocol**: Transaction type 121 (Agreed) to accept server agreement
- **Banner Download Protocol**: Transaction type 212 (DownloadBanner) to request server banner
- **Banner Display**: Server banner displayed at top of server window
- **Event Handling**: AgreementRequired event forwarded from backend to frontend with pending state storage

**Agreement Dialog Implementation:**
- Agreement displayed inline in chat view (not as modal dialog)
- Banner shown above agreement text if available
- Expandable view for long agreements (max height 340px, expand button if needed)
- Accept/Decline buttons below agreement text
- Monospace font for agreement text to preserve formatting
- Chat input disabled while agreement is pending
- Agreement stored in backend state to handle timing issues (event may arrive before component mounts)

**Agreement Protocol:**
- Backend detects `ShowAgreement` transaction (type 109)
- Extracts agreement text from `Data` field (type 101) - servers may send in Data field instead of ServerAgreement field
- Stores agreement in `pending_agreements` HashMap for retrieval on component mount
- Emits `agreement-required-{serverId}` event to frontend
- Frontend checks for pending agreement on mount and listens for events
- On accept, sends `Agreed` transaction (type 121) - empty transaction, no fields needed
- On decline, disconnects from server

**Banner Download Implementation:**
- `download_banner()` method sends DownloadBanner transaction (type 212)
- Server replies with reference number and transfer size
- **Key Fix**: Banners use raw image data transfer (not FILP format)
  - Created `download_banner_raw()` method that reads raw data after HTXF handshake
  - Regular file downloads use FILP format, but banners are sent as raw JPEG/PNG data
- Saves banner to app data directory as `banner-{serverId}.png`
- Converts banner to base64 data URL for frontend display (Tauri asset URLs don't work with app data paths)
- Detects image format (JPEG/PNG/GIF) from file signature

**Banner Display:**
- Banner downloaded automatically after connection (when users list is populated)
- Displayed at very top of server window (above header) with dark background
- Max height 60px, centered, auto-scaling
- Uses base64 data URL for reliable cross-platform display
- Falls back gracefully if banner download fails (not all servers have banners)
- Error handling with console logging for debugging

**Event Listener Improvements:**
- Fixed cleanup errors for all event listeners (added `.catch()` handlers)
- Improved agreement listener with ref-based cleanup tracking
- All listeners now handle cleanup gracefully without console errors

**Files created/modified:**
- `src/components/server/ServerWindow.tsx` - Added agreement state, event listener, banner state, pending agreement check
- `src/components/chat/ChatTab.tsx` - Added agreement display inline with banner, Accept/Decline buttons
- `src-tauri/src/protocol/client/chat.rs` - Added accept_agreement() method
- `src-tauri/src/protocol/client/files.rs` - Added download_banner() and download_banner_raw() methods
- `src-tauri/src/state/mod.rs` - Added pending_agreements HashMap, get_pending_agreement() method, accept_agreement() and download_banner() state methods, agreement event forwarding
- `src-tauri/src/commands/mod.rs` - Added get_pending_agreement, accept_agreement and download_banner Tauri commands (download_banner returns base64 data URL)
- `src-tauri/src/lib.rs` - Registered new commands
- `src-tauri/Cargo.toml` - Added base64 dependency for data URL encoding

**Implementation details:**
- **Agreement Transaction**: Type 109 (ShowAgreement) from server, contains Data field (type 101) with agreement text
- **Acceptance Transaction**: Type 121 (Agreed) - empty transaction, just sends transaction header
- **Banner Transaction**: Type 212 (DownloadBanner) - returns ReferenceNumber and TransferSize fields
- **Banner Transfer**: Raw image data after HTXF handshake (not FILP format like regular files)
- **Banner Display**: Base64 data URL (`data:image/jpeg;base64,...`) for reliable cross-platform display
- **Pending State**: Agreements stored in backend state to handle race condition where event arrives before component mounts

**Testing status:**
- ✅ Code compiles successfully
- ✅ Agreement displays inline in chat view when server sends agreement
- ✅ Agreement acceptance sends correct transaction
- ✅ Banner download works with raw data format
- ✅ Banner displays correctly using base64 data URL
- ✅ Event listener cleanup errors resolved
- ✅ Pending agreement retrieval works on component mount
- ✅ Tested with live server (Apple Archive) - agreement and banner both working

**Next task:** File uploads, server info display, or other features from porting guide

### 2025-12-12: Tracker Support & UI Improvements

**What was completed:**
- **Tracker Protocol Implementation**: Complete HTRK (Hotline Tracker) protocol support in Rust
- **Tracker Server Browsing**: Fetch and display servers from tracker bookmarks
- **Tracker UI**: Expandable tracker list with nested server display, refresh functionality
- **Default Tracker**: Auto-creates "Featured Servers" tracker (hltracker.com:5498) on first launch
- **Bookmark Type Persistence**: Fixed bookmark type (server vs tracker) storage and retrieval
- **UI Matching Screenshots**: Redesigned tracker and server windows to match Swift app design

**Tracker Protocol Implementation:**
- Created `TrackerClient` in Rust (`src-tauri/src/protocol/tracker.rs`)
- Handles HTRK magic packet and version negotiation
- Parses server information headers and decodes server entries
- MacOS Roman encoding support for server names/descriptions
- Filters out separator entries (e.g., "-------")
- Returns `TrackerServer` structs with address, port, name, description, user count

**Tracker UI Features:**
- Tracker bookmarks display with expand/collapse chevron (▶/▼)
- Tracker icon (16x16) and bold name
- Refresh button (always visible) with loading spinner
- Server count badge when expanded (e.g., "42 🌐")
- Nested server list with indentation (34px) when expanded
- Server entries show icon, name, description, user count with animated green dot
- Click tracker servers to connect directly
- No "Connect" button for tracker bookmarks (they're for browsing, not connecting)
- Compact list style with alternating row backgrounds (34px row height)
- Loading states and error handling for tracker fetch failures

**Bookmark Type System:**
- Added `BookmarkType` enum (Server, Tracker) to Rust types
- Frontend uses `type: 'server' | 'tracker'` field
- Fixed serde mapping: `#[serde(rename = "type")]` to match frontend
- Auto-fixes lost bookmark types on load (restores default tracker type)
- EditBookmarkDialog preserves type when updating bookmarks
- Default tracker automatically created if missing

**UI Redesign - Tracker Window:**
- Compact list design matching Swift app (34px row height, alternating backgrounds)
- Tracker icons (16x16) and Server icons (16x16) from Swift assets
- Bookmark icon (11x11, 75% opacity) for saved server bookmarks
- Chevron expand/collapse (10px, 50% opacity) for trackers
- Refresh icon (16x16 SVG) for trackers
- Header updated to "Servers" title with toolbar-style buttons
- Clean, native macOS-style appearance

**UI Redesign - Server Window:**
- Tabs moved to left sidebar (200px width) with vertical layout
- Tab icons (20x20) from Swift assets (Section Chat, Board, News, Files)
- Users list moved below tabs in left sidebar (matching screenshot)
- Divider between tabs and users
- Active tab highlighted with blue background
- Main content area on right
- Removed top horizontal tab bar

**Files created/modified:**
- `src-tauri/src/protocol/tracker.rs` - NEW: TrackerClient implementation
- `src-tauri/src/protocol/types.rs` - Added BookmarkType enum, TrackerServer struct
- `src-tauri/src/state/mod.rs` - Added tracker type checks, default tracker creation, type restoration
- `src-tauri/src/commands/mod.rs` - Added fetch_tracker_servers command
- `src-tauri/src/lib.rs` - Registered fetch_tracker_servers command
- `src-tauri/Cargo.toml` - Added encoding_rs dependency (already present)
- `src/components/tracker/BookmarkList.tsx` - Complete UI redesign, tracker expansion, nested servers
- `src/components/tracker/TrackerWindow.tsx` - Updated header, removed test button
- `src/components/server/ServerWindow.tsx` - Moved tabs to left sidebar, users below tabs
- `src/types/index.ts` - Added BookmarkType, TrackerBookmark, ServerBookmark types
- `public/icons/tracker.png` - NEW: Tracker icon from Swift assets
- `public/icons/server.png` - NEW: Server icon from Swift assets
- `public/icons/section-*.png` - NEW: Section icons (Chat, Board, News, Files) from Swift assets

**Implementation details:**
- **Tracker Protocol**: HTRK magic (4 bytes) + version (2) + subversion (2) + server count (2) + server count 2 (2) + server entries
- **Server Entry Format**: 2 bytes name length + name (MacOS Roman) + 2 bytes description length + description + address (32 bytes) + port (2) + users (2) + flags (2)
- **Default Tracker**: Created automatically if missing, saved to disk, fixed if type is lost
- **Type Persistence**: Frontend `type` field maps to Rust `bookmark_type` via serde rename
- **UI Spacing**: Matches Swift exactly (34px rows, 10px chevron, 16x16 icons, 11x11 bookmark icon)

**Testing status:**
- ✅ Tracker protocol implementation complete
- ✅ Default tracker auto-created on first launch
- ✅ Tracker expansion and server browsing working
- ✅ Bookmark types persist correctly across saves/edits
- ✅ UI matches Swift app design and screenshots
- ✅ Icons display correctly with fallbacks
- ✅ Refresh functionality works for trackers
- ✅ Nested server connection works
- ⏸️ Needs testing with various tracker servers

**Next task:** File uploads, connection status indicators, or server info display

---

### Future: Tracker Features

**Todo (lower priority):**
- [x] Tracker server fetch (COMPLETED - see above)
- [ ] Import/export bookmarks (JSON file)
- [ ] Bookmark reordering (drag & drop)
- [ ] Bonjour/mDNS server discovery

---

## Future Feature Enhancements

### Private Messaging
- [x] Send private messages to specific users
- [x] Private message windows/dialogs
- [ ] Message notifications
- [ ] Private chat rooms
- [ ] Chat invitations

### User Interaction
- [x] User info dialog (click user to view full details)
- [x] User privileges/flags display
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
- [x] Server agreement dialog (inline in chat view)
- [ ] Server info display (name, description, user count)
- [x] Server banner download and display
- [ ] Connection status indicators
- [ ] Server statistics

### UI/UX Improvements
- [ ] File preview (images, text files)
- [ ] Drag & drop file uploads
- [ ] Context menus throughout app
- [ ] Keyboard shortcuts
- [x] Transfer progress indicators
- [x] Multiple simultaneous server connections
- [x] Tabbed interface for multiple servers
- [x] Unread message indicators
- [x] Connection error handling with inline messages
- [x] User icon display (classic icons imported)
- [x] Settings UI for username and icon
- [ ] Notification system
- [ ] Sound effects

### Advanced Features
- [x] Tracker server support and browsing (COMPLETED)
- [ ] Connection history tracking
- [ ] Auto-reconnect on disconnect
- [ ] Encrypted file transfers
- [x] Custom user icon support (classic icon set, 629 icons available)
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
