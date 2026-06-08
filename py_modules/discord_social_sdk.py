"""
Discord Social SDK Python wrapper for Deckycord.
Provides a high-level interface to the Discord Social SDK through the native C++ module.
"""

import threading
import time
import asyncio
from typing import Dict, List, Optional, Callable, Any
import logging

try:
    import discord_sdk_native
    DISCORD_SDK_AVAILABLE = True
except ImportError:
    DISCORD_SDK_AVAILABLE = False

# Setup logging
logger = logging.getLogger(__name__)

class DiscordSocialSDK:
    """High-level Python wrapper for Discord Social SDK."""
    
    def __init__(self, client_id: str = "1511445489386787129"):
        self.client_id = client_id
        self.sdk = None
        self.connected = False
        self.callback_thread = None
        self.running = False
        self.last_error = ""
        
        # Event callbacks
        self.on_lobby_joined = None
        self.on_lobby_left = None
        self.on_voice_state_changed = None
        self.on_user_joined = None
        self.on_user_left = None
        self.on_error = None
        
        # Cache
        self.current_user = None
        self.joined_lobbies = {}
        self.voice_state = None
        
    def is_available(self) -> bool:
        """Check if Discord SDK is available."""
        return DISCORD_SDK_AVAILABLE
    
    def connect(self) -> bool:
        """Initialize and connect to Discord Social SDK."""
        if not DISCORD_SDK_AVAILABLE:
            self.last_error = "Discord SDK native module not available"
            return False
            
        try:
            # Create SDK instance
            self.sdk = discord_sdk_native.DiscordSDKWrapper(self.client_id)
            
            # Set up callbacks
            self.sdk.set_lobby_joined_callback(self._on_lobby_joined)
            self.sdk.set_lobby_left_callback(self._on_lobby_left)
            self.sdk.set_voice_state_changed_callback(self._on_voice_state_changed)
            self.sdk.set_user_joined_callback(self._on_user_joined)
            self.sdk.set_user_left_callback(self._on_user_left)
            self.sdk.set_error_callback(self._on_error)
            
            # Initialize SDK
            if not self.sdk.initialize():
                self.last_error = self.sdk.get_last_error()
                return False
            
            # Start callback processing thread
            self.running = True
            self.callback_thread = threading.Thread(target=self._callback_loop, daemon=True)
            self.callback_thread.start()
            
            # Get initial state
            self.current_user = self.sdk.get_current_user()
            self.voice_state = self.sdk.get_voice_state()
            
            self.connected = True
            logger.info(f"Discord SDK connected successfully for user: {self.current_user.username if self.current_user else 'Unknown'}")
            return True
            
        except Exception as e:
            self.last_error = f"Failed to connect to Discord SDK: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def disconnect(self) -> bool:
        """Disconnect from Discord Social SDK."""
        try:
            self.running = False
            
            if self.callback_thread:
                self.callback_thread.join(timeout=2.0)
                self.callback_thread = None
            
            if self.sdk:
                self.sdk.shutdown()
                self.sdk = None
            
            self.connected = False
            logger.info("Discord SDK disconnected")
            return True
            
        except Exception as e:
            self.last_error = f"Error during disconnect: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def is_connected(self) -> bool:
        """Check if connected to Discord."""
        return self.connected and self.sdk and self.sdk.is_connected()
    
    def get_last_error(self) -> str:
        """Get the last error message."""
        return self.last_error
    
    def get_current_user(self) -> Optional[Dict[str, Any]]:
        """Get current user information."""
        if not self.current_user:
            return None
        return {
            "id": self.current_user.id,
            "username": self.current_user.username,
            "discriminator": self.current_user.discriminator,
            "avatar": self.current_user.avatar
        }
    
    # Lobby Management
    def create_lobby(self, name: str, capacity: int = 10) -> Optional[str]:
        """Create a new voice lobby."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return None
        
        try:
            lobby_id = self.sdk.create_lobby(name, capacity)
            if lobby_id:
                logger.info(f"Created lobby '{name}' with ID: {lobby_id}")
                return lobby_id
            else:
                self.last_error = self.sdk.get_last_error()
                return None
        except Exception as e:
            self.last_error = f"Failed to create lobby: {str(e)}"
            logger.error(self.last_error)
            return None
    
    def join_lobby(self, lobby_id: str) -> bool:
        """Join an existing lobby."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.join_lobby(lobby_id)
            if success:
                logger.info(f"Joined lobby: {lobby_id}")
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to join lobby: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def leave_lobby(self, lobby_id: str) -> bool:
        """Leave a lobby."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.leave_lobby(lobby_id)
            if success:
                logger.info(f"Left lobby: {lobby_id}")
                self.joined_lobbies.pop(lobby_id, None)
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to leave lobby: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def delete_lobby(self, lobby_id: str) -> bool:
        """Delete a lobby (owner only)."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.delete_lobby(lobby_id)
            if success:
                logger.info(f"Deleted lobby: {lobby_id}")
                self.joined_lobbies.pop(lobby_id, None)
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to delete lobby: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def get_lobbies(self) -> List[Dict[str, Any]]:
        """Get list of joined lobbies."""
        if not self.is_connected():
            return []
        
        try:
            lobbies = self.sdk.get_joined_lobbies()
            return [{
                "id": lobby.id,
                "name": lobby.name,
                "owner_id": lobby.owner_id,
                "capacity": lobby.capacity,
                "member_count": lobby.member_count,
                "voice_enabled": lobby.voice_enabled,
                "members": [{
                    "id": member.id,
                    "username": member.username,
                    "discriminator": member.discriminator,
                    "avatar": member.avatar
                } for member in lobby.members]
            } for lobby in lobbies]
        except Exception as e:
            self.last_error = f"Failed to get lobbies: {str(e)}"
            logger.error(self.last_error)
            return []
    
    def get_lobby_info(self, lobby_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific lobby."""
        if not self.is_connected():
            return None
        
        try:
            lobby = self.sdk.get_lobby_info(lobby_id)
            if lobby.id:  # Check if lobby was found
                return {
                    "id": lobby.id,
                    "name": lobby.name,
                    "owner_id": lobby.owner_id,
                    "capacity": lobby.capacity,
                    "member_count": lobby.member_count,
                    "voice_enabled": lobby.voice_enabled,
                    "members": [{
                        "id": member.id,
                        "username": member.username,
                        "discriminator": member.discriminator,
                        "avatar": member.avatar
                    } for member in lobby.members]
                }
            return None
        except Exception as e:
            self.last_error = f"Failed to get lobby info: {str(e)}"
            logger.error(self.last_error)
            return None
    
    def create_invite(self, lobby_id: str, max_age_seconds: int = 3600) -> Optional[str]:
        """Create an invite code for a lobby."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return None
        
        try:
            invite_code = self.sdk.create_lobby_invite(lobby_id, max_age_seconds)
            if invite_code:
                logger.info(f"Created invite for lobby {lobby_id}: {invite_code}")
            else:
                self.last_error = self.sdk.get_last_error()
            return invite_code
        except Exception as e:
            self.last_error = f"Failed to create invite: {str(e)}"
            logger.error(self.last_error)
            return None
    
    def accept_invite(self, invite_code: str) -> bool:
        """Accept a lobby invite."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.accept_invite(invite_code)
            if success:
                logger.info(f"Accepted invite: {invite_code}")
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to accept invite: {str(e)}"
            logger.error(self.last_error)
            return False
    
    # Voice Control
    def start_voice_call(self, lobby_id: str) -> bool:
        """Start voice call in a lobby."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.start_voice_call(lobby_id)
            if success:
                logger.info(f"Started voice call in lobby: {lobby_id}")
                self.voice_state = self.sdk.get_voice_state()
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to start voice call: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def end_voice_call(self, lobby_id: str) -> bool:
        """End voice call in a lobby."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.end_voice_call(lobby_id)
            if success:
                logger.info(f"Ended voice call in lobby: {lobby_id}")
                self.voice_state = self.sdk.get_voice_state()
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to end voice call: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def set_mute(self, muted: bool) -> bool:
        """Mute/unmute microphone."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.set_self_mute(muted)
            if success:
                logger.info(f"Microphone {'muted' if muted else 'unmuted'}")
                self.voice_state = self.sdk.get_voice_state()
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to set mute: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def set_deafen(self, deafened: bool) -> bool:
        """Deafen/undeafen audio."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = self.sdk.set_self_deafen(deafened)
            if success:
                logger.info(f"Audio {'deafened' if deafened else 'undeafened'}")
                self.voice_state = self.sdk.get_voice_state()
            else:
                self.last_error = self.sdk.get_last_error()
            return success
        except Exception as e:
            self.last_error = f"Failed to set deafen: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def set_volume(self, input_volume: Optional[float] = None, output_volume: Optional[float] = None) -> bool:
        """Set input and/or output volume (0.0-1.0)."""
        if not self.is_connected():
            self.last_error = "Not connected to Discord"
            return False
        
        try:
            success = True
            if input_volume is not None:
                success &= self.sdk.set_input_volume(input_volume)
            if output_volume is not None:
                success &= self.sdk.set_output_volume(output_volume)
            
            if success:
                self.voice_state = self.sdk.get_voice_state()
                logger.info(f"Volume updated - input: {input_volume}, output: {output_volume}")
            else:
                self.last_error = self.sdk.get_last_error()
            
            return success
        except Exception as e:
            self.last_error = f"Failed to set volume: {str(e)}"
            logger.error(self.last_error)
            return False
    
    def get_voice_state(self) -> Optional[Dict[str, Any]]:
        """Get current voice state."""
        if not self.is_connected():
            return None
        
        try:
            state = self.sdk.get_voice_state()
            return {
                "is_muted": state.is_muted,
                "is_deafened": state.is_deafened,
                "is_connected": state.is_connected,
                "lobby_id": state.lobby_id,
                "input_volume": state.input_volume,
                "output_volume": state.output_volume
            }
        except Exception as e:
            self.last_error = f"Failed to get voice state: {str(e)}"
            logger.error(self.last_error)
            return None
    
    def is_in_voice_call(self) -> bool:
        """Check if currently in a voice call."""
        if not self.is_connected():
            return False
        
        try:
            return self.sdk.is_in_voice_call()
        except Exception as e:
            self.last_error = f"Failed to check voice call status: {str(e)}"
            logger.error(self.last_error)
            return False
    
    # Event Callbacks
    def set_event_callbacks(self, 
                           on_lobby_joined: Optional[Callable] = None,
                           on_lobby_left: Optional[Callable] = None,
                           on_voice_state_changed: Optional[Callable] = None,
                           on_user_joined: Optional[Callable] = None,
                           on_user_left: Optional[Callable] = None,
                           on_error: Optional[Callable] = None):
        """Set event callback functions."""
        self.on_lobby_joined = on_lobby_joined
        self.on_lobby_left = on_lobby_left
        self.on_voice_state_changed = on_voice_state_changed
        self.on_user_joined = on_user_joined
        self.on_user_left = on_user_left
        self.on_error = on_error
    
    # Internal callback handlers
    def _on_lobby_joined(self, lobby_id: str):
        if self.on_lobby_joined:
            try:
                self.on_lobby_joined(lobby_id)
            except Exception as e:
                logger.error(f"Error in lobby_joined callback: {e}")
    
    def _on_lobby_left(self, lobby_id: str):
        if self.on_lobby_left:
            try:
                self.on_lobby_left(lobby_id)
            except Exception as e:
                logger.error(f"Error in lobby_left callback: {e}")
    
    def _on_voice_state_changed(self, state):
        self.voice_state = state
        if self.on_voice_state_changed:
            try:
                voice_dict = {
                    "is_muted": state.is_muted,
                    "is_deafened": state.is_deafened,
                    "is_connected": state.is_connected,
                    "lobby_id": state.lobby_id,
                    "input_volume": state.input_volume,
                    "output_volume": state.output_volume
                }
                self.on_voice_state_changed(voice_dict)
            except Exception as e:
                logger.error(f"Error in voice_state_changed callback: {e}")
    
    def _on_user_joined(self, lobby_id: str, user):
        if self.on_user_joined:
            try:
                user_dict = {
                    "id": user.id,
                    "username": user.username,
                    "discriminator": user.discriminator,
                    "avatar": user.avatar
                }
                self.on_user_joined(lobby_id, user_dict)
            except Exception as e:
                logger.error(f"Error in user_joined callback: {e}")
    
    def _on_user_left(self, lobby_id: str, user):
        if self.on_user_left:
            try:
                user_dict = {
                    "id": user.id,
                    "username": user.username,
                    "discriminator": user.discriminator,
                    "avatar": user.avatar
                }
                self.on_user_left(lobby_id, user_dict)
            except Exception as e:
                logger.error(f"Error in user_left callback: {e}")
    
    def _on_error(self, error: str):
        self.last_error = error
        if self.on_error:
            try:
                self.on_error(error)
            except Exception as e:
                logger.error(f"Error in error callback: {e}")
    
    def _callback_loop(self):
        """Background thread to process Discord SDK callbacks."""
        logger.info("Started Discord SDK callback processing thread")
        
        while self.running:
            try:
                if self.sdk:
                    self.sdk.run_callbacks()
                time.sleep(0.016)  # ~60 FPS
            except Exception as e:
                logger.error(f"Error in callback loop: {e}")
                time.sleep(0.1)  # Slow down on errors
        
        logger.info("Discord SDK callback processing thread stopped")


def test_connection():
    """Test function to verify Discord Social SDK connection works."""
    sdk = DiscordSocialSDK()
    
    try:
        if sdk.is_available():
            print("✅ Discord SDK native module is available")
            
            if sdk.connect():
                print("✅ Successfully connected to Discord Social SDK")
                
                user = sdk.get_current_user()
                if user:
                    print(f"📋 Connected as: {user['username']}#{user['discriminator']}")
                
                # Test lobby creation
                lobby_id = sdk.create_lobby("Test Lobby")
                if lobby_id:
                    print(f"🎮 Created test lobby: {lobby_id}")
                    
                    # Test invite creation
                    invite = sdk.create_invite(lobby_id)
                    if invite:
                        print(f"📨 Created invite: {invite}")
                    
                    # Clean up
                    sdk.delete_lobby(lobby_id)
                    print("🧹 Cleaned up test lobby")
                
                sdk.disconnect()
                return True
            else:
                print(f"❌ Failed to connect: {sdk.get_last_error()}")
                return False
        else:
            print("❌ Discord SDK native module not available")
            return False
    except Exception as e:
        print(f"❌ Connection test error: {e}")
        return False


if __name__ == "__main__":
    test_connection()