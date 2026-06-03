import os
import sys
import decky
import asyncio
import json
import urllib.request
import urllib.parse
import ssl
import shutil
import tempfile
import zipfile
import time
from typing import Dict, List, Optional

# Add py_modules to path for bundled dependencies
plugin_dir = os.path.dirname(os.path.abspath(__file__))
py_modules_path = os.path.join(plugin_dir, "py_modules")
if py_modules_path not in sys.path:
    sys.path.insert(0, py_modules_path)

# Debug the module loading
decky.logger.info(f"Plugin directory: {plugin_dir}")
decky.logger.info(f"py_modules path: {py_modules_path}")
decky.logger.info(f"py_modules exists: {os.path.exists(py_modules_path)}")
decky.logger.info(f"simple_discord_rpc.py exists: {os.path.exists(os.path.join(py_modules_path, 'simple_discord_rpc.py'))}")
decky.logger.info(f"sys.path includes py_modules: {py_modules_path in sys.path}")

try:
    from simple_discord_rpc import DiscordRPC
    DISCORD_RPC_AVAILABLE = True
    decky.logger.info("Using bundled Discord RPC implementation")
except ImportError as e:
    DISCORD_RPC_AVAILABLE = False
    decky.logger.warning(f"Discord RPC not available: {e}")
    decky.logger.error(f"Current sys.path: {sys.path[:5]}...")  # Show first 5 path entries
    decky.logger.error("CRITICAL: simple_discord_rpc.py is missing from py_modules directory!")
    decky.logger.error("This indicates an incomplete plugin installation or auto-update failure.")
    decky.logger.error("Please download the latest release manually from GitHub and reinstall.")

class Plugin:
    def __init__(self):
        self.rpc = None
        self.connected = False
        self.connection_error = None
        # Use a writable location for config file
        plugin_dir = os.path.dirname(__file__)
        try:
            # Try plugin directory first
            test_file = os.path.join(plugin_dir, "test_write.tmp")
            with open(test_file, 'w') as f:
                f.write("test")
            os.remove(test_file)
            self.config_file = os.path.join(plugin_dir, "server_config.json")
        except (PermissionError, OSError):
            # Fall back to user home directory if plugin dir isn't writable
            home_dir = os.path.expanduser("~")
            self.config_file = os.path.join(home_dir, ".deckycord_servers.json")
            decky.logger.info(f"Using fallback config location: {self.config_file}")
        self.servers = self._load_servers()
        
    async def get_connection_status(self) -> Dict[str, any]:
        status = {
            "connected": self.connected,
            "error": self.connection_error,
            "pypresence_available": DISCORD_RPC_AVAILABLE
        }
        
        # Add helpful error message if Discord RPC is not available due to missing files
        if not DISCORD_RPC_AVAILABLE:
            simple_rpc_path = os.path.join(os.path.dirname(__file__), "py_modules", "simple_discord_rpc.py")
            if not os.path.exists(simple_rpc_path):
                status["error"] = "Plugin installation corrupted - missing Discord RPC module. Please download latest release from GitHub and reinstall manually."
        
        return status
    
    async def connect_to_discord(self) -> Dict[str, any]:
        if not DISCORD_RPC_AVAILABLE:
            self.connection_error = "Discord RPC library not available"
            return await self.get_connection_status()
            
        try:
            if self.rpc is None:
                self.rpc = DiscordRPC(client_id='1511445489386787129')
            
            # Run the blocking connect call in a thread to avoid blocking the event loop
            loop = asyncio.get_event_loop()
            connection_result = await loop.run_in_executor(None, self.rpc.connect)
            
            if connection_result and self.rpc.is_connected():
                self.connected = True
                self.connection_error = None
                decky.logger.info(f"Successfully connected to Discord RPC - connection state: {self.rpc.is_connected()}")
            else:
                self.connected = False
                self.connection_error = "Discord RPC connect() returned False"
                decky.logger.error("Discord RPC connect() succeeded but connection state is False")
            
        except Exception as e:
            self.connected = False
            self.connection_error = str(e)
            decky.logger.error(f"Failed to connect to Discord RPC: {e}")
            
        return await self.get_connection_status()
    
    async def disconnect_from_discord(self) -> Dict[str, any]:
        if self.rpc and self.connected:
            try:
                self.rpc.close()
                self.connected = False
                self.connection_error = None
                decky.logger.info("Disconnected from Discord RPC")
            except Exception as e:
                decky.logger.error(f"Error disconnecting from Discord: {e}")
                self.connection_error = str(e)
        
        return await self.get_connection_status()
    
    async def get_guilds(self) -> Dict[str, any]:
        """Get guilds - now redirects to the new server management system."""
        decky.logger.info(f"get_guilds called - redirecting to get_servers")
        return await self.get_servers()

    async def debug_discord_connection(self) -> Dict[str, any]:
        """Debug Discord connection issues with detailed logging."""
        try:
            if not DISCORD_RPC_AVAILABLE:
                return {
                    "success": False,
                    "error": "Discord RPC library not available",
                    "message": "Discord RPC implementation not loaded"
                }
            
            # Import in a safer way
            try:
                from simple_discord_rpc import DiscordRPC
            except Exception as import_error:
                decky.logger.error(f"Import error: {import_error}")
                return {
                    "success": False,
                    "error": f"Import failed: {str(import_error)}",
                    "message": "Could not import Discord RPC module"
                }
            
            # Create a temporary RPC instance for debugging and run in executor
            loop = asyncio.get_event_loop()
            
            def run_debug():
                debug_rpc = DiscordRPC()
                return debug_rpc._find_discord_socket()
            
            socket_path = await loop.run_in_executor(None, run_debug)
            
            if socket_path:
                decky.logger.info(f"Debug: Found Discord socket at {socket_path}")
                return {
                    "success": True,
                    "socket_found": True,
                    "socket_path": socket_path,
                    "message": f"Found socket: {socket_path}"
                }
            else:
                decky.logger.warning("Debug: No Discord socket found")
                return {
                    "success": False,
                    "socket_found": False,
                    "socket_path": None,
                    "message": "No Discord socket found. Check logs for details."
                }
                
        except Exception as e:
            error_msg = f"Debug error: {str(e)}"
            decky.logger.error(error_msg)
            return {
                "success": False,
                "error": str(e),
                "message": "Debug function failed - check logs"
            }

    async def check_for_updates(self) -> Dict[str, any]:
        """Check if there's a newer version available on GitHub."""
        try:
            # Get current version
            current_version = "0.1.13"  # This should be updated automatically
            
            # GitHub API to get latest release
            api_url = "https://api.github.com/repos/deegan/deckydiscord/releases/latest"
            
            loop = asyncio.get_event_loop()
            def fetch_latest():
                # Skip secure SSL entirely on Steam Deck - go straight to insecure
                decky.logger.info(f"Checking for updates (Steam Deck SSL workaround)")
                
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                
                req = urllib.request.Request(
                    api_url,
                    headers={'User-Agent': 'Deckycord-Plugin/0.1.13'}
                )
                
                with urllib.request.urlopen(req, context=ssl_context, timeout=10) as response:
                    return json.loads(response.read().decode())
            
            latest_release = await loop.run_in_executor(None, fetch_latest)
            latest_version = latest_release.get('tag_name', '')
            
            # Compare versions
            is_newer = latest_version != f"v{current_version}"
            
            decky.logger.info(f"Update check result - Current: v{current_version}, Latest: {latest_version}, Update available: {is_newer}")
            
            return {
                "success": True,
                "current_version": current_version,
                "latest_version": latest_version,
                "update_available": is_newer,
                "download_url": latest_release.get('assets', [{}])[0].get('browser_download_url') if latest_release.get('assets') else None,
                "release_url": f"https://github.com/deegan/deckydiscord/releases/tag/{latest_version}"
            }
            
        except Exception as e:
            decky.logger.error(f"Error checking for updates: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to check for updates: {str(e)[:100]}..."
            }

    async def update_plugin(self) -> Dict[str, any]:
        """Download and install the latest version of the plugin."""
        try:
            # First check for updates
            update_check = await self.check_for_updates()
            if not update_check.get("success") or not update_check.get("update_available"):
                return {
                    "success": False,
                    "message": "No updates available or update check failed"
                }
            
            download_url = update_check.get("download_url")
            if not download_url:
                return {
                    "success": False,
                    "message": "No download URL found"
                }
            
            decky.logger.info(f"Downloading update from: {download_url}")
            
            loop = asyncio.get_event_loop()
            
            def download_and_install():
                # Download the update
                with tempfile.TemporaryDirectory() as temp_dir:
                    zip_path = os.path.join(temp_dir, "update.zip")
                    
                    # Skip secure SSL entirely on Steam Deck
                    ssl_context = ssl.create_default_context()
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE
                    
                    req = urllib.request.Request(
                        download_url,
                        headers={'User-Agent': 'Deckycord-Plugin/0.1.13'}
                    )
                    
                    with urllib.request.urlopen(req, context=ssl_context, timeout=30) as response:
                        with open(zip_path, 'wb') as f:
                            shutil.copyfileobj(response, f)
                    
                    # Extract the ZIP
                    extract_path = os.path.join(temp_dir, "extracted")
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        zip_ref.extractall(extract_path)
                    
                    # Find the plugin directory in the extracted files
                    plugin_source = None
                    for item in os.listdir(extract_path):
                        if os.path.isdir(os.path.join(extract_path, item)):
                            plugin_source = os.path.join(extract_path, item)
                            break
                    
                    if not plugin_source:
                        raise Exception("Could not find plugin directory in download")
                    
                    # Copy files to current plugin directory
                    plugin_target = os.path.dirname(os.path.abspath(__file__))
                    
                    # Create backup directory with better error handling
                    backup_dir = os.path.join(plugin_target, "backup_" + str(int(time.time())))
                    try:
                        os.makedirs(backup_dir)
                    except PermissionError:
                        # Try creating backup in temp directory instead
                        backup_dir = os.path.join(tempfile.gettempdir(), "deckycord_backup_" + str(int(time.time())))
                        os.makedirs(backup_dir)
                    
                    # First, backup critical files
                    critical_files = ["main.py", "plugin.json", "package.json"]
                    for file_name in critical_files:
                        src_path = os.path.join(plugin_target, file_name)
                        if os.path.exists(src_path):
                            shutil.copy2(src_path, os.path.join(backup_dir, file_name))
                    
                    # Copy new files, handling permission errors gracefully
                    update_errors = []
                    for item in os.listdir(plugin_source):
                        source_path = os.path.join(plugin_source, item)
                        target_path = os.path.join(plugin_target, item)
                        
                        try:
                            if os.path.isdir(source_path):
                                if os.path.exists(target_path):
                                    # Try to remove, but don't fail if we can't
                                    try:
                                        shutil.rmtree(target_path)
                                    except PermissionError:
                                        # Directory in use, try renaming it
                                        backup_path = target_path + "_old"
                                        if os.path.exists(backup_path):
                                            shutil.rmtree(backup_path)
                                        os.rename(target_path, backup_path)
                                shutil.copytree(source_path, target_path)
                            else:
                                shutil.copy2(source_path, target_path)
                        except Exception as copy_error:
                            update_errors.append(f"{item}: {str(copy_error)}")
                    
                    # Clean up backup if update was successful
                    if not update_errors:
                        shutil.rmtree(backup_dir)
                    
                    if update_errors:
                        raise Exception(f"Update partial - some files failed: {'; '.join(update_errors)}")
                    
                    return True
            
            await loop.run_in_executor(None, download_and_install)
            
            decky.logger.info("Plugin updated successfully")
            return {
                "success": True,
                "message": f"Updated to {update_check.get('latest_version')}. Please restart Decky Loader or reload the plugin to complete the update.",
                "restart_required": True
            }
            
        except Exception as e:
            decky.logger.error(f"Error updating plugin: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to update plugin"
            }

    def _load_servers(self) -> List[Dict]:
        """Load server configuration from file."""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            decky.logger.warning(f"Could not load server config: {e}")
        
        # Default server list
        return [
            {"id": "add_server", "name": "➕ Add Your Discord Server", "favorite": False, "configurable": True},
            {"id": "example1", "name": "🎮 Gaming Server", "favorite": True, "configurable": False},
            {"id": "example2", "name": "👥 Friends Chat", "favorite": True, "configurable": False}
        ]

    def _save_servers(self) -> bool:
        """Save server configuration to file."""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.servers, f, indent=2)
            return True
        except Exception as e:
            decky.logger.error(f"Could not save server config: {e}")
            return False

    async def add_server(self, name: str) -> Dict[str, any]:
        """Add a new server to the list."""
        try:
            import uuid
            new_server = {
                "id": str(uuid.uuid4()),
                "name": name,
                "favorite": True,
                "configurable": False
            }
            self.servers.append(new_server)
            
            if self._save_servers():
                return {"success": True, "server": new_server}
            else:
                return {"success": False, "error": "Failed to save server"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def remove_server(self, server_id: str) -> Dict[str, any]:
        """Remove a server from the list."""
        try:
            self.servers = [s for s in self.servers if s["id"] != server_id]
            
            if self._save_servers():
                return {"success": True}
            else:
                return {"success": False, "error": "Failed to save changes"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def toggle_favorite(self, server_id: str) -> Dict[str, any]:
        """Toggle favorite status of a server."""
        try:
            for server in self.servers:
                if server["id"] == server_id:
                    server["favorite"] = not server.get("favorite", False)
                    break
            
            if self._save_servers():
                return {"success": True}
            else:
                return {"success": False, "error": "Failed to save changes"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_servers(self) -> Dict[str, any]:
        """Get the configured server list with favorites."""
        if not self.connected:
            return {"success": False, "error": "Not connected to Discord"}
        
        # Separate favorites from regular servers
        favorites = [s for s in self.servers if s.get("favorite", False)]
        regular = [s for s in self.servers if not s.get("favorite", False)]
        
        return {
            "success": True,
            "connected_to_discord": True,
            "favorites": favorites,
            "servers": regular,
            "total_count": len(self.servers)
        }

    async def discover_discord_servers(self) -> Dict[str, any]:
        """Attempt to discover user's actual Discord servers for easy adding."""
        decky.logger.info("discover_discord_servers called")
        
        if not self.connected or not self.rpc:
            decky.logger.warning("Discovery failed: not connected to Discord")
            return {"success": False, "error": "Not connected to Discord"}
        
        discovered_servers = []
        
        # Try multiple approaches to get server info
        try:
            loop = asyncio.get_event_loop()
            
            # Method 1: Try GET_GUILDS (will likely fail but worth trying)
            def try_get_guilds():
                try:
                    decky.logger.info("Attempting GET_GUILDS request...")
                    guild_request = {
                        "cmd": "GET_GUILDS",
                        "args": {},
                        "nonce": "discover-guilds"
                    }
                    
                    self.rpc._send_data(1, guild_request)
                    op, data = self.rpc._recv_data()
                    
                    if op == 1:
                        response = json.loads(data.decode('utf-8'))
                        decky.logger.info(f"GET_GUILDS response: {response}")
                        
                        if response.get('cmd') == 'GET_GUILDS' and response.get('evt') == 'RESPONSE':
                            guilds = response.get('data', {}).get('guilds', [])
                            decky.logger.info(f"Successfully retrieved {len(guilds)} real Discord servers!")
                            return [{"id": g.get('id'), "name": g.get('name'), "source": "api"} for g in guilds]
                        elif response.get('evt') == 'ERROR':
                            error_data = response.get('data', {})
                            decky.logger.warning(f"GET_GUILDS error: {error_data}")
                            if error_data.get('code') == 4006:
                                decky.logger.info("OAuth scopes need to be authorized - using fallback suggestions")
                except Exception as e:
                    decky.logger.warning(f"GET_GUILDS failed: {e}")
                return []
            
            api_servers = await loop.run_in_executor(None, try_get_guilds)
            decky.logger.info(f"API servers found: {len(api_servers)}")
            discovered_servers.extend(api_servers)
            
            # Method 2: Common Discord server names (fallback suggestions)
            if not discovered_servers:
                decky.logger.info("No API servers found, using fallback suggestions")
                common_servers = [
                    {"id": "common1", "name": "🎮 Gaming", "source": "suggestion"},
                    {"id": "common2", "name": "👥 Friends", "source": "suggestion"},
                    {"id": "common3", "name": "💼 Work/School", "source": "suggestion"},
                    {"id": "common4", "name": "🎵 Music", "source": "suggestion"},
                    {"id": "common5", "name": "🎨 Art/Creative", "source": "suggestion"},
                    {"id": "common6", "name": "📚 Study Group", "source": "suggestion"},
                    {"id": "common7", "name": "🏆 Competitive", "source": "suggestion"},
                    {"id": "common8", "name": "🌍 Community", "source": "suggestion"}
                ]
                discovered_servers.extend(common_servers)
            
            decky.logger.info(f"Total discovered servers: {len(discovered_servers)}")
            
            return {
                "success": True,
                "servers": discovered_servers,
                "source_info": "Real Discord servers" if api_servers else "Common server suggestions",
                "can_add_custom": True
            }
            
        except Exception as e:
            decky.logger.error(f"Error discovering servers: {e}")
            return {
                "success": False, 
                "error": str(e),
                "servers": []
            }

    async def get_oauth_url(self) -> Dict[str, any]:
        """Generate OAuth authorization URL for the user."""
        try:
            client_id = "1511445489386787129"
            scopes = "rpc+guilds+guilds.members.read+guilds.channels.read"
            redirect_uri = "http://localhost"
            
            oauth_url = (
                f"https://discord.com/api/oauth2/authorize?"
                f"client_id={client_id}&"
                f"permissions=0&"
                f"redirect_uri={redirect_uri}&"
                f"response_type=code&"
                f"scope={scopes}"
            )
            
            return {
                "success": True,
                "oauth_url": oauth_url,
                "instructions": [
                    "1. Open this URL in your browser while Discord is running",
                    "2. Click 'Authorize' when prompted", 
                    "3. Return to the plugin and reconnect to Discord",
                    "4. You should then see real Discord servers instead of suggestions"
                ]
            }
        except Exception as e:
            decky.logger.error(f"Error generating OAuth URL: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def get_voice_channels(self, guild_id: str) -> Dict[str, any]:
        """Get voice channels for a specific server/guild."""
        if not self.connected or not self.rpc:
            return {"success": False, "error": "Not connected to Discord"}
        
        try:
            loop = asyncio.get_event_loop()
            channels_data = await loop.run_in_executor(
                None, 
                self.rpc.get_voice_channels, 
                guild_id
            )
            return channels_data
        except Exception as e:
            decky.logger.error(f"Error fetching voice channels: {e}")
            return {"success": False, "error": str(e)}

    async def join_voice_channel(self, channel_id: str, guild_id: str) -> Dict[str, any]:
        """Join a voice channel."""
        if not self.connected or not self.rpc:
            return {"success": False, "error": "Not connected to Discord"}
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self.rpc.join_voice_channel,
                channel_id,
                guild_id
            )
            
            if result.get("success"):
                decky.logger.info(f"Successfully joined voice channel {channel_id}")
            
            return result
        except Exception as e:
            decky.logger.error(f"Error joining voice channel: {e}")
            return {"success": False, "error": str(e)}

    async def leave_voice_channel(self, guild_id: str) -> Dict[str, any]:
        """Leave current voice channel in guild."""
        if not self.connected or not self.rpc:
            return {"success": False, "error": "Not connected to Discord"}
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self.rpc.leave_voice_channel,
                guild_id
            )
            
            if result.get("success"):
                decky.logger.info(f"Successfully left voice channel in guild {guild_id}")
            
            return result
        except Exception as e:
            decky.logger.error(f"Error leaving voice channel: {e}")
            return {"success": False, "error": str(e)}

    async def _main(self):
        self.loop = asyncio.get_event_loop()
        decky.logger.info("Discord RPC Plugin loaded")
        
        # Attempt initial connection
        if DISCORD_RPC_AVAILABLE:
            await self.connect_to_discord()

    async def _unload(self):
        decky.logger.info("Discord RPC Plugin unloading")
        await self.disconnect_from_discord()

    async def _uninstall(self):
        decky.logger.info("Discord RPC Plugin uninstalled")
        await self.disconnect_from_discord()
