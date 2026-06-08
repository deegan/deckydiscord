# Makefile for Deckycord with Discord Social SDK support
# This Makefile handles building the native Discord SDK module and frontend

.PHONY: all clean build-native build-frontend install-deps help

# Default target
all: install-deps build-native build-frontend

# Help target
help:
	@echo "Deckycord Build System"
	@echo "====================="
	@echo ""
	@echo "Targets:"
	@echo "  all           - Build everything (install deps + native + frontend)"
	@echo "  install-deps  - Install Python and Node.js dependencies"
	@echo "  build-native  - Build the Discord Social SDK native module"
	@echo "  build-frontend- Build the React frontend"
	@echo "  clean         - Clean all build artifacts"
	@echo "  test          - Run tests"
	@echo ""
	@echo "Requirements:"
	@echo "  - Discord Social SDK downloaded to native/discord_sdk/"
	@echo "  - CMake 3.12+"
	@echo "  - C++17 compiler"
	@echo "  - Python 3.8+ with pybind11"
	@echo "  - Node.js with pnpm"

# Install dependencies
install-deps:
	@echo "=== Installing Dependencies ==="
	@echo "Installing Python dependencies..."
	pip install pybind11 numpy
	@echo "Installing Node.js dependencies..."
	pnpm install
	@echo "✓ Dependencies installed"

# Build native Discord SDK module
build-native:
	@echo "=== Building Native Discord SDK Module ==="
	@if [ ! -d "native/discord_sdk" ]; then \
		echo "WARNING: Discord SDK not found at native/discord_sdk/"; \
		echo "Please download Discord Social SDK from:"; \
		echo "https://discord.com/developers/social-sdk"; \
		echo "And extract it to native/discord_sdk/"; \
		echo ""; \
		echo "Building stub version for development..."; \
	fi
	cd native && ./build.sh
	@echo "✓ Native module built"

# Build React frontend
build-frontend:
	@echo "=== Building Frontend ==="
	pnpm run build
	@echo "✓ Frontend built"

# Clean build artifacts
clean:
	@echo "=== Cleaning Build Artifacts ==="
	rm -rf native/build/
	rm -f py_modules/discord_sdk_native*
	rm -rf node_modules/
	rm -rf dist/
	@echo "✓ Clean completed"

# Run tests
test:
	@echo "=== Running Tests ==="
	@echo "Testing native module..."
	python3 -c "import sys; sys.path.insert(0, 'py_modules'); import discord_social_sdk; print('✓ Python module imports successfully')"
	@echo "Testing frontend build..."
	pnpm run build
	@echo "✓ All tests passed"

# Development setup
dev-setup: install-deps
	@echo "=== Development Setup ==="
	@echo "1. Download Discord Social SDK:"
	@echo "   wget https://dl-game-sdk.discordapp.net/3.2.1/discord_game_sdk.zip"
	@echo "   unzip discord_game_sdk.zip -d native/discord_sdk/"
	@echo ""
	@echo "2. Build native module:"
	@echo "   make build-native"
	@echo ""
	@echo "3. Build frontend:"
	@echo "   make build-frontend"
	@echo ""
	@echo "✓ Development setup instructions displayed"

# Create Discord app setup instructions
discord-setup:
	@echo "=== Discord Application Setup ==="
	@echo "To use the Discord Social SDK, you need to:"
	@echo ""
	@echo "1. Go to https://discord.com/developers/applications"
	@echo "2. Create a new application or use existing one"
	@echo "3. Go to 'General Information' and copy the Application ID"
	@echo "4. Update the client ID in main.py (currently: 1511445489386787129)"
	@echo "5. Enable the required OAuth2 scopes:"
	@echo "   - guilds"
	@echo "   - guilds.members.read"
	@echo "   - voice (if needed)"
	@echo ""
	@echo "6. For Social SDK features, ensure your app is approved for:"
	@echo "   - Rich Presence"
	@echo "   - Voice/Lobbies (may require approval)"
	@echo ""
	@echo "✓ Discord setup instructions displayed"

# Package for distribution
package: all
	@echo "=== Packaging Plugin ==="
	mkdir -p dist/deckycord/
	cp -r py_modules/ dist/deckycord/
	cp main.py plugin.json README.md LICENSE dist/deckycord/
	cp -r src/ dist/deckycord/ 2>/dev/null || true
	cp -r defaults/ dist/deckycord/ 2>/dev/null || true
	cd dist && zip -r deckycord-v$(shell grep version plugin.json | cut -d'"' -f4).zip deckycord/
	@echo "✓ Package created in dist/"

# Install to Decky Loader (for development)
install-dev: all
	@echo "=== Installing to Decky Loader (Development) ==="
	@if [ -d "$(HOME)/homebrew/plugins/deckycord" ]; then \
		echo "Updating existing installation..."; \
		cp -r * "$(HOME)/homebrew/plugins/deckycord/"; \
	else \
		echo "Installing to $(HOME)/homebrew/plugins/deckycord"; \
		mkdir -p "$(HOME)/homebrew/plugins/deckycord"; \
		cp -r * "$(HOME)/homebrew/plugins/deckycord/"; \
	fi
	@echo "✓ Installed to Decky Loader"
	@echo "Restart Decky Loader to load the updated plugin"