#!/usr/bin/env bash

# Build and release helper for Linux ARM64 only
# This script builds the Tauri app for aarch64-unknown-linux-gnu,
# bundles DEB and AppImage artifacts, and copies them into release/.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure nvm/node available if installed via nvm
if [ -d "$HOME/.nvm" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
fi

echo "🔧 Building Linux ARM64 release (aarch64-unknown-linux-gnu)"

# Ensure Rust target
echo "🛠️ Ensuring Rust target: aarch64-unknown-linux-gnu"
rustup target add aarch64-unknown-linux-gnu >/dev/null 2>&1 || true

echo "📦 Installing npm dependencies (if needed)"
npm install --silent || true

echo "🔨 Running Tauri build for aarch64"
npm run build:linux-arm

# Paths
TARGET_BUNDLE_DIR="src-tauri/target/aarch64-unknown-linux-gnu/release/bundle"
RELEASE_DIR="release/hotline-navigator-$(node -p "require('./package.json').version")-linux-arm64"
mkdir -p "$RELEASE_DIR"

# Copy DEB artifacts
if [ -d "$TARGET_BUNDLE_DIR/deb" ]; then
  cp -R "$TARGET_BUNDLE_DIR/deb"/* "$RELEASE_DIR/" 2>/dev/null || true
  echo "✅ DEB artifacts copied to $RELEASE_DIR"
fi

# AppImage fallback (similar to build-release-all.sh helper)
create_appimage_from_appdir() {
  local bundle_dir="$1"
  local arch="$2"
  local appimage_dir="$bundle_dir/appimage"
  local appdir_path

  if [ -d "$appimage_dir" ]; then
    for d in "$appimage_dir"/*; do
      [ -d "$d" ] || continue
      case "$d" in
        *.AppDir)
          appdir_path="$d"
          break
          ;;
      esac
    done
  fi

  if [ -z "$appdir_path" ]; then
    echo "ℹ️  No AppDir found to create AppImage"
    return 0
  fi

  if ls "$appimage_dir"/*.AppImage >/dev/null 2>&1; then
    echo "ℹ️  AppImage already present in $appimage_dir; skipping"
    return 0
  fi

  echo "🔁 Creating AppImage from AppDir: $appdir_path"

  local appimagetool_local="$SCRIPT_DIR/appimagetool-${arch}.AppImage"
  local appimagetool_bin=""
  if [ -x "$appimagetool_local" ]; then
    appimagetool_bin="$appimagetool_local"
  elif command -v appimagetool >/dev/null 2>&1; then
    appimagetool_bin="$(command -v appimagetool)"
  else
    local download_url="https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-${arch}.AppImage"
    appimagetool_bin="$SCRIPT_DIR/appimagetool-${arch}.AppImage"
    if [ ! -f "$appimagetool_bin" ]; then
      echo "⬇️  Downloading appimagetool for $arch..."
      if command -v curl >/dev/null 2>&1; then
        curl -L -o "$appimagetool_bin" "$download_url" || true
      elif command -v wget >/dev/null 2>&1; then
        wget -O "$appimagetool_bin" "$download_url" || true
      fi
      chmod +x "$appimagetool_bin" 2>/dev/null || true
    fi
    if [ ! -x "$appimagetool_bin" ]; then
      echo "⚠️  appimagetool not available; cannot create AppImage fallback"
      return 1
    fi
  fi

  local tmp_appdir="/tmp/$(basename "$appdir_path" | sed 's/[^A-Za-z0-9._-]/_/g')-$$"
  rm -rf "$tmp_appdir"
  cp -a "$appdir_path" "$tmp_appdir"

  if [ -f "$tmp_appdir/Hotline Navigator.png" ] && [ ! -f "$tmp_appdir/hotline-tauri.png" ]; then
    ln -sf "Hotline Navigator.png" "$tmp_appdir/hotline-tauri.png" || true
  fi

  echo "🔧 Running appimagetool... ($appimagetool_bin)"
  (cd /tmp && "$appimagetool_bin" --no-appstream "$tmp_appdir") || {
    echo "⚠️  appimagetool run failed"
    return 1
  }

  local gen
  gen=$(ls -1 /tmp/*Hotline*AppImage 2>/dev/null | head -n1 || true)
  if [ -n "$gen" ]; then
    mkdir -p "$appimage_dir"
    cp -v "$gen" "$appimage_dir/Hotline_Navigator_$(node -p "require('./package.json').version")_aarch64.AppImage" 2>/dev/null || cp -v "$gen" "$appimage_dir/" || true
    echo "✅ AppImage created in $appimage_dir"
  else
    echo "⚠️  appimagetool did not produce an AppImage in /tmp"
    return 1
  fi

  rm -rf "$tmp_appdir"
  return 0
}

# Run fallback and copy resulting AppImage into release
create_appimage_from_appdir "$TARGET_BUNDLE_DIR" "aarch64" || true
if [ -d "$TARGET_BUNDLE_DIR/appimage" ]; then
  cp -R "$TARGET_BUNDLE_DIR/appimage"/* "$RELEASE_DIR/" 2>/dev/null || true
fi

echo "✅ Linux ARM64 release ready: $RELEASE_DIR"
ls -la "$RELEASE_DIR" || true

# Optionally deploy if DEPLOY environment variable is set
if [ "${DEPLOY:-}" = "1" ] || [ "${DEPLOY:-}" = "true" ]; then
  echo ""
  echo "🚀 Deploying to remote server..."
  if [ -f "release/deploy-linux-arm64.sh" ]; then
    bash "release/deploy-linux-arm64.sh" success || {
      echo "⚠️  Deployment failed, but build was successful"
      exit 0
    }
  else
    echo "⚠️  Deployment script not found: release/deploy-linux-arm64.sh"
  fi
fi

exit 0
