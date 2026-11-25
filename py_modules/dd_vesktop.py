"""Run Vesktop (a real Discord desktop client) in the background and expose its
Chrome DevTools port, so the plugin can drive it from Gaming Mode.

Why not the Discord RPC socket: it needs the Discord desktop app running in the
same session, and voice control over RPC needs OAuth scopes (rpc, rpc.voice.*)
that Discord only grants to approved apps. Running our own client and talking to
it over CDP avoids both problems, and mic/audio work natively because it is a
normal Electron app in the user's PipeWire session.

The launch logic (environment repair, display detection, systemd-run) is adapted
from Steamcord (https://github.com/Necrosiak/Steamcord, BSD-3-Clause).
"""

import asyncio
import os
import re
import shutil
from pathlib import Path
from subprocess import DEVNULL, PIPE

import decky  # type: ignore

logger = decky.logger

CDP_PORT = 39224                 # Steamcord uses 39223; keep clear of it
VESKTOP_APP = "dev.vencord.Vesktop"
UNIT = "deckydiscord-vesktop"

# The backend inherits plugin_loader's (systemd) PATH. Append the usual extra
# roots so shutil.which finds flatpak/systemd-run on any distro.
_EXTRA_PATH = (
    "/run/wrappers/bin", "/run/current-system/sw/bin", "~/.nix-profile/bin",
    "~/.local/bin", "/usr/local/bin", "/usr/bin", "/bin",
    "/usr/local/sbin", "/usr/sbin", "/sbin",
)


def _ensure_path():
    cur = [d for d in os.environ.get("PATH", "").split(os.pathsep) if d]
    seen = set(cur)
    for d in _EXTRA_PATH:
        d = os.path.expanduser(d)
        if d not in seen and os.path.isdir(d):
            seen.add(d)
            cur.append(d)
    os.environ["PATH"] = os.pathsep.join(cur)


_ensure_path()


# ── processes ────────────────────────────────────────────────────────────────

def proc_pids(cmdline_rx):
    rx = re.compile(cmdline_rx)
    me = os.getpid()
    out = []
    for name in os.listdir("/proc"):
        if not name.isdigit() or int(name) == me:
            continue
        try:
            with open(f"/proc/{name}/cmdline", "rb") as f:
                argv = f.read().replace(b"\0", b" ").decode("utf-8", "replace")
        except OSError:
            continue
        if rx.search(argv):
            out.append(int(name))
    return out


def _comm_running(comm_rx):
    rx = re.compile(comm_rx)
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            with open(f"/proc/{name}/comm", encoding="utf-8") as f:
                if rx.fullmatch(f.read().strip()):
                    return True
        except OSError:
            continue
    return False


# Any Vesktop process, and only the main one (not Chromium's --type= children:
# killing the zygote/GPU process under the parent makes it crash-loop).
_ANY_VESKTOP = r"[Vv]esktop"
_MAIN_VESKTOP = r"(?s)\A(?!.*--type=).*[Vv]esktop"


def running():
    return bool(proc_pids(_ANY_VESKTOP))


# ── backend detection / install ─────────────────────────────────────────────

def _native_bin():
    return shutil.which("vesktop") or shutil.which("vesktop-bin")


def _flatpak_installed():
    return any((base / "app" / VESKTOP_APP).is_dir()
               for base in (Path.home() / ".local/share/flatpak", Path("/var/lib/flatpak")))


def backend():
    """'flatpak' | 'native' | None."""
    has_flatpak = shutil.which("flatpak") is not None
    if has_flatpak and _flatpak_installed():
        return "flatpak"
    if _native_bin():
        return "native"
    if has_flatpak:
        return "flatpak"
    return None


def installed():
    b = backend()
    return b == "native" or (b == "flatpak" and _flatpak_installed())


def user_env():
    """Environment for talking to the *user* systemd/D-Bus.

    plugin_loader is a root system service; the backend runs as the deck user but
    inherits root's XDG_RUNTIME_DIR/DBUS address, and PyInstaller's
    LD_LIBRARY_PATH (an old libcrypto that breaks systemd-run/flatpak). This was
    the "no access to the socket" problem: nothing in the user session is
    reachable with the inherited environment."""
    uid = os.getuid()
    rt = f"/run/user/{uid}"
    env = {**os.environ, "XDG_RUNTIME_DIR": rt, "DBUS_SESSION_BUS_ADDRESS": f"unix:path={rt}/bus"}
    orig = env.pop("LD_LIBRARY_PATH_ORIG", None)
    if orig is not None:
        env["LD_LIBRARY_PATH"] = orig
    else:
        env.pop("LD_LIBRARY_PATH", None)
    env.pop("LD_PRELOAD", None)
    return env


async def _run(*args, timeout=None):
    proc = await asyncio.create_subprocess_exec(*args, stdout=PIPE, stderr=PIPE, env=user_env())
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")


async def install():
    """User-level flatpak install of Vesktop (no root/polkit prompt)."""
    if backend() != "flatpak":
        return False
    await _run("flatpak", "remote-add", "--user", "--if-not-exists", "flathub",
               "https://flathub.org/repo/flathub.flatpakrepo", timeout=120)
    code, _, err = await _run("flatpak", "install", "--user", "-y", "--noninteractive",
                              "flathub", VESKTOP_APP, timeout=1800)
    if code != 0:
        logger.error(f"[vesktop] flatpak install failed ({code}): {err.strip()[-500:]}")
    return _flatpak_installed()


# ── display / session environment ───────────────────────────────────────────

async def _session_env():
    try:
        _, out, _ = await _run("systemctl", "--user", "show-environment", timeout=10)
    except Exception:
        return {}
    env = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            env[k] = v
    return env


def _any_display(rt):
    try:
        for p in Path(rt).iterdir():
            if (p.name.startswith("wayland-") or p.name.startswith("gamescope-")) and p.is_socket():
                return True
    except OSError:
        pass
    try:
        return any(Path("/tmp/.X11-unix").iterdir())
    except OSError:
        return False


def _steam_display_env():
    """DISPLAY/XAUTHORITY of the running Steam client. In Gaming Mode that is
    gamescope's XWayland, the one display we know is usable."""
    pids = []
    try:
        pids.append(Path("~/.steampid").expanduser().read_text().strip())
    except OSError:
        pass
    uid = os.getuid()
    for p in Path("/proc").iterdir():
        if not p.name.isdigit():
            continue
        try:
            if p.stat().st_uid == uid and (p / "comm").read_text().strip() == "steam":
                pids.append(p.name)
        except OSError:
            continue
    for pid in pids:
        out = {}
        try:
            for item in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0"):
                k, _, v = item.partition(b"=")
                if k in (b"DISPLAY", b"XAUTHORITY"):
                    out[k.decode()] = v.decode(errors="ignore")
        except OSError:
            continue
        if out.get("DISPLAY"):
            return out
    return {}


async def cdp_up():
    import aiohttp  # type: ignore
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"http://127.0.0.1:{CDP_PORT}/json/version",
                             timeout=aiohttp.ClientTimeout(total=3)) as r:
                return r.status == 200
    except Exception:
        return False


async def _unit_active():
    try:
        code, _, _ = await _run("systemctl", "--user", "is-active", "--quiet", UNIT, timeout=10)
        return code == 0
    except Exception:
        return False


async def _kill_vesktop():
    if not running():
        return
    if backend() == "flatpak":
        try:
            await _run("flatpak", "kill", VESKTOP_APP, timeout=15)
        except Exception:
            pass
    import signal
    for pid in proc_pids(_MAIN_VESKTOP):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    for _ in range(10):
        if not running():
            return
        await asyncio.sleep(1)


async def stop():
    try:
        await _run("systemctl", "--user", "stop", UNIT, timeout=20)
    except Exception:
        pass
    await _kill_vesktop()


async def launch():
    """Start Vesktop with remote debugging on CDP_PORT. True once the port is up."""
    if await cdp_up():
        return True
    rt = f"/run/user/{os.getuid()}"
    for _ in range(120):
        if _any_display(rt):
            break
        await asyncio.sleep(1)

    # Our unit may still be coming up; give it a moment before replacing it.
    if await _unit_active():
        for _ in range(15):
            if await cdp_up():
                return True
            await asyncio.sleep(1)
    # Electron is single-instance: a Vesktop started without our flags (or a
    # hung one) would just swallow the new launch. Stop everything first.
    await stop()
    try:
        await _run("systemctl", "--user", "reset-failed", UNIT, timeout=10)
    except Exception:
        pass

    session = await _session_env()
    gamescope = (not _comm_running("kwin_wayland|kwin_x11")
                 and _comm_running("gamescope|gamescope-wl"))
    display = session.get("DISPLAY", ":0")
    xauth = session.get("XAUTHORITY", "")
    if gamescope:
        steam = _steam_display_env()
        if steam.get("DISPLAY"):
            display = steam["DISPLAY"]
            xauth = steam.get("XAUTHORITY", xauth)
    wayland = "wayland-0"
    if not gamescope and session.get("WAYLAND_DISPLAY"):
        wl = session["WAYLAND_DISPLAY"]
        if (Path(wl) if wl.startswith("/") else Path(rt) / wl).is_socket():
            wayland = wl

    setenv = [
        f"--setenv=DISPLAY={display}",
        f"--setenv=WAYLAND_DISPLAY={wayland}",
        f"--setenv=XDG_RUNTIME_DIR={rt}",
        f"--setenv=DBUS_SESSION_BUS_ADDRESS={session.get('DBUS_SESSION_BUS_ADDRESS', f'unix:path={rt}/bus')}",
    ]
    if xauth:
        setenv.append(f"--setenv=XAUTHORITY={xauth}")
    extra = []
    if gamescope:
        # Under pure gamescope there is no wayland-0; pin rendering to XWayland.
        extra.append("--ozone-platform=x11")

    b = backend()
    if b == "flatpak":
        cmd = ["flatpak", "run", VESKTOP_APP]
        stop_cmd = f"{shutil.which('flatpak')} kill {VESKTOP_APP}"
    elif b == "native":
        cmd = [_native_bin()]
        pk = shutil.which("pkill")
        stop_cmd = f"{pk} -f {_ANY_VESKTOP}" if pk else None
    else:
        return False

    props = ["--property=TimeoutStopSec=8", "--property=KillMode=mixed"]
    if stop_cmd:
        props.append(f"--property=ExecStop={stop_cmd}")

    logger.info(f"[vesktop] launching ({b}) DISPLAY={display} gamescope={gamescope}")
    proc = await asyncio.create_subprocess_exec(
        "systemd-run", "--user", "--collect", f"--unit={UNIT}", *props, *setenv, *cmd,
        f"--remote-debugging-port={CDP_PORT}",
        "--remote-allow-origins=*",
        "--start-minimized",
        # keep the gateway heartbeat alive while the window is hidden
        "--disable-background-timer-throttling",
        # VAAPI decode gives green frames on the Deck
        "--disable-accelerated-video-decode",
        *extra,
        stdout=DEVNULL, stderr=PIPE, env=user_env(),
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        logger.error(f"[vesktop] systemd-run failed: {err.decode(errors='replace').strip()}")
        return False
    for i in range(60):
        if await cdp_up():
            logger.info(f"[vesktop] DevTools port up after ~{i}s")
            return True
        await asyncio.sleep(1)
    try:
        _, out, _ = await _run("journalctl", "--user", "-u", UNIT, "-n", "15",
                               "--no-pager", "-o", "cat", timeout=10)
        for line in out.splitlines():
            logger.warning(f"[vesktop] {line[:300]}")
    except Exception:
        pass
    return False
