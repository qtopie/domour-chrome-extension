#!/bin/bash

# Script to register Native Messaging Host for Microsoft Edge and Google Chrome on macOS / Linux

PROD_EXTENSION_ID="ndbhggifgbebojmidnoenkfpiiknkggc"
EXTENSION_ID="${1:-$PROD_EXTENSION_ID}"

HOST_NAME="com.go_react.search_bridge"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BINARY_PATH="${SCRIPT_DIR}/bin/domour-chrome-bridge"

if [ ! -f "$BINARY_PATH" ]; then
    echo "Error: Binary not found at $BINARY_PATH"
    echo "Please build the Go backend first: task backend:build or go build -o bin/domour-chrome-bridge main.go"
    exit 1
fi

chmod +x "$BINARY_PATH"

if [ "$EXTENSION_ID" = "$PROD_EXTENSION_ID" ]; then
    ALLOWED_ORIGINS="\"chrome-extension://${PROD_EXTENSION_ID}/\""
else
    ALLOWED_ORIGINS="\"chrome-extension://${EXTENSION_ID}/\", \"chrome-extension://${PROD_EXTENSION_ID}/\""
fi

MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Go Native Messaging Bridge for AI Browser Automation Platform",
  "path": "${BINARY_PATH}",
  "type": "stdio",
  "allowed_origins": [
    ${ALLOWED_ORIGINS}
  ]
}
EOF
)

# Destination directories on macOS / Linux for Edge & Chrome
EDGE_MAC_DIR="${HOME}/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
CHROME_MAC_DIR="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
EDGE_LINUX_DIR="${HOME}/.config/microsoft-edge/NativeMessagingHosts"
CHROME_LINUX_DIR="${HOME}/.config/google-chrome/NativeMessagingHosts"

register_manifest() {
    local target_dir=$1
    local browser_name=$2
    if [ -d "$(dirname "$target_dir")" ] || [ -d "$target_dir" ]; then
        mkdir -p "$target_dir"
        echo "$MANIFEST_CONTENT" > "${target_dir}/${HOST_NAME}.json"
        echo "✅ Successfully registered Native Messaging Host for ${browser_name}: ${target_dir}/${HOST_NAME}.json"
    fi
}

register_manifest "$EDGE_MAC_DIR" "Microsoft Edge (macOS)"
register_manifest "$CHROME_MAC_DIR" "Google Chrome (macOS)"
register_manifest "$EDGE_LINUX_DIR" "Microsoft Edge (Linux)"
register_manifest "$CHROME_LINUX_DIR" "Google Chrome (Linux)"

echo "🎉 Registration finished. Extension ID allowed: ${EXTENSION_ID}"
