#!/bin/bash
set -e

VERSION=${1:-latest}

echo "🔍 Detecting platform..."

# Detect platform and architecture
OS=$(echo "$RUNNER_OS" | tr '[:upper:]' '[:lower:]')
RUNNER_ARCH=$(echo "$RUNNER_ARCH" | tr '[:upper:]' '[:lower:]')

case "$OS-$RUNNER_ARCH" in
  linux-x64)
    ARCH="x86_64-unknown-linux-musl"
    ARCHIVE_EXT="tar.gz"
    BINARY_EXT=""
    ;;
  linux-arm64)
    ARCH="aarch64-unknown-linux-musl"
    ARCHIVE_EXT="tar.gz"
    BINARY_EXT=""
    ;;
  windows-x64)
    ARCH="x86_64-pc-windows-msvc"
    ARCHIVE_EXT="zip"
    BINARY_EXT=".exe"
    ;;
  windows-x86)
    ARCH="i686-pc-windows-msvc"
    ARCHIVE_EXT="zip"
    BINARY_EXT=".exe"
    ;;
  macos-x64)
    ARCH="x86_64-apple-darwin"
    ARCHIVE_EXT="tar.gz"
    BINARY_EXT=""
    ;;
  macos-arm64)
    ARCH="aarch64-apple-darwin"
    ARCHIVE_EXT="tar.gz"
    BINARY_EXT=""
    ;;
  *)
    echo "❌ Unsupported OS: $OS"
    exit 1
    ;;
esac

echo "📋 Platform: $OS-$RUNNER_ARCH -> $ARCH"

# Get version
if [ "$VERSION" = "latest" ]; then
  echo "🔍 Fetching latest version..."

  # Retry logic for fetching version
  RETRY_COUNT=0
  MAX_RETRIES=3

  # Prepare auth header if GITHUB_TOKEN is available
  AUTH_HEADER=""
  if [ -n "$GITHUB_TOKEN" ]; then
    AUTH_HEADER="-H \"Authorization: Bearer $GITHUB_TOKEN\""
    echo "🔑 Using GitHub token for authentication"
  else
    echo "⚠️ No GitHub token found - using unauthenticated requests (rate limited)"
  fi

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if [ -n "$AUTH_HEADER" ]; then
      VERSION=$(curl -LsS -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/ekzhang/bore/releases/latest | jq -r '.tag_name')
    else
      VERSION=$(curl -LsS https://api.github.com/repos/ekzhang/bore/releases/latest | jq -r '.tag_name')
    fi

    if [ $? -eq 0 ] && [ -n "$VERSION" ] && [ "$VERSION" != "null" ]; then
      echo "📌 Latest version: $VERSION"
      break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "⚠️ Failed to fetch version (attempt $RETRY_COUNT/$MAX_RETRIES). Retrying in 2 seconds..."
      sleep 2
    else
      echo "❌ Failed to fetch latest version after $MAX_RETRIES attempts"
      echo "💡 Tip: Ensure GITHUB_TOKEN is passed to avoid rate limiting"
      exit 1
    fi
  done
else
  echo "📌 Using specified version: $VERSION"
fi

# Create temporary directory
TEMP_DIR=$RUNNER_TEMP/.boretmp
mkdir -p "$TEMP_DIR"
echo "📁 Using temp directory: $TEMP_DIR"

# Set installation path
if [ "$OS" = "windows" ]; then
  INSTALL_DIR="$RUNNER_TEMP/bin"
  BORE_BIN="$INSTALL_DIR/bore${BINARY_EXT}"
else
  INSTALL_DIR="/usr/local/bin"
  BORE_BIN="$INSTALL_DIR/bore${BINARY_EXT}"
fi

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download to temp directory
cd "$TEMP_DIR"
ARCHIVE_NAME="bore-${VERSION}-${ARCH}.${ARCHIVE_EXT}"
DOWNLOAD_URL="https://github.com/ekzhang/bore/releases/download/${VERSION}/${ARCHIVE_NAME}"

echo "⬇️ Downloading: $DOWNLOAD_URL"
if ! curl -LsS "$DOWNLOAD_URL" -o "$ARCHIVE_NAME"; then
  echo "❌ Failed to download bore binary"
  exit 1
fi

# Extract the archive
echo "📦 Extracting archive..."
if [ "$ARCHIVE_EXT" = "tar.gz" ]; then
  tar -xzf "$ARCHIVE_NAME"
elif [ "$ARCHIVE_EXT" = "zip" ]; then
  unzip -q "$ARCHIVE_NAME"
fi

# Find the binary
BINARY_NAME="bore${BINARY_EXT}"
if [ -f "$BINARY_NAME" ]; then
  BORE_TMP_PATH="$TEMP_DIR/$BINARY_NAME"
else
  # Sometimes the binary is in a subdirectory
  BORE_TMP_PATH=$(find "$TEMP_DIR" -name "bore${BINARY_EXT}" -type f | head -1)
fi

if [ -z "$BORE_TMP_PATH" ] || [ ! -f "$BORE_TMP_PATH" ]; then
  echo "❌ Could not find bore binary in extracted archive"
  ls -la "$TEMP_DIR"
  exit 1
fi

echo "📄 Found binary: $BORE_TMP_PATH"

# Install binary
echo "🔧 Installing to: $BORE_BIN"
if [ "$OS" = "windows" ]; then
  # On Windows, copy to RUNNER_TEMP/bin and add to PATH
  cp "$BORE_TMP_PATH" "$BORE_BIN"
  echo "$INSTALL_DIR" >> $GITHUB_PATH
else
  # On Unix systems, install to /usr/local/bin with sudo if needed
  if [ -w "$INSTALL_DIR" ]; then
    cp "$BORE_TMP_PATH" "$BORE_BIN"
  else
    sudo cp "$BORE_TMP_PATH" "$BORE_BIN"
  fi
fi

chmod +x "$BORE_BIN"

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Verify installation
echo "✅ Installation completed!"
echo "📍 Bore installed to: $BORE_BIN"
"$BORE_BIN" --version

echo "✅ Bore binary installation completed successfully"
