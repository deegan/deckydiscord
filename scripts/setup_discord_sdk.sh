#!/bin/bash

# Discord SDK Setup Script for Steam Deck
# This script guides users through Discord SDK setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [[ ! -f "plugin.json" ]]; then
    error "Please run this script from the plugin directory"
    exit 1
fi

echo "🎮 Deckycord Discord SDK Setup"
echo "=============================="
echo ""

# Check if Discord SDK already exists
if [[ -f "native/discord_sdk/include/discord/discord.h" ]]; then
    success "Discord SDK already installed!"
    
    # Check if native module is built
    if ls py_modules/discord_sdk_native* 1> /dev/null 2>&1; then
        success "Native module already built!"
        echo ""
        info "Setup appears complete. Try restarting Decky Loader:"
        echo "  sudo systemctl restart plugin_loader"
        exit 0
    else
        info "Discord SDK found, but native module needs building"
        echo ""
    fi
else
    warning "Discord SDK not found. Manual download required."
    echo ""
    echo "📋 Discord SDK Installation Steps:"
    echo ""
    echo "1. 🌐 Open browser and go to:"
    echo "   https://discord.com/developers/social-sdk"
    echo ""
    echo "2. 📝 Log in to your Discord account"
    echo ""
    echo "3. 💾 Download the Discord Social SDK"
    echo ""
    echo "4. 📁 Extract the downloaded ZIP file"
    echo ""
    echo "5. 📂 Copy the extracted contents to:"
    echo "   $(pwd)/native/discord_sdk/"
    echo ""
    echo "   The structure should look like:"
    echo "   native/discord_sdk/"
    echo "   ├── include/discord/discord.h"
    echo "   ├── lib/linux/x86_64/libdiscord_game_sdk.so"
    echo "   └── ..."
    echo ""
    
    read -p "Have you completed the Discord SDK download? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Please complete Discord SDK download first, then run this script again"
        exit 0
    fi
    
    # Verify SDK was installed
    if [[ ! -f "native/discord_sdk/include/discord/discord.h" ]]; then
        error "Discord SDK still not found at native/discord_sdk/"
        error "Please ensure you extracted the SDK to the correct location"
        exit 1
    fi
    
    success "Discord SDK found!"
fi

# Check build dependencies
info "Checking build dependencies..."

# Check for CMake
if ! command -v cmake &> /dev/null; then
    warning "CMake not found. Installing build dependencies..."
    
    if command -v pacman &> /dev/null; then
        # Steam Deck / Arch Linux
        info "Detected Steam Deck/Arch Linux"
        echo "Installing build tools..."
        
        # Check if in readonly mode
        if mount | grep -q "overlay.*ro"; then
            info "Enabling write access to system..."
            sudo steamos-readonly disable
        fi
        
        sudo pacman -Sy --noconfirm base-devel cmake python-pip
        success "Build tools installed"
    else
        error "Unknown system. Please install cmake, build-essential, and python3-dev manually"
        exit 1
    fi
else
    success "Build tools found"
fi

# Check for Python dependencies
info "Installing Python dependencies..."
pip install --user pybind11 numpy || {
    error "Failed to install Python dependencies"
    exit 1
}
success "Python dependencies installed"

# Build native module
info "Building Discord SDK native module..."
cd native

if [[ ! -f "build.sh" ]]; then
    error "Build script not found! This might be an incomplete installation."
    exit 1
fi

chmod +x build.sh
if ./build.sh; then
    success "Native module built successfully!"
else
    error "Native module build failed"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "- Check that Discord SDK is properly extracted"
    echo "- Ensure build tools are installed"
    echo "- Try: sudo pacman -Sy base-devel cmake"
    exit 1
fi

cd ..

# Verify build
info "Verifying installation..."
if python3 test_build.py | grep -q "✓"; then
    success "Installation verification successful!"
else
    warning "Installation verification had warnings (may be normal)"
fi

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "📋 Next steps:"
echo "1. Restart Decky Loader: sudo systemctl restart plugin_loader"
echo "2. Open Deckycord plugin in Game Mode"
echo "3. Click 'Connect to Discord'"
echo "4. Create voice lobbies and invite friends!"
echo ""
success "Deckycord Discord Social SDK is ready to use!"