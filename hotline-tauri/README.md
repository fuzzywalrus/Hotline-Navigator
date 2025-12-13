# Hotline

A modern, cross-platform client for the Hotline protocol built with Tauri, React, and Rust.

![Hotline Client](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## About

Hotline is a classic Internet protocol and community platform from the 1990s that provided chat, file sharing, news, and message boards - predating modern social platforms. This is a **cross-platform port** of the excellent [Swift/macOS Hotline client](https://github.com/mierau/hotline) by Mierau, bringing the protocol to Windows and Linux while maintaining full macOS support.

### Why This Port?

While the original Swift version provides a beautiful, native macOS experience, this Tauri-based port offers:

- **Cross-Platform Reach**: Runs on macOS, Windows, and Linux with a single codebase
- **Long-Term Sustainability**: Built on widely-supported, modern technologies (React, Rust, Tauri)
- **Broader Community**: Accessible to developers across all platforms, encouraging contributions
- **Modern Tooling**: Benefits from the extensive React and Rust ecosystems

This port aims to complement, not replace, the original Swift client. macOS users seeking the most native experience should consider the [original Swift version](https://github.com/mierau/hotline).

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
- ✅ **Settings**: Username and icon customization with persistent storage
- ✅ **Server Banners**: Automatic banner download and display
- ✅ **Server Agreements**: Agreement acceptance flow
- ✅ **Notifications**: Toast notifications with history log
- ✅ **Sound Effects**: Classic Hotline sounds (ported from original)
- ✅ **Keyboard Shortcuts**: macOS-style shortcuts (⌘K to connect, ⌘1-4 for tabs, etc.)
- ✅ **Context Menus**: Right-click actions throughout the app
- ✅ **Dark Mode**: Full dark mode support
- ✅ **Transfer List**: Track active and completed file transfers

### Roadmap
- [ ] Account management and permissions
- [ ] Bonjour/mDNS server discovery
- [ ] Auto-reconnect on disconnect
- [ ] Message filtering and blocking
- [ ] Bookmark import/export

## Installation

### Prerequisites
- **Node.js** 18 or later
- **Rust** (stable channel)
- **Tauri Dependencies** - [Platform-specific requirements](https://tauri.app/v1/guides/getting-started/prerequisites)

### Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/hotline-tauri.git
   cd hotline-tauri
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
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

**macOS-specific builds:**
```bash
npm run build:macos-universal    # Universal binary (Intel + Apple Silicon)
npm run build:macos-intel        # Intel (x86_64) only
npm run build:macos-silicon      # Apple Silicon (aarch64) only
```

**macOS Requirements:**
- Both Rust targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- Minimum macOS version: Big Sur (11.0)
- Universal binaries recommended for distribution

### Release Builds (macOS Code Signing)

For distribution-ready builds with code signing and notarization:

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
   - Output to `release/hotline-{version}-macos/`

**Note:** The `.env` file is gitignored and contains sensitive credentials.

## Project Structure

```
hotline-tauri/
├── src/                          # React frontend (TypeScript + Vite)
│   ├── components/
│   │   ├── tracker/              # Server browser and bookmarks
│   │   ├── server/               # Server window shell
│   │   ├── chat/                 # Public and private chat
│   │   ├── board/                # Message board
│   │   ├── news/                 # News reader
│   │   ├── files/                # File browser
│   │   ├── users/                # User list and info
│   │   ├── settings/             # Preferences
│   │   ├── notifications/        # Toast notifications
│   │   └── transfers/            # Transfer manager
│   ├── stores/                   # Zustand state management
│   ├── hooks/                    # Custom React hooks
│   └── types/                    # TypeScript definitions
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── protocol/             # Hotline protocol implementation
│   │   │   ├── client/           # Client connection logic
│   │   │   ├── tracker.rs        # Tracker protocol
│   │   │   └── types.rs          # Protocol types
│   │   ├── state/                # Application state
│   │   ├── commands/             # Tauri IPC commands
│   │   └── main.rs               # Application entry point
│   └── tauri.conf.json           # Tauri configuration
└── public/
    ├── icons/                    # User icons (629 classic icons)
    └── sounds/                   # Sound effects
```

## Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
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

This project is a port of the excellent **[Hotline client for macOS](https://github.com/mierau/hotline)** by **Mierau**. The original Swift implementation provided the protocol reference, UI inspiration, and feature set that made this cross-platform port possible.

The Hotline protocol itself was created by **Hotline Communications** in the 1990s.

## License

MIT License - See LICENSE file for details

## Links

- **Original Swift Client**: https://github.com/mierau/hotline
- **Hotline Protocol Information**: (Coming soon)
- **Issue Tracker**: https://github.com/yourusername/hotline-tauri/issues

---

*Bringing the classic Hotline experience to modern platforms* 🔥
