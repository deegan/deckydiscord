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
  pypresence_available: boolean;
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

function Content() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, pypresence_available: false });
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
          title: "Server Added",
          body: `Added "${newServerName}" to your servers`
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

  const ServerRow = ({ server, isFavorite }: { server: Guild; isFavorite: boolean }) => {
    const isExpanded = expandedServer === server.id;
    const serverVoiceChannels = voiceChannels[server.id] || [];
    
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
                <FaServer style={{ color: isFavorite ? "#5865F2" : "#7289DA" }} />
                <span style={{ flex: 1 }}>{server.name}</span>
                <span style={{ fontSize: "0.8em", color: "#888" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </ButtonItem>
            
            {!server.configurable && (
              <div style={{ display: "flex", gap: "4px" }}>
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
        
        {!status.pypresence_available && (
          <PanelSectionRow>
            <div style={{ color: "#FFA500", fontSize: "0.9em" }}>
              pypresence library not installed. Install requirements.txt to enable Discord RPC.
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
            disabled={loading || !status.pypresence_available}
          >
            {loading ? "Connecting..." : status.connected ? "Disconnect" : "Connect to Discord"}
          </ButtonItem>
        </PanelSectionRow>
        
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handleDebug}
            disabled={!status.pypresence_available}
          >
            Debug Discord Connection
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

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
          
          <PanelSection title="Add Discord Servers">
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
              </>
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
