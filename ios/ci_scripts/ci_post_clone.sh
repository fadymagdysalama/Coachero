#!/bin/sh
set -e

cd "$(dirname "$0")/../.." || exit 1

echo "Installing Node dependencies"
npm install || { echo "npm install failed"; exit 1; }

echo "Running prebuild for iOS"
npx expo prebuild --platform ios --clean --yes || { echo "prebuild failed"; exit 1; }

echo "Installing CocoaPods"
cd ios || { echo "cd ios failed"; exit 1; }
pod install || { echo "pod install failed"; exit 1; }

echo "Build setup complete"