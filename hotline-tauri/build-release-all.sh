#!/bin/bash

# Multi-platform release build script for Hotline Tauri
# Builds for macOS, Windows, and Linux

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version")
PRODUCT_NAME=$(node -p "require('./src-tauri/tauri.conf.json').productName")
RELEASE_DIR="release"

echo "🚀 Building Hotline Navigator Release v$VERSION (All Platforms)"
echo "================================================================"
echo "📦 Product: $PRODUCT_NAME"
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Function to build for a platform
build_platform() {
    local platform=$1
    local target=$2
    local build_cmd=$3
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔨 Building for $platform..."
    echo "   Target: $target"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Set CI=false to avoid build issues
    CI=false $build_cmd || {
        echo "⚠️  Warning: $platform build failed or requires additional setup"
        echo "   This is normal for cross-compilation from macOS"
        echo "   For production builds, consider building on the native platform"
        return 1
    }
    
    echo "✅ $platform build complete!"
}

# Build macOS (Universal Binary)
if [ -f .env ]; then
    echo "📝 Loading macOS signing credentials from .env..."
    set -a
    source .env
    set +a
    
    if [ -n "$SIGNING_IDENTITY" ]; then
        export APPLE_ID
        export APP_PASSWORD
        export TEAM_ID
        export SIGNING_IDENTITY
        echo "🔐 Using signing identity: $SIGNING_IDENTITY"
    fi
fi

build_platform "macOS (Universal)" "universal-apple-darwin" "npm run build:macos-universal"

# Copy macOS build to release directory
MACOS_BUNDLE="src-tauri/target/universal-apple-darwin/release/bundle/macos/$PRODUCT_NAME.app"
if [ -d "$MACOS_BUNDLE" ]; then
    MACOS_DIR="$RELEASE_DIR/hotline-navigator-$VERSION-macos"
    mkdir -p "$MACOS_DIR"
    cp -R "$MACOS_BUNDLE" "$MACOS_DIR/"
    
    # Copy DMG if it exists
    DMG_FILE="src-tauri/target/universal-apple-darwin/release/bundle/dmg/$PRODUCT_NAME_$VERSION_universal.dmg"
    if [ -f "$DMG_FILE" ]; then
        cp "$DMG_FILE" "$MACOS_DIR/"
        echo "📦 DMG copied to release directory"
    fi
    
    echo "✅ macOS release packaged: $MACOS_DIR"
fi

# Build Windows
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔨 Building for Windows..."
echo "   Note: Cross-compilation from macOS may require additional setup"
echo "   (mingw-w64, Windows SDK, etc.)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

build_platform "Windows" "x86_64-pc-windows-msvc" "npm run build:windows"

# Copy Windows build to release directory
WINDOWS_BUNDLE="src-tauri/target/x86_64-pc-windows-msvc/release/bundle"
if [ -d "$WINDOWS_BUNDLE" ]; then
    WINDOWS_DIR="$RELEASE_DIR/hotline-navigator-$VERSION-windows"
    mkdir -p "$WINDOWS_DIR"
    
    # Copy MSI installer if it exists
    if [ -d "$WINDOWS_BUNDLE/msi" ]; then
        cp -R "$WINDOWS_BUNDLE/msi"/* "$WINDOWS_DIR/" 2>/dev/null || true
    fi
    
    # Copy NSIS installer if it exists
    if [ -d "$WINDOWS_BUNDLE/nsis" ]; then
        cp -R "$WINDOWS_BUNDLE/nsis"/* "$WINDOWS_DIR/" 2>/dev/null || true
    fi
    
    echo "✅ Windows release packaged: $WINDOWS_DIR"
fi

# Build Linux
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔨 Building for Linux..."
echo "   Note: Cross-compilation from macOS may require additional setup"
echo "   For best results, build on a Linux system or use Docker"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

build_platform "Linux" "x86_64-unknown-linux-gnu" "npm run build:linux"

# Copy Linux build to release directory
LINUX_BUNDLE="src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
if [ -d "$LINUX_BUNDLE" ]; then
    LINUX_DIR="$RELEASE_DIR/hotline-navigator-$VERSION-linux"
    mkdir -p "$LINUX_DIR"
    
    # Copy DEB package if it exists
    if [ -d "$LINUX_BUNDLE/deb" ]; then
        cp -R "$LINUX_BUNDLE/deb"/* "$LINUX_DIR/" 2>/dev/null || true
    fi
    
    # Copy AppImage if it exists
    if [ -d "$LINUX_BUNDLE/appimage" ]; then
        cp -R "$LINUX_BUNDLE/appimage"/* "$LINUX_DIR/" 2>/dev/null || true
    fi
    
    echo "✅ Linux release packaged: $LINUX_DIR"
fi

# Build Linux ARM (optional)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔨 Building for Linux ARM64..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

build_platform "Linux ARM64" "aarch64-unknown-linux-gnu" "npm run build:linux-arm"

# Copy Linux ARM build to release directory
LINUX_ARM_BUNDLE="src-tauri/target/aarch64-unknown-linux-gnu/release/bundle"
if [ -d "$LINUX_ARM_BUNDLE" ]; then
    LINUX_ARM_DIR="$RELEASE_DIR/hotline-navigator-$VERSION-linux-arm64"
    mkdir -p "$LINUX_ARM_DIR"
    
    # Copy DEB package if it exists
    if [ -d "$LINUX_ARM_BUNDLE/deb" ]; then
        cp -R "$LINUX_ARM_BUNDLE/deb"/* "$LINUX_ARM_DIR/" 2>/dev/null || true
    fi
    
    # Copy AppImage if it exists
    if [ -d "$LINUX_ARM_BUNDLE/appimage" ]; then
        cp -R "$LINUX_ARM_BUNDLE/appimage"/* "$LINUX_ARM_DIR/" 2>/dev/null || true
    fi
    
    echo "✅ Linux ARM64 release packaged: $LINUX_ARM_DIR"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Multi-platform release build complete!"
echo "📦 Output directory: $RELEASE_DIR"
echo ""
echo "Built platforms:"
[ -d "$RELEASE_DIR/hotline-navigator-$VERSION-macos" ] && echo "  ✅ macOS (Universal Binary)"
[ -d "$RELEASE_DIR/hotline-navigator-$VERSION-windows" ] && echo "  ✅ Windows"
[ -d "$RELEASE_DIR/hotline-navigator-$VERSION-linux" ] && echo "  ✅ Linux (x86_64)"
[ -d "$RELEASE_DIR/hotline-navigator-$VERSION-linux-arm64" ] && echo "  ✅ Linux (ARM64)"
echo ""
echo "Note: Some platforms may have failed due to cross-compilation requirements."
echo "      For production builds, consider building on native platforms or using CI/CD."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
