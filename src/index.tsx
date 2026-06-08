import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  Field,
  Focusable
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster
} from "@decky/api"
import { useState, useEffect } from "react";
import { FaDiscord, FaServer, FaExclamationTriangle } from "react-icons/fa";

interface ConnectionStatus {
  connected: boolean;
  error?: string;
  discord_sdk_available: boolean;
}

interface Guild {
  id: string;
  name: string;
  icon?: string;
  favorite?: boolean;
  configurable?: boolean;
}

interface VoiceChannel {
  id: string;
  name: string;
  user_limit: number;
  position: number;
}

interface GuildsResponse {
  success: boolean;
  guilds?: Guild[];
  error?: string;
}

const getConnectionStatus = callable<[], ConnectionStatus>("get_connection_status");
const connectToDiscord = callable<[], ConnectionStatus>("connect_to_discord");
const disconnectFromDiscord = callable<[], ConnectionStatus>("disconnect_from_discord");
const getGuilds = callable<[], GuildsResponse>("get_guilds");
const debugDiscordConnection = callable<[], any>("debug_discord_connection");
const checkForUpdates = callable<[], any>("check_for_updates");
const updatePlugin = callable<[], any>("update_plugin");
const getServers = callable<[], any>("get_servers");
const addServer = callable<[string], any>("add_server");
const removeServer = callable<[string], any>("remove_server");
const toggleFavorite = callable<[string], any>("toggle_favorite");
const getVoiceChannels = callable<[string], any>("get_voice_channels");
const joinVoiceChannel = callable<[string, string], any>("join_voice_channel");
const leaveVoiceChannel = callable<[string], any>("leave_voice_channel");
const discoverDiscordServers = callable<[], any>("discover_discord_servers");
const getOAuthUrl = callable<[], any>("get_oauth_url");
const muteVoice = callable<[], any>("mute_voice");
const unmuteVoice = callable<[], any>("unmute_voice");
const toggleDeafen = callable<[], any>("toggle_deafen");
const testRpcCommands = callable<[], any>("test_rpc_commands");

// New Discord Social SDK methods
const createLobby = callable<[string, number], any>("create_lobby");
const joinLobbyById = callable<[string], any>("join_lobby_by_id");
const createLobbyInvite = callable<[string], any>("create_lobby_invite");
const joinByInvite = callable<[string], any>("join_by_invite");

function Content() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, discord_sdk_available: false });
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [favorites, setFavorites] = useState<Guild[]>([]);
  const [servers, setServers] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [voiceChannels, setVoiceChannels] = useState<{[serverId: string]: VoiceChannel[]}>({});
  const [discoveredServers, setDiscoveredServers] = useState<any[]>([]);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showCreateLobby, setShowCreateLobby] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [newLobbyCapacity, setNewLobbyCapacity] = useState(10);
  const [showJoinLobby, setShowJoinLobby] = useState(false);
  const [joinLobbyCode, setJoinLobbyCode] = useState("");

  useEffect(() => {
    loadStatus();
    checkUpdates();
  }, []);

  const loadStatus = async () => {
    try {
      const connectionStatus = await getConnectionStatus();
      setStatus(connectionStatus);
      
      if (connectionStatus.connected) {
        await loadGuilds();
      }
    } catch (error) {
      console.error("Failed to get connection status:", error);
    }
  };

  const loadGuilds = async () => {
    try {
      const response = await getServers();
      console.log("Server response:", response); // Debug log
      
      if (response.success) {
        // Handle new response format with favorites and servers arrays
        const favs = response.favorites || [];
        const regs = response.servers || [];
        
        setFavorites(favs);
        setServers(regs);
        setGuilds([...favs, ...regs]); // Keep legacy guilds for compatibility
      } else {
        toaster.toast({
          title: "Failed to load servers",
          body: response.error || "Unknown error"
        });
      }
    } catch (error) {
      console.error("Failed to load servers:", error);
      toaster.toast({
        title: "Failed to load servers",
        body: "Network error"
      });
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await connectToDiscord();
      setStatus(result);
      
      if (result.connected) {
        await loadGuilds();
        toaster.toast({
          title: "Connected to Discord",
          body: "Successfully connected to Discord RPC"
        });
      } else {
        toaster.toast({
          title: "Connection failed",
          body: result.error || "Failed to connect to Discord"
        });
      }
    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const result = await disconnectFromDiscord();
      setStatus(result);
      setGuilds([]);
      toaster.toast({
        title: "Disconnected",
        body: "Disconnected from Discord RPC"
      });
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  const handleDebug = async () => {
    try {
      const result = await debugDiscordConnection();
      toaster.toast({
        title: result.socket_found ? "Debug: Socket Found!" : "Debug: No Socket",
        body: result.message
      });
      console.log("Discord Debug Result:", result);
    } catch (error) {
      console.error("Debug error:", error);
      toaster.toast({
        title: "Debug Failed",
        body: "Check console for details"
      });
    }
  };

  const checkUpdates = async () => {
    try {
      const result = await checkForUpdates();
      setUpdateInfo(result);
    } catch (error) {
      console.error("Update check failed:", error);
    }
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);
      const result = await updatePlugin();
      
      if (result.success) {
        toaster.toast({
          title: "Update Successful!",
          body: result.message || "Update completed successfully"
        });
        await checkUpdates();
      } else {
        // Show manual download option
        toaster.toast({
          title: "Auto-Update Failed",
          body: "Please download manually from GitHub releases"
        });
        
        if (updateInfo?.release_url) {
          // Could open browser to release page if supported
          console.log("Manual download:", updateInfo.release_url);
        }
      }
    } catch (error) {
      console.error("Update error:", error);
      toaster.toast({
        title: "Update Error", 
        body: "Auto-update failed. Please download manually from GitHub."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleServerClick = async (serverId: string) => {
    console.log("Frontend: Expanding server for voice channels:", serverId);
    
    if (expandedServer === serverId) {
      // Collapse if already expanded
      console.log("Frontend: Collapsing server");
      setExpandedServer(null);
    } else {
      // Expand and load voice channels
      console.log("Frontend: Loading voice channels...");
      setExpandedServer(serverId);
      if (!voiceChannels[serverId]) {
        try {
          const result = await getVoiceChannels(serverId);
          console.log("Frontend: Voice channels result:", result);
          if (result.success) {
            setVoiceChannels(prev => ({
              ...prev,
              [serverId]: result.voice_channels || []
            }));
          }
        } catch (error) {
          console.error("Failed to load voice channels:", error);
        }
      }
    }
  };

  const handleJoinVoice = async (channelId: string, serverId: string) => {
    try {
      const result = await joinVoiceChannel(channelId, serverId);
      toaster.toast({
        title: result.success ? "Joined Voice Channel" : "Join Failed",
        body: result.message || result.error || result.mock_action || "Unknown result"
      });
    } catch (error) {
      console.error("Failed to join voice channel:", error);
    }
  };

  const handleLeaveVoice = async (serverId: string) => {
    try {
      const result = await leaveVoiceChannel(serverId);
      toaster.toast({
        title: result.success ? "Left Voice Channel" : "Leave Failed", 
        body: result.message || result.error || result.mock_action || "Unknown result"
      });
    } catch (error) {
      console.error("Failed to leave voice channel:", error);
    }
  };

  const handleAddServer = async () => {
    if (!newServerName.trim()) return;
    
    try {
      const result = await addServer(newServerName.trim());
      if (result.success) {
        toaster.toast({
          title: result.server?.is_lobby ? "Lobby Created" : "Server Added",
          body: `${result.server?.is_lobby ? 'Created lobby' : 'Added server'} "${newServerName}"`
        });
        setNewServerName("");
        setShowAddServer(false);
        // Refresh server list
        await loadGuilds();
      } else {
        toaster.toast({
          title: "Failed to Add Server",
          body: result.error || "Unknown error"
        });
      }
    } catch (error) {
      console.error("Failed to add server:", error);
      toaster.toast({
        title: "Failed to Add Server",
        body: "Network error"
      });
    }
  };

  const handleCreateLobby = async () => {
    if (!newLobbyName.trim()) return;
    
    try {
      const result = await createLobby(newLobbyName.trim(), newLobbyCapacity);
      if (result.success) {
        toaster.toast({
          title: "Lobby Created",
          body: `Created "${newLobbyName}" with ${newLobbyCapacity} slots`
        });
        setNewLobbyName("");
        setNewLobbyCapacity(10);
        setShowCreateLobby(false);
        // Refresh server list
        await loadGuilds();
      } else {
        toaster.toast({
          title: "Failed to Create Lobby",
          body: result.error || "Unknown error"
        });
      }
    } catch (error) {
      console.error("Failed to create lobby:", error);
      toaster.toast({
        title: "Failed to Create Lobby",
        body: "Network error"
      });
    }
  };

  const handleJoinByCode = async () => {
    if (!joinLobbyCode.trim()) return;
    
    try {
      const result = await joinByInvite(joinLobbyCode.trim());
      if (result.success) {
        toaster.toast({
          title: "Joined Lobby",
          body: "Successfully joined lobby via invite code"
        });
        setJoinLobbyCode("");
        setShowJoinLobby(false);
        // Refresh server list
        await loadGuilds();
      } else {
        toaster.toast({
          title: "Failed to Join Lobby",
          body: result.error || "Invalid invite code"
        });
      }
    } catch (error) {
      console.error("Failed to join lobby:", error);
      toaster.toast({
        title: "Failed to Join Lobby",
        body: "Network error"
      });
    }
  };

  const handleCreateInvite = async (serverId: string) => {
    try {
      const result = await createLobbyInvite(serverId);
      if (result.success) {
        // Copy invite code to clipboard if possible
        toaster.toast({
          title: "Invite Created",
          body: `Invite code: ${result.invite_code}`
        });
      } else {
        toaster.toast({
          title: "Failed to Create Invite",
          body: result.error || "Unknown error"
        });
      }
    } catch (error) {
      console.error("Failed to create invite:", error);
      toaster.toast({
        title: "Failed to Create Invite",
        body: "Network error"
      });
    }
  };

  const toggleServerFavorite = async (serverId: string) => {
    try {
      const result = await toggleFavorite(serverId);
      if (result.success) {
        await loadGuilds(); // Refresh to show updated favorite status
        toaster.toast({
          title: "Updated Favorite",
          body: "Server favorite status updated"
        });
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const removeServerById = async (serverId: string) => {
    try {
      const result = await removeServer(serverId);
      if (result.success) {
        await loadGuilds(); // Refresh server list
        toaster.toast({
          title: "Server Removed",
          body: "Server removed from your list"
        });
      }
    } catch (error) {
      console.error("Failed to remove server:", error);
    }
  };

  const handleDiscoverServers = async () => {
    try {
      setLoading(true);
      console.log("Frontend: Starting server discovery...");
      
      const result = await discoverDiscordServers();
      console.log("Frontend: Discovery result:", result);
      
      if (result.success) {
        setDiscoveredServers(result.servers || []);
        setShowDiscovery(true);
        console.log("Frontend: Set discovered servers:", result.servers);
        
        toaster.toast({
          title: "Server Discovery Complete",
          body: `Found ${(result.servers || []).length} suggestions to add`
        });
      } else {
        toaster.toast({
          title: "Discovery Failed",
          body: result.error || "Could not discover servers"
        });
      }
    } catch (error) {
      console.error("Failed to discover servers:", error);
      toaster.toast({
        title: "Discovery Error",
        body: "Failed to contact Discord API"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDiscoveredServer = async (server: any) => {
    try {
      const result = await addServer(server.name);
      if (result.success) {
        toaster.toast({
          title: "Server Added",
          body: `Added "${server.name}" to your servers`
        });
        await loadGuilds(); // Refresh server list
      } else {
        toaster.toast({
          title: "Failed to Add Server", 
          body: result.error || "Unknown error"
        });
      }
    } catch (error) {
      console.error("Failed to add discovered server:", error);
      toaster.toast({
        title: "Add Server Error",
        body: "Failed to add server"
      });
    }
  };

  const handleGetOAuthHelp = async () => {
    try {
      const result = await getOAuthUrl();
      if (result.success) {
        setOauthInfo(result);
        setShowOAuthHelp(true);
        toaster.toast({
          title: "OAuth Help Ready",
          body: "Follow the instructions to authorize Discord access"
        });
      } else {
        toaster.toast({
          title: "OAuth Help Failed",
          body: result.error || "Could not generate OAuth URL"
        });
      }
    } catch (error) {
      console.error("Failed to get OAuth help:", error);
      toaster.toast({
        title: "OAuth Help Error",
        body: "Failed to get authorization help"
      });
    }
  };

  const handleMute = async () => {
    try {
      const result = await muteVoice();
      toaster.toast({
        title: result.success ? "Microphone Muted" : "Mute Failed",
        body: result.message || result.error || "Unknown result"
      });
    } catch (error) {
      console.error("Failed to mute:", error);
      toaster.toast({
        title: "Mute Error",
        body: "Failed to mute microphone"
      });
    }
  };

  const handleUnmute = async () => {
    try {
      const result = await unmuteVoice();
      toaster.toast({
        title: result.success ? "Microphone Unmuted" : "Unmute Failed",
        body: result.message || result.error || "Unknown result"
      });
    } catch (error) {
      console.error("Failed to unmute:", error);
      toaster.toast({
        title: "Unmute Error",
        body: "Failed to unmute microphone"
      });
    }
  };

  const handleToggleDeafen = async () => {
    try {
      const result = await toggleDeafen();
      toaster.toast({
        title: result.success ? "Audio Deafened" : "Deafen Failed",
        body: result.message || result.error || "Unknown result"
      });
    } catch (error) {
      console.error("Failed to toggle deafen:", error);
      toaster.toast({
        title: "Deafen Error",
        body: "Failed to toggle audio deafen"
      });
    }
  };

  const ServerRow = ({ server, isFavorite }: { server: Guild; isFavorite: boolean }) => {
    const isExpanded = expandedServer === server.id;
    const serverVoiceChannels = voiceChannels[server.id] || [];
    const isLobby = (server as any).is_lobby || false;
    
    return (
      <div>
        <PanelSectionRow>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px" }}>
            <ButtonItem
              layout="below"
              onClick={() => handleServerClick(server.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                {isLobby ? (
                  <span style={{ color: isFavorite ? "#5865F2" : "#7289DA" }}>🎮</span>
                ) : (
                  <FaServer style={{ color: isFavorite ? "#5865F2" : "#7289DA" }} />
                )}
                <span style={{ flex: 1 }}>{server.name}</span>
                {isLobby && (server as any).member_count !== undefined && (
                  <span style={{ fontSize: "0.7em", color: "#888" }}>
                    {(server as any).member_count}/{(server as any).capacity}
                  </span>
                )}
                <span style={{ fontSize: "0.8em", color: "#888" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </ButtonItem>
            
            {!server.configurable && (
              <div style={{ display: "flex", gap: "4px" }}>
                {isLobby && (
                  <ButtonItem
                    layout="below"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateInvite(server.id);
                    }}
                    style={{
                      fontSize: "0.7em",
                      padding: "3px 6px",
                      minWidth: "32px",
                      color: "#00ff88"
                    }}
                  >
                    📨
                  </ButtonItem>
                )}
                
                <ButtonItem
                  layout="below"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleServerFavorite(server.id);
                  }}
                  style={{
                    fontSize: "0.8em",
                    padding: "4px 8px",
                    minWidth: "32px",
                    color: isFavorite ? "#FFD700" : "#888"
                  }}
                >
                  {isFavorite ? "★" : "☆"}
                </ButtonItem>
                
                <ButtonItem
                  layout="below"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeServerById(server.id);
                  }}
                  style={{
                    fontSize: "0.8em",
                    padding: "4px 8px",
                    minWidth: "32px",
                    color: "#ff6b6b"
                  }}
                >
                  ✕
                </ButtonItem>
              </div>
            )}
          </div>
        </PanelSectionRow>
        
        {isExpanded && (
          <div style={{ marginLeft: "20px", borderLeft: "2px solid #444", paddingLeft: "10px" }}>
            {serverVoiceChannels.length > 0 ? (
              serverVoiceChannels.map((channel) => (
                <PanelSectionRow key={channel.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px" }}>
                    <span style={{ color: "#888", fontSize: "0.9em" }}>🎙️</span>
                    <span style={{ flex: 1, fontSize: "0.9em" }}>{channel.name}</span>
                    {channel.user_limit > 0 && (
                      <span style={{ fontSize: "0.8em", color: "#888" }}>
                        (0/{channel.user_limit})
                      </span>
                    )}
                    <ButtonItem
                      layout="below"
                      onClick={() => handleJoinVoice(channel.id, server.id)}
                      style={{ fontSize: "0.8em", padding: "2px 8px" }}
                    >
                      Join
                    </ButtonItem>
                  </div>
                </PanelSectionRow>
              ))
            ) : (
              <PanelSectionRow>
                <div style={{ color: "#888", fontStyle: "italic", fontSize: "0.9em", padding: "4px 8px" }}>
                  No voice channels found
                </div>
              </PanelSectionRow>
            )}
            
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={() => handleLeaveVoice(server.id)}
                style={{ fontSize: "0.8em", padding: "2px 8px" }}
              >
                Leave Voice Channel
              </ButtonItem>
            </PanelSectionRow>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <PanelSection title="Connection Status">
        <PanelSectionRow>
          <Field label="Status">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {status.connected ? (
                <>
                  <FaDiscord style={{ color: "#5865F2" }} />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <FaExclamationTriangle style={{ color: "#FFA500" }} />
                  <span>Disconnected</span>
                </>
              )}
            </div>
          </Field>
        </PanelSectionRow>
        
        {!status.discord_sdk_available && (
          <PanelSectionRow>
            <div style={{ color: "#FFA500", fontSize: "0.9em" }}>
              Discord Social SDK not available. Build native module: cd native && ./build.sh
            </div>
          </PanelSectionRow>
        )}
        
        {status.error && (
          <PanelSectionRow>
            <div style={{ color: "#FF4444", fontSize: "0.9em" }}>
              Error: {status.error}
            </div>
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={status.connected ? handleDisconnect : handleConnect}
            disabled={loading || !status.discord_sdk_available}
          >
            {loading ? "Connecting..." : status.connected ? "Disconnect" : "Connect to Discord"}
          </ButtonItem>
        </PanelSectionRow>
        
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handleDebug}
            disabled={!status.discord_sdk_available}
          >
            Debug Discord Connection
          </ButtonItem>
        </PanelSectionRow>
        
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={async () => {
              try {
                const result = await testRpcCommands();
                toaster.toast({
                  title: "RPC Test Complete",
                  body: result.summary || "Check logs for results"
                });
              } catch (error) {
                toaster.toast({
                  title: "RPC Test Failed",
                  body: "Failed to test RPC commands"
                });
              }
            }}
            disabled={!status.connected}
          >
            Test RPC Commands
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      {status.connected && (
        <PanelSection title="Voice Controls">
          <PanelSectionRow>
            <div style={{ display: "flex", gap: "8px" }}>
              <ButtonItem
                layout="below"
                onClick={handleMute}
                style={{ flex: 1, fontSize: "0.8em", padding: "8px", backgroundColor: "#ff4444" }}
              >
                🔇 Mute
              </ButtonItem>
              
              <ButtonItem
                layout="below"
                onClick={handleUnmute}
                style={{ flex: 1, fontSize: "0.8em", padding: "8px", backgroundColor: "#44ff44" }}
              >
                🎤 Unmute
              </ButtonItem>
            </div>
          </PanelSectionRow>
          
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={handleToggleDeafen}
              style={{ fontSize: "0.8em", padding: "8px", backgroundColor: "#4444ff" }}
            >
              🔕 Toggle Deafen
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}

      {status.connected && (
        <>
          {favorites.length > 0 && (
            <PanelSection title="⭐ Favorite Servers">
              {favorites.map((server) => (
                <ServerRow key={server.id} server={server} isFavorite={true} />
              ))}
            </PanelSection>
          )}
          
          {servers.length > 0 && (
            <PanelSection title="📋 All Servers">
              {servers.map((server) => (
                <ServerRow key={server.id} server={server} isFavorite={false} />
              ))}
              
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={loadGuilds}
                >
                  Refresh Servers
                </ButtonItem>
              </PanelSectionRow>
            </PanelSection>
          )}
          
          {(favorites.length === 0 && servers.length === 0) && (
            <PanelSection title="Server Management">
              <PanelSectionRow>
                <div style={{ color: "#888", fontStyle: "italic", textAlign: "center", padding: "16px" }}>
                  No servers configured yet.{"\n"}
                  Add your Discord servers below!
                </div>
              </PanelSectionRow>
              
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={loadGuilds}
                >
                  Load Default Servers
                </ButtonItem>
              </PanelSectionRow>
            </PanelSection>
          )}
          
          <PanelSection title="Discord Voice Lobbies">
            {!showCreateLobby ? (
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={() => setShowCreateLobby(true)}
                  disabled={loading}
                >
                  🎮 Create Voice Lobby
                </ButtonItem>
              </PanelSectionRow>
            ) : (
              <>
                <PanelSectionRow>
                  <Field label="Lobby Name">
                    <input
                      type="text"
                      value={newLobbyName}
                      onChange={(e) => setNewLobbyName(e.target.value)}
                      placeholder="My Voice Lobby"
                      style={{
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#2a2a2a",
                        color: "#fff",
                        border: "1px solid #444",
                        borderRadius: "4px"
                      }}
                    />
                  </Field>
                </PanelSectionRow>
                
                <PanelSectionRow>
                  <Field label="Max Members">
                    <input
                      type="number"
                      value={newLobbyCapacity}
                      onChange={(e) => setNewLobbyCapacity(Math.max(2, Math.min(25, parseInt(e.target.value) || 10)))}
                      min="2"
                      max="25"
                      style={{
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#2a2a2a",
                        color: "#fff",
                        border: "1px solid #444",
                        borderRadius: "4px"
                      }}
                    />
                  </Field>
                </PanelSectionRow>
                
                <PanelSectionRow>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <ButtonItem
                      layout="below"
                      onClick={handleCreateLobby}
                      disabled={!newLobbyName.trim() || loading}
                      style={{ flex: 1, backgroundColor: "#5865F2" }}
                    >
                      Create Lobby
                    </ButtonItem>
                    <ButtonItem
                      layout="below"
                      onClick={() => {
                        setShowCreateLobby(false);
                        setNewLobbyName("");
                        setNewLobbyCapacity(10);
                      }}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </ButtonItem>
                  </div>
                </PanelSectionRow>
              </>
            )}
            
            {!showJoinLobby ? (
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={() => setShowJoinLobby(true)}
                  disabled={loading}
                >
                  📨 Join by Invite Code
                </ButtonItem>
              </PanelSectionRow>
            ) : (
              <>
                <PanelSectionRow>
                  <Field label="Invite Code">
                    <input
                      type="text"
                      value={joinLobbyCode}
                      onChange={(e) => setJoinLobbyCode(e.target.value)}
                      placeholder="Paste invite code here"
                      style={{
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#2a2a2a",
                        color: "#fff",
                        border: "1px solid #444",
                        borderRadius: "4px"
                      }}
                    />
                  </Field>
                </PanelSectionRow>
                
                <PanelSectionRow>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <ButtonItem
                      layout="below"
                      onClick={handleJoinByCode}
                      disabled={!joinLobbyCode.trim() || loading}
                      style={{ flex: 1, backgroundColor: "#00ff88" }}
                    >
                      Join Lobby
                    </ButtonItem>
                    <ButtonItem
                      layout="below"
                      onClick={() => {
                        setShowJoinLobby(false);
                        setJoinLobbyCode("");
                      }}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </ButtonItem>
                  </div>
                </PanelSectionRow>
              </>
            )}
          </PanelSection>
          
          <PanelSection title="Add Discord Servers (Legacy)">
            {!showDiscovery ? (
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={handleDiscoverServers}
                  disabled={loading}
                >
                  🔍 Discover Your Discord Servers
                </ButtonItem>
              </PanelSectionRow>
            ) : (
              <>
                <PanelSectionRow>
                  <div style={{ fontSize: "0.9em", color: "#ccc", marginBottom: "8px" }}>
                    {discoveredServers.length > 0 ? "Select servers to add:" : "No servers found"}
                  </div>
                </PanelSectionRow>
                
                {discoveredServers.map((server, index) => (
                  <PanelSectionRow key={server.id || index}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "8px", 
                      padding: "8px",
                      backgroundColor: "#2a2a2a",
                      borderRadius: "4px",
                      margin: "2px 0"
                    }}>
                      <span style={{ flex: 1, fontSize: "0.9em" }}>{server.name}</span>
                      <span style={{ fontSize: "0.7em", color: "#888" }}>
                        {server.source === "api" ? "📡" : "💡"}
                      </span>
                      <ButtonItem
                        layout="below"
                        onClick={() => handleAddDiscoveredServer(server)}
                        style={{ fontSize: "0.8em", padding: "4px 8px" }}
                      >
                        Add
                      </ButtonItem>
                    </div>
                  </PanelSectionRow>
                ))}
                
                <PanelSectionRow>
                  <ButtonItem
                    layout="below"
                    onClick={() => {
                      setShowDiscovery(false);
                      setDiscoveredServers([]);
                    }}
                  >
                    Close Discovery
                  </ButtonItem>
                </PanelSectionRow>
                
                <PanelSectionRow>
                  <div style={{ fontSize: "0.8em", color: "#888", fontStyle: "italic" }}>
                    📡 = Real Discord servers, 💡 = Common suggestions
                  </div>
                </PanelSectionRow>
                
                {/* Show OAuth help if we only have suggestions */}
                {discoveredServers.length > 0 && discoveredServers.every(s => s.source === "suggestion") && (
                  <PanelSectionRow>
                    <ButtonItem
                      layout="below"
                      onClick={handleGetOAuthHelp}
                      style={{ fontSize: "0.8em", padding: "4px 8px", backgroundColor: "#5865F2" }}
                    >
                      🔐 Get Real Discord Servers (OAuth Setup)
                    </ButtonItem>
                  </PanelSectionRow>
                )}
              </>
            )}
            
            {/* OAuth Help Section */}
            {showOAuthHelp && oauthInfo && (
              <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#1a1a1a", borderRadius: "6px" }}>
                <div style={{ fontSize: "0.9em", fontWeight: "bold", marginBottom: "8px", color: "#5865F2" }}>
                  🔐 Discord OAuth Authorization Required
                </div>
                <div style={{ fontSize: "0.8em", color: "#ccc", marginBottom: "8px" }}>
                  To see your real Discord servers, you need to authorize this app:
                </div>
                
                {oauthInfo.instructions.map((instruction: string, index: number) => (
                  <div key={index} style={{ fontSize: "0.8em", color: "#aaa", margin: "4px 0" }}>
                    {instruction}
                  </div>
                ))}
                
                <div style={{ fontSize: "0.7em", color: "#888", marginTop: "8px", wordBreak: "break-all" }}>
                  OAuth URL: {oauthInfo.oauth_url}
                </div>
                
                <ButtonItem
                  layout="below"
                  onClick={() => setShowOAuthHelp(false)}
                  style={{ fontSize: "0.8em", padding: "4px 8px", marginTop: "8px" }}
                >
                  Close Help
                </ButtonItem>
              </div>
            )}
          </PanelSection>
        </>
      )}

      <PanelSection title="Plugin Management">
        <PanelSectionRow>
          <Field label="Version">
            <span style={{ fontSize: "0.9em" }}>
              {updateInfo?.current_version || "Unknown"}
            </span>
          </Field>
        </PanelSectionRow>
        
        {updateInfo?.update_available && (
          <PanelSectionRow>
            <div style={{ color: "#5865F2", fontSize: "0.9em" }}>
              Update available: {updateInfo.latest_version}
            </div>
          </PanelSectionRow>
        )}
        
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={updateInfo?.update_available ? handleUpdate : checkUpdates}
            disabled={loading}
          >
            {loading ? "Updating..." : updateInfo?.update_available ? "Update Now" : "Check for Updates"}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
};

export default definePlugin(() => {
  console.log("Deckycord plugin initializing")

  return {
    name: "Deckycord",
    titleView: <div className={staticClasses.Title}>Deckycord</div>,
    content: <Content />,
    icon: <FaDiscord />,
    onDismount() {
      console.log("Deckycord plugin unloading")
    },
  };
});
