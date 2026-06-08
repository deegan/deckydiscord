cmake_minimum_required(VERSION 3.12)
project(DiscordSDKNative)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(pybind11 REQUIRED)

# Discord Social SDK Configuration
# You'll need to download the Discord Social SDK from Discord Developer Portal
# and extract it to a 'discord_social_sdk' directory
set(DISCORD_SDK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/discord_social_sdk")

# Check if Discord SDK exists
if(NOT EXISTS "${DISCORD_SDK_DIR}")
    message(WARNING "Discord Social SDK not found at ${DISCORD_SDK_DIR}")
    message(WARNING "Please download Discord Social SDK from https://discord.com/developers/social-sdk")
    message(WARNING "and extract it to the 'discord_sdk' directory")
endif()

# Check for correct header files
if(NOT EXISTS "${DISCORD_SDK_DIR}/include/discordpp.h")
    message(WARNING "Discord SDK headers not found")
    message(WARNING "Expected: ${DISCORD_SDK_DIR}/include/discordpp.h")
    message(WARNING "Please ensure Discord Social SDK is properly extracted")
endif()

# Include Discord SDK headers
include_directories("${DISCORD_SDK_DIR}/include")

# Discord SDK library paths (adjust based on platform)
if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    set(DISCORD_LIB_ARCH "x86_64")
else()
    set(DISCORD_LIB_ARCH "x86")
endif()

# Platform-specific library configuration
if(UNIX AND NOT APPLE)
    # Linux
    set(DISCORD_LIB_DIR "${DISCORD_SDK_DIR}/lib/release")
    set(DISCORD_LIB_NAME "discord_partner_sdk")
    set(DISCORD_LIB_EXT ".so")
elseif(APPLE)
    # macOS
    set(DISCORD_LIB_DIR "${DISCORD_SDK_DIR}/lib/release")
    set(DISCORD_LIB_NAME "discord_partner_sdk")
    set(DISCORD_LIB_EXT ".dylib")
elseif(WIN32)
    # Windows
    set(DISCORD_LIB_DIR "${DISCORD_SDK_DIR}/lib/release")
    set(DISCORD_LIB_NAME "discord_partner_sdk")
    set(DISCORD_LIB_EXT ".dll")
endif()

# Find Discord library
find_library(DISCORD_LIBRARY 
    NAMES ${DISCORD_LIB_NAME}
    PATHS "${DISCORD_LIB_DIR}"
    NO_DEFAULT_PATH
)

if(NOT DISCORD_LIBRARY)
    message(WARNING "Discord SDK library not found in ${DISCORD_LIB_DIR}")
    message(WARNING "Expected library: lib${DISCORD_LIB_NAME}${DISCORD_LIB_EXT}")
    message(WARNING "Available files in ${DISCORD_LIB_DIR}:")
    file(GLOB LIB_FILES "${DISCORD_LIB_DIR}/*")
    foreach(FILE ${LIB_FILES})
        message(WARNING "  ${FILE}")
    endforeach()
endif()

# Source files
set(SOURCES
    discord_sdk_wrapper.cpp
    python_bindings.cpp
)

# Create the Python module
pybind11_add_module(discord_sdk_native ${SOURCES})

# Link libraries
if(DISCORD_LIBRARY)
    target_link_libraries(discord_sdk_native PRIVATE ${DISCORD_LIBRARY})
else()
    # Create a stub version without Discord SDK for development
    target_compile_definitions(discord_sdk_native PRIVATE DISCORD_SDK_STUB)
    message(STATUS "Building stub version without Discord SDK")
endif()

# Compiler-specific options
target_compile_definitions(discord_sdk_native PRIVATE VERSION_INFO=${EXAMPLE_VERSION_INFO})

# Platform-specific settings
if(UNIX)
    # Linux/macOS specific settings
    target_compile_options(discord_sdk_native PRIVATE -fPIC)
    target_link_libraries(discord_sdk_native PRIVATE pthread)
    
    # Add rpath for Discord library
    if(DISCORD_LIBRARY)
        set_target_properties(discord_sdk_native PROPERTIES
            INSTALL_RPATH "${DISCORD_LIB_DIR}"
            BUILD_WITH_INSTALL_RPATH TRUE
        )
    endif()
elseif(WIN32)
    # Windows specific settings
    if(DISCORD_LIBRARY)
        # Copy Discord DLL to output directory
        add_custom_command(TARGET discord_sdk_native POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${DISCORD_LIB_DIR}/${DISCORD_LIB_NAME}.dll"
            $<TARGET_FILE_DIR:discord_sdk_native>
        )
    endif()
endif()

# Installation
install(TARGETS discord_sdk_native DESTINATION .)

# Development convenience - copy to py_modules for testing
add_custom_command(TARGET discord_sdk_native POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
    $<TARGET_FILE:discord_sdk_native>
    "${CMAKE_CURRENT_SOURCE_DIR}/../py_modules/"
    COMMENT "Copying built module to py_modules for testing"
)