# Release Checklist

## Pre-Release Steps

1. **Update version numbers** (if needed):
   - `package.json`: `"version": "0.1.1"`
   - `src-tauri/tauri.conf.json`: `"version": "0.1.1"`
   - `src-tauri/Cargo.toml`: `version = "0.1.1"`

2. **Build the release**:
   ```bash
   npm run build:macos-universal
   ```

3. **Verify build artifacts**:
   - App bundle: `src-tauri/target/universal-apple-darwin/release/bundle/macos/Hotline Navigator.app`
   - DMG: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/Hotline Navigator_0.1.1_universal.dmg`

## GitHub Release Steps

1. **Create a Git tag** (if not already created):
   ```bash
   git tag -a v0.1.1 -m "Release v0.1.1"
   git push origin v0.1.1
   ```

2. **Create GitHub Release**:
   - Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/releases/new
   - **Tag**: Select or create `v0.1.1`
   - **Title**: `Hotline Navigator v0.1.1`
   - **Description**: Use the template below

3. **Upload DMG file**:
   - Drag and drop: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/Hotline Navigator_0.1.1_universal.dmg`
   - Or use the "Attach binaries" section

4. **Publish the release**

## Release Notes Template

```markdown
## Hotline Navigator v0.1.1

### 🎉 Initial Release

A modern, cross-platform client for the Hotline protocol.

### ✨ Features

- **Server Browser**: Tracker server browsing with bookmark management
- **Chat**: Public chat rooms with server broadcasts
- **Private Messaging**: Direct messages with persistent history
- **Message Board**: Read and post to server message boards
- **News**: Browse categories, read articles, post news and replies
- **File Management**: Browse, download, upload files with progress tracking
- **File Preview**: Preview images, audio, and text files
- **Settings**: Username and icon customization
- **Server Banners**: Automatic banner download and display
- **Dark Mode**: Full dark mode support
- **Keyboard Shortcuts**: macOS-style shortcuts
- **Sound Effects**: Classic Hotline sounds

### 📦 Installation

1. Download `Hotline Navigator_0.1.1_universal.dmg`
2. Open the DMG file
3. Drag `Hotline Navigator` to your Applications folder
4. Launch from Applications

### 🖥️ System Requirements

- macOS Big Sur (11.0) or later
- Universal Binary (works on Intel and Apple Silicon Macs)

### 📝 Notes

- This is the initial release of the Tauri-based Hotline client
- Cross-platform support (Windows/Linux) coming soon
- Report issues at: [GitHub Issues](https://github.com/YOUR_USERNAME/YOUR_REPO/issues)

### 🙏 Credits

Built with [Tauri](https://tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/).
Port of the excellent [Hotline client for macOS](https://github.com/mierau/hotline) by Mierau.
```

## Quick Release Script

You can also use this one-liner to prepare the release:

```bash
# Get version
VERSION=$(node -p "require('./package.json').version")
DMG_PATH="src-tauri/target/universal-apple-darwin/release/bundle/dmg/Hotline Navigator_${VERSION}_universal.dmg"

# Check if DMG exists
if [ -f "$DMG_PATH" ]; then
  echo "✅ DMG found: $DMG_PATH"
  echo "📦 File size: $(du -h "$DMG_PATH" | cut -f1)"
  echo ""
  echo "Next steps:"
  echo "1. Create tag: git tag -a v${VERSION} -m 'Release v${VERSION}' && git push origin v${VERSION}"
  echo "2. Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/releases/new"
  echo "3. Upload: $DMG_PATH"
else
  echo "❌ DMG not found. Run: npm run build:macos-universal"
fi
```
