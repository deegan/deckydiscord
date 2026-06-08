# Deckycord - Discord Social SDK Implementation

This is the **Discord Social SDK** version of Deckycord, providing reliable voice control without OAuth limitations.

## 🎯 What Changed?

### Before (RPC Version)
- Used Discord RPC over IPC sockets
- Required OAuth permissions that were hard to grant on Steam Deck
- Limited voice control due to permission restrictions
- Dependent on Discord client being installed and running

### Now (Social SDK Version)
- Uses Discord Social SDK for native voice integration
- Creates Discord voice lobbies that users can join
- Full voice control: mute/unmute, deafen, volume control
- Works independently of Discord client state
- No OAuth complexity - just works!

## 🚀 Features

### Voice Lobbies
- Create voice lobbies with custom names and member limits
- Join lobbies via invite codes
- Real-time voice communication with lobby members
- Full voice control (mute, deafen, volume)

### Invite System
- Generate invite codes for your lobbies
- Share codes with friends to join voice chat
- Easy lobby discovery and joining

### Voice Controls
- Mute/unmute microphone
- Deafen/undeafen audio output
- Volume control for input and output
- Real-time voice state monitoring

## 📋 Requirements

### Discord Application Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or use existing one
3. Copy the Application ID
4. Update `client_id` in `main.py` if needed

### Build Dependencies
- **CMake 3.12+**
- **C++17 compatible compiler** (GCC 7+, Clang 5+)
- **Python 3.8+** with pybind11
- **Node.js** with pnpm
- **Discord Social SDK** (see installation below)

## 🛠️ Installation

### Quick Setup (Recommended)

```bash
# Run the automated setup script
./scripts/setup_discord_sdk.sh
```

This script will:
- Guide you through Discord SDK download
- Install build dependencies
- Build the native module
- Verify installation

### Manual Installation

#### 1. Download Discord Social SDK

⚠️ **Important**: Due to Discord's licensing, the SDK cannot be included in our package.

1. Go to [Discord Developer Portal](https://discord.com/developers/social-sdk)
2. Log in to your Discord account
3. Download the Discord Social SDK
4. Extract to `native/discord_sdk/`

Expected structure:
```
native/discord_sdk/
├── include/discord/discord.h
├── lib/linux/x86_64/libdiscord_game_sdk.so
└── ...
```

#### 2. Install Dependencies (Steam Deck)

```bash
# Enable write access (Steam Deck only)
sudo steamos-readonly disable

# Install build tools
sudo pacman -Sy base-devel cmake python-pip

# Install Python dependencies
pip install --user pybind11 numpy
```

#### 3. Build Native Module

```bash
# Make build script executable
chmod +x native/build.sh

# Build the Discord SDK wrapper
cd native && ./build.sh
```

#### 4. Verify Installation

```bash
# Test that everything works
python3 test_build.py
```

#### 5. Restart Decky Loader

```bash
# Restart to load the new native module
sudo systemctl restart plugin_loader
```

## 🔧 Development

### Project Structure

```
discord-rpc-plugin/
├── native/                 # C++ Discord SDK integration
│   ├── discord_sdk_wrapper.h     # C++ wrapper header
│   ├── discord_sdk_wrapper.cpp   # C++ wrapper implementation  
│   ├── python_bindings.cpp       # pybind11 Python bindings
│   ├── CMakeLists.txt            # CMake build configuration
│   ├── build.sh                  # Build script
│   └── discord_sdk/              # Discord Social SDK (download separately)
├── py_modules/
│   ├── discord_social_sdk.py     # High-level Python wrapper
│   └── discord_sdk_native.*      # Generated native module
├── src/
│   └── index.tsx                 # React frontend
├── main.py                       # Plugin backend
├── Makefile                     # Build system
└── README_SOCIAL_SDK.md         # This file
```

### Building Components

```bash
# Build only native module
make build-native

# Build only frontend  
make build-frontend

# Build everything
make all

# Clean build artifacts
make clean

# Run tests
make test
```

### Development Workflow

1. **Native Development**: Make changes to C++ code in `native/`
2. **Rebuild**: Run `make build-native` to rebuild the native module
3. **Python Development**: Edit `py_modules/discord_social_sdk.py`
4. **Frontend Development**: Edit `src/index.tsx`
5. **Test**: Use `make test` to verify builds

## 🎮 Usage

### Creating Voice Lobbies

1. **Connect to Discord**: Click "Connect to Discord" in the plugin
2. **Create Lobby**: Use "Create Voice Lobby" button
3. **Set Name & Capacity**: Choose name and max members (2-25)
4. **Start Voice Chat**: Join the lobby voice channel

### Joining Lobbies

1. **By Invite Code**: 
   - Get invite code from lobby owner
   - Use "Join by Invite Code" 
   - Enter code and join

2. **Direct Join**:
   - Get lobby ID from friend
   - Use backend `join_lobby_by_id` method

### Voice Control

- **Mute/Unmute**: Toggle microphone
- **Deafen**: Toggle audio output
- **Volume**: Adjust input/output levels
- **Leave**: End voice call and leave lobby

## 🔍 Troubleshooting

### Common Issues

**"Discord SDK not available"**
- Ensure Discord Social SDK is downloaded to `native/discord_sdk/`
- Rebuild with `make build-native`
- Check CMake output for missing libraries

**"Failed to connect to Discord"**
- Verify Discord application ID is correct
- Check Discord app settings in Developer Portal
- Ensure Discord Social SDK libraries are properly linked

**Build Errors**
- Install CMake 3.12+ and C++17 compiler
- Install pybind11: `pip install pybind11`
- Check Discord SDK path in `native/CMakeLists.txt`

**Voice Not Working**
- Check audio permissions on Steam Deck
- Verify lobby creation succeeded
- Test with a second Discord account

### Debug Commands

```bash
# Test native module import
python3 -c "import sys; sys.path.insert(0, 'py_modules'); import discord_social_sdk; print('✓ Module imports')"

# Test Discord SDK connection
python3 py_modules/discord_social_sdk.py

# Check build output
cd native && ./build.sh
```

## 🔧 Advanced Configuration

### Custom Discord Application

1. Create Discord application at https://discord.com/developers/applications
2. Copy Application ID  
3. Update `main.py`:
   ```python
   self.sdk = DiscordSocialSDK(client_id='YOUR_APP_ID_HERE')
   ```

### Voice Quality Settings

The Discord Social SDK automatically handles:
- Audio compression and quality
- Echo cancellation  
- Noise suppression
- Network optimization

### Lobby Limits

- **Max Members**: 25 (Discord recommendation)
- **Lobby Lifespan**: Active until last member leaves
- **Invite Codes**: 1 hour expiry by default

## 📝 API Reference

### Backend Methods

```python
# Lobby Management
create_lobby(name: str, capacity: int = 10) -> Dict
join_lobby_by_id(lobby_id: str) -> Dict  
create_lobby_invite(lobby_id: str) -> Dict
join_by_invite(invite_code: str) -> Dict

# Voice Control
mute_voice() -> Dict
unmute_voice() -> Dict  
toggle_deafen() -> Dict

# Connection
connect_to_discord() -> Dict
disconnect_from_discord() -> Dict
get_connection_status() -> Dict
```

### Frontend Components

```typescript
// New lobby management UI
createLobby(name: string, capacity: number)
joinByInvite(inviteCode: string)  
createLobbyInvite(lobbyId: string)

// Voice controls (unchanged)
muteVoice()
unmuteVoice() 
toggleDeafen()
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Build and test: `make all && make test`
4. Commit changes: `git commit -m 'Add amazing feature'`
5. Push to branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📄 License

This project is licensed under the BSD-3-Clause License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Discord Social SDK](https://discord.com/developers/social-sdk) for voice integration
- [pybind11](https://github.com/pybind/pybind11) for Python-C++ bindings
- [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) for Steam Deck plugin framework
- Discord community for feedback and testing