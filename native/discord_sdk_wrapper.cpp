#include "discord_sdk_wrapper.h"
#include <discordpp.h>
#include <cdiscord.h>
#include <iostream>
#include <chrono>
#include <thread>

DiscordSDKWrapper::DiscordSDKWrapper(const std::string& client_id)
    : client_id_(client_id), initialized_(false), last_error_("") {
    current_voice_state_ = {};
    current_voice_state_.is_muted = false;
    current_voice_state_.is_deafened = false;
    current_voice_state_.is_connected = false;
    current_voice_state_.input_volume = 1.0f;
    current_voice_state_.output_volume = 1.0f;
}

DiscordSDKWrapper::~DiscordSDKWrapper() {
    Shutdown();
}

bool DiscordSDKWrapper::Initialize() {
    if (initialized_) {
        return true;
    }

#ifdef DISCORD_SDK_STUB
    // Stub implementation when Discord SDK is not available
    SetError("Discord SDK not linked - stub mode");
    return false;
#else
    try {
        // TODO: Replace with actual Discord Social SDK initialization
        // The exact API calls depend on the Discord Social SDK documentation
        // which needs to be referenced once the SDK is properly installed
        
        // Parse client ID
        int64_t client_id_num = std::stoll(client_id_);
        
        // Initialize Discord Social SDK core
        // This is a placeholder - actual implementation needs Discord Social SDK API
        SetError("Discord Social SDK integration needs implementation with actual SDK");
        return false;
        
        // Example of what the actual implementation might look like:
        /*
        // Initialize Discord Social SDK
        auto result = DiscordCreate(client_id_num, &core_);
        if (result != DISCORD_RESULT_OK) {
            SetError("Failed to create Discord Core");
            return false;
        }
        
        // Set up event handlers for lobby and voice events
        // Configure callbacks for lobby updates, member changes, voice state
        
        initialized_ = true;
        return true;
        */
    }
    catch (const std::exception& e) {
        SetError("Exception during initialization: " + std::string(e.what()));
        return false;
    }
#endif
}

void DiscordSDKWrapper::Shutdown() {
    if (!initialized_) {
        return;
    }

    // Leave all lobbies before shutdown
    for (const auto& lobby_pair : joined_lobbies_) {
        LeaveLobby(lobby_pair.first);
    }

    core_.reset();
    initialized_ = false;
}

void DiscordSDKWrapper::RunCallbacks() {
    if (!initialized_ || !core_) {
        return;
    }

    try {
        core_->RunCallbacks();
    }
    catch (const std::exception& e) {
        SetError("Exception in RunCallbacks: " + std::string(e.what()));
    }
}

bool DiscordSDKWrapper::IsConnected() const {
    return initialized_ && core_ != nullptr;
}

std::string DiscordSDKWrapper::GetLastError() const {
    return last_error_;
}

DiscordSDKWrapper::UserInfo DiscordSDKWrapper::GetCurrentUser() const {
    return current_user_;
}

std::string DiscordSDKWrapper::CreateLobby(const std::string& name, int32_t capacity) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return "";
    }

    auto& lobby_manager = core_->LobbyManager();
    discord::LobbyTransaction transaction{};
    
    // Set lobby properties
    transaction.SetCapacity(capacity);
    transaction.SetType(discord::LobbyType::Public);
    
    // Set metadata
    transaction.SetMetadata("name", name.c_str());
    transaction.SetMetadata("voice_enabled", "true");

    std::string lobby_id = "";
    lobby_manager.CreateLobby(transaction, [this, &lobby_id](discord::Result result, discord::Lobby const& lobby) {
        if (result == discord::Result::Ok) {
            lobby_id = std::to_string(lobby.GetId());
            
            // Add to our cache
            LobbyInfo info;
            info.id = lobby_id;
            info.name = lobby.GetMetadataValue("name");
            info.owner_id = std::to_string(lobby.GetOwnerId());
            info.capacity = lobby.GetCapacity();
            info.member_count = lobby.GetMemberCount();
            info.voice_enabled = true;
            
            joined_lobbies_[lobby_id] = info;
            
            if (on_lobby_joined_) {
                on_lobby_joined_(lobby_id);
            }
        } else {
            SetError("Failed to create lobby: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback (simple synchronous approach)
    auto start_time = std::chrono::steady_clock::now();
    while (lobby_id.empty() && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(5)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return lobby_id;
}

bool DiscordSDKWrapper::JoinLobby(const std::string& lobby_id) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& lobby_manager = core_->LobbyManager();
    int64_t id = std::stoll(lobby_id);
    
    bool success = false;
    lobby_manager.JoinLobby(id, "", [this, lobby_id, &success](discord::Result result) {
        if (result == discord::Result::Ok) {
            success = true;
            UpdateLobbyCache();
            if (on_lobby_joined_) {
                on_lobby_joined_(lobby_id);
            }
        } else {
            SetError("Failed to join lobby: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (!success && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(5)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return success;
}

bool DiscordSDKWrapper::LeaveLobby(const std::string& lobby_id) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& lobby_manager = core_->LobbyManager();
    int64_t id = std::stoll(lobby_id);
    
    bool success = false;
    lobby_manager.DisconnectLobby(id, [this, lobby_id, &success](discord::Result result) {
        if (result == discord::Result::Ok) {
            success = true;
            joined_lobbies_.erase(lobby_id);
            if (on_lobby_left_) {
                on_lobby_left_(lobby_id);
            }
        } else {
            SetError("Failed to leave lobby: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (!success && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(3)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return success;
}

bool DiscordSDKWrapper::DeleteLobby(const std::string& lobby_id) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& lobby_manager = core_->LobbyManager();
    int64_t id = std::stoll(lobby_id);
    
    bool success = false;
    lobby_manager.DeleteLobby(id, [this, lobby_id, &success](discord::Result result) {
        if (result == discord::Result::Ok) {
            success = true;
            joined_lobbies_.erase(lobby_id);
            if (on_lobby_left_) {
                on_lobby_left_(lobby_id);
            }
        } else {
            SetError("Failed to delete lobby: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (!success && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(3)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return success;
}

std::vector<DiscordSDKWrapper::LobbyInfo> DiscordSDKWrapper::GetJoinedLobbies() const {
    std::vector<LobbyInfo> lobbies;
    for (const auto& pair : joined_lobbies_) {
        lobbies.push_back(pair.second);
    }
    return lobbies;
}

DiscordSDKWrapper::LobbyInfo DiscordSDKWrapper::GetLobbyInfo(const std::string& lobby_id) const {
    auto it = joined_lobbies_.find(lobby_id);
    if (it != joined_lobbies_.end()) {
        return it->second;
    }
    return {}; // Return empty struct if not found
}

std::string DiscordSDKWrapper::CreateLobbyInvite(const std::string& lobby_id, int32_t max_age_seconds) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return "";
    }

    auto& lobby_manager = core_->LobbyManager();
    int64_t id = std::stoll(lobby_id);
    
    std::string invite_code = "";
    lobby_manager.CreateLobbyInvite(id, [&invite_code, this](discord::Result result, char const* invite) {
        if (result == discord::Result::Ok) {
            invite_code = std::string(invite);
        } else {
            SetError("Failed to create invite: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (invite_code.empty() && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(3)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return invite_code;
}

bool DiscordSDKWrapper::AcceptInvite(const std::string& invite_code) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& lobby_manager = core_->LobbyManager();
    
    bool success = false;
    lobby_manager.AcceptInvite(invite_code.c_str(), [this, &success](discord::Result result, discord::Lobby const& lobby) {
        if (result == discord::Result::Ok) {
            success = true;
            UpdateLobbyCache();
            if (on_lobby_joined_) {
                on_lobby_joined_(std::to_string(lobby.GetId()));
            }
        } else {
            SetError("Failed to accept invite: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (!success && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(5)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return success;
}

bool DiscordSDKWrapper::StartVoiceCall(const std::string& lobby_id) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& voice_manager = core_->VoiceManager();
    int64_t id = std::stoll(lobby_id);
    
    bool success = false;
    voice_manager.CreateCall(id, [this, lobby_id, &success](discord::Result result) {
        if (result == discord::Result::Ok) {
            success = true;
            current_voice_state_.is_connected = true;
            current_voice_state_.lobby_id = lobby_id;
            UpdateVoiceState();
            if (on_voice_state_changed_) {
                on_voice_state_changed_(current_voice_state_);
            }
        } else {
            SetError("Failed to start voice call: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (!success && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(5)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return success;
}

bool DiscordSDKWrapper::EndVoiceCall(const std::string& lobby_id) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& voice_manager = core_->VoiceManager();
    int64_t id = std::stoll(lobby_id);
    
    bool success = false;
    voice_manager.DestroyCall(id, [this, &success](discord::Result result) {
        if (result == discord::Result::Ok) {
            success = true;
            current_voice_state_.is_connected = false;
            current_voice_state_.lobby_id = "";
            UpdateVoiceState();
            if (on_voice_state_changed_) {
                on_voice_state_changed_(current_voice_state_);
            }
        } else {
            SetError("Failed to end voice call: " + std::to_string(static_cast<int>(result)));
        }
    });

    // Wait for callback
    auto start_time = std::chrono::steady_clock::now();
    while (!success && 
           std::chrono::steady_clock::now() - start_time < std::chrono::seconds(3)) {
        RunCallbacks();
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return success;
}

bool DiscordSDKWrapper::SetSelfMute(bool muted) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& voice_manager = core_->VoiceManager();
    voice_manager.SetSelfMute(muted);
    current_voice_state_.is_muted = muted;
    
    if (on_voice_state_changed_) {
        on_voice_state_changed_(current_voice_state_);
    }
    
    return true;
}

bool DiscordSDKWrapper::SetSelfDeafen(bool deafened) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& voice_manager = core_->VoiceManager();
    voice_manager.SetSelfDeaf(deafened);
    current_voice_state_.is_deafened = deafened;
    
    if (on_voice_state_changed_) {
        on_voice_state_changed_(current_voice_state_);
    }
    
    return true;
}

bool DiscordSDKWrapper::SetSelfMuteAll(bool muted) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    // Discord Social SDK's SetSelfMuteAll affects all calls
    auto& voice_manager = core_->VoiceManager();
    // Note: This is a global mute that affects all voice calls
    // For now, we'll use the regular SetSelfMute
    voice_manager.SetSelfMute(muted);
    current_voice_state_.is_muted = muted;
    
    if (on_voice_state_changed_) {
        on_voice_state_changed_(current_voice_state_);
    }
    
    return true;
}

DiscordSDKWrapper::VoiceState DiscordSDKWrapper::GetVoiceState() const {
    return current_voice_state_;
}

bool DiscordSDKWrapper::IsInVoiceCall() const {
    return current_voice_state_.is_connected;
}

std::string DiscordSDKWrapper::GetCurrentVoiceLobby() const {
    return current_voice_state_.lobby_id;
}

bool DiscordSDKWrapper::SetInputVolume(float volume) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& voice_manager = core_->VoiceManager();
    voice_manager.SetInputVolume(static_cast<uint8_t>(volume * 100));
    current_voice_state_.input_volume = volume;
    return true;
}

bool DiscordSDKWrapper::SetOutputVolume(float volume) {
    if (!initialized_ || !core_) {
        SetError("SDK not initialized");
        return false;
    }

    auto& voice_manager = core_->VoiceManager();
    voice_manager.SetOutputVolume(static_cast<uint8_t>(volume * 100));
    current_voice_state_.output_volume = volume;
    return true;
}

float DiscordSDKWrapper::GetInputVolume() const {
    return current_voice_state_.input_volume;
}

float DiscordSDKWrapper::GetOutputVolume() const {
    return current_voice_state_.output_volume;
}

// Callback setters
void DiscordSDKWrapper::SetLobbyJoinedCallback(LobbyJoinedCallback callback) {
    on_lobby_joined_ = callback;
}

void DiscordSDKWrapper::SetLobbyLeftCallback(LobbyLeftCallback callback) {
    on_lobby_left_ = callback;
}

void DiscordSDKWrapper::SetVoiceStateChangedCallback(VoiceStateChangedCallback callback) {
    on_voice_state_changed_ = callback;
}

void DiscordSDKWrapper::SetUserJoinedCallback(UserJoinedCallback callback) {
    on_user_joined_ = callback;
}

void DiscordSDKWrapper::SetUserLeftCallback(UserLeftCallback callback) {
    on_user_left_ = callback;
}

void DiscordSDKWrapper::SetErrorCallback(ErrorCallback callback) {
    on_error_ = callback;
}

// Private helper methods
void DiscordSDKWrapper::UpdateLobbyCache() {
    if (!initialized_ || !core_) {
        return;
    }

    // Update lobby information from Discord SDK
    // This would typically iterate through lobbies and update the cache
    // Implementation depends on specific Discord SDK lobby enumeration methods
}

void DiscordSDKWrapper::UpdateVoiceState() {
    if (!initialized_ || !core_) {
        return;
    }

    // Update voice state from Discord SDK
    // This would query current voice settings and update current_voice_state_
}

void DiscordSDKWrapper::SetError(const std::string& error) {
    last_error_ = error;
    std::cerr << "Discord SDK Error: " << error << std::endl;
    
    if (on_error_) {
        on_error_(error);
    }
}