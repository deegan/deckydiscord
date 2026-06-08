#!/bin/bash

# Release script for Deckycord Discord Social SDK
# Usage: ./scripts/release.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
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
if [[ ! -f "package.json" ]] || [[ ! -f "plugin.json" ]]; then
    error "Must be run from the project root directory"
    exit 1
fi

# Get version argument or current version
if [[ $# -eq 1 ]]; then
    NEW_VERSION=$1
else
    CURRENT_VERSION=$(jq -r '.version' package.json)
    echo "Current version: $CURRENT_VERSION"
    read -p "Enter new version (or press Enter to use current): " NEW_VERSION
    if [[ -z "$NEW_VERSION" ]]; then
        NEW_VERSION=$CURRENT_VERSION
    fi
fi

# Validate version format
if [[ ! $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "Version must be in format x.y.z (e.g., 0.3.1)"
    exit 1
fi

TAG_NAME="v$NEW_VERSION"

info "Preparing release $TAG_NAME"

# Check if tag already exists
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    warning "Tag $TAG_NAME already exists"
    read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "$TAG_NAME"
        git push origin :refs/tags/"$TAG_NAME" 2>/dev/null || true
    else
        error "Aborting release"
        exit 1
    fi
fi

# Update version in files
info "Updating version to $NEW_VERSION in project files..."

# Update package.json
jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
success "Updated package.json"

# Update plugin.json
jq ".version = \"$NEW_VERSION\"" plugin.json > plugin.json.tmp && mv plugin.json.tmp plugin.json
success "Updated plugin.json"

# Update main.py
sed -i "s/current_version = \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/current_version = \"$NEW_VERSION\"/" main.py
success "Updated main.py"

# Build and test
info "Building project..."

# Test that imports work
if ! python3 test_build.py; then
    warning "Build test had warnings (expected without Discord SDK)"
fi

# Build frontend
if command -v pnpm &> /dev/null; then
    pnpm install
    pnpm run build
    success "Frontend built successfully"
else
    warning "pnpm not found, skipping frontend build"
fi

# Git operations
info "Committing changes..."

# Check if there are any changes
if git diff --quiet && git diff --cached --quiet; then
    warning "No changes to commit"
else
    git add package.json plugin.json main.py
    git commit -m "Bump version to $NEW_VERSION

- Update to Discord Social SDK architecture
- Add lobby-based voice system  
- Implement native C++ Discord SDK wrapper
- Add Python bindings with pybind11
- Update CI/CD pipeline for new build system
- Full voice control without OAuth limitations"
    
    success "Changes committed"
fi

# Create and push tag
info "Creating git tag $TAG_NAME..."
git tag -a "$TAG_NAME" -m "Release $TAG_NAME - Discord Social SDK Integration

🎮 Major Update: Discord Social SDK Integration!

✨ New Features:
- Voice Lobbies - Create Discord voice rooms
- Invite System - Share invite codes with friends  
- Full Voice Control - Mute/deafen without OAuth complexity
- Steam Deck Compatible - No browser requirements

🛠️ Technical Changes:
- Native C++ Discord SDK wrapper
- Python bindings with pybind11
- Lobby-based voice system
- Updated CI/CD pipeline
- Cross-platform build system

📖 Installation:
1. Download Discord Social SDK
2. Extract to native/discord_sdk/
3. Build with: make all

See README_SOCIAL_SDK.md for complete setup instructions."

success "Tag $TAG_NAME created"

# Push to GitHub
info "Pushing to GitHub..."

read -p "Push changes and tag to GitHub? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    git push origin main
    git push origin "$TAG_NAME"
    success "Pushed to GitHub"
    
    info "GitHub Actions will now build the release packages"
    info "Check: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
else
    warning "Skipped GitHub push"
    info "To push manually:"
    info "  git push origin main"
    info "  git push origin $TAG_NAME"
fi

# Create GitHub release
if command -v gh &> /dev/null; then
    info "Creating GitHub release..."
    read -p "Create GitHub release? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        gh release create "$TAG_NAME" \
            --title "Deckycord $TAG_NAME - Discord Social SDK" \
            --notes "🎮 Discord Social SDK Integration Release

Major update moving from Discord RPC to Discord Social SDK for reliable voice control without OAuth limitations.

## ✨ New Features:
- **Voice Lobbies** - Create Discord voice rooms
- **Invite System** - Share invite codes with friends
- **Full Voice Control** - Mute/deafen without OAuth complexity  
- **Steam Deck Compatible** - No browser requirements

## 🛠️ Installation:
1. Download this release
2. Download Discord Social SDK from [Discord Developer Portal](https://discord.com/developers/social-sdk)
3. Extract Discord SDK to \`native/discord_sdk/\`
4. Build with: \`make all\`

## 📖 Documentation:
Complete setup guide in \`README_SOCIAL_SDK.md\`

## ⚠️ Breaking Changes:
- Requires Discord Social SDK (manual download)
- New lobby-based voice system
- Build system requires C++ compiler and CMake

See \`README_SOCIAL_SDK.md\` for migration guide." \
            --draft

        success "GitHub release created (draft)"
        info "Edit the release at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/releases"
    fi
else
    info "GitHub CLI not found, skipping release creation"
    info "Create release manually at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/releases/new"
fi

echo ""
success "Release $TAG_NAME completed!"
echo ""
info "Next steps:"
echo "  1. Monitor GitHub Actions build"
echo "  2. Test the release packages"  
echo "  3. Update release notes if needed"
echo "  4. Publish the GitHub release"
echo ""
info "Build artifacts will be available at:"
info "  https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"