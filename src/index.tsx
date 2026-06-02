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
      toaster.toast({
        title: result.success ? "Update Successful" : "Update Failed",
        body: result.message
      });
      if (result.success) {
        // Refresh update info
        await checkUpdates();
      }
    } catch (error) {
      console.error("Update error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleServerClick = async (serverId: string) => {
    if (expandedServer === serverId) {
      // Collapse if already expanded
      setExpandedServer(null);
    } else {
      // Expand and load voice channels
      setExpandedServer(serverId);
      if (!voiceChannels[serverId]) {
        try {
          const result = await getVoiceChannels(serverId);
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

  const ServerRow = ({ server, isFavorite }: { server: Guild; isFavorite: boolean }) => {
    const isExpanded = expandedServer === server.id;
    const serverVoiceChannels = voiceChannels[server.id] || [];
    
    return (
      <div>
        <PanelSectionRow>
          <Focusable 
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px", cursor: "pointer" }}
            onClick={() => handleServerClick(server.id)}
          >
            <FaServer style={{ color: isFavorite ? "#5865F2" : "#7289DA" }} />
            <span style={{ flex: 1 }}>{server.name}</span>
            <span style={{ fontSize: "0.8em", color: "#888" }}>
              {isExpanded ? "▲" : "▼"}
            </span>
          </Focusable>
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
          
          {guilds.length === 0 && (
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
