"""KATLAB TrackingMonitor server (PLAN v0.1.0.0 C.3).

Run: python -m Backend.app.main  (from the repo root; the BAT does this).
F10: host/port come from Config/repos.yaml - the SINGLE source; no port is
hardcoded anywhere else in the backend.
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import routes, ws
from .config import ConfigAuthoringError, load_config
from .version import __version__
from .watcher import Tracker

REPO_ROOT = Path(__file__).resolve().parents[2]
# KATLAB_TRACKER_CONFIG env override: used by demo mode (Scripts/start_demo.bat)
CONFIG_PATH = Path(os.environ.get("KATLAB_TRACKER_CONFIG",
                                  str(REPO_ROOT / "Config" / "repos.yaml")))
FRONTEND_DIST = REPO_ROOT / "Frontend" / "dist"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")


def create_app () -> FastAPI:
    config = load_config(CONFIG_PATH)  # F44: authoring errors raise -> fail fast
    tracker = Tracker(config)

    @asynccontextmanager
    async def lifespan (app: FastAPI):
        tracker.set_broadcaster(ws.broadcast)
        await tracker.startup()
        yield
        await tracker.shutdown()

    app = FastAPI(title="KATLAB TrackingMonitor", version=__version__, lifespan=lifespan)
    app.state.tracker = tracker
    app.include_router(routes.router)
    app.include_router(ws.router)

    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/")
        def index ():
            return FileResponse(FRONTEND_DIST / "index.html")
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
    uvicorn.run("Backend.app.main:create_app", factory=True,
                host=config.server.host, port=config.server.port, log_level="info")
