#!/bin/sh
set -e

# Source nvm if available (Xcode Cloud typically has Node via nvm)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
fi

# Fallback: find node in common locations
if ! command -v node >/dev/null 2>&1; then
    for dir in /usr/local/bin /opt/homebrew/bin "$HOME/.nvm/versions/node/"*; do
        if [ -x "$dir/node" ]; then
            export PATH="$dir:$PATH"
            break
        fi
    done
fi

cd "$(dirname "$0")/../.." || exit 1

echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

echo "Installing Node dependencies"
npm install || { echo "npm install failed"; exit 1; }

echo "Running prebuild for iOS"
npx expo prebuild --platform ios --clean --yes || { echo "prebuild failed"; exit 1; }

echo "Installing CocoaPods"
cd ios || { echo "cd ios failed"; exit 1; }
pod install || { echo "pod install failed"; exit 1; }

echo "Build setup complete"