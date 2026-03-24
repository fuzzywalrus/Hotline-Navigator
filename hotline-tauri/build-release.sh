#!/bin/bash

# Build release script for Hotline Tauri
# This script creates a signed, notarized Universal Binary for macOS Big Sur+

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables from .env file
if [ -f .env ]; then
    # Source .env file and export variables
    set -a
    source .env
    set +a
else
    echo "❌ Error: .env file not found!"
    echo "   Please create .env file with APPLE_ID, APP_PASSWORD, TEAM_ID, and SIGNING_IDENTITY"
    exit 1
fi

# Verify required environment variables
# Support both naming conventions
APP_PASSWORD="${APP_PASSWORD:-$APPLE_PASSWORD}"
TEAM_ID="${TEAM_ID:-$APPLE_TEAM_ID}"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-$APPLE_SIGNING_IDENTITY}"

if [ -z "$APPLE_ID" ] || [ -z "$APP_PASSWORD" ] || [ -z "$TEAM_ID" ] || [ -z "$SIGNING_IDENTITY" ]; then
    echo "❌ Error: Missing required environment variables in .env file"
    echo "   Required: APPLE_ID, APP_PASSWORD (or APPLE_PASSWORD), TEAM_ID (or APPLE_TEAM_ID), SIGNING_IDENTITY (or APPLE_SIGNING_IDENTITY)"
    exit 1
fi

VERSION=$(node -p "require('./package.json').version")
PRODUCT_NAME=$(node -p "require('./src-tauri/tauri.conf.json').productName")
RELEASE_DIR="release"
DIST_DIR="$RELEASE_DIR/hotline-navigator-$VERSION-macos"

echo "🚀 Building Hotline Navigator Release v$VERSION"
echo "================================================"
echo "📦 Product: $PRODUCT_NAME"
echo "🍎 Target: macOS Big Sur+ (Universal Binary)"
echo "🔐 Signing: $SIGNING_IDENTITY"
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$RELEASE_DIR"
rm -rf "src-tauri/target/universal-apple-darwin/release/bundle"

# Build Universal Binary (.app only — we create the DMG ourselves)
echo "🔨 Building Universal Binary (Intel + Apple Silicon)..."
echo "   This may take several minutes..."
echo ""

# Export environment variables for Tauri build
export APPLE_ID
export APP_PASSWORD
export TEAM_ID
export SIGNING_IDENTITY

npx tauri build --target universal-apple-darwin --bundles app

# Verify build exists
APP_BUNDLE="src-tauri/target/universal-apple-darwin/release/bundle/macos/$PRODUCT_NAME.app"
if [ ! -d "$APP_BUNDLE" ]; then
    echo "❌ Build failed! App bundle not found at: $APP_BUNDLE"
    exit 1
fi

echo "✅ Build successful!"

# Create release directory
echo "📁 Creating release directory..."
mkdir -p "$DIST_DIR"

# Copy app bundle to release directory
echo "📦 Packaging release files..."
cp -R "$APP_BUNDLE" "$DIST_DIR/"

# Verify code signing
echo "🔍 Verifying code signature..."
codesign -dv --verbose=2 "$DIST_DIR/$PRODUCT_NAME.app" 2>&1 || true

# Create zip for notarization
echo "📦 Creating zip archive for notarization..."
PREVERIFIED_DIR="$RELEASE_DIR/preverified"
mkdir -p "$PREVERIFIED_DIR"
ZIP_FILE="$PREVERIFIED_DIR/$PRODUCT_NAME.app.zip"
ditto -c -k --keepParent "$DIST_DIR/$PRODUCT_NAME.app" "$ZIP_FILE"
echo "✅ Zip created: $ZIP_FILE"

# Notarization
echo "📝 Notarizing app..."
xcrun notarytool submit "$ZIP_FILE" \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

echo "📎 Stapling notarization ticket..."
xcrun stapler staple "$DIST_DIR/$PRODUCT_NAME.app"

# Verify Gatekeeper acceptance
echo "🔍 Verifying Gatekeeper..."
spctl -a -vv "$DIST_DIR/$PRODUCT_NAME.app" 2>&1 || true

# Create DMG
if command -v create-dmg &> /dev/null; then
    echo "💿 Creating DMG..."
    DMG_NAME="$DIST_DIR/$PRODUCT_NAME-$VERSION-universal.dmg"
    create-dmg \
        --volname "$PRODUCT_NAME" \
        --window-pos 200 120 \
        --window-size 800 400 \
        --icon-size 100 \
        --icon "$PRODUCT_NAME.app" 200 190 \
        --hide-extension "$PRODUCT_NAME.app" \
        --app-drop-link 600 185 \
        "$DMG_NAME" \
        "$DIST_DIR/$PRODUCT_NAME.app"

    # Sign and notarize the DMG
    echo "🔐 Signing DMG..."
    codesign --force --sign "$SIGNING_IDENTITY" "$DMG_NAME"

    echo "📝 Notarizing DMG..."
    xcrun notarytool submit "$DMG_NAME" \
        --apple-id "$APPLE_ID" \
        --password "$APP_PASSWORD" \
        --team-id "$TEAM_ID" \
        --wait

    echo "📎 Stapling DMG..."
    xcrun stapler staple "$DMG_NAME"

    echo "✅ DMG created: $DMG_NAME"
else
    echo "⚠️  Skipping DMG creation (create-dmg not installed)"
    echo "   Install with: brew install create-dmg"
fi

echo ""
echo "✅ Release build complete!"
echo "📦 Output: $DIST_DIR"
echo ""
echo "To install:"
echo "  cp -R \"$DIST_DIR/$PRODUCT_NAME.app\" /Applications/"
echo ""
