#!/usr/bin/env python3
"""m3tv - a Material You (M3) TV launcher for Linux.

Runs a tiny local web server that serves the launcher UI, and opens the UI in a
Firefox kiosk window. Clicking a tile opens that service in its own Firefox
kiosk window (own profile, Widevine/DRM enabled), so Netflix, Disney+ etc. work.

Only the Python standard library is used.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import configparser
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlparse

VERSION = "0.4.0"
APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "m3-tvui"
DATA_DIR = Path(
    os.environ.get("M3TV_DATA_DIR")
    or Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "m3-tvui"
)
CONFIG_FILE = CONFIG_DIR / "config.json"
CATALOG_FILE = APP_DIR / "catalog.json"
STORE_FILE = APP_DIR / "store-config.json"
DEFAULT_PORT = 8787
CONFIG_VERSION = 4
DEFAULT_HOTKEY = "ctrl+x"

# Smart-TV user agent so youtube.com/tv serves the TV ("Leanback") interface.
TV_UA = (
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 "
    "(KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36"
)

BROWSER_CANDIDATES = ["firefox", "firefox-bin", "firefox-esr", "librewolf"]

# Nothing is installed by default. The Store and Settings are built into the launcher,
# and every streaming app comes from the Store (m3tv/catalog.json) or "Add a website".
DEFAULT_SERVICES = []

_GROUPS = {
    "youtube": "Featured", "youtube-tv": "Featured", "netflix": "Featured", "disney": "Featured",
    "prime": "More streaming", "hbo": "More streaming", "hulu": "More streaming",
    "paramount": "More streaming", "peacock": "More streaming", "crunchyroll": "More streaming",
    "twitch": "Live, music and library", "plex": "Live, music and library", "spotify": "Live, music and library",
}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:32]
    return slug or "app"


def clean_service(raw):
    """Validate one service dict from user input. Returns a clean dict or None."""
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name", "")).strip()[:40]
    url = str(raw.get("url", "")).strip()
    if not name or not url:
        return None
    if re.match(r"^(javascript|data|file|about|blob|view-source|chrome|resource):", url, re.I):
        return None
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    sid = str(raw.get("id") or "").strip().lower()
    if not SLUG_RE.match(sid):
        sid = slugify(name)
    if sid.startswith("builtin-"):  # reserved for the Store and Settings icons
        sid = "app-" + sid
    try:
        hue = int(raw.get("hue", 285)) % 360
    except (TypeError, ValueError):
        hue = 285
    profile = "tv" if raw.get("profile") == "tv" else "web"
    return {
        "id": sid,
        "name": name,
        "subtitle": str(raw.get("subtitle", "")).strip()[:48],
        "url": url,
        "hue": hue,
        "profile": profile,
        "group": str(raw.get("group", "")).strip()[:30] or "Your apps",
        "description": str(raw.get("description", "")).strip()[:400],
        "source": "community" if raw.get("source") == "community" else "",
    }


def clean_services(items):
    out, seen = [], set()
    for raw in items if isinstance(items, list) else []:
        svc = clean_service(raw)
        if not svc:
            continue
        base, n = svc["id"], 2
        while svc["id"] in seen:
            svc["id"] = f"{base}-{n}"
            n += 1
        seen.add(svc["id"])
        out.append(svc)
    return out


def clean_weather(raw):
    """Validate a saved weather location: {"name", "lat", "lon"} or None."""
    if not isinstance(raw, dict):
        return None
    try:
        lat = float(raw["lat"])
        lon = float(raw["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return {"name": str(raw.get("name", "")).strip()[:60], "lat": round(lat, 4), "lon": round(lon, 4)}


_catalog_cache = {}


def store_config(cfg: dict) -> dict:
    """Where the community Store (Supabase) lives: store-config.json, overridden by store_url/store_anon_key in the config."""
    base = {}
    try:
        base = json.loads(STORE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    url = str(cfg.get("store_url") or base.get("url") or "").strip().rstrip("/")
    key = str(cfg.get("store_anon_key") or base.get("anon_key") or "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or not key:
        return {"url": "", "anon_key": ""}
    return {"url": url, "anon_key": key}


def load_catalog(cfg: dict) -> list:
    """Apps offered in the Store: the bundled catalog.json plus any "catalog_sources" you list in the config."""
    entries, seen = [], set()
    sources = [str(CATALOG_FILE)] + [x for x in (cfg.get("catalog_sources") or []) if isinstance(x, str)]
    for src in sources:
        raw = None
        try:
            if src.startswith(("http://", "https://")):
                cached = _catalog_cache.get(src)
                if cached and time.time() - cached[0] < 600:
                    raw = cached[1]
                else:
                    raw = json.loads(_http_get(src, 300_000)[0].decode("utf-8", "replace"))
                    _catalog_cache[src] = (time.time(), raw)
            else:
                raw = json.loads(Path(src).expanduser().read_text(encoding="utf-8"))
        except Exception:
            continue
        for item in raw.get("apps", []) if isinstance(raw, dict) else raw if isinstance(raw, list) else []:
            svc = clean_service(item)
            if not svc or svc["id"] in seen:
                continue
            seen.add(svc["id"])
            svc["category"] = str(item.get("category", "")).strip()[:24] or "More"
            entries.append(svc)
    return entries


HOTKEY_ALIASES = {"control": "ctrl", "win": "super", "mod": "super"}
HOTKEY_MODS = ("ctrl", "alt", "shift", "super")
HOTKEY_BARE = {"home", "end", "pause", "insert", "print", "menu"} | {f"f{i}" for i in range(1, 13)}
HOTKEY_NAMED = HOTKEY_BARE | {"delete", "prior", "next", "left", "right", "up", "down", "return", "space", "tab", "backspace", "escape"}


def normalize_hotkey(spec):
    """Return a clean hotkey like "ctrl+x" or "home", or None if it is not allowed.

    A plain letter or digit would steal normal typing, so those need Ctrl, Alt or Super.
    Keys like Home or F9 may be used on their own."""
    parts = [p.strip().lower() for p in str(spec or "").split("+") if p.strip()]
    if not parts or not all(re.fullmatch(r"[a-z0-9_]+", p) for p in parts):
        return None
    mods = [HOTKEY_ALIASES.get(m, m) for m in parts[:-1]]
    key = parts[-1]
    if any(m not in HOTKEY_MODS for m in mods) or len(set(mods)) != len(mods):
        return None
    if re.fullmatch(r"[a-z0-9]", key):
        if not set(mods) & {"ctrl", "alt", "super"}:
            return None
    elif key in HOTKEY_NAMED:
        if not mods and key not in HOTKEY_BARE:
            return None
    else:
        return None
    return "+".join([m for m in HOTKEY_MODS if m in mods] + [key])


def load_config() -> dict:
    cfg = {
        "port": DEFAULT_PORT,
        "hue": 285,
        "scale": 1.0,
        "browser": None,
        "home_hotkey": DEFAULT_HOTKEY,
        "profile_mode": "firefox",
        "firefox_profile": None,
        "weather": None,
        "units": "auto",
        "recent": [],
        "catalog_sources": [],
        "store_url": "",
        "store_anon_key": "",
        "services": DEFAULT_SERVICES,
    }
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    # Old config files have no version; new installs start at the current one.
    try:
        version = int(data.get("config_version", 1)) if isinstance(data, dict) and data else CONFIG_VERSION
    except (TypeError, ValueError):
        version = 1
    if isinstance(data, dict):
        for key in cfg:
            if key in data:
                cfg[key] = data[key]
    try:
        cfg["port"] = int(cfg["port"])
    except (TypeError, ValueError):
        cfg["port"] = DEFAULT_PORT
    try:
        cfg["hue"] = int(cfg["hue"]) % 360
    except (TypeError, ValueError):
        cfg["hue"] = 285
    try:
        cfg["scale"] = min(3.0, max(0.75, float(cfg["scale"])))
    except (TypeError, ValueError):
        cfg["scale"] = 1.0
    if cfg["profile_mode"] not in ("firefox", "separate"):
        cfg["profile_mode"] = "firefox"
    cfg["home_hotkey"] = normalize_hotkey(cfg["home_hotkey"]) or DEFAULT_HOTKEY
    if not isinstance(cfg.get("catalog_sources"), list):
        cfg["catalog_sources"] = []
    cfg["weather"] = clean_weather(cfg["weather"])
    if cfg["units"] not in ("auto", "f", "c"):
        cfg["units"] = "auto"
    cfg["services"] = clean_services(cfg["services"])
    if version < 2:  # the YouTube Classic tile was removed in config version 2
        cfg["services"] = [s for s in cfg["services"] if s["id"] != "youtube-classic"]
    if version < 4:  # v0.4: only Settings is built in; apps come later from the Store
        cfg["services"] = []
    ids = {svc["id"] for svc in cfg["services"]}
    recent = cfg.get("recent")
    cfg["recent"] = list(dict.fromkeys(r for r in recent if isinstance(r, str) and r in ids))[:8] if isinstance(recent, list) else []
    cfg["config_version"] = CONFIG_VERSION
    return cfg


def save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    tmp.replace(CONFIG_FILE)


# --------------------------------------------------------------------------
# Browser handling
# --------------------------------------------------------------------------

def find_browser(cfg: dict):
    """Return the browser command as a list, or None if no Firefox is found."""
    override = os.environ.get("M3TV_BROWSER") or cfg.get("browser")
    if override:
        return shlex.split(str(override))
    for name in BROWSER_CANDIDATES:
        path = shutil.which(name)
        if path:
            return [path]
    return None


def write_user_js(profile_dir: Path, kind: str, cfg: dict) -> None:
    prefs = {
        # DRM playback (Netflix, Disney+, ...). Firefox downloads Widevine on first use.
        "media.eme.enabled": True,
        "media.gmp-widevinecdm.enabled": True,
        "media.gmp-widevinecdm.visible": True,
        "media.autoplay.default": 0,
        "media.autoplay.blocking_policy": 0,
        "media.ffmpeg.vaapi.enabled": True,
        # Quiet, kiosk-friendly behaviour.
        "browser.shell.checkDefaultBrowser": False,
        "browser.aboutwelcome.enabled": False,
        "browser.startup.homepage_override.mstone": "ignore",
        "browser.tabs.warnOnClose": False,
        "browser.sessionstore.resume_from_crash": False,
        "browser.fullscreen.autohide": True,
        "full-screen-api.warning.timeout": 0,
        "datareporting.policy.dataSubmissionEnabled": False,
        "toolkit.telemetry.reportingpolicy.firstRun": False,
        "dom.webnotifications.enabled": False,
        "ui.key.menuAccessKeyFocuses": False,
        "ui.systemUsesDarkTheme": 1,
    }
    scale = float(cfg.get("scale", 1.0))
    # Auto scale (-1) unless the user picked a custom TV scale.
    prefs["layout.css.devPixelsPerPx"] = "-1.0" if abs(scale - 1.0) < 0.01 else str(scale)
    if kind == "tv":
        prefs["general.useragent.override"] = TV_UA
    lines = [f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in prefs.items()]
    (profile_dir / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")


def firefox_roots() -> list:
    """Folders where Firefox keeps its profiles (classic, XDG, Flatpak, Snap)."""
    home = Path.home()
    xdg = Path(os.environ.get("XDG_CONFIG_HOME") or home / ".config")
    roots = [
        home / ".mozilla" / "firefox",
        xdg / "mozilla" / "firefox",          # Firefox 147+ on Linux
        home / ".config" / "mozilla" / "firefox",
        home / ".var" / "app" / "org.mozilla.firefox" / ".mozilla" / "firefox",
        home / ".var" / "app" / "org.mozilla.firefox" / "config" / "mozilla" / "firefox",
        home / "snap" / "firefox" / "common" / ".mozilla" / "firefox",
    ]
    return list(dict.fromkeys(roots))


def find_login_profile(cfg: dict):
    """Find the user's everyday Firefox profile (the one with their logins)."""
    custom = cfg.get("firefox_profile")
    if custom:
        path = Path(str(custom)).expanduser()
        return path if path.is_dir() else None
    roots = firefox_roots()
    for root in roots:
        ini = root / "profiles.ini"
        if not ini.is_file():
            continue
        parser = configparser.RawConfigParser()
        parser.optionxform = str
        try:
            parser.read(ini, encoding="utf-8")
        except configparser.Error:
            continue
        for sec in parser.sections():  # Firefox 67+: the install's default profile
            if sec.startswith("Install") and parser.has_option(sec, "Default"):
                path = root / parser.get(sec, "Default")
                if path.is_dir():
                    return path
        for sec in parser.sections():  # older style: Default=1
            if sec.startswith("Profile") and parser.get(sec, "Default", fallback="0") == "1":
                raw = parser.get(sec, "Path", fallback="")
                path = root / raw if parser.get(sec, "IsRelative", fallback="1") == "1" else Path(raw)
                if raw and path.is_dir():
                    return path
    # No profiles.ini we could read: use the most recently used profile that has saved sign-ins.
    best, best_time = None, 0.0
    for root in roots:
        try:
            candidates = [d for d in root.iterdir() if d.is_dir()]
        except OSError:
            continue
        for d in candidates:
            for marker in ("cookies.sqlite", "logins.json", "prefs.js"):
                try:
                    mtime = (d / marker).stat().st_mtime
                except OSError:
                    continue
                if mtime > best_time:
                    best, best_time = d, mtime
    return best


def profile_in_use(profile: Path) -> bool:
    """True if a running Firefox currently holds this profile's lock."""
    try:
        target = os.readlink(profile / "lock")
    except OSError:
        return False
    match = re.search(r"\+(\d+)$", target)
    if not match:
        return False
    try:
        os.kill(int(match.group(1)), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def spawn_browser(cfg: dict, kind: str, url: str) -> subprocess.Popen:
    cmd = find_browser(cfg)
    if not cmd:
        raise RuntimeError("Firefox was not found. Install it, or set \"browser\" in " + str(CONFIG_FILE))
    login = find_login_profile(cfg) if kind in ("web", "tv") and cfg.get("profile_mode") != "separate" else None
    if login is not None and profile_in_use(login):
        raise RuntimeError("Your regular Firefox is open and using your profile. Close it, then try again.")
    if kind == "web" and login is not None:
        # Your own profile: sign-ins, cookies and extensions come along. We do not touch its settings.
        profile_dir = login
    else:
        profile_dir = DATA_DIR / "profiles" / kind
        profile_dir.mkdir(parents=True, exist_ok=True)
        write_user_js(profile_dir, kind, cfg)
        if login is not None:
            # The YouTube TV profile needs its own smart-TV user agent, so it gets a copy of your sign-ins.
            sync_login_data(login, profile_dir)
    env = os.environ.copy()
    env.setdefault("MOZ_ENABLE_WAYLAND", "1")
    return subprocess.Popen(
        cmd + ["--no-remote", "--profile", str(profile_dir), "--kiosk", url],
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def stop_proc(proc) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return
    try:
        proc.wait(timeout=4)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


# --------------------------------------------------------------------------
# Logos, network status and sign-in data
# --------------------------------------------------------------------------

LOGO_EXT = {
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
}
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
LOGO_RETRY_SECONDS = 7 * 24 * 3600
LOGIN_FILES = ["cookies.sqlite", "cookies.sqlite-wal", "key4.db", "logins.json"]


def find_logo(sid: str):
    """Your own file in ~/.config/m3-tvui/logos/<id>.png wins over the cached site icon."""
    if not SLUG_RE.match(sid):
        return None
    for folder in (CONFIG_DIR / "logos", DATA_DIR / "icons"):
        for ext in LOGO_EXT:
            path = folder / (sid + ext)
            if path.is_file():
                return path
    return None


def logo_versions(services) -> dict:
    out = {}
    for svc in services:
        path = find_logo(svc["id"])
        if path:
            try:
                out[svc["id"]] = int(path.stat().st_mtime)
            except OSError:
                pass
    return out


def sniff_image(data: bytes):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:4] == b"\x00\x00\x01\x00":
        return ".ico"
    return None


def save_custom_logo(sid: str, b64) -> None:
    """Store a logo you picked in "Add a website" in ~/.config/m3-tvui/logos (it wins over any downloaded icon)."""
    try:
        data = base64.b64decode(str(b64), validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("That logo image could not be read")
    if len(data) > 1_000_000:
        raise ValueError("That logo image is too large (1 MB at most)")
    ext = sniff_image(data)
    if not ext:
        raise ValueError("The logo must be a PNG, JPG, WebP or ICO image")
    folder = CONFIG_DIR / "logos"
    folder.mkdir(parents=True, exist_ok=True)
    for old in LOGO_EXT:
        try:
            (folder / (sid + old)).unlink()
        except OSError:
            pass
    (folder / (sid + ext)).write_bytes(data)


def _http_get(url: str, limit: int, truncate: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        data = resp.read(limit + 1)
        final = resp.geturl()
    if len(data) > limit:
        if not truncate:
            raise ValueError("too large")
        data = data[:limit]
    return data, final


LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.I)
ATTR_RE = re.compile(r"""([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""")


def icon_candidates(page_url: str, html: str) -> list:
    found = []
    for tag in LINK_TAG_RE.findall(html):
        attrs = {m.group(1).lower(): (m.group(2) if m.group(2) is not None else m.group(3)) for m in ATTR_RE.finditer(tag)}
        rel = attrs.get("rel", "").lower()
        href = attrs.get("href")
        if not href or "icon" not in rel or "mask-icon" in rel:
            continue
        size_match = re.match(r"(\d+)x\d+", attrs.get("sizes", ""))
        size = int(size_match.group(1)) if size_match else 0
        url = urljoin(page_url, href)
        if urlparse(url).scheme in ("http", "https"):
            found.append(((2 if "apple-touch-icon" in rel else 1, size), url))
    found.sort(key=lambda item: item[0], reverse=True)
    return [url for _, url in found]


def fetch_site_icon(svc: dict) -> bool:
    """Download the site's own icon (apple-touch-icon or favicon) into the cache. Best effort."""
    icons = DATA_DIR / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    parsed = urlparse(svc["url"])
    base = f"{parsed.scheme}://{parsed.netloc}"
    urls = []
    try:
        html, final = _http_get(svc["url"], 300_000, truncate=True)
        urls += icon_candidates(final, html.decode("utf-8", "replace"))
    except Exception:
        pass
    urls += [base + "/apple-touch-icon.png", base + "/favicon.ico"]
    seen = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        try:
            data, _ = _http_get(url, 400_000)
        except Exception:
            continue
        ext = sniff_image(data)
        if ext and len(data) > 200:
            (icons / (svc["id"] + ext)).write_bytes(data)
            try:
                (icons / (svc["id"] + ".none")).unlink()
            except OSError:
                pass
            return True
    try:
        (icons / (svc["id"] + ".none")).write_text("")
    except OSError:
        pass
    return False


def sync_login_data(src: Path, dst: Path) -> None:
    """Copy sign-in data (cookies, saved logins) from your Firefox profile into a helper profile."""
    dst.mkdir(parents=True, exist_ok=True)
    for name in ("cookies.sqlite", "cookies.sqlite-wal", "cookies.sqlite-shm"):
        try:
            (dst / name).unlink()
        except OSError:
            pass
    for name in LOGIN_FILES:
        try:
            if (src / name).is_file():
                shutil.copy2(src / name, dst / name)
        except OSError:
            pass


_net_cache = (0.0, None)


def _ssid():
    for args in (["iwgetid", "-r"], ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"]):
        if not shutil.which(args[0]):
            continue
        try:
            out = subprocess.run(args, capture_output=True, text=True, timeout=1.5).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        for line in out.splitlines():
            line = line.strip()
            if args[0] == "nmcli":
                if line.startswith("yes:"):
                    return line[4:] or None
            elif line:
                return line
    return None


def network_status() -> dict:
    """What the Wi-Fi icon shows: ethernet, wifi (with 1-3 bars) or none. Cached for a few seconds."""
    global _net_cache
    now = time.monotonic()
    if _net_cache[1] is not None and now - _net_cache[0] < 4:
        return _net_cache[1]
    status = {"type": "none", "level": 0, "ssid": None}
    quality = {}
    try:
        for line in Path("/proc/net/wireless").read_text().splitlines()[2:]:
            iface, _, rest = line.partition(":")
            fields = rest.split()
            if len(fields) >= 3:
                quality[iface.strip()] = float(fields[1].rstrip("."))
    except (OSError, ValueError):
        pass
    wifi = None
    try:
        for dev in sorted(Path("/sys/class/net").iterdir()):
            if dev.name == "lo" or not (dev / "device").exists():  # skip virtual interfaces
                continue
            try:
                if (dev / "operstate").read_text().strip() != "up":
                    continue
            except OSError:
                continue
            if (dev / "wireless").exists():
                q = quality.get(dev.name, 0.0)  # out of 70
                wifi = {"type": "wifi", "level": 3 if q >= 47 else 2 if q >= 28 else 1, "ssid": None}
            else:
                status = {"type": "ethernet", "level": 3, "ssid": None}
                break
        else:
            if wifi:
                wifi["ssid"] = _ssid()
                status = wifi
    except OSError:
        pass
    _net_cache = (now, status)
    return status


# --------------------------------------------------------------------------
# Home hotkey
#
# A kiosk Firefox window swallows keys, so the hotkey is registered with the
# compositor while an app is open and removed again when you are back home.
# Hyprland and sway are supported. Elsewhere, bind `m3tv home` yourself.
# --------------------------------------------------------------------------

HYPR_MODS = {"ctrl": "CTRL", "control": "CTRL", "alt": "ALT", "shift": "SHIFT", "super": "SUPER", "win": "SUPER", "mod": "SUPER"}


def parse_hotkey(spec):
    parts = [p.strip().lower() for p in str(spec or "").split("+") if p.strip()]
    if not parts or not all(re.fullmatch(r"[a-z0-9_]+", p) for p in parts):
        return None
    return parts[:-1], parts[-1]


def hotkey_label(spec) -> str:
    parsed = parse_hotkey(spec)
    return "+".join(p.capitalize() for p in (parsed[0] + [parsed[1]])) if parsed else ""


def detect_compositor():
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE") and shutil.which("hyprctl"):
        return "hyprland"
    if os.environ.get("SWAYSOCK") and shutil.which("swaymsg"):
        return "sway"
    return None


def home_command() -> str:
    return f"{shlex.quote(sys.executable)} {shlex.quote(str(Path(__file__).resolve()))} home"


def set_hotkey(spec, enable: bool) -> bool:
    """Register or remove the global 'go home' hotkey. Returns True on success."""
    parsed = parse_hotkey(spec)
    comp = detect_compositor()
    if not parsed or not comp:
        return False
    mods, key = parsed
    try:
        if comp == "hyprland":
            combo = ",".join(["+".join(HYPR_MODS.get(m, m.upper()) for m in mods).replace("+", " "), key.upper() if len(key) == 1 else key])
            args = ["hyprctl", "keyword", "bind" if enable else "unbind", combo + (",exec," + home_command() if enable else "")]
        else:
            combo = "+".join(mods + [key])
            args = ["swaymsg", "bindsym", combo, "exec", home_command()] if enable else ["swaymsg", "unbindsym", combo]
        result = subprocess.run(args, capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        return False
    if result.returncode != 0:
        return False
    return comp != "hyprland" or result.stdout.strip().startswith("ok")


# --------------------------------------------------------------------------
# Application state
# --------------------------------------------------------------------------

class App:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.lock = threading.RLock()
        self.current = None  # (service_id, Popen)
        self.launcher = None
        self.hotkey_on = False
        self.stop_event = threading.Event()

    def _hotkey(self, enable: bool) -> None:
        if enable == self.hotkey_on:
            return
        if set_hotkey(self.cfg.get("home_hotkey"), enable):
            self.hotkey_on = enable
        elif not enable:
            self.hotkey_on = False

    def ensure_icons(self, include_catalog: bool = False) -> None:
        with self.lock:
            services = list(self.cfg["services"])
            if include_catalog:
                have = {svc["id"] for svc in services}
                services += [e for e in load_catalog(self.cfg) if e["id"] not in have]
        for svc in services:
            if find_logo(svc["id"]):
                continue
            marker = DATA_DIR / "icons" / (svc["id"] + ".none")
            try:
                if marker.exists() and time.time() - marker.stat().st_mtime < LOGO_RETRY_SECONDS:
                    continue
            except OSError:
                pass
            fetch_site_icon(svc)

    @property
    def port(self) -> int:
        return self.cfg["port"]

    def state(self) -> dict:
        with self.lock:
            running = self.current[0] if self.current and self.current[1].poll() is None else None
            cmd = find_browser(self.cfg)
            login = find_login_profile(self.cfg)
            return {
                "version": VERSION,
                "services": self.cfg["services"],
                "hue": self.cfg["hue"],
                "scale": self.cfg["scale"],
                "running": running,
                "browser": Path(cmd[0]).name if cmd else None,
                "hotkey": hotkey_label(self.cfg.get("home_hotkey")) if self.hotkey_on else None,
                "home_hotkey": hotkey_label(self.cfg.get("home_hotkey")),
                "hotkey_supported": detect_compositor() is not None,
                "profile_mode": self.cfg["profile_mode"],
                "login_profile": login.name.split(".", 1)[-1] if login else None,
                "network": network_status(),
                "weather": self.cfg["weather"],
                "units": self.cfg["units"],
                "recent": self.cfg.get("recent", []),
                "logos": logo_versions(self.cfg["services"]),
                "store": store_config(self.cfg),
            }

    def launch(self, sid: str) -> dict:
        with self.lock:
            svc = next((s for s in self.cfg["services"] if s["id"] == sid), None)
            if not svc:
                raise KeyError("Unknown app")
            if self.current:
                stop_proc(self.current[1])
                self.current = None
            proc = spawn_browser(self.cfg, svc["profile"], svc["url"])
            self.current = (sid, proc)
            self._hotkey(True)
            self.cfg["recent"] = ([sid] + [r for r in self.cfg.get("recent", []) if r != sid])[:8]
            try:
                save_config(self.cfg)
            except OSError:
                pass
        threading.Thread(target=self._watch, args=(proc,), daemon=True).start()
        return {"running": sid}

    def _watch(self, proc) -> None:
        proc.wait()
        with self.lock:
            if self.current and self.current[1] is proc:
                self.current = None
                self._hotkey(False)

    def home(self) -> dict:
        with self.lock:
            if self.current:
                stop_proc(self.current[1])
                self.current = None
            self._hotkey(False)
        return {"running": None}

    def set_settings(self, body: dict) -> dict:
        with self.lock:
            if "hue" in body:
                self.cfg["hue"] = int(body["hue"]) % 360
            if "scale" in body:
                self.cfg["scale"] = min(3.0, max(0.75, float(body["scale"])))
            if "profile_mode" in body:
                if body["profile_mode"] not in ("firefox", "separate"):
                    raise ValueError("profile_mode must be firefox or separate")
                self.cfg["profile_mode"] = body["profile_mode"]
            if "units" in body:
                if body["units"] not in ("auto", "f", "c"):
                    raise ValueError("units must be auto, f or c")
                self.cfg["units"] = body["units"]
            if "home_hotkey" in body:
                new_key = normalize_hotkey(body["home_hotkey"])
                if not new_key:
                    raise ValueError("That key is not allowed. Use Ctrl, Alt or Super with a key, or a key such as Home or F9.")
                was_on = self.hotkey_on
                if was_on:
                    set_hotkey(self.cfg["home_hotkey"], False)
                    self.hotkey_on = False
                self.cfg["home_hotkey"] = new_key
                if was_on:
                    self._hotkey(True)
            if "weather" in body:
                if body["weather"] is None:
                    self.cfg["weather"] = None
                else:
                    place = clean_weather(body["weather"])
                    if not place:
                        raise ValueError("Invalid weather location")
                    self.cfg["weather"] = place
            save_config(self.cfg)
        return self.state()

    def set_services(self, items) -> dict:
        services = clean_services(items)
        with self.lock:
            self.cfg["services"] = services
            keep = {svc["id"] for svc in services}
            self.cfg["recent"] = [r for r in self.cfg.get("recent", []) if r in keep]
            save_config(self.cfg)
        threading.Thread(target=self.ensure_icons, daemon=True).start()
        return self.state()

    def reset_services(self) -> dict:
        return self.set_services([])

    def catalog(self) -> dict:
        with self.lock:
            apps = load_catalog(self.cfg)
            installed = {svc["id"] for svc in self.cfg["services"]}
            if not getattr(self, "_catalog_icons_started", False):
                self._catalog_icons_started = True
                threading.Thread(target=self.ensure_icons, kwargs={"include_catalog": True}, daemon=True).start()
        logos = logo_versions(apps)
        return {"apps": [dict(app, installed=app["id"] in installed, logo=logos.get(app["id"])) for app in apps]}

    def install(self, sid: str) -> dict:
        with self.lock:
            if any(svc["id"] == sid for svc in self.cfg["services"]):
                return self.state()
            entry = next((e for e in load_catalog(self.cfg) if e["id"] == sid), None)
            if not entry:
                raise KeyError("That app is not in the Store")
            entry = {k: v for k, v in entry.items() if k != "category"}
            self.cfg["services"] = self.cfg["services"] + [entry]
            save_config(self.cfg)
        threading.Thread(target=self.ensure_icons, daemon=True).start()
        return self.state()

    def install_remote(self, body: dict) -> dict:
        """Install a community app. Its icon may only come from the configured Store host."""
        store = store_config(self.cfg)
        if not store["url"]:
            raise ValueError("The community Store is not set up")
        icon = str(body.get("icon_url", ""))
        if urlparse(icon).netloc != urlparse(store["url"]).netloc or urlparse(icon).scheme != "https":
            raise ValueError("Icon must come from the Store")
        slug = re.sub(r"[^a-z0-9-]", "", str(body.get("id", "")).lower())[:37]
        if not slug:
            raise ValueError("Missing app id")
        svc = clean_service({**body, "id": "c-" + slug, "source": "community", "group": "Your apps"})
        if not svc:
            raise ValueError("Invalid app")
        with self.lock:
            if any(x["id"] == svc["id"] for x in self.cfg["services"]):
                return self.state()
        data = _http_get(icon, 600_000)[0]
        save_custom_logo(svc["id"], base64.b64encode(data).decode())
        with self.lock:
            self.cfg["services"] = self.cfg["services"] + [svc]
            save_config(self.cfg)
        return self.state()

    def remove_service(self, sid: str) -> dict:
        with self.lock:
            if self.current and self.current[0] == sid:
                stop_proc(self.current[1])
                self.current = None
                self._hotkey(False)
            self.cfg["services"] = [svc for svc in self.cfg["services"] if svc["id"] != sid]
            self.cfg["recent"] = [r for r in self.cfg.get("recent", []) if r != sid]
            save_config(self.cfg)
        return self.state()

    def add_service(self, body: dict) -> dict:
        svc = clean_service(body)
        if not svc:
            raise ValueError("Enter a name and a valid web address")
        with self.lock:
            ids = {s["id"] for s in self.cfg["services"]}
            base, n = svc["id"], 2
            while svc["id"] in ids:
                svc["id"] = f"{base}-{n}"
                n += 1
            if body.get("logo"):
                save_custom_logo(svc["id"], body["logo"])
            self.cfg["services"] = self.cfg["services"] + [svc]
            save_config(self.cfg)
        threading.Thread(target=self.ensure_icons, daemon=True).start()
        state = self.state()
        state["added"] = svc["id"]
        return state

    def shutdown(self) -> None:
        self.home()
        self.stop_event.set()


# --------------------------------------------------------------------------
# HTTP server
# --------------------------------------------------------------------------

STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}


class Handler(BaseHTTPRequestHandler):
    app: App = None  # set before serving
    server_version = "m3tv"

    def log_message(self, *args):  # keep the terminal quiet
        pass

    def _send(self, code: int, body, ctype: str = "application/json") -> None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _host_ok(self) -> bool:
        port = self.app.port
        return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, {"error": "bad host"})
        path = urlparse(self.path).path
        if path == "/api/state":
            return self._send(200, self.app.state())
        if path == "/api/catalog":
            return self._send(200, self.app.catalog())
        logo = re.fullmatch(r"/api/logo/([a-z0-9-]{1,40})", path)
        if logo:
            found = find_logo(logo.group(1))
            if not found:
                return self._send(404, {"error": "no logo"})
            try:
                return self._send(200, found.read_bytes(), LOGO_EXT[found.suffix])
            except OSError:
                return self._send(404, {"error": "no logo"})
        entry = STATIC.get(path)
        font = re.fullmatch(r"/fonts/([A-Za-z0-9._-]+\.(woff2|txt))", path)
        if font:
            entry = ("fonts/" + font.group(1), "font/woff2" if font.group(2) == "woff2" else "text/plain; charset=utf-8")
        if not entry:
            return self._send(404, {"error": "not found"})
        try:
            data = (WEB_DIR / entry[0]).read_bytes()
        except OSError:
            return self._send(404, {"error": "missing file"})
        self._send(200, data, entry[1])

    def do_POST(self):
        # Defence against other web pages poking the local server (CSRF / DNS rebinding).
        if not self._host_ok() or self.headers.get("X-M3TV") != "1":
            return self._send(403, {"error": "forbidden"})
        origin = self.headers.get("Origin")
        port = self.app.port
        if origin and origin not in (f"http://127.0.0.1:{port}", f"http://localhost:{port}"):
            return self._send(403, {"error": "forbidden origin"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 2_000_000:
                return self._send(413, {"error": "too large"})
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("JSON object expected")
        except (ValueError, OSError) as exc:
            return self._send(400, {"error": str(exc)})

        path = urlparse(self.path).path
        try:
            if path == "/api/launch":
                return self._send(200, self.app.launch(str(body.get("id", ""))))
            if path == "/api/home":
                return self._send(200, self.app.home())
            if path == "/api/settings":
                return self._send(200, self.app.set_settings(body))
            if path == "/api/services":
                return self._send(200, self.app.set_services(body.get("services")))
            if path == "/api/install":
                return self._send(200, self.app.install(str(body.get("id", ""))))
            if path == "/api/check-app":
                import store_check
                return self._send(200, store_check.verify(str(body.get("name", ""))[:40], str(body.get("url", "")), str(body.get("description", ""))[:400]))
            if path == "/api/install-remote":
                return self._send(200, self.app.install_remote(body))
            if path == "/api/uninstall":
                return self._send(200, self.app.remove_service(str(body.get("id", ""))))
            if path == "/api/services/add":
                return self._send(200, self.app.add_service(body))
            if path == "/api/services/reset":
                return self._send(200, self.app.reset_services())
            if path == "/api/quit":
                self._send(200, {"ok": True})
                threading.Thread(target=self.app.shutdown, daemon=True).start()
                return
        except KeyError as exc:
            return self._send(404, {"error": str(exc).strip("'\"")})
        except (ValueError, TypeError) as exc:
            return self._send(400, {"error": str(exc)})
        except Exception as exc:  # e.g. Firefox missing
            return self._send(500, {"error": str(exc)})
        self._send(404, {"error": "not found"})


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def api_call(cfg: dict, path: str, body=None):
    url = f"http://127.0.0.1:{cfg['port']}{path}"
    headers = {"X-M3TV": "1", "Content-Type": "application/json"}
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read() or b"{}")


def is_running(cfg: dict) -> bool:
    try:
        api_call(cfg, "/api/state")
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


def start_server(app: App) -> ThreadingHTTPServer:
    Handler.app = app
    server = ThreadingHTTPServer(("127.0.0.1", app.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def cmd_run(cfg: dict, with_browser: bool) -> int:
    if is_running(cfg):
        print(f"m3tv is already running on http://127.0.0.1:{cfg['port']}/")
        return 0
    app = App(cfg)
    try:
        server = start_server(app)
    except OSError as exc:
        print(f"Could not listen on port {cfg['port']}: {exc}", file=sys.stderr)
        return 1
    threading.Thread(target=app.ensure_icons, daemon=True).start()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: app.stop_event.set())

    url = f"http://127.0.0.1:{cfg['port']}/"
    if with_browser:
        try:
            app.launcher = spawn_browser(cfg, "launcher", url)
            threading.Thread(target=lambda: (app.launcher.wait(), app.stop_event.set()), daemon=True).start()
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            server.shutdown()
            return 1
    else:
        print(f"m3tv is serving {url}  (Ctrl+C to stop)")

    while not app.stop_event.wait(0.5):
        pass
    app.home()
    stop_proc(app.launcher)
    server.shutdown()
    return 0


def cmd_doctor(cfg: dict) -> int:
    cmd = find_browser(cfg)
    print(f"m3tv {VERSION}")
    print(f"  python    : {sys.version.split()[0]}")
    print(f"  browser   : {' '.join(cmd) if cmd else 'NOT FOUND (install Firefox)'}")
    print(f"  config    : {CONFIG_FILE}")
    print(f"  profiles  : {DATA_DIR / 'profiles'}")
    print(f"  running   : {'yes' if is_running(cfg) else 'no'}")
    login = find_login_profile(cfg)
    if cfg["profile_mode"] == "firefox" and login:
        print(f"  sign-ins  : using your Firefox profile {login}")
        print(f"              {'IN USE by a running Firefox, close it first' if profile_in_use(login) else 'free'}")
    else:
        print("  sign-ins  : separate m3tv profile" + ("" if cfg["profile_mode"] == "separate" else " (no Firefox profile found; looked in: " + ", ".join(str(r) for r in firefox_roots()) + ". Set \"firefox_profile\" in " + str(CONFIG_FILE) + " to its folder)"))
    comp = detect_compositor()
    print(f"  hotkey    : {hotkey_label(cfg['home_hotkey'])} via {comp}" if comp else f"  hotkey    : no Hyprland/sway session; bind `m3tv home` to {hotkey_label(cfg['home_hotkey'])} yourself")
    widevine = login if (cfg["profile_mode"] == "firefox" and login) else DATA_DIR / "profiles" / "web"
    widevine = (widevine / "gmp-widevinecdm").exists()
    print(f"  widevine  : {'installed' if widevine else 'not downloaded yet (opens on first Netflix/Disney+ visit; needs internet)'}")
    if cmd and "snap" in os.path.realpath(cmd[0]):
        print("  WARNING   : snap Firefox cannot use profiles in hidden folders. Use Mozilla's .deb/apt repo or set M3TV_DATA_DIR to a visible folder.")
    return 0 if cmd else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="m3tv", description="Material You TV launcher")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("run", help="start the launcher (default)")
    sub.add_parser("serve", help="serve the UI only, open it in any browser yourself")
    sub.add_parser("home", help="close the open app and go back to the launcher")
    sub.add_parser("quit", help="close everything")
    p_launch = sub.add_parser("launch", help="open an app by id")
    p_launch.add_argument("id")
    sub.add_parser("doctor", help="check the setup")
    sub.add_parser("config-path", help="print the config file path")
    args = parser.parse_args(argv)

    cfg = load_config()
    command = args.command or "run"
    if command == "run":
        return cmd_run(cfg, with_browser=True)
    if command == "serve":
        return cmd_run(cfg, with_browser=False)
    if command == "doctor":
        return cmd_doctor(cfg)
    if command == "config-path":
        print(CONFIG_FILE)
        return 0
    try:
        if command == "home":
            api_call(cfg, "/api/home", {})
        elif command == "quit":
            api_call(cfg, "/api/quit", {})
        elif command == "launch":
            api_call(cfg, "/api/launch", {"id": args.id})
    except urllib.error.HTTPError as exc:
        print(f"m3tv: {exc.read().decode(errors='replace')}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, OSError):
        print("m3tv is not running. Start it with: m3tv", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
