#!/usr/bin/env python3
"""
Test script for Discord Social SDK integration.
Verifies that the build process completed successfully.
"""

import sys
import os
import importlib.util

def test_import(module_name, module_path=None):
    """Test if a module can be imported."""
    try:
        if module_path:
            # Import from specific path
            spec = importlib.util.spec_from_file_location(module_name, module_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        else:
            # Regular import
            __import__(module_name)
        return True, None
    except Exception as e:
        return False, str(e)

def main():
    print("=== Deckycord Discord Social SDK Build Test ===\n")
    
    # Test 1: Check if py_modules directory exists
    py_modules_path = os.path.join(os.path.dirname(__file__), "py_modules")
    if os.path.exists(py_modules_path):
        print("✓ py_modules directory found")
    else:
        print("✗ py_modules directory not found")
        return False
    
    # Test 2: Add py_modules to path
    if py_modules_path not in sys.path:
        sys.path.insert(0, py_modules_path)
    print("✓ py_modules added to Python path")
    
    # Test 3: Try to import the high-level wrapper
    success, error = test_import("discord_social_sdk")
    if success:
        print("✓ discord_social_sdk module imports successfully")
    else:
        print(f"✗ Failed to import discord_social_sdk: {error}")
        print("  Note: This is expected if native module isn't built yet")
    
    # Test 4: Try to import the native module
    native_modules = [f for f in os.listdir(py_modules_path) if f.startswith("discord_sdk_native")]
    if native_modules:
        print(f"✓ Found native module: {native_modules[0]}")
        
        # Try to import it
        module_name = native_modules[0].split('.')[0]  # Remove extension
        success, error = test_import(module_name)
        if success:
            print("✓ Native module imports successfully")
            
            # Test basic functionality
            try:
                import discord_social_sdk
                sdk = discord_social_sdk.DiscordSocialSDK()
                if sdk.is_available():
                    print("✓ Discord Social SDK is available")
                else:
                    print("! Discord Social SDK available but native module reports not available")
                    print("  (This may be normal if Discord SDK libraries aren't linked)")
            except Exception as e:
                print(f"! Could not test SDK availability: {e}")
        else:
            print(f"✗ Failed to import native module: {error}")
    else:
        print("✗ No native module found in py_modules")
        print("  Build the native module with: cd native && ./build.sh")
    
    # Test 5: Check for Discord SDK directory
    discord_sdk_path = os.path.join(os.path.dirname(__file__), "native", "discord_sdk")
    if os.path.exists(discord_sdk_path):
        print("✓ Discord SDK directory found")
        
        # Check for key SDK files
        include_path = os.path.join(discord_sdk_path, "include", "discord", "discord.h")
        if os.path.exists(include_path):
            print("✓ Discord SDK headers found")
        else:
            print("! Discord SDK headers not found")
            print("  Expected: native/discord_sdk/include/discord/discord.h")
        
        # Check for library files
        lib_dirs = ["lib/linux/x86_64", "lib/macos", "lib/win/x86_64"]
        found_lib = False
        for lib_dir in lib_dirs:
            lib_path = os.path.join(discord_sdk_path, lib_dir)
            if os.path.exists(lib_path):
                libs = os.listdir(lib_path)
                if libs:
                    print(f"✓ Discord SDK libraries found: {libs}")
                    found_lib = True
                    break
        
        if not found_lib:
            print("! Discord SDK libraries not found")
            print("  Check native/discord_sdk/lib/ directory")
    else:
        print("✗ Discord SDK not found at native/discord_sdk/")
        print("  Download from: https://discord.com/developers/social-sdk")
    
    # Test 6: Check build files
    build_path = os.path.join(os.path.dirname(__file__), "native", "build")
    if os.path.exists(build_path):
        print("✓ Native build directory exists")
    else:
        print("! Native build directory not found")
        print("  Run: cd native && ./build.sh")
    
    # Test 7: Check frontend build
    src_path = os.path.join(os.path.dirname(__file__), "src", "index.tsx")
    if os.path.exists(src_path):
        print("✓ Frontend source found")
    else:
        print("✗ Frontend source not found")
    
    package_json_path = os.path.join(os.path.dirname(__file__), "package.json")
    if os.path.exists(package_json_path):
        print("✓ package.json found")
    else:
        print("✗ package.json not found")
    
    print("\n=== Build Test Summary ===")
    print("To complete the setup:")
    print("1. Download Discord Social SDK to native/discord_sdk/")
    print("2. Run: make all")
    print("3. Test with: python3 test_build.py")
    
    return True

if __name__ == "__main__":
    main()