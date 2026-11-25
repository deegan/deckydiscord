"""Minimal Chrome DevTools Protocol client for Vesktop's Discord page."""

import asyncio
import json

import aiohttp  # type: ignore


class CDPError(RuntimeError):
    pass


async def list_targets(port):
    async with aiohttp.ClientSession() as s:
        async with s.get(f"http://127.0.0.1:{port}/json",
                         timeout=aiohttp.ClientTimeout(total=5)) as r:
            return await r.json(content_type=None)


class Page:
    def __init__(self, target):
        self.target = target
        self.url = target.get("url", "")
        self._session = None
        self._ws = None
        self._reader = None
        self._next_id = 0
        self._pending = {}

    @property
    def closed(self):
        return self._ws is None or self._ws.closed

    async def connect(self):
        self._session = aiohttp.ClientSession()
        try:
            self._ws = await self._session.ws_connect(
                self.target["webSocketDebuggerUrl"], max_msg_size=0)
        except BaseException:
            await self._session.close()
            raise
        self._reader = asyncio.create_task(self._read())

    async def _read(self):
        try:
            async for msg in self._ws:
                if msg.type != aiohttp.WSMsgType.TEXT:
                    continue
                data = json.loads(msg.data)
                fut = self._pending.pop(data.get("id"), None)
                if fut is not None and not fut.done():
                    fut.set_result(data)
        except Exception:
            pass
        finally:
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(CDPError("DevTools connection closed"))
            self._pending.clear()

    async def send(self, method, params=None, timeout=15):
        if self.closed:
            raise CDPError("DevTools connection closed")
        self._next_id += 1
        msg_id = self._next_id
        fut = asyncio.get_running_loop().create_future()
        self._pending[msg_id] = fut
        await self._ws.send_str(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        try:
            data = await asyncio.wait_for(fut, timeout)
        finally:
            self._pending.pop(msg_id, None)
        if "error" in data:
            raise CDPError(data["error"].get("message", "CDP error"))
        return data.get("result", {})

    async def evaluate(self, expression, timeout=15):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
            "userGesture": True,
        }, timeout)
        if "exceptionDetails" in res:
            det = res["exceptionDetails"]
            text = (det.get("exception") or {}).get("description") or det.get("text") or "JS exception"
            raise CDPError(text.splitlines()[0])
        return (res.get("result") or {}).get("value")

    async def close(self):
        try:
            if self._ws is not None:
                await self._ws.close()
        finally:
            if self._session is not None:
                await self._session.close()
            if self._reader is not None:
                self._reader.cancel()
