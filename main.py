import os
import sys
import decky
import asyncio
import json
from typing import Dict, List, Optional

# Add py_modules to path for bundled dependencies
plugin_dir = os.path.dirname(os.path.abspath(__file__))
py_modules_path = os.path.join(plugin_dir, "py_modules")
if py_modules_path not in sys.path:
    sys.path.insert(0, py_modules_path)

try:
    from simple_discord_rpc import DiscordRPC
    DISCORD_RPC_AVAILABLE = True
    decky.logger.info("Using bundled Discord RPC implementation")
except ImportError as e:
    DISCORD_RPC_AVAILABLE = False
    decky.logger.warning(f"Discord RPC not available: {e}")

class Plugin:
    def __init__(self):
        self.rpc = None
        self.connected = False
        self.connection_error = None
        
    async def get_connection_status(self) -> Dict[str, any]:
        return {
            "connected": self.connected,
            "error": self.connection_error,
            "pypresence_available": DISCORD_RPC_AVAILABLE
        }
    
    async def connect_to_discord(self) -> Dict[str, any]:
        if not DISCORD_RPC_AVAILABLE:
            self.connection_error = "Discord RPC library not available"
            return await self.get_connection_status()
            
        try:
            if self.rpc is None:
                self.rpc = DiscordRPC(client_id='1234567890123456789')
            
            # Run the blocking connect call in a thread to avoid blocking the event loop
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.rpc.connect)
            
            self.connected = True
            self.connection_error = None
            decky.logger.info("Successfully connected to Discord RPC")
            
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
        if not self.connected:
            return {"success": False, "error": "Not connected to Discord"}
            
        try:
            # Use our bundled RPC implementation
            if self.rpc:
                loop = asyncio.get_event_loop()
                guilds_data = await loop.run_in_executor(None, self.rpc.get_guilds)
                return guilds_data
            else:
                return {"success": False, "error": "RPC client not initialized"}
            
        except Exception as e:
            decky.logger.error(f"Error fetching guilds: {e}")
            return {"success": False, "error": str(e)}

    async def debug_discord_connection(self) -> Dict[str, any]:
        """Debug Discord connection issues with detailed logging."""
        try:
            from simple_discord_rpc import DiscordRPC
            
            # Create a temporary RPC instance for debugging
            debug_rpc = DiscordRPC()
            
            # This will print detailed debug info to the logs
            socket_path = debug_rpc._find_discord_socket()
            
            if socket_path:
                return {
                    "success": True,
                    "socket_found": True,
                    "socket_path": socket_path,
                    "message": "Discord socket found! Check Decky logs for details."
                }
            else:
                return {
                    "success": False,
                    "socket_found": False,
                    "socket_path": None,
                    "message": "No Discord socket found. Check Decky logs for detailed search info."
                }
                
        except Exception as e:
            decky.logger.error(f"Debug error: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Debug function failed"
            }

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
