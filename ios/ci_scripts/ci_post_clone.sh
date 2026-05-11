#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1

# Install nvm if not available
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
    echo "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

# Source nvm
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Install and use Node.js 20
echo "Installing Node.js..."
nvm install 20
nvm use 20

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