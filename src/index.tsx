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

function Content() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, pypresence_available: false });
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [favorites, setFavorites] = useState<Guild[]>([]);
  const [servers, setServers] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServerName, setNewServerName] = useState("");

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
      const response = await getGuilds();
      if (response.success && response.guilds) {
        setGuilds(response.guilds);
      } else {
        toaster.toast({
          title: "Failed to load servers",
          body: response.error || "Unknown error"
        });
      }
    } catch (error) {
      console.error("Failed to load guilds:", error);
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
        <PanelSection title="Discord Servers">
          {guilds.length > 0 ? (
            guilds.map((guild) => (
              <PanelSectionRow key={guild.id}>
                <Focusable style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px" }}>
                  <FaServer style={{ color: "#7289DA" }} />
                  <span>{guild.name}</span>
                </Focusable>
              </PanelSectionRow>
            ))
          ) : (
            <PanelSectionRow>
              <div style={{ color: "#888", fontStyle: "italic" }}>
                No servers found or loading...
              </div>
            </PanelSectionRow>
          )}
          
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
