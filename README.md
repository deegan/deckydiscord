# Deckycord

Discord voice chat in Steam Gaming Mode, from the Quick Access Menu. This is a
[Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin.

- Log in by scanning a QR code with the Discord mobile app
- Browse your servers and see who is in each voice channel
- Join and leave voice channels
- Mute and deafen
- See who is in your call, who is muted, and who is speaking

## How it works

Earlier versions talked to the Discord RPC socket. That cannot work from Gaming
Mode, for two reasons:

- **No Discord to talk to.** The RPC socket only exists while the Discord desktop
  app is running in the user's session. The Decky backend is started by a system
  service and inherits root's `XDG_RUNTIME_DIR` and D-Bus address, so it cannot
  even see the user session.
- **No permission for voice.** Controlling voice over RPC needs the `rpc` and
  `rpc.voice.*` OAuth scopes, which Discord grants only to approved apps.

Deckycord now works the way [Steamcord](https://github.com/Necrosiak/Steamcord)
does. It runs [Vesktop](https://github.com/Vencord/Vesktop), a complete Discord
desktop client, hidden in the background. It starts Vesktop with Chrome
DevTools enabled on `127.0.0.1:39224` and controls Discord through that
connection. Because Vesktop is a normal desktop app in your session, the
microphone and voice audio work as usual.

- `py_modules/dd_vesktop.py` installs Vesktop (a user-level flatpak from
  Flathub, or a native `vesktop` already on `PATH`). It repairs the
  environment, picks the display Steam is using (gamescope's XWayland in Gaming
  Mode), and starts Vesktop as the `deckydiscord-vesktop` user systemd unit.
- `py_modules/dd_cdp.py` is a small DevTools client.
- `defaults/deckydiscord_client.js` is injected into the Discord page. It
  exposes `window.DECKYDISCORD` (state, servers, join and leave, mute and
  deafen, log out) using Discord's own stores through Vencord.
- `main.py` restarts Vesktop when it dies, re-injects the client, and exposes
  the plugin's callables to the frontend.

## Install

Download `Deckycord-vX.Y.Z.zip` from the
[releases](https://github.com/deegan/deckydiscord/releases). Then, in Decky:
Settings → Developer → Install Plugin from ZIP.

The first time it runs, the plugin installs Vesktop from Flathub. This takes a
few minutes and needs a network connection. Then open Deckycord in the Quick
Access Menu and scan the QR code. On your phone, open Discord → Settings → Scan
QR Code. Your login is kept across reboots.

### Updates

Deckycord checks the `manifest.json` attached to the latest GitHub release. When
there is a newer version, use the update button at the bottom of the panel.
Decky's installer downloads the zip, verifies its SHA-256 and replaces the
plugin. Your Discord login is kept. Versions before 0.4.1 need one manual ZIP
install first.

### Notes

- **Don't run Deckycord and Steamcord together.** Both run their own copy of
  Vesktop, and Electron allows only one instance. Deckycord refuses to start
  while Steamcord is installed.
- **Deckycord takes over Vesktop.** If you also use Vesktop in Desktop Mode,
  Deckycord stops it and restarts it with DevTools enabled. Your login is
  shared.
- **CAPTCHA at login.** If Discord asks for a CAPTCHA, the QR code never logs
  you in. Log in once from Vesktop in Desktop Mode instead.

## Development

```bash
npx pnpm@9 install
npx pnpm@9 run typecheck
npx pnpm@9 run build
```

To release, run `./scripts/release.sh 0.4.1`. It bumps the version, builds,
tags, and pushes. CI then attaches the zip and its `manifest.json` to the GitHub
release.

## Credits

The Vesktop launch logic and the use of Discord's internal stores are adapted
from [Steamcord](https://github.com/Necrosiak/Steamcord) by Necrosiak
(BSD-3-Clause); its license is in `LICENSE.Steamcord`.
