#!/bin/bash

set -euo pipefail

# Path to your archive (edit this)
ARCHIVE_PATH=$1

# Output .ipa path
DATE=$(date +%Y-%m-%d_%H-%M-%S)
OUTPUT_IPA_PATH="$HOME/Desktop/side store/builds/3secsCopilot-${DATE}.ipa"

# Derived paths
APP_PATH="$ARCHIVE_PATH/Products/Applications"
TEMP_PAYLOAD_DIR="$(mktemp -d)"

echo "Extracting .app from archive..."
mkdir -p "$TEMP_PAYLOAD_DIR/Payload"
cp -R "$APP_PATH"/*.app "$TEMP_PAYLOAD_DIR/Payload/"

echo "Zipping to create .ipa..."
cd "$TEMP_PAYLOAD_DIR"
zip -r "$OUTPUT_IPA_PATH" Payload

echo "Cleaning up..."
rm -rf "$TEMP_PAYLOAD_DIR"

echo "✅ IPA created at: $OUTPUT_IPA_PATH"
