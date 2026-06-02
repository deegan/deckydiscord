# Discord RPC Plugin for Steam Deck

Control Discord from your Steam Deck without leaving Big Picture Mode! This Decky Loader plugin provides Discord RPC integration, allowing you to manage your Discord presence and servers directly from the Steam Deck interface.

## Features

- **Discord RPC Connection**: Connect to Discord's Rich Presence Client locally
- **Server List Display**: View your connected Discord servers
- **Connection Status**: Real-time connection status monitoring
- **Error Handling**: Clear error messages and troubleshooting info
- **Refresh Controls**: Manual refresh of server list

## Installation

### Prerequisites

1. **Discord Desktop Client**: Must be running on your Steam Deck
2. **Decky Loader**: Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) on your Steam Deck
3. **Python Dependencies**: The plugin requires `pypresence` library

### Install Steps

1. **Download/Clone** this repository:
   ```bash
   git clone https://github.com/deegan/deckydiscord.git
   cd deckydiscord
   ```

2. **Install Dependencies**:
   ```bash
   # Frontend dependencies
   pnpm install
   
   # Python backend dependency
   pip install pypresence>=4.3.0
   ```

3. **Build the Plugin**:
   ```bash
   pnpm run build
   ```

4. **Install in Decky Loader**:
   - Copy the entire plugin folder to your Decky Loader plugins directory
   - Or use Decky's developer mode to load from the build output

## Usage

1. **Start Discord**: Make sure Discord desktop client is running
2. **Open Plugin**: Access the Discord RPC plugin from Decky's plugin menu
3. **Connect**: Click "Connect to Discord" button
4. **View Servers**: Once connected, your Discord servers will be displayed
5. **Refresh**: Use the refresh button to update the server list

### Plugin Interface

- **Connection Status Section**: Shows current connection state and any errors
- **Connect/Disconnect Button**: Manual control over Discord RPC connection  
- **Discord Servers Section**: Lists your connected servers (appears when connected)
- **Refresh Servers Button**: Updates the server list

## Current Limitations

- **Mock Data**: Currently displays test server data for UI testing
- **Read-Only**: No server switching or voice controls yet
- **Local Only**: Requires Discord client running locally on Steam Deck
- **No Authentication**: Uses placeholder client ID (needs Discord app registration for full features)

## Development Roadmap

Future features planned:
- ✅ Discord RPC connection
- ✅ Server list display
- 🔄 Real Discord server data (requires Discord app approval)
- ⏳ Voice channel controls
- ⏳ Mute/unmute functionality
- ⏳ Server switching
- ⏳ Channel navigation

## Development

### Building

```bash
# Install dependencies
pnpm install

# Build for development
pnpm run build

# Watch mode for development
pnpm run watch
```

### Dependencies

- **Frontend**: React, TypeScript, Decky UI components
- **Backend**: Python with pypresence library for Discord RPC
- **Build**: Rollup, pnpm package manager

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
- Uses [pypresence](https://github.com/qwertyquerty/pypresence) for Discord RPC
- Based on [Decky Plugin Template](https://github.com/SteamDeckHomebrew/decky-plugin-template)
