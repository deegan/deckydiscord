"""Update check against the manifest attached to the latest GitHub release.

Only the check happens here. Plugin folders belong to root while the plugin runs
as the deck user, so the frontend hands the result to Decky's own installer,
which verifies the SHA-256 and replaces the whole folder.
"""

import asyncio
import json
import os
import re
import ssl
import urllib.request

REPO = "https://github.com/deegan/deckydiscord"
MANIFEST_URL = f"{REPO}/releases/latest/download/manifest.json"

# Decky's bundled Python has no default CA path on SteamOS.
_CA_FILES = ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem",
             "/etc/pki/tls/certs/ca-bundle.crt")


def parse_version(v):
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", v) if isinstance(v, str) else None
    if not m:
        raise ValueError(f"bad version: {v!r}")
    return tuple(int(x) for x in m.groups())


def evaluate(manifest, current):
    """Validate a manifest and compare it with the installed version."""
    if not isinstance(manifest, dict):
        raise ValueError("bad manifest")
    version = manifest.get("version")
    newer = parse_version(version) > parse_version(current)
    artifact, digest = manifest.get("artifact"), manifest.get("sha256")
    if artifact != f"{REPO}/releases/download/v{version}/Deckycord-v{version}.zip":
        raise ValueError("manifest points at an unexpected file")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("manifest has no valid SHA-256")
    return {"ok": True, "current": current, "latest": version,
            "available": newer, "artifact": artifact, "sha256": digest}


def _fetch():
    ca = next((p for p in _CA_FILES if os.path.exists(p)), None)
    ctx = ssl.create_default_context(cafile=ca)
    req = urllib.request.Request(MANIFEST_URL, headers={"User-Agent": "Deckycord"})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return json.loads(r.read(65536))


async def check(current):
    manifest = await asyncio.get_running_loop().run_in_executor(None, _fetch)
    return evaluate(manifest, current)
