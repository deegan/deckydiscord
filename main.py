"""Deckycord backend.

Discord is controlled by running Vesktop (a Discord desktop client) in the
background and driving it over the Chrome DevTools Protocol. See
py_modules/dd_vesktop.py for why the RPC socket approach could not work.
"""

import asyncio
import json
import time
from pathlib import Path

import decky  # type: ignore

import dd_update as update
import dd_vesktop as vesktop
from dd_cdp import Page, CDPError, list_targets

logger = decky.logger

PLUGIN_DIR = Path(decky.DECKY_PLUGIN_DIR)


def _client_js():
    for p in (PLUGIN_DIR / "defaults" / "deckydiscord_client.js",
              PLUGIN_DIR / "deckydiscord_client.js"):
        if p.exists():
            return p.read_text(encoding="utf-8")
    raise FileNotFoundError("deckydiscord_client.js missing from the plugin")


def _steamcord_installed():
    return (PLUGIN_DIR.parent / "Steamcord").is_dir()


class Plugin:
    page = None              # dd_cdp.Page connected to Discord
    status = "starting"      # backend phase while the page is not usable
    detail = ""
    supervisor = None
    wake = None              # asyncio.Event: retry now
    lock = None
    login_stuck_since = None # when the page was first seen stuck after login
    login_reloaded_at = None # last reload done to recover from that
    update_info = None       # last successful update check
    update_checked_at = 0.0

    # ── supervisor ──────────────────────────────────────────────────────────

    @classmethod
    def _set(cls, status, detail=""):
        if (status, detail) != (cls.status, cls.detail):
            logger.info(f"[state] {status} {detail}".rstrip())
        cls.status, cls.detail = status, detail

    @classmethod
    async def _drop_page(cls):
        page, cls.page = cls.page, None
        if page is not None:
            try:
                await page.close()
            except Exception:
                pass

    @classmethod
    async def _connect_page(cls):
        """Find Discord's page target, get past Vesktop's first-launch screen,
        and inject the client API."""
        for _ in range(60):
            targets = await list_targets(vesktop.CDP_PORT)
            pages = [t for t in targets if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
            target = next((t for t in pages if "discord.com" in t.get("url", "")), None) \
                or next(iter(pages), None)
            if target is None:
                await asyncio.sleep(1)
                continue
            page = Page(target)
            await page.connect()
            if "first-launch" in page.url:
                logger.info("[vesktop] accepting first-launch setup")
                try:
                    await page.evaluate("document.getElementById('submit')?.click()")
                finally:
                    await page.close()
                await asyncio.sleep(4)
                continue
            # Re-inject on every new document (logout reloads the page), and now.
            js = _client_js()
            await page.send("Page.addScriptToEvaluateOnNewDocument", {"source": js})
            await page.evaluate(js)
            return page
        raise RuntimeError("Vesktop has no Discord page")

    @classmethod
    async def _supervise(cls):
        backoff = 5
        while True:
            try:
                if cls.page is None or cls.page.closed:
                    await cls._drop_page()
                    if _steamcord_installed():
                        cls._set("conflict", "Steamcord is installed. Both plugins drive Vesktop; "
                                             "uninstall Steamcord to use Deckycord.")
                        raise _Wait(60)
                    if not await vesktop.cdp_up():
                        if not vesktop.installed():
                            if vesktop.backend() is None:
                                cls._set("no_backend", "Neither flatpak nor Vesktop is available on this system.")
                                raise _Wait(60)
                            cls._set("installing", "Installing Vesktop from Flathub. This can take a few minutes.")
                            if not await vesktop.install():
                                cls._set("error", "Installing Vesktop failed. Check your network and retry.")
                                raise _Wait(60)
                        cls._set("starting", "Starting Discord…")
                        if not await vesktop.launch():
                            cls._set("error", "Vesktop started but its debug port never opened.")
                            raise _Wait(30)
                    cls._set("starting", "Connecting to Discord…")
                    cls.page = await cls._connect_page()
                    cls._set("running")
                    backoff = 5
                # health check: a dead page stops answering
                await cls._recover_login()
                await cls._sleep(5)
            except asyncio.CancelledError:
                raise
            except _Wait as w:
                await cls._sleep(w.seconds)
            except Exception as e:
                logger.warning(f"[supervisor] {e!r}")
                await cls._drop_page()
                if cls.status == "running":
                    cls._set("starting", "Reconnecting to Discord…")
                await cls._sleep(backoff)
                backoff = min(backoff * 2, 60)

    @classmethod
    async def _recover_login(cls):
        """After a QR login, Discord can stay on a blank /login page in a hidden
        window even though it is authenticated. Reloading resumes the login."""
        stuck = await cls.page.evaluate("!!window.DECKYDISCORD?.loginStuck?.()", timeout=5)
        now = time.monotonic()
        if not stuck:
            cls.login_stuck_since = None
            return
        if cls.login_stuck_since is None:
            cls.login_stuck_since = now
        if now - cls.login_stuck_since < 4:
            return
        if cls.login_reloaded_at is not None and now - cls.login_reloaded_at < 60:
            return
        logger.info("[login] authenticated but stuck on the login page; reloading")
        cls.login_reloaded_at = now
        cls.login_stuck_since = None
        await cls.page.send("Page.reload")

    @classmethod
    async def _sleep(cls, seconds):
        try:
            await asyncio.wait_for(cls.wake.wait(), seconds)
        except asyncio.TimeoutError:
            pass
        cls.wake.clear()

    @classmethod
    async def _call(cls, method, *args, timeout=15):
        page = cls.page
        if page is None or page.closed:
            raise CDPError(cls.detail or "Discord is not running yet")
        expr = ("(async () => { const D = window.DECKYDISCORD;"
                " if (!D) return {__missing: true};"
                f" return await D.{method}(...{json.dumps(list(args))}); }})()")
        res = await page.evaluate(expr, timeout)
        if isinstance(res, dict) and res.get("__missing"):
            await page.evaluate(_client_js())
            res = await page.evaluate(expr, timeout)
        return res

    # ── callables ───────────────────────────────────────────────────────────

    async def get_state(self):
        if Plugin.page is None or Plugin.status != "running":
            return {"phase": Plugin.status, "message": Plugin.detail}
        try:
            return await Plugin._call("state", timeout=5)
        except Exception as e:
            return {"phase": "starting", "message": f"Waiting for Discord ({e})"}

    async def get_guilds(self):
        try:
            return {"ok": True, "guilds": await Plugin._call("guilds")}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def join_voice(self, channel_id: str, guild_id: str = ""):
        return await Plugin._action("join", channel_id, guild_id or None)

    async def leave_voice(self):
        return await Plugin._action("leave")

    async def toggle_mute(self):
        return await Plugin._action("toggleMute")

    async def toggle_deafen(self):
        return await Plugin._action("toggleDeafen")

    async def logout(self):
        return await Plugin._action("logout")

    async def check_update(self, force: bool = False):
        now = time.monotonic()
        if Plugin.update_info and not force and now - Plugin.update_checked_at < 3600:
            return Plugin.update_info
        try:
            info = await update.check(decky.DECKY_PLUGIN_VERSION)
        except Exception as e:
            logger.warning(f"[update] {e!r}")
            return {"ok": False, "current": decky.DECKY_PLUGIN_VERSION, "error": str(e)}
        Plugin.update_info, Plugin.update_checked_at = info, now
        return info

    async def restart_discord(self):
        logger.info("[vesktop] restart requested")
        await Plugin._drop_page()
        await vesktop.stop()
        Plugin._set("starting", "Restarting Discord…")
        Plugin.wake.set()
        return {"ok": True}

    @classmethod
    async def _action(cls, method, *args):
        try:
            return {"ok": True, "result": await Plugin._call(method, *args)}
        except Exception as e:
            logger.warning(f"[{method}] {e}")
            return {"ok": False, "error": str(e)}

    # ── lifecycle ───────────────────────────────────────────────────────────

    async def _main(self):
        Plugin.wake = asyncio.Event()
        Plugin.supervisor = asyncio.create_task(Plugin._supervise())
        logger.info("Deckycord loaded")

    async def _unload(self):
        # Leave Vesktop running so a Decky restart does not drop an active call.
        if Plugin.supervisor:
            Plugin.supervisor.cancel()
        await Plugin._drop_page()
        logger.info("Deckycord unloaded")

    async def _uninstall(self):
        await vesktop.stop()
        logger.info("Deckycord uninstalled; Vesktop stopped")


class _Wait(Exception):
    def __init__(self, seconds):
        super().__init__(seconds)
        self.seconds = seconds
