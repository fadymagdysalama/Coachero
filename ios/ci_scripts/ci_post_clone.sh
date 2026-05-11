#!/bin/sh

echo "Installing Node dependencies"
npm install

echo "Running prebuild for iOS"
npx expo prebuild --platform ios --clean

echo "Installing CocoaPods"
cd ios || exit
pod install