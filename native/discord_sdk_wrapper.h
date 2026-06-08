#ifndef DISCORD_SDK_WRAPPER_H
#define DISCORD_SDK_WRAPPER_H

#include <string>
#include <vector>
#include <functional>
#include <memory>
#include <unordered_map>

// Forward declare Discord Social SDK types
// Note: Discord Social SDK uses different structure than Game SDK
// These will be properly included from discordpp.h and cdiscord.h
struct IDiscordCore;
struct IDiscordLobbyManager;
struct IDiscordVoiceManager;

// C++ wrapper for Discord Social SDK functionality
class DiscordSDKWrapper {
public:
    // Initialization and cleanup
    DiscordSDKWrapper(const std::string& client_id);
    ~DiscordSDKWrapper();

    bool Initialize();
    void Shutdown();
    void RunCallbacks();

    // Connection status
    bool IsConnected() const;
    std::string GetLastError() const;

    // User management
    struct UserInfo {
        std::string id;
        std::string username;
        std::string discriminator;
        std::string avatar;
    };
    UserInfo GetCurrentUser() const;

    // Lobby management
    struct LobbyInfo {
        std::string id;
        std::string name;
        std::string owner_id;
        int32_t capacity;
        int32_t member_count;
        bool voice_enabled;
        std::vector<UserInfo> members;
    };

    // Create and manage lobbies
    std::string CreateLobby(const std::string& name, int32_t capacity = 10);
    bool JoinLobby(const std::string& lobby_id);
    bool LeaveLobby(const std::string& lobby_id);
    bool DeleteLobby(const std::string& lobby_id);
    
    // Get lobby information
    std::vector<LobbyInfo> GetJoinedLobbies() const;
    LobbyInfo GetLobbyInfo(const std::string& lobby_id) const;
    
    // Invite management
    std::string CreateLobbyInvite(const std::string& lobby_id, int32_t max_age_seconds = 3600);
    bool AcceptInvite(const std::string& invite_code);

    // Voice functionality
    struct VoiceState {
        bool is_muted;
        bool is_deafened;
        bool is_connected;
        std::string lobby_id;
        float input_volume;
        float output_volume;
    };

    // Voice control
    bool StartVoiceCall(const std::string& lobby_id);
    bool EndVoiceCall(const std::string& lobby_id);
    bool SetSelfMute(bool muted);
    bool SetSelfDeafen(bool deafened);
    bool SetSelfMuteAll(bool muted);
    
    // Voice state queries
    VoiceState GetVoiceState() const;
    bool IsInVoiceCall() const;
    std::string GetCurrentVoiceLobby() const;

    // Volume controls
    bool SetInputVolume(float volume); // 0.0 - 1.0
    bool SetOutputVolume(float volume); // 0.0 - 1.0
    float GetInputVolume() const;
    float GetOutputVolume() const;

    // Event callbacks
    using LobbyJoinedCallback = std::function<void(const std::string& lobby_id)>;
    using LobbyLeftCallback = std::function<void(const std::string& lobby_id)>;
    using VoiceStateChangedCallback = std::function<void(const VoiceState& state)>;
    using UserJoinedCallback = std::function<void(const std::string& lobby_id, const UserInfo& user)>;
    using UserLeftCallback = std::function<void(const std::string& lobby_id, const UserInfo& user)>;
    using ErrorCallback = std::function<void(const std::string& error)>;

    void SetLobbyJoinedCallback(LobbyJoinedCallback callback);
    void SetLobbyLeftCallback(LobbyLeftCallback callback);
    void SetVoiceStateChangedCallback(VoiceStateChangedCallback callback);
    void SetUserJoinedCallback(UserJoinedCallback callback);
    void SetUserLeftCallback(UserLeftCallback callback);
    void SetErrorCallback(ErrorCallback callback);

private:
    // Internal implementation
    struct IDiscordCore* core_;
    std::string client_id_;
    std::string last_error_;
    bool initialized_;
    
    // Current state
    UserInfo current_user_;
    std::unordered_map<std::string, LobbyInfo> joined_lobbies_;
    VoiceState current_voice_state_;
    
    // Callbacks
    LobbyJoinedCallback on_lobby_joined_;
    LobbyLeftCallback on_lobby_left_;
    VoiceStateChangedCallback on_voice_state_changed_;
    UserJoinedCallback on_user_joined_;
    UserLeftCallback on_user_left_;
    ErrorCallback on_error_;

    // Internal helper methods
    void UpdateLobbyCache();
    void UpdateVoiceState();
    void OnDiscordEvent();
    void SetError(const std::string& error);
    
    // Discord SDK event handlers
    void OnLobbyUpdate(const discord::Lobby& lobby);
    void OnLobbyMemberUpdate(const discord::Lobby& lobby, const discord::User& user);
    void OnVoiceUpdate();
};

#endif // DISCORD_SDK_WRAPPER_H