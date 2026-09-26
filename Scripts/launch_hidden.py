"""Short-lived Windows launcher; leave no CMD wrapper around the backend."""

import argparse
import os
from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]


def launch_hidden (command: list[str], *, cwd: Path,
                   log_path: Path) -> subprocess.Popen:
    """Start without a shell/console, handing the child independent log handles."""
    if os.name != "nt":
        raise OSError("The hidden launcher requires Windows")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("ab", buffering=0) as log:
        # Do not context-manage Popen: that would wait for the server to exit.
        # Valid standard handles are essential even for the GUI Python runtime.
        return subprocess.Popen(
            command, cwd=str(cwd), stdin=subprocess.DEVNULL,
            stdout=log, stderr=subprocess.STDOUT, shell=False, close_fds=True,
            creationflags=subprocess.CREATE_NO_WINDOW)


def main (argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("tracker", "demo"))
    args = parser.parse_args(argv)
    log_path = REPO_ROOT / ("data/logs/tracker.log" if args.mode == "tracker"
                            else "Demo/runtime/demo.log")
    # Keep the venv's GUI redirector AND base interpreter console-free. A venv
    # python.exe redirector can launch its base with no inherited creation flags.
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    try:
        process = launch_hidden(
            [str(pythonw), "-u", "-m", "Backend.app.main"],
            cwd=REPO_ROOT, log_path=log_path)
    except OSError as exc:
        print(f"[ABORT] Hidden launch failed: {exc}", file=sys.stderr)
        return 1
    print(f"Launch requested (PID {process.pid}); startup details: {log_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
