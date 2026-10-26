#!/usr/bin/env python3
"""m3tv - a Material You (M3) TV launcher for Linux.

Runs a tiny local web server that serves the launcher UI, and opens the UI in a
Firefox kiosk window. Clicking a tile opens that service in its own Firefox
kiosk window (own profile, Widevine/DRM enabled), so Netflix, Disney+ etc. work.

Only the Python standard library is used.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

VERSION = "0.1.0"
APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "m3-tvui"
DATA_DIR = Path(
    os.environ.get("M3TV_DATA_DIR")
    or Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "m3-tvui"
)
CONFIG_FILE = CONFIG_DIR / "config.json"
DEFAULT_PORT = 8787

# Smart-TV user agent so youtube.com/tv serves the TV ("Leanback") interface.
TV_UA = (
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 "
    "(KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36"
)

BROWSER_CANDIDATES = ["firefox", "firefox-bin", "firefox-esr", "librewolf"]

DEFAULT_SERVICES = [
    {"id": "youtube", "name": "YouTube", "subtitle": "Made for TVs", "url": "https://www.youtube.com/tv", "hue": 25, "profile": "tv"},
    {"id": "youtube-classic", "name": "YouTube Classic", "subtitle": "Regular website", "url": "https://www.youtube.com", "hue": 35, "profile": "web"},
    {"id": "youtube-tv", "name": "YouTube TV", "subtitle": "Live TV subscription", "url": "https://tv.youtube.com", "hue": 15, "profile": "web"},
    {"id": "netflix", "name": "Netflix", "subtitle": "Movies and series", "url": "https://www.netflix.com", "hue": 20, "profile": "web"},
    {"id": "disney", "name": "Disney+", "subtitle": "Stories for everyone", "url": "https://www.disneyplus.com", "hue": 260, "profile": "web"},
    {"id": "prime", "name": "Prime Video", "subtitle": "Watch with Prime", "url": "https://www.primevideo.com", "hue": 235, "profile": "web"},
    {"id": "hbo", "name": "HBO Max", "subtitle": "Series and films", "url": "https://www.hbomax.com", "hue": 300, "profile": "web"},
    {"id": "hulu", "name": "Hulu", "subtitle": "Streaming TV", "url": "https://www.hulu.com", "hue": 150, "profile": "web"},
    {"id": "paramount", "name": "Paramount+", "subtitle": "Shows and sports", "url": "https://www.paramountplus.com", "hue": 250, "profile": "web"},
    {"id": "peacock", "name": "Peacock", "subtitle": "Originals and live", "url": "https://www.peacocktv.com", "hue": 95, "profile": "web"},
    {"id": "twitch", "name": "Twitch", "subtitle": "Live streams", "url": "https://www.twitch.tv", "hue": 305, "profile": "web"},
    {"id": "crunchyroll", "name": "Crunchyroll", "subtitle": "Anime", "url": "https://www.crunchyroll.com", "hue": 55, "profile": "web"},
    {"id": "plex", "name": "Plex", "subtitle": "Your media library", "url": "https://app.plex.tv", "hue": 80, "profile": "web"},
    {"id": "spotify", "name": "Spotify", "subtitle": "Music and podcasts", "url": "https://open.spotify.com", "hue": 155, "profile": "web"},
]

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


def load_config() -> dict:
    cfg = {"port": DEFAULT_PORT, "hue": 285, "scale": 1.0, "browser": None, "services": DEFAULT_SERVICES}
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
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
    cfg["services"] = clean_services(cfg["services"]) or clean_services(DEFAULT_SERVICES)
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


def spawn_browser(cfg: dict, kind: str, url: str) -> subprocess.Popen:
    cmd = find_browser(cfg)
    if not cmd:
        raise RuntimeError("Firefox was not found. Install it, or set \"browser\" in " + str(CONFIG_FILE))
    profile_dir = DATA_DIR / "profiles" / kind
    profile_dir.mkdir(parents=True, exist_ok=True)
    write_user_js(profile_dir, kind, cfg)
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
# Application state
# --------------------------------------------------------------------------

class App:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.lock = threading.RLock()
        self.current = None  # (service_id, Popen)
        self.launcher = None
        self.stop_event = threading.Event()

    @property
    def port(self) -> int:
        return self.cfg["port"]

    def state(self) -> dict:
        with self.lock:
            running = self.current[0] if self.current and self.current[1].poll() is None else None
            cmd = find_browser(self.cfg)
            return {
                "version": VERSION,
                "services": self.cfg["services"],
                "hue": self.cfg["hue"],
                "scale": self.cfg["scale"],
                "running": running,
                "browser": Path(cmd[0]).name if cmd else None,
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
        threading.Thread(target=self._watch, args=(proc,), daemon=True).start()
        return {"running": sid}

    def _watch(self, proc) -> None:
        proc.wait()
        with self.lock:
            if self.current and self.current[1] is proc:
                self.current = None

    def home(self) -> dict:
        with self.lock:
            if self.current:
                stop_proc(self.current[1])
                self.current = None
        return {"running": None}

    def set_settings(self, body: dict) -> dict:
        with self.lock:
            if "hue" in body:
                self.cfg["hue"] = int(body["hue"]) % 360
            if "scale" in body:
                self.cfg["scale"] = min(3.0, max(0.75, float(body["scale"])))
            save_config(self.cfg)
        return self.state()

    def set_services(self, items) -> dict:
        services = clean_services(items)
        if not services:
            raise ValueError("At least one valid app is required")
        with self.lock:
            self.cfg["services"] = services
            save_config(self.cfg)
        return self.state()

    def reset_services(self) -> dict:
        return self.set_services(DEFAULT_SERVICES)

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
        entry = STATIC.get(path)
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
            if length > 65536:
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
    widevine = (DATA_DIR / "profiles" / "web" / "gmp-widevinecdm").exists()
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
