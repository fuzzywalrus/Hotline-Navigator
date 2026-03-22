# Hotline Navigator (Tauri Client)

The Tauri/React/Rust client for the Hotline protocol — part of the [Hotline Navigator](https://github.com/fuzzywalrus/hotline) project. A modern, cross-platform client built with Tauri v2, React, and Rust.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20iOS%20%7C%20iPadOS%20%7C%20Android-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## About

Hotline is a classic Internet protocol and community platform from the 1990s that provided chat, file sharing, news, and message boards. This is a **cross-platform port** of the excellent [Swift/macOS Hotline client](https://github.com/mierau/hotline) by Dustin Mierau — a recreation in Tauri using React and Rust, with the original source providing protocol reference and inspiration.

### Why This Port?

While the original Swift version provides a native macOS experience, this Tauri-based client offers:

- **Cross-Platform Reach**: Runs on macOS, Windows, Linux, iOS, iPadOS, and Android from a single codebase
- **Long-Term Sustainability**: Built on widely-supported technologies (React, Rust, Tauri v2)
- **Broader Community**: Accessible to developers across all platforms
- **Modern Tooling**: Benefits from the React and Rust ecosystems

This project complements the [original Swift client](https://github.com/mierau/hotline). It does not include server software; for hosting your own Hotline server, see [Mobius](https://github.com/jhalter/mobius).

## Features

- **Server Browser**: Tracker server browsing with bookmark management
- **Chat**: Public chat rooms with server broadcasts
- **Private Messaging**: Direct messages with persistent history and unread indicators
- **Private Chat Rooms**: Multi-user private chat with invites, subjects, and member management
- **User Management**: User lists with admin/idle status indicators
- **Message Board**: Read and post to server message boards
- **News**: Browse categories, read articles, post news and replies
- **File Management**: Browse, download, upload files with progress tracking
- **File Preview**: Preview images, audio, and text files before downloading
- **TLS Support**: Secure encrypted connections to TLS-enabled servers (e.g. Mobius on port 5600), with per-bookmark TLS toggle and auto-detect from tracker listings
- **Settings**: Username and icon customization with persistent storage
- **Server Banners**: Automatic banner download and display
- **Server Agreements**: Agreement acceptance flow
- **Notifications**: Toast notifications with history log
- **Sound Effects**: Classic Hotline sounds (ported from original)
- **Keyboard Shortcuts**: macOS-style shortcuts (Cmd+K to connect, Cmd+1-4 for tabs, etc.)
- **Context Menus**: Right-click actions throughout the app
- **Dark Mode**: Full dark mode support
- **Transfer List**: Track active and completed file transfers
- **IPv6**: Connect to servers and trackers via IPv6 literals (e.g. `[::1]:5493`) and hostnames that resolve to AAAA
- **Large File Support**: 64-bit file sizes for transfers >4 GB via [capability negotiation](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Large-File.md), backward compatible with legacy servers

### Roadmap
- [ ] HOPE secure login — re-enable the probe with a reconnect delay (probe-disconnect-reconnect is the intended detection flow per the spec author; INVERSE MAC is the bare minimum for authenticated login without transport encryption)
- [ ] Account management and permissions
- [ ] Bonjour/mDNS server discovery
- [ ] Auto-reconnect on disconnect
- [ ] Message filtering and blocking
- [ ] Bookmark import/export

## Getting Started

### Prerequisites
- **Node.js** 20+ (recommended for Vite 7 / modern Tauri tooling)
- **Rust** (stable channel)
- **Tauri v2** — [Platform-specific requirements](https://v2.tauri.app/start/prerequisites/)

**Linux (Debian/Ubuntu)** — install system libraries before building:
```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```

### Development

1. **Clone the repository** (this client lives in the `hotline-tauri` directory of the main repo)
   ```bash
   git clone https://github.com/fuzzywalrus/hotline.git
   cd hotline/hotline-tauri
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```
   This starts the Vite frontend only.

4. **Run the full desktop app in development mode**
   ```bash
   npm run tauri dev
   ```

### Debugging

The app includes a built-in debug logging system that is **active only in development builds** (`npm run tauri dev`) and completely stripped from production/distributed builds.

**Viewing logs:** Right-click anywhere in the running dev app → **Inspect Element** → **Console** tab. All debug output appears in the browser console.

**How it works:** The logger utility (`src/utils/logger.ts`) wraps `console.log` behind `import.meta.env.DEV`, which Vite statically replaces at build time. In production builds, the bundler dead-code-eliminates all `log()` calls — zero runtime cost.

**Log format:** All messages are prefixed with a category tag for easy filtering:

```
[Chat]        Chat messages, private messages, broadcasts, private chat rooms
[Users]       User join/leave/change events, disconnect actions
[Files]       File list requests/responses, folder creation
[Transfer]    Download/upload start, progress, completion, errors
[News]        News categories, articles, posting, navigation
[Board]       Message board loading and posting
[Connection]  Status changes, server info, connect/disconnect
[Banner]      Server banner download lifecycle
[Agreement]   Server agreement detection and acceptance
[Permissions] User access permission bitmask
```

**Filtering in the console:** Type a category name (e.g. `[Transfer]`) into the browser console's filter box to isolate logs for a specific subsystem.

**Error logging:** `error()` calls always log to `console.error` regardless of build mode — these represent real problems that should never be silenced.

**Rust backend debugging:** Rust `println!` output may not appear in the Tauri dev console. For backend debugging, write to `/tmp/hotline-debug.log` using file I/O, or check the terminal where `npm run tauri dev` is running.

## Building

**Platform support:** macOS (x86_64, ARM64, Universal), Windows (x86_64), Linux (x86_64, ARM64), iOS, iPadOS, and Android. Mobile builds are not in app stores and must be built or sideloaded. See the [main project README](https://github.com/fuzzywalrus/hotline#platform-support) for details.

### Desktop

**Frontend only:**
```bash
npm run build
```

**Full application bundle:**
```bash
npm run tauri build
```

**Windows:**
```bash
npm run build:windows          # Windows x86_64 (MSVC)
```

**macOS:**
```bash
npm run build:macos-universal    # Universal binary (Intel + Apple Silicon)
npm run build:macos-intel        # Intel (x86_64) only
npm run build:macos-silicon      # Apple Silicon (aarch64) only
```

**Linux (including ARM64):**
```bash
# Add Rust target for native ARM64 builds (on an ARM machine) or when using a proper cross toolchain
rustup target add aarch64-unknown-linux-gnu

# Build for x86_64 Linux
npm run build:linux

# Build for Linux ARM64 (aarch64)
npm run build:linux-arm
```

Notes:
- Cross-compiling from x86_64 to `aarch64-unknown-linux-gnu` requires an aarch64 cross toolchain (for example `aarch64-linux-gnu-gcc`) or using Docker/CI running on ARM64. For static MUSL builds you may need the `aarch64-unknown-linux-musl` target and musl cross toolchain.
- The `build-release-linux-arm64.sh` helper script attempts to add the ARM64 Rust target automatically.

### Mobile

**iOS / iPadOS** (requires Xcode and CocoaPods; minimum iOS 15.0 in config; see repo root for sideloading):
```bash
npm run ios:init                 # One-time: generate Xcode project
npm run build:ios                # Build for device
npm run build:ios-simulator      # Build for simulator
npm run ios:dev                  # Run on device
npm run ios:dev:simulator        # Run in simulator (default: iPad Pro 11-inch M4)
```

**Android** (requires Android SDK/NDK; see repo root for sideloading):
```bash
npm run android:init             # One-time: initialize Android project
npm run build:android             # Build release APK
npm run build:android-debug      # Build debug APK
npm run build:android-aab        # Build App Bundle for Play Store
npm run android:dev              # Run on device/emulator
```

### Multi-Platform Release

```bash
npm run build:release-all
```
This runs the macOS/Windows/Linux build scripts in sequence and packages artifacts under `release/`.

### macOS Code Signing

For distribution-ready builds with code signing:

1. **Create `.env` file** in project root:
   ```bash
   APPLE_ID="your-apple-id@example.com"
   APP_PASSWORD="your-app-specific-password"
   TEAM_ID="YOUR_TEAM_ID"
   SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
   ```

2. **Run release build:**
   ```bash
   npm run build:release
   ```

   This will:
   - Build a Universal Binary
   - Code sign the application
   - Verify signatures
   - Create a DMG (if `create-dmg` is installed)
   - Output to `release/hotline-navigator-{version}-macos/`

**Notarization:** the script includes commented `notarytool`/`stapler` steps you can enable for your release flow.

**Note:** The `.env` file is gitignored and contains sensitive credentials.

**macOS requirements:**
- Both Rust targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- Minimum macOS version: Big Sur (11.0)
- Universal binaries recommended for distribution

## Testing & Quality

**Rust (protocol, transaction encoding, IPv6 address formatting):**
```bash
cd hotline-tauri/src-tauri && cargo test
```

**Frontend (Vitest — stores, utils):**
```bash
cd hotline-tauri && npm run test
```

Watch mode: `npm run test:watch`. Coverage: `npm run test:coverage`.

**Linting and type checking:**
```bash
npm run typecheck
npm run lint
```

## Architecture

### Technology Stack

**Frontend:**
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite 7** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **@dnd-kit** - Drag and drop functionality

**Backend:**
- **Rust** - Systems programming language
- **Tauri v2** - Desktop application framework
- **Tokio** - Async runtime
- **Serde** - Serialization/deserialization

### State Management
- **Frontend**: Zustand stores with persistence to localStorage
- **Backend**: Rust AppState with Arc<RwLock<T>> for thread-safe access
- **Communication**: Tauri IPC commands and events

### Protocol Implementation
- Clean-room Rust implementation of the Hotline protocol
- Uses the original Swift client as reference for protocol details
- Async/await architecture with Tokio for network operations
- Event-driven design for real-time updates

### Cross-Platform Considerations
- Platform-agnostic file paths using Tauri's path API
- Conditional platform features (keyboard shortcuts adapt to OS)
- Responsive layout that works on different screen sizes

### Project Structure

```
hotline-tauri/
├── src/                          # React frontend (TypeScript + Vite)
│   ├── assets/                   # App images and static UI assets
│   ├── components/
│   │   ├── tracker/              # Server browser and bookmarks
│   │   ├── server/               # Server window shell
│   │   │   └── hooks/            # Server-specific event/handler hooks
│   │   ├── chat/                 # Public and private chat
│   │   ├── board/                # Message board
│   │   ├── news/                 # News reader
│   │   ├── files/                # File browser
│   │   ├── about/                # About dialog
│   │   ├── users/                # User list and info
│   │   ├── settings/             # Preferences
│   │   ├── notifications/        # Toast notifications
│   │   ├── transfers/            # Transfer manager
│   │   ├── update/               # App update UI
│   │   ├── common/               # Shared UI (e.g. Linkify, ContextMenu)
│   │   └── tabs/                 # Tab bar
│   ├── stores/                   # Zustand state management
│   ├── hooks/                    # Custom React hooks
│   ├── test/                     # Frontend test setup/helpers
│   ├── types/                    # TypeScript definitions
│   └── utils/                    # Shared utility functions (logger, sounds, etc.)
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── protocol/             # Hotline protocol implementation
│   │   │   ├── client/           # Client connection (chat, files, news, users)
│   │   │   ├── tracker.rs        # Tracker protocol
│   │   │   ├── types.rs          # Protocol types
│   │   │   ├── transaction.rs    # Transaction handling
│   │   │   └── constants.rs      # Protocol constants
│   │   ├── state/                # Application state
│   │   ├── commands/             # Tauri IPC commands
│   │   ├── lib.rs                # Plugin setup and entry
│   │   └── main.rs               # Application entry point
│   └── tauri.conf.json           # Tauri configuration
├── build-release.sh              # Signed macOS release helper
├── build-release-all.sh          # Multi-platform release helper
├── build-release-linux-arm64.sh  # Linux ARM64 packaging helper
└── public/
    ├── icons/                    # User icons (classic set)
    └── sounds/                   # Sound effects
```

## Protocol Details

These sections document the protocol implementation details for contributors and client authors. For the Hotline protocol spec itself, see [fogWraith/Hotline Docs/Protocol](https://github.com/fogWraith/Hotline/tree/main/Docs/Protocol).

### TLS (Encrypted Connections)

Hotline Navigator supports TLS connections to servers that offer encryption (such as [Mobius](https://github.com/jhalter/mobius) v0.20+). TLS wraps the TCP connection before the Hotline protocol handshake, protecting credentials and data in transit.

**Per-bookmark TLS:** Each bookmark has a "Use TLS" toggle. When enabled, the client connects on the specified port (typically 5600) using TLS. Toggling TLS on/off in the Connect or Edit Bookmark dialogs automatically switches between port 5600 and 5500.

**Auto-Detect TLS:** An opt-in setting (Settings > General > Auto-Detect TLS) that automatically tries a TLS connection when connecting from tracker listings. When enabled, the client attempts to connect on port+100 with TLS first; if TLS fails or times out (5 seconds), it falls back to a plain connection on the original port. This works transparently — no user action needed beyond enabling the setting.

<details>
<summary><strong>Implementation guide for client authors</strong></summary>

Hotline TLS follows the convention established by [Mobius](https://github.com/jhalter/mobius): TLS is served on a port 100 higher than the plain Hotline port (e.g. plain on 5500, TLS on 5600). TLS wraps the raw TCP socket *before* the Hotline protocol handshake — the protocol bytes on the wire are identical, just encrypted. File transfers follow the same pattern (transfer port = server port + 1, so TLS transfers on 5601).

To implement auto-detect TLS in your own client:

1. **Try TLS first, fall back to plain.** Attempt a full TLS connection on port+100 with a reasonable timeout (we use 5 seconds). If it succeeds, you're done. If it fails or times out, connect on the original port without TLS.
2. **Do not probe separately.** An earlier approach of opening a TCP connection to check if the TLS port was open, then closing it and opening a second connection for the real TLS handshake, caused the server to reject the second connection. Hotline servers (particularly Mobius) appear to treat the aborted probe as a bad client and temporarily refuse connections from the same IP. The correct approach is a single connection attempt — try TLS, and if it fails, try plain.
3. **SNI with IP addresses.** Go's `crypto/tls` server rejects the TLS IP Address SNI extension (`ServerName::IpAddress`). When connecting by IP rather than hostname, either omit the SNI extension entirely or send a dummy DNS hostname (we use `"hotline"`). Since Hotline servers use self-signed certificates, the SNI value only affects certificate selection, not validation — any value (or none) works.
4. **Certificate verification.** Hotline servers use self-signed certificates, so TLS clients must either skip verification or implement a trust-on-first-use model. We skip verification entirely (`InsecureSkipVerify` equivalent).
5. **Per-bookmark persistence.** Store whether a bookmark uses TLS so users don't pay the auto-detect timeout cost on every connection. Auto-detect is best suited for tracker listings where TLS capability isn't known in advance.

</details>

### File Transfers (HTXF)

Hotline file transfers happen on a separate TCP connection from the main chat/command connection. When you download or upload a file, the client first asks the server on the main connection ("I'd like to download X"). The server replies with a **reference number** — a temporary token that identifies this specific transfer. The client then opens a *second* TCP connection to the server's transfer port (main port + 1, so typically 5501) and sends a 16-byte handshake:

```
Bytes 0-3:   "HTXF"              <- The file-transfer protocol ID (4 ASCII bytes)
Bytes 4-7:   Reference number    <- The token the server gave us
Bytes 8-11:  Transfer size       <- For uploads: total bytes we're sending. For downloads: 0
Bytes 12-15: Flags               <- Usually 0 for legacy transfers
```

After the handshake, file data flows as a **FILP** (Flattened File) stream. A FILP wraps one or more "forks" — the DATA fork is the actual file content, and there may also be an INFO fork (metadata) or MACR fork (classic Mac resource fork). Each fork has a 16-byte header describing its type and size, followed by the raw fork data.

For TLS-enabled servers, the transfer connection is also wrapped in TLS, using the same approach as the main connection.

<details>
<summary><strong>Large file support (>4 GB)</strong></summary>

The original Hotline protocol used 32-bit integers for file sizes, capping transfers at ~4.3 GB. Hotline Navigator implements the [Large File extension](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Large-File.md) drafted by [fogWraith/HLServer](https://github.com/fogWraith/HLServer), which adds 64-bit file size support through a capability negotiation mechanism:

1. **Negotiation:** During login, the client sends a `DATA_CAPABILITIES` field (ID `0x01F0`) with bit 0 set, advertising large file support. If the server understands and supports it, it echoes the capability back in its reply. If the server doesn't recognize the field, it simply ignores it — no harm done.

2. **64-bit fields:** When large file mode is active, the server sends additional 64-bit companion fields alongside the legacy 32-bit ones: `FileSize64` (`0x01F1`), `TransferSize64` (`0x01F3`), etc. The client reads the 64-bit value when present and falls back to the 32-bit value for legacy servers.

3. **Extended HTXF handshake:** The flags field (bytes 12-15) gains two bits: `HTXF_FLAG_LARGE_FILE` (0x01) signals large file mode is active, and `HTXF_FLAG_SIZE64` (0x02) means an additional 8 bytes follow the standard 16-byte header, carrying the full 64-bit transfer length.

4. **Fork header reinterpretation:** In large file mode, the 16-byte fork header layout changes — bytes 4-7 become the *high* 32 bits of the fork size and bytes 12-15 become the *low* 32 bits, combining into a full 64-bit length.

This is fully backward compatible: legacy servers that don't understand the capabilities field ignore it, and Navigator operates in standard 32-bit mode. The extension only activates when both client and server agree.

</details>

### HOPE (Secure Login & Transport Encryption)

HOPE (Hotline One-time Password Extension) is a protocol extension that replaces Hotline's weak XOR-0xFF password obfuscation with proper MAC-based authentication and optional transport encryption (RC4). The spec lives at [fogWraith/Hotline HOPE-Secure-Login.md](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/HOPE-Secure-Login.md).

**Current status: implemented but disabled.** The full HOPE implementation is in place — MAC authentication (HMAC-SHA1, SHA1, HMAC-MD5, MD5), RC4 transport encryption with key rotation, and the 3-step login handshake. However, auto-negotiation is turned off because there is no safe way to detect whether a server supports HOPE before trying it.

**The problem:** HOPE login starts by sending a Login transaction with `UserLogin` set to a single `0x00` byte. Servers that understand HOPE recognize this as a negotiation request and reply with a session key. Servers that don't understand HOPE treat it as a real login attempt with an invalid username — they reject it, close the connection, and may temporarily block the client's IP. This makes the "try HOPE first, fall back to legacy" approach unsuitable for general use.

<details>
<summary><strong>Enabling HOPE & implementation details</strong></summary>

**What needs to happen to enable HOPE:**

1. **Server-side detection** — A way to know a server supports HOPE *before* sending the probe. Possible approaches:
   - A per-bookmark "Use HOPE" toggle (user opts in when they know the server supports it)
   - Server version or capability advertisement in the handshake response (would require a protocol addition)
   - Tracker metadata indicating HOPE support
   - A separate lightweight probe that doesn't poison the connection

2. **Enabling the probe** — Once detection is solved, un-comment `try_hope_probe()` in the login flow (`client/mod.rs`). The rest of the implementation (crypto, key derivation, encryption activation, transport wrappers) is ready to go.

**How HOPE works (the 3-step login):**

1. **Client sends identification** — A Login transaction with `UserLogin = 0x00`, a list of supported MAC algorithms (strongest first), the app ID (`HTLN`), and optionally supported ciphers (currently `RC4`).

2. **Server replies** — If it supports HOPE, it sends back a 64-byte session key, its chosen MAC algorithm, and chosen ciphers. If it doesn't, the login fails (see "the problem" above).

3. **Client sends authenticated login** — The password is MAC'd with the session key instead of XOR'd. After a successful login, if both sides agreed on a cipher (e.g. RC4), transport encryption is activated for all subsequent transactions on the main connection. File transfers on port+1 remain unencrypted — they use their own separate connections.

**Transport encryption details:**

- RC4 stream cipher encrypts each transaction (header + body) as it goes over the wire
- Key rotation provides forward secrecy: after each packet, `new_key = MAC(current_key, session_key)`, and RC4 is re-initialized
- The rotation count is embedded in the top byte of the encrypted transaction's type field
- Encryption is packet-aware — the reader/writer know transaction boundaries, which is why this uses custom `HopeReader`/`HopeWriter` wrappers rather than a byte-stream encryption layer

See [HOPE_IMPLEMENTATION.md](HOPE_IMPLEMENTATION.md) for a map of all HOPE-related code locations.

</details>

### Error Handling

Hotline Navigator uses a two-tier error handling system to give users clear, actionable feedback when something goes wrong.

**Tier 1 — Backend error resolution (`resolve_error_message`):** When the Rust protocol client receives a non-zero error code from the server, it first checks for a server-provided `ErrorText` field (FieldType 100), which many servers include with a human-readable description. If no `ErrorText` is present, it falls back to the [HL Error Codes](https://hlwiki.com/index.php/HL_ErrorCodes) spec — a set of well-known error codes defined in `HotlineErrorCode` (`src-tauri/src/protocol/constants.rs`):

| Code | Name | Fallback Message |
|------|------|-----------------|
| 0 | None | No error |
| -1 | Generic | A non-specific error occurred |
| 1 | NotConnected | The connection is no longer active |
| 2 | Socket | A network socket error occurred |
| 1000 | LoginFailed | Invalid login credentials |
| 1001 | AlreadyLoggedIn | Already logged in to this server |
| 1002 | AccessDenied | Access denied |
| 1003 | UserBanned | Banned from this server |
| 1004 | ServerFull | Server is full |
| 2000 | FileNotFound | File or folder not found |
| 2001 | FileInUse | File is in use by another process |
| 2002 | DiskFull | Server disk is full |
| 2003 | TransferFailed | File transfer failed |
| 3000 | NewsFull | News database is full |
| 3001 | MsgRefused | Recipient has refused private messages |

For unrecognized codes, it displays "Unknown error (code N)". Server-provided text always takes priority — the table above is only used when the server doesn't send an `ErrorText` field.

**Tier 2 — Frontend error classification (`classifyError`):** Error strings from the backend are passed to the frontend classifier (`src/utils/errorClassifier.ts`), which categorizes them by keyword matching into categories like `dns`, `timeout`, `refused`, `tls`, `protocol`, `auth`, `transfer`, and `cancelled`. Each category maps to a user-friendly title, message, and recovery suggestion.

**Display paths:**
- **Connection errors** (login, handshake, server full, banned) → `classifyError()` → **ErrorModal** with icon, explanation, and retry button
- **Operational errors** (file transfers, news, chat) → **toast notifications** with the resolved error message

### Icon System

Hotline servers assign each user a numeric icon ID displayed next to their name in chat and the user list.

**Bundled icons:** The app ships with 631 classic Hotline icons in `public/icons/classic/`, named by ID (e.g. `191.png`). These are 16x16 PNGs rendered with `image-rendering: pixelated` to preserve their pixel art look.

**Remote fallback (hlwiki.com):** Many servers use custom icon IDs beyond the bundled set. When a local icon isn't found, the client loads it from the [hlwiki.com Icon Gallery](https://hlwiki.com/index.php?title=Icon_Gallery):

```
https://hlwiki.com/ik0ns/{id}.png
```

The fallback chain in `src/components/users/UserIcon.tsx`:

1. Try local path `/icons/classic/{id}.png`
2. If that fails and "Remote Icons" is enabled, try `https://hlwiki.com/ik0ns/{id}.png`
3. If the remote also fails (or remote icons are disabled), show a gray box with the numeric ID

Remote images render at natural size, clipped to the icon container — no scaling. This matters because some hlwiki icons are actually banners.

**Banner icons:** Some icon IDs on hlwiki.com are wide "banner" images (232x18) meant to display behind usernames rather than as square icons. The `UserBanner` component in `UserIcon.tsx` handles these:

- Probes whether the icon exists locally (hidden `<img>` load test)
- If the icon is NOT local and remote icons are enabled, fetches from hlwiki.com and renders the banner behind the username row at native size with 80% opacity
- The "Show Banners" preference controls banner display — when off, remote icons still load but get clipped to normal icon size

**Preferences** (in `preferencesStore.ts`, persisted under the `hotline-preferences` localStorage key):

| Setting | Default | What it does |
|---------|---------|--------------|
| `useRemoteIcons` | `true` | Load missing icons from hlwiki.com |
| `showRemoteBanners` | `true` | Show wide banner icons at full size behind usernames |

Both toggles are in Settings > General.

**Adding bundled icons:** Drop a PNG named `{id}.png` into `public/icons/classic/`. Local icons always take priority over the remote fallback.

## Contributing

Contributions are welcome! This project benefits from:
- Bug reports and feature requests via GitHub Issues
- Code contributions via Pull Requests
- Protocol documentation and implementation notes
- Testing on different platforms

When contributing, please:
1. Follow the existing code style
2. Add tests for new features
3. Update documentation as needed
4. Test on your target platform

## Credits

This project is a port of the excellent **[Hotline client for macOS](https://github.com/mierau/hotline)** by **Dustin Mierau**. The original Swift implementation provided the protocol reference, UI inspiration, and feature set that made this cross-platform port possible.

The Hotline protocol itself was created by **Hotline Communications** in the 1990s.

## License

MIT License - See LICENSE file for details

## Links

- **Official Website**: https://hotline.greggant.com
- **Hotline Navigator (this repo)**: https://github.com/fuzzywalrus/hotline
- **Releases**: https://github.com/fuzzywalrus/hotline/releases
- **Original Swift Client**: https://github.com/mierau/hotline
- **Mobius (Hotline server)**: https://github.com/jhalter/mobius
- **Issue Tracker**: https://github.com/fuzzywalrus/hotline/issues

---

*Bringing the classic Hotline experience to modern platforms*
