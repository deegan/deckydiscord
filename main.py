import os
import decky
import asyncio
import json
from typing import Dict, List, Optional

try:
    from pypresence import Presence
    PYPRESENCE_AVAILABLE = True
except ImportError:
    PYPRESENCE_AVAILABLE = False
    decky.logger.warning("pypresence not available - Discord RPC features disabled")

class Plugin:
    def __init__(self):
        self.rpc = None
        self.connected = False
        self.connection_error = None
        
    async def get_connection_status(self) -> Dict[str, any]:
        return {
            "connected": self.connected,
            "error": self.connection_error,
            "pypresence_available": PYPRESENCE_AVAILABLE
        }
    
    async def connect_to_discord(self) -> Dict[str, any]:
        if not PYPRESENCE_AVAILABLE:
            self.connection_error = "pypresence library not installed"
            return await self.get_connection_status()
            
        try:
            if self.rpc is None:
                self.rpc = Presence(client_id='1234567890123456789')  # Placeholder client ID
            
            self.rpc.connect()
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
            # Note: This is a placeholder - actual Discord RPC guild fetching 
            # requires proper authentication and different approach
            # For now, return mock data to test the UI
            guilds = [
                {"id": "123456789", "name": "Test Server 1", "icon": None},
                {"id": "987654321", "name": "Gaming Community", "icon": None},
                {"id": "456789123", "name": "Friends", "icon": None}
            ]
            
            return {
                "success": True,
                "guilds": guilds
            }
            
        except Exception as e:
            decky.logger.error(f"Error fetching guilds: {e}")
            return {"success": False, "error": str(e)}

    async def _main(self):
        self.loop = asyncio.get_event_loop()
        decky.logger.info("Discord RPC Plugin loaded")
        
        # Attempt initial connection
        if PYPRESENCE_AVAILABLE:
            await self.connect_to_discord()

    async def _unload(self):
        decky.logger.info("Discord RPC Plugin unloading")
        await self.disconnect_from_discord()

    async def _uninstall(self):
        decky.logger.info("Discord RPC Plugin uninstalled")
        await self.disconnect_from_discord()
