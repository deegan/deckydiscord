#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>
#include "discord_sdk_wrapper.h"

namespace py = pybind11;

PYBIND11_MODULE(discord_sdk_native, m) {
    m.doc() = "Discord Social SDK Python bindings for Deckycord";

    // UserInfo struct
    py::class_<DiscordSDKWrapper::UserInfo>(m, "UserInfo")
        .def(py::init<>())
        .def_readwrite("id", &DiscordSDKWrapper::UserInfo::id)
        .def_readwrite("username", &DiscordSDKWrapper::UserInfo::username)
        .def_readwrite("discriminator", &DiscordSDKWrapper::UserInfo::discriminator)
        .def_readwrite("avatar", &DiscordSDKWrapper::UserInfo::avatar)
        .def("__repr__", [](const DiscordSDKWrapper::UserInfo& u) {
            return "<UserInfo id=" + u.id + " username=" + u.username + ">";
        });

    // LobbyInfo struct
    py::class_<DiscordSDKWrapper::LobbyInfo>(m, "LobbyInfo")
        .def(py::init<>())
        .def_readwrite("id", &DiscordSDKWrapper::LobbyInfo::id)
        .def_readwrite("name", &DiscordSDKWrapper::LobbyInfo::name)
        .def_readwrite("owner_id", &DiscordSDKWrapper::LobbyInfo::owner_id)
        .def_readwrite("capacity", &DiscordSDKWrapper::LobbyInfo::capacity)
        .def_readwrite("member_count", &DiscordSDKWrapper::LobbyInfo::member_count)
        .def_readwrite("voice_enabled", &DiscordSDKWrapper::LobbyInfo::voice_enabled)
        .def_readwrite("members", &DiscordSDKWrapper::LobbyInfo::members)
        .def("__repr__", [](const DiscordSDKWrapper::LobbyInfo& l) {
            return "<LobbyInfo id=" + l.id + " name=" + l.name + " members=" + std::to_string(l.member_count) + ">";
        });

    // VoiceState struct
    py::class_<DiscordSDKWrapper::VoiceState>(m, "VoiceState")
        .def(py::init<>())
        .def_readwrite("is_muted", &DiscordSDKWrapper::VoiceState::is_muted)
        .def_readwrite("is_deafened", &DiscordSDKWrapper::VoiceState::is_deafened)
        .def_readwrite("is_connected", &DiscordSDKWrapper::VoiceState::is_connected)
        .def_readwrite("lobby_id", &DiscordSDKWrapper::VoiceState::lobby_id)
        .def_readwrite("input_volume", &DiscordSDKWrapper::VoiceState::input_volume)
        .def_readwrite("output_volume", &DiscordSDKWrapper::VoiceState::output_volume)
        .def("__repr__", [](const DiscordSDKWrapper::VoiceState& v) {
            return "<VoiceState connected=" + std::string(v.is_connected ? "true" : "false") + 
                   " muted=" + std::string(v.is_muted ? "true" : "false") + 
                   " lobby=" + v.lobby_id + ">";
        });

    // Main DiscordSDKWrapper class
    py::class_<DiscordSDKWrapper>(m, "DiscordSDKWrapper")
        .def(py::init<const std::string&>(), 
             "Create Discord SDK wrapper with client ID",
             py::arg("client_id"))
        
        // Initialization and cleanup
        .def("initialize", &DiscordSDKWrapper::Initialize,
             "Initialize the Discord SDK")
        .def("shutdown", &DiscordSDKWrapper::Shutdown,
             "Shutdown the Discord SDK")
        .def("run_callbacks", &DiscordSDKWrapper::RunCallbacks,
             "Process Discord SDK callbacks - call this regularly")
        
        // Status methods
        .def("is_connected", &DiscordSDKWrapper::IsConnected,
             "Check if connected to Discord")
        .def("get_last_error", &DiscordSDKWrapper::GetLastError,
             "Get the last error message")
        .def("get_current_user", &DiscordSDKWrapper::GetCurrentUser,
             "Get current user information")
        
        // Lobby management
        .def("create_lobby", &DiscordSDKWrapper::CreateLobby,
             "Create a new lobby",
             py::arg("name"), py::arg("capacity") = 10)
        .def("join_lobby", &DiscordSDKWrapper::JoinLobby,
             "Join an existing lobby",
             py::arg("lobby_id"))
        .def("leave_lobby", &DiscordSDKWrapper::LeaveLobby,
             "Leave a lobby",
             py::arg("lobby_id"))
        .def("delete_lobby", &DiscordSDKWrapper::DeleteLobby,
             "Delete a lobby (owner only)",
             py::arg("lobby_id"))
        .def("get_joined_lobbies", &DiscordSDKWrapper::GetJoinedLobbies,
             "Get list of joined lobbies")
        .def("get_lobby_info", &DiscordSDKWrapper::GetLobbyInfo,
             "Get information about a specific lobby",
             py::arg("lobby_id"))
        
        // Invite management
        .def("create_lobby_invite", &DiscordSDKWrapper::CreateLobbyInvite,
             "Create an invite code for a lobby",
             py::arg("lobby_id"), py::arg("max_age_seconds") = 3600)
        .def("accept_invite", &DiscordSDKWrapper::AcceptInvite,
             "Accept a lobby invite",
             py::arg("invite_code"))
        
        // Voice functionality
        .def("start_voice_call", &DiscordSDKWrapper::StartVoiceCall,
             "Start voice call in lobby",
             py::arg("lobby_id"))
        .def("end_voice_call", &DiscordSDKWrapper::EndVoiceCall,
             "End voice call in lobby",
             py::arg("lobby_id"))
        .def("set_self_mute", &DiscordSDKWrapper::SetSelfMute,
             "Mute/unmute microphone",
             py::arg("muted"))
        .def("set_self_deafen", &DiscordSDKWrapper::SetSelfDeafen,
             "Deafen/undeafen audio",
             py::arg("deafened"))
        .def("set_self_mute_all", &DiscordSDKWrapper::SetSelfMuteAll,
             "Mute/unmute microphone across all calls",
             py::arg("muted"))
        
        // Voice state queries
        .def("get_voice_state", &DiscordSDKWrapper::GetVoiceState,
             "Get current voice state")
        .def("is_in_voice_call", &DiscordSDKWrapper::IsInVoiceCall,
             "Check if currently in a voice call")
        .def("get_current_voice_lobby", &DiscordSDKWrapper::GetCurrentVoiceLobby,
             "Get ID of current voice lobby")
        
        // Volume controls
        .def("set_input_volume", &DiscordSDKWrapper::SetInputVolume,
             "Set microphone input volume (0.0-1.0)",
             py::arg("volume"))
        .def("set_output_volume", &DiscordSDKWrapper::SetOutputVolume,
             "Set audio output volume (0.0-1.0)",
             py::arg("volume"))
        .def("get_input_volume", &DiscordSDKWrapper::GetInputVolume,
             "Get current input volume")
        .def("get_output_volume", &DiscordSDKWrapper::GetOutputVolume,
             "Get current output volume")
        
        // Event callbacks
        .def("set_lobby_joined_callback", &DiscordSDKWrapper::SetLobbyJoinedCallback,
             "Set callback for when lobby is joined",
             py::arg("callback"))
        .def("set_lobby_left_callback", &DiscordSDKWrapper::SetLobbyLeftCallback,
             "Set callback for when lobby is left",
             py::arg("callback"))
        .def("set_voice_state_changed_callback", &DiscordSDKWrapper::SetVoiceStateChangedCallback,
             "Set callback for voice state changes",
             py::arg("callback"))
        .def("set_user_joined_callback", &DiscordSDKWrapper::SetUserJoinedCallback,
             "Set callback for when user joins lobby",
             py::arg("callback"))
        .def("set_user_left_callback", &DiscordSDKWrapper::SetUserLeftCallback,
             "Set callback for when user leaves lobby",
             py::arg("callback"))
        .def("set_error_callback", &DiscordSDKWrapper::SetErrorCallback,
             "Set callback for error events",
             py::arg("callback"));

    // Utility functions
    m.def("get_version", []() {
        return "Discord SDK Native Bridge v1.0.0";
    }, "Get version information");
    
    m.def("test_sdk_available", []() {
        try {
            DiscordSDKWrapper wrapper("123456789");
            return true;
        } catch (...) {
            return false;
        }
    }, "Test if Discord SDK is available");
}