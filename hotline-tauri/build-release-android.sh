#!/bin/bash

# Build release script for Hotline Navigator - Android
# Creates a signed APK and AAB for distribution

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables from .env file
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="release"
DIST_DIR="$RELEASE_DIR/hotline-navigator-$VERSION-android"

echo "Building Hotline Navigator Android Release v$VERSION"
echo "===================================================="

# Verify Android SDK
if [ -z "$ANDROID_HOME" ]; then
    echo "Error: ANDROID_HOME is not set"
    echo "   Please install Android Studio and set ANDROID_HOME"
    exit 1
fi

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Build Android release
echo "Building Android release..."
echo "   This may take several minutes..."
CI=false npm run tauri -- android build

# Copy APK outputs
echo "Copying build artifacts..."
APK_DIR="src-tauri/gen/android/app/build/outputs/apk"
AAB_DIR="src-tauri/gen/android/app/build/outputs/bundle"

# Copy APKs if they exist
if [ -d "$APK_DIR" ]; then
    find "$APK_DIR" -name "*.apk" -exec cp {} "$DIST_DIR/" \;
fi

# Copy AABs if they exist
if [ -d "$AAB_DIR" ]; then
    find "$AAB_DIR" -name "*.aab" -exec cp {} "$DIST_DIR/" \;
fi

echo ""
echo "Release build complete!"
echo "Output: $DIST_DIR"
ls -la "$DIST_DIR/"
