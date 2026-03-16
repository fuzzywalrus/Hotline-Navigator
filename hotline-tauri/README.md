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

### Currently Implemented
- ✅ **Server Browser**: Tracker server browsing with bookmark management
- ✅ **Chat**: Public chat rooms with server broadcasts
- ✅ **Private Messaging**: Direct messages with persistent history and unread indicators
- ✅ **User Management**: User lists with admin/idle status indicators
- ✅ **Message Board**: Read and post to server message boards
- ✅ **News**: Browse categories, read articles, post news and replies
- ✅ **File Management**: Browse, download, upload files with progress tracking
- ✅ **File Preview**: Preview images, audio, and text files before downloading
- ✅ **TLS Support**: Secure encrypted connections to TLS-enabled servers (e.g. Mobius on port 5600), with per-bookmark TLS toggle and auto-detect from tracker listings
- ✅ **Settings**: Username and icon customization with persistent storage
- ✅ **Server Banners**: Automatic banner download and display
- ✅ **Server Agreements**: Agreement acceptance flow
- ✅ **Notifications**: Toast notifications with history log
- ✅ **Sound Effects**: Classic Hotline sounds (ported from original)
- ✅ **Keyboard Shortcuts**: macOS-style shortcuts (⌘K to connect, ⌘1-4 for tabs, etc.)
- ✅ **Context Menus**: Right-click actions throughout the app
- ✅ **Dark Mode**: Full dark mode support
- ✅ **Transfer List**: Track active and completed file transfers
- ✅ **IPv6**: Connect to servers and trackers via IPv6 literals (e.g. `[::1]:5493`) and hostnames that resolve to AAAA
- ✅ **Large File Support**: 64-bit file sizes for transfers >4 GB via [capability negotiation](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Large-File.md), backward compatible with legacy servers

### TLS (Encrypted Connections)

Hotline Navigator supports TLS connections to servers that offer encryption (such as [Mobius](https://github.com/jhalter/mobius) v0.20+). TLS wraps the TCP connection before the Hotline protocol handshake, protecting credentials and data in transit.

**Per-bookmark TLS:** Each bookmark has a "Use TLS" toggle. When enabled, the client connects on the specified port (typically 5600) using TLS. Toggling TLS on/off in the Connect or Edit Bookmark dialogs automatically switches between port 5600 and 5500.

**Auto-Detect TLS:** An opt-in setting (Settings > General > Auto-Detect TLS) that automatically tries a TLS connection when connecting from tracker listings. When enabled, the client attempts to connect on port+100 with TLS first; if TLS fails or times out (5 seconds), it falls back to a plain connection on the original port. This works transparently — no user action needed beyond enabling the setting.

**Implementation guide for client authors:**

Hotline TLS follows the convention established by [Mobius](https://github.com/jhalter/mobius): TLS is served on a port 100 higher than the plain Hotline port (e.g. plain on 5500, TLS on 5600). TLS wraps the raw TCP socket *before* the Hotline protocol handshake — the protocol bytes on the wire are identical, just encrypted. File transfers follow the same pattern (transfer port = server port + 1, so TLS transfers on 5601).

To implement auto-detect TLS in your own client:

1. **Try TLS first, fall back to plain.** Attempt a full TLS connection on port+100 with a reasonable timeout (we use 5 seconds). If it succeeds, you're done. If it fails or times out, connect on the original port without TLS.
2. **Do not probe separately.** An earlier approach of opening a TCP connection to check if the TLS port was open, then closing it and opening a second connection for the real TLS handshake, caused the server to reject the second connection. Hotline servers (particularly Mobius) appear to treat the aborted probe as a bad client and temporarily refuse connections from the same IP. The correct approach is a single connection attempt — try TLS, and if it fails, try plain.
3. **SNI with IP addresses.** Go's `crypto/tls` server rejects the TLS IP Address SNI extension (`ServerName::IpAddress`). When connecting by IP rather than hostname, either omit the SNI extension entirely or send a dummy DNS hostname (we use `"hotline"`). Since Hotline servers use self-signed certificates, the SNI value only affects certificate selection, not validation — any value (or none) works.
4. **Certificate verification.** Hotline servers use self-signed certificates, so TLS clients must either skip verification or implement a trust-on-first-use model. We skip verification entirely (`InsecureSkipVerify` equivalent).
5. **Per-bookmark persistence.** Store whether a bookmark uses TLS so users don't pay the auto-detect timeout cost on every connection. Auto-detect is best suited for tracker listings where TLS capability isn't known in advance.

### File Transfers (HTXF)

Hotline file transfers happen on a separate TCP connection from the main chat/command connection. Here's how it works:

**The basics:** When you download or upload a file, the client first asks the server on the main connection ("I'd like to download X"). The server replies with a **reference number** — a temporary token that identifies this specific transfer. The client then opens a *second* TCP connection to the server's transfer port (main port + 1, so typically 5501) and sends a 16-byte handshake:

```
Bytes 0–3:   "HTXF"              ← The file-transfer protocol ID (4 ASCII bytes)
Bytes 4–7:   Reference number    ← The token the server gave us
Bytes 8–11:  Transfer size       ← For uploads: total bytes we're sending. For downloads: 0
Bytes 12–15: Flags               ← Usually 0 for legacy transfers
```

After the handshake, file data flows as a **FILP** (Flattened File) stream. A FILP wraps one or more "forks" — the DATA fork is the actual file content, and there may also be an INFO fork (metadata) or MACR fork (classic Mac resource fork). Each fork has a 16-byte header describing its type and size, followed by the raw fork data.

For TLS-enabled servers, the transfer connection is also wrapped in TLS, using the same approach as the main connection.

**Large file support (>4 GB):** The original Hotline protocol used 32-bit integers for file sizes, capping transfers at ~4.3 GB. Hotline Navigator implements the [Large File extension](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Large-File.md) drafted by [fogWraith/HLServer](https://github.com/fogWraith/HLServer), which adds 64-bit file size support through a capability negotiation mechanism:

1. **Negotiation:** During login, the client sends a `DATA_CAPABILITIES` field (ID `0x01F0`) with bit 0 set, advertising large file support. If the server understands and supports it, it echoes the capability back in its reply. If the server doesn't recognize the field, it simply ignores it — no harm done.

2. **64-bit fields:** When large file mode is active, the server sends additional 64-bit companion fields alongside the legacy 32-bit ones: `FileSize64` (`0x01F1`), `TransferSize64` (`0x01F3`), etc. The client reads the 64-bit value when present and falls back to the 32-bit value for legacy servers.

3. **Extended HTXF handshake:** The flags field (bytes 12–15) gains two bits: `HTXF_FLAG_LARGE_FILE` (0x01) signals large file mode is active, and `HTXF_FLAG_SIZE64` (0x02) means an additional 8 bytes follow the standard 16-byte header, carrying the full 64-bit transfer length.

4. **Fork header reinterpretation:** In large file mode, the 16-byte fork header layout changes — bytes 4–7 become the *high* 32 bits of the fork size and bytes 12–15 become the *low* 32 bits, combining into a full 64-bit length.

This is fully backward compatible: legacy servers that don't understand the capabilities field ignore it, and Navigator operates in standard 32-bit mode. The extension only activates when both client and server agree.

### Icon System

Hotline servers assign each user a numeric icon ID displayed next to their name in chat and the user list.

**Bundled icons:** The app ships with 631 classic Hotline icons in `public/icons/classic/`, named by ID (e.g. `191.png`). These are 16×16 PNGs rendered with `image-rendering: pixelated` to preserve their pixel art look.

**Remote fallback (hlwiki.com):** Many servers use custom icon IDs beyond the bundled set. When a local icon isn't found, the client loads it from the [hlwiki.com Icon Gallery](https://hlwiki.com/index.php?title=Icon_Gallery):

```
https://hlwiki.com/ik0ns/{id}.png
```

The fallback chain in `src/components/users/UserIcon.tsx`:

1. Try local path `/icons/classic/{id}.png`
2. If that fails and "Remote Icons" is enabled, try `https://hlwiki.com/ik0ns/{id}.png`
3. If the remote also fails (or remote icons are disabled), show a gray box with the numeric ID

Remote images render at natural size, clipped to the icon container — no scaling. This matters because some hlwiki icons are actually banners.

**Banner icons:** Some icon IDs on hlwiki.com are wide "banner" images (232×18) meant to display behind usernames rather than as square icons. The `UserBanner` component in `UserIcon.tsx` handles these:

- Probes whether the icon exists locally (hidden `<img>` load test)
- If the icon is NOT local and remote icons are enabled, fetches from hlwiki.com and renders the banner behind the username row at native size with 80% opacity
- The "Show Banners" preference controls banner display — when off, remote icons still load but get clipped to normal icon size

**Preferences** (in `preferencesStore.ts`, persisted under the `hotline-preferences` localStorage key):

| Setting | Default | What it does |
|---------|---------|--------------|
| `useRemoteIcons` | `true` | Load missing icons from hlwiki.com |
| `showRemoteBanners` | `true` | Show wide banner icons at full size behind usernames |

Both toggles are in Settings → General.

**Adding bundled icons:** Drop a PNG named `{id}.png` into `public/icons/classic/`. Local icons always take priority over the remote fallback.

### Roadmap
- [ ] Account management and permissions
- [ ] Bonjour/mDNS server discovery
- [ ] Auto-reconnect on disconnect
- [ ] Message filtering and blocking
- [ ] Bookmark import/export

## Installation

**Platform support:** macOS (x86_64, ARM64, Universal), Windows (x86_64), Linux (x86_64, ARM64), iOS, iPadOS, and Android. Mobile builds are not in app stores and must be built or sideloaded. See the [main project README](https://github.com/fuzzywalrus/hotline#platform-support) for details.

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

### Building

**Frontend only:**
```bash
npm run build
```

**Full application bundle:**
```bash
npm run tauri build
```

**Windows build:**
```bash
npm run build:windows          # Windows x86_64 (MSVC)
```

**macOS-specific builds:**
```bash
npm run build:macos-universal    # Universal binary (Intel + Apple Silicon)
npm run build:macos-intel        # Intel (x86_64) only
npm run build:macos-silicon      # Apple Silicon (aarch64) only
```

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

**Multi-platform release helper:**
```bash
npm run build:release-all
```
This runs the macOS/Windows/Linux build scripts in sequence and packages artifacts under `release/`.

### Quality Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
```

**macOS Requirements:**
- Both Rust targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- Minimum macOS version: Big Sur (11.0)
- Universal binaries recommended for distribution

### Release Builds (macOS Code Signing)

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

## Project Structure

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
│   └── utils/                    # Shared utility functions
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

## Technology Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite 7** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **@dnd-kit** - Drag and drop functionality

### Backend
- **Rust** - Systems programming language
- **Tauri v2** - Desktop application framework
- **Tokio** - Async runtime
- **Serde** - Serialization/deserialization

## Architecture

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

## Testing

- **Rust (protocol, transaction encoding, IPv6 address formatting):**
  ```bash
  cd hotline-tauri/src-tauri && cargo test
  ```
- **Frontend (Vitest — stores, utils):**
  ```bash
  cd hotline-tauri && npm run test
  ```
- Watch mode: `npm run test:watch`. Coverage: `npm run test:coverage`.

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

*Bringing the classic Hotline experience to modern platforms* 🔥
