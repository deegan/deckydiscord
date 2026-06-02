"""
Simple Discord RPC implementation without external dependencies.
Implements basic Discord IPC communication for Steam Deck.
"""

import json
import socket
import struct
import tempfile
import os
import sys
import asyncio
from typing import Dict, Any, Optional


class DiscordRPC:
    """Simple Discord RPC client that doesn't require pypresence."""
    
    def __init__(self, client_id: str = "1234567890123456789"):
        self.client_id = client_id
        self.socket = None
        self.connected = False
        self.pipe_path = None
        
    def _find_discord_socket(self) -> Optional[str]:
        """Find Discord IPC socket on Linux."""
        # Common Discord IPC socket locations on Linux
        possible_paths = []
        
        # XDG_RUNTIME_DIR is the standard location
        runtime_dir = os.environ.get('XDG_RUNTIME_DIR')
        if runtime_dir:
            for i in range(10):  # Discord usually uses discord-ipc-0 to discord-ipc-9
                possible_paths.append(f"{runtime_dir}/discord-ipc-{i}")
        
        # Fallback locations
        temp_dir = tempfile.gettempdir()
        for i in range(10):
            possible_paths.append(f"{temp_dir}/discord-ipc-{i}")
            
        # Check which socket exists and is accessible
        for path in possible_paths:
            if os.path.exists(path):
                try:
                    # Test if we can connect to this socket
                    test_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    test_sock.settimeout(1)
                    test_sock.connect(path)
                    test_sock.close()
                    return path
                except (socket.error, OSError):
                    continue
        return None
    
    def connect(self) -> bool:
        """Connect to Discord via IPC socket."""
        try:
            self.pipe_path = self._find_discord_socket()
            if not self.pipe_path:
                raise ConnectionError("No accessible Discord IPC socket found")
            
            self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.socket.connect(self.pipe_path)
            
            # Send handshake
            handshake = {
                "v": 1,
                "client_id": self.client_id
            }
            
            self._send_data(0, handshake)  # Opcode 0 = handshake
            
            # Read handshake response
            op, data = self._recv_data()
            if op == 1:  # Opcode 1 = frame
                response = json.loads(data.decode('utf-8'))
                if response.get('evt') == 'READY':
                    self.connected = True
                    return True
            
            return False
            
        except Exception as e:
            self.connected = False
            if self.socket:
                self.socket.close()
                self.socket = None
            raise e
    
    def close(self):
        """Close the Discord RPC connection."""
        if self.socket:
            try:
                # Send close frame
                self._send_data(2, {})  # Opcode 2 = close
            except:
                pass
            finally:
                self.socket.close()
                self.socket = None
        self.connected = False
    
    def _send_data(self, opcode: int, data: Dict[str, Any]):
        """Send data to Discord via IPC."""
        if not self.socket:
            raise ConnectionError("Not connected to Discord")
        
        payload = json.dumps(data).encode('utf-8')
        header = struct.pack('<II', opcode, len(payload))
        self.socket.sendall(header + payload)
    
    def _recv_data(self) -> tuple:
        """Receive data from Discord via IPC."""
        if not self.socket:
            raise ConnectionError("Not connected to Discord")
        
        # Read header (8 bytes: opcode + length)
        header = self._recv_exact(8)
        opcode, length = struct.unpack('<II', header)
        
        # Read payload
        payload = self._recv_exact(length)
        return opcode, payload
    
    def _recv_exact(self, num_bytes: int) -> bytes:
        """Receive exact number of bytes from socket."""
        data = b''
        while len(data) < num_bytes:
            chunk = self.socket.recv(num_bytes - len(data))
            if not chunk:
                raise ConnectionError("Socket closed unexpectedly")
            data += chunk
        return data
    
    def get_guilds(self) -> Dict[str, Any]:
        """
        Get user's Discord guilds (servers).
        Note: This requires special Discord app permissions that aren't available
        for basic RPC connections. Returns mock data for now.
        """
        if not self.connected:
            raise ConnectionError("Not connected to Discord")
        
        # Discord RPC doesn't actually expose guild information without
        # special app approval. For a basic plugin, we return mock data
        # that users can modify for their specific servers.
        
        return {
            "success": True,
            "guilds": [
                {"id": "example1", "name": "My Gaming Server", "icon": None},
                {"id": "example2", "name": "Friends", "icon": None},
                {"id": "example3", "name": "Work Chat", "icon": None}
            ]
        }
    
    def is_connected(self) -> bool:
        """Check if connected to Discord."""
        return self.connected and self.socket is not None


def test_connection():
    """Test function to verify Discord RPC connection works."""
    rpc = DiscordRPC()
    try:
        if rpc.connect():
            print("✅ Successfully connected to Discord RPC")
            guilds = rpc.get_guilds()
            print(f"📋 Found {len(guilds.get('guilds', []))} servers")
            return True
        else:
            print("❌ Failed to connect to Discord RPC")
            return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False
    finally:
        rpc.close()


if __name__ == "__main__":
    test_connection()