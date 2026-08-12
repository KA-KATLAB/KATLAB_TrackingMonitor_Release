"""KATLAB TrackingMonitor server (PLAN v0.1.0.0 C.3).

Run: python -m Backend.app.main  (from the repo root; the BAT does this).
F10: host/port come from Config/repos.yaml - the SINGLE source; no port is
hardcoded anywhere else in the backend.
"""

import logging
import mimetypes
import os
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .api import routes, ws
from .badge import build_badge, events_last_7d
from .config import ConfigAuthoringError, load_config
from .version import __version__
from .watcher import Tracker

REPO_ROOT = Path(__file__).resolve().parents[2]
# KATLAB_TRACKER_CONFIG env override: used by demo mode (Scripts/start_demo.bat)
CONFIG_PATH = Path(os.environ.get("KATLAB_TRACKER_CONFIG",
                                  str(REPO_ROOT / "Config" / "repos.yaml")))
FRONTEND_DIST = REPO_ROOT / "Frontend" / "dist"

# PLAN v0.2.6.0 A.1 (R-BA): the Chronicle's BUILT site, served at
# /chronicle/ by a per-request resolver (the v0.1.12.0 RV2 law - a
# StaticFiles mount raises at construction on the missing dir of a
# fresh clone; the resolver also picks up a later-built site live).
CHRONICLE_SITE = REPO_ROOT / "Chronicle" / "runtime" / "site"
# RV26: no-cache UNIFORM - all mkdocs output is unhashed (C6 applies
# to assets exactly as to pages); revalidation is cheap local 304s.
CHRONICLE_HEADERS = {"Cache-Control": "no-cache"}
# Pinned types (Windows registry mimetypes are unreliable).
CHRONICLE_TYPES = {".html": "text/html", ".css": "text/css",
                   ".js": "application/javascript",
                   ".svg": "image/svg+xml", ".png": "image/png",
                   ".json": "application/json", ".ico": "image/x-icon",
                   ".woff2": "font/woff2", ".woff": "font/woff"}
# RV25b: the self-healing not-built page - ANY landing (a mid-swap
# navigation, a tab opened before the first build) re-asks every 5s
# and enters the site the moment it exists.
CHRONICLE_404 = (
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<meta http-equiv='refresh' content='5'>"
    "<title>Chronicle not built</title></head>"
    "<body style='background:#020617;color:#cbd5e1;"
    "font-family:sans-serif;display:grid;place-items:center;"
    "height:100vh;margin:0'><div style='max-width:34rem'>"
    "<h2>&#128214; Chronicle not built yet</h2>"
    "<p>Keep the tracker running &mdash; its loop builds the site "
    "within a minute (or run "
    "<code>Scripts/Chronicle/generate.bat</code> once; MkDocs comes "
    "from <code>Scripts/Chronicle/install.bat</code>).</p>"
    "<p style='color:#64748b'>This page retries every 5 seconds.</p>"
    "</div></body></html>")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
chronicle_log = logging.getLogger("katlab.chronicle")


def spawn_chronicle_loop ():
    """PLAN v0.2.6.0 A.2 (R-BC): the regen loop as a guarded child.
    Guards: demo never spawns (KATLAB_TRACKER_CONFIG set); module
    present; the SYSTEM python's mkdocs probes OK - RV4: the tracker
    lives in .venv which has NO mkdocs (user-ruled plain pip), so the
    spawn and the probe use shutil.which("python"), NEVER
    sys.executable. RV28: data/logs self-created (a directly-run
    server has no bat mkdir). Returns (proc, logfile) or (None, None)
    - the Chronicle stays OPTIONAL by construction."""
    if os.environ.get("KATLAB_TRACKER_CONFIG"):
        return None, None  # demo isolation law
    gen = REPO_ROOT / "Scripts" / "Chronicle" / "generate.py"
    if not gen.is_file():
        return None, None
    py = shutil.which("python")  # RV4 - never sys.executable
    if not py:
        chronicle_log.info("no python on PATH - Chronicle loop skipped")
        return None, None
    try:
        probe = subprocess.run([py, "-m", "mkdocs", "--version"],
                               capture_output=True, timeout=30,
                               creationflags=subprocess.CREATE_NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired):  # R-BD: probe too
        probe = None
    if probe is None or probe.returncode != 0:
        chronicle_log.info(
            "mkdocs not installed for the PATH python - Chronicle loop "
            "skipped (run Scripts/Chronicle/install.bat to enable)")
        return None, None
    log_dir = REPO_ROOT / "data" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)  # RV28
    logfile = open(log_dir / "chronicle.log", "a", encoding="utf-8")
    try:
        proc = subprocess.Popen(
            # CFT-6 (V7 live-proven violated): -u, or the child's prints
            # sit in a BLOCK buffer for hours (~60 B/tick vs 8 KB) and
            # chronicle.log stays 0 bytes while the loop visibly builds.
            [py, "-u", str(gen), "--loop", "60", "--build"],
            cwd=str(gen.parent), stdout=logfile, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW)  # R-BD: no window
    except OSError as exc:
        # CFT-14: the OPTIONAL law must hold on the spawn itself too -
        # this runs PRE-YIELD in the lifespan, so an unguarded raise
        # would kill the TRACKER over its optional child (and leak
        # the log handle).
        logfile.close()
        chronicle_log.info("Chronicle loop spawn failed (%s) - "
                           "tracker unaffected", exc)
        return None, None
    chronicle_log.info("Chronicle regen loop spawned (pid %s) - site at "
                       "/chronicle/", proc.pid)
    return proc, logfile


def create_app () -> FastAPI:
    config = load_config(CONFIG_PATH)  # F44: authoring errors raise -> fail fast
    tracker = Tracker(config)

    @asynccontextmanager
    async def lifespan (app: FastAPI):
        tracker.set_broadcaster(ws.broadcast)
        await tracker.startup()
        # PLAN v0.2.6.0 A.2 (R-BC): the tracker OWNS the Chronicle
        # regen loop; RV14: the pre-yield spawn's first tick beats
        # uvicorn and skips (designed degrade) - first build ~60s
        # after a cold start, warm starts never notice.
        loop_proc, loop_log = spawn_chronicle_loop()
        app.state.chronicle_proc = loop_proc
        yield
        if loop_proc is not None:
            loop_proc.terminate()
            try:
                loop_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                loop_proc.kill()
        if loop_log is not None:
            loop_log.close()
        await tracker.shutdown()

    app = FastAPI(title="KATLAB TrackingMonitor", version=__version__, lifespan=lifespan)
    app.state.tracker = tracker
    app.include_router(routes.router)
    app.include_router(ws.router)

    # v0.2.0.1 D2 (B.2): the live stats badge - root-level (README-
    # friendly URL), OUTSIDE the FRONTEND_DIST guard (server-rendered,
    # no dist needed). Local previews only - github.com's camo proxy
    # cannot reach 127.0.0.1 (the guideline states the limit).
    @app.get("/badge/{repo_id}.svg")
    def badge (repo_id: str):
        status = tracker.status.get(repo_id)
        if status is None:
            raise HTTPException(status_code=404, detail=f"unknown repo: {repo_id}")
        svg = build_badge(repo_id, clean=bool(status.get("clean")),
                          offline=bool(status.get("offline")),
                          count=int(status.get("count", 0)),
                          events_7d=events_last_7d(repo_id))
        # max-age=300: a live badge that local previews refresh within
        # minutes (never no-store - VS Code re-fetches politely).
        return Response(content=svg, media_type="image/svg+xml",
                        headers={"Cache-Control": "max-age=300"})

    # PLAN v0.2.6.0 A.1 (R-BA): the one-port merge. RV29 (405-proven
    # live): FastAPI's @app.get never auto-adds HEAD, and BOTH
    # self-healing mechanisms (the UI's probe + refresh.js's poll)
    # are HEAD requests - the methods are EXPLICIT.
    @app.api_route("/chronicle", methods=["GET", "HEAD"],
                   include_in_schema=False)
    def chronicle_redirect ():
        # relative links require the trailing slash (subpath law)
        return RedirectResponse(url="/chronicle/", status_code=307)

    @app.api_route("/chronicle/{path:path}", methods=["GET", "HEAD"],
                   include_in_schema=False)
    def chronicle (path: str):
        target = CHRONICLE_SITE / path if path else CHRONICLE_SITE / "index.html"
        try:
            resolved = target.resolve()
            # traversal guard: inside the site dir or a 404, never a 500
            if not resolved.is_relative_to(CHRONICLE_SITE.resolve()):
                resolved = None
        except OSError:
            resolved = None
        if resolved is not None and resolved.is_dir():
            # CFT-5: a BARE dir URL (/chronicle/devlog) must redirect
            # to the slashed form - served in place, the browser would
            # resolve the page's RELATIVE links against the PARENT
            # (base = /chronicle/) and every asset/link lands one
            # level too high. The slashed URL re-enters here with the
            # correct base and serves the dir index below.
            if path and not path.endswith("/"):
                return RedirectResponse(url=f"/chronicle/{path}/",
                                        status_code=307)
            resolved = resolved / "index.html"
        if resolved is not None and resolved.name == "404.html":
            resolved = None  # mkdocs' 404.html is NEVER served (the one
            # absolute-path file in the build - ours replaces it)
        if resolved is None or not resolved.is_file():
            return Response(content=CHRONICLE_404, status_code=404,
                            media_type="text/html",
                            headers=CHRONICLE_HEADERS)
        media = CHRONICLE_TYPES.get(
            resolved.suffix.lower(),
            mimetypes.guess_type(resolved.name)[0]
            or "application/octet-stream")
        return FileResponse(resolved, media_type=media,
                            headers=CHRONICLE_HEADERS)

    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/")
        def index ():
            # C6 (v0.1.3.0, user-reported): index.html must NOT be browser-
            # cached, else a rebuild's new hashed bundle is never picked up
            # (the stale index still points at the old assets). The hashed
            # /assets/* files ARE immutable, so only index.html needs this.
            return FileResponse(FRONTEND_DIST / "index.html",
                                headers={"Cache-Control": "no-cache"})

        # C4: browsers probe /favicon.ico when no icon is declared/served -
        # answer BOTH paths with the SVG icon (vite copies public/ to dist/).
        @app.get("/favicon.svg")
        @app.get("/favicon.ico")
        def favicon ():
            return FileResponse(FRONTEND_DIST / "favicon.svg", media_type="image/svg+xml")

        # v0.1.12.0 D2 (B.2): the PWA shell. Explicit routes ONLY - no
        # StaticFiles mount for /icons (RV2: StaticFiles raises at
        # CONSTRUCTION on a missing directory, so a stale pre-v0.1.12.0
        # dist would pass the FRONTEND_DIST guard yet kill the server at
        # startup; explicit routes degrade to per-request errors instead).
        @app.get("/manifest.webmanifest")
        def manifest ():
            return FileResponse(FRONTEND_DIST / "manifest.webmanifest",
                                media_type="application/manifest+json")

        @app.get("/sw.js")
        def service_worker ():
            # no-cache: a stale service worker is the classic PWA trap.
            return FileResponse(FRONTEND_DIST / "sw.js",
                                media_type="application/javascript",
                                headers={"Cache-Control": "no-cache"})

        @app.get("/icons/icon-192.png")
        def icon_192 ():
            return FileResponse(FRONTEND_DIST / "icons" / "icon-192.png",
                                media_type="image/png")

        @app.get("/icons/icon-512.png")
        def icon_512 ():
            return FileResponse(FRONTEND_DIST / "icons" / "icon-512.png",
                                media_type="image/png")
    else:
        @app.get("/")
        def index_missing ():
            return {"message": "Frontend not built - run Scripts/start_tracking_monitor.bat "
                               "(it builds Frontend/dist on first run)"}

    return app


if __name__ == "__main__":
    import sys

    import uvicorn

    try:
        config = load_config(CONFIG_PATH)
    except ConfigAuthoringError as exc:
        print(f"[CONFIG ERROR] {exc}")  # F44 fail-fast tier
        sys.exit(1)

    print(f"KATLAB TrackingMonitor v{__version__} "
          f"-> http://{config.server.host}:{config.server.port}")
    # PLAN v0.2.6.0 RV21: access logs retired - the regen loop's own
    # REST calls (~11.5k lines/day) plus the freshness poller would
    # drown data\logs\tracker.log; app-level + error logs stay.
    uvicorn.run("Backend.app.main:create_app", factory=True,
                host=config.server.host, port=config.server.port,
                log_level="info", access_log=False)
