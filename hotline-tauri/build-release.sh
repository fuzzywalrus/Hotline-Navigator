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
if [ -z "$APPLE_ID" ] || [ -z "$APP_PASSWORD" ] || [ -z "$TEAM_ID" ] || [ -z "$SIGNING_IDENTITY" ]; then
    echo "❌ Error: Missing required environment variables in .env file"
    echo "   Required: APPLE_ID, APP_PASSWORD, TEAM_ID, SIGNING_IDENTITY"
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

# Build Universal Binary
echo "🔨 Building Universal Binary (Intel + Apple Silicon)..."
echo "   This may take several minutes..."
echo "   Signing Identity: $SIGNING_IDENTITY"
echo ""

# Export environment variables for Tauri build
export APPLE_ID
export APP_PASSWORD
export TEAM_ID
export SIGNING_IDENTITY

# Tauri v2 will automatically use SIGNING_IDENTITY if set
npm run build:macos-universal

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
if codesign -dv --verbose=4 "$DIST_DIR/$PRODUCT_NAME.app" 2>&1 | grep -q "valid on disk"; then
    echo "✅ Code signature verified"
else
    echo "⚠️  Warning: Code signature verification failed or app not signed"
    echo "   The app may need to be signed manually"
fi

# Create preverified directory for notarization zip
PREVERIFIED_DIR="$RELEASE_DIR/preverified"
mkdir -p "$PREVERIFIED_DIR"

# Create zip for notarization (if needed)
echo "📦 Creating zip archive for notarization..."
ZIP_FILE="$PREVERIFIED_DIR/$PRODUCT_NAME.app.zip"
ditto -c -k --keepParent "$DIST_DIR/$PRODUCT_NAME.app" "$ZIP_FILE"
echo "✅ Zip created: $ZIP_FILE"

# Create DMG (optional - requires create-dmg)
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
    echo "✅ DMG created: $DMG_NAME"
else
    echo "ℹ️  Skipping DMG creation (create-dmg not installed)"
    echo "   Install with: brew install create-dmg"
fi

# Notarization (optional - uncomment to enable)
# echo "📝 Notarizing app..."
# xcrun notarytool submit "$DIST_DIR/$PRODUCT_NAME.app" \
#     --apple-id "$APPLE_ID" \
#     --password "$APP_PASSWORD" \
#     --team-id "$TEAM_ID" \
#     --wait

# Staple notarization ticket (if notarized)
# echo "📎 Stapling notarization ticket..."
# xcrun stapler staple "$DIST_DIR/$PRODUCT_NAME.app"

echo ""
echo "✅ Release build complete!"
echo "📦 Output: $DIST_DIR"
echo ""
echo "To install:"
echo "  cp -R \"$DIST_DIR/$PRODUCT_NAME.app\" /Applications/"
echo ""
