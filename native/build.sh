#!/bin/bash

# Build script for Discord SDK Native module
# This script builds the C++ Discord SDK wrapper and Python bindings

set -e  # Exit on any error

echo "=== Building Discord SDK Native Module ==="

# Check if we're in the right directory
if [[ ! -f "CMakeLists.txt" ]]; then
    echo "Error: CMakeLists.txt not found. Run this script from the native/ directory."
    exit 1
fi

# Create build directory
BUILD_DIR="build"
if [[ -d "$BUILD_DIR" ]]; then
    echo "Cleaning existing build directory..."
    rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "=== Configuring build with CMake ==="

# Configure with CMake
cmake .. -DCMAKE_BUILD_TYPE=Release

echo "=== Building ==="

# Build the project
make -j$(nproc 2>/dev/null || echo 4)

echo "=== Build completed ==="

# Check if the module was built successfully
if [[ -f "discord_sdk_native"* ]]; then
    echo "✓ discord_sdk_native module built successfully"
    
    # Copy to py_modules directory for the plugin
    PLUGIN_DIR="../py_modules"
    if [[ -d "$PLUGIN_DIR" ]]; then
        echo "Copying module to $PLUGIN_DIR..."
        cp discord_sdk_native* "$PLUGIN_DIR/"
        echo "✓ Module copied to plugin directory"
    fi
else
    echo "✗ Failed to build discord_sdk_native module"
    exit 1
fi

echo ""
echo "=== Build Summary ==="
echo "✓ Discord SDK Native module built successfully"
echo "✓ Module available for Python import as 'discord_sdk_native'"
echo ""
echo "Next steps:"
echo "1. Download Discord Social SDK from https://discord.com/developers/social-sdk"
echo "2. Extract it to native/discord_sdk/ directory"
echo "3. Rebuild to link with actual Discord SDK"
echo ""
echo "For now, a stub version has been built for development."