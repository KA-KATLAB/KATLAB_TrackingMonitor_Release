"""Disabled KATLAB Scribe command surface for v0.3.0.3.

Re-enabling Scribe requires a separately reviewed integration. This module
deliberately remains stdlib-only and performs no repository, tracker,
configuration, network, process, quota, or story I/O.
"""

import re
import sys
from datetime import date


DISABLED_MESSAGE = (
    "[DISABLED] KATLAB Scribe is disabled in v0.3.0.3; "
    "reviewed integration required."
)
USAGE_MESSAGE = (
    "Usage: scribe.py [--force | --day YYYY-MM-DD [--force] | "
    "--week YYYY-Www [--force] | --release REPO vX.Y.Z.W [--force]]"
)

_DAY_RX = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", re.ASCII)
_WEEK_RX = re.compile(r"^([0-9]{4})-W([0-9]{2})$", re.ASCII)
_REPO_RX = re.compile(r"^[A-Za-z0-9_-]+$", re.ASCII)
_VERSION_RX = re.compile(
    r"^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$", re.ASCII,
)


def _ascii_without_controls (value: str) -> bool:
    return all(0x20 <= ord(character) <= 0x7e for character in value)


def _real_day (value: str) -> bool:
    if _DAY_RX.fullmatch(value) is None:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _real_week (value: str) -> bool:
    match = _WEEK_RX.fullmatch(value)
    if match is None:
        return False
    try:
        date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
    except ValueError:
        return False
    return True


def _valid_arguments (argv: list[str]) -> bool:
    if any(not isinstance(value, str) or not _ascii_without_controls(value)
           for value in argv):
        return False
    if argv == [] or argv == ["--force"]:
        return True
    if len(argv) in (2, 3) and argv[0] == "--day":
        return _real_day(argv[1]) and (len(argv) == 2 or argv[2] == "--force")
    if len(argv) in (2, 3) and argv[0] == "--week":
        return _real_week(argv[1]) and (len(argv) == 2 or argv[2] == "--force")
    if len(argv) in (3, 4) and argv[0] == "--release":
        return (
            _REPO_RX.fullmatch(argv[1]) is not None
            and _VERSION_RX.fullmatch(argv[2]) is not None
            and (len(argv) == 3 or argv[3] == "--force")
        )
    return False


def auto_tick (_model: dict, heartbeat=None) -> None:
    """Retained import-compatible hook; disabled and intentionally inert."""


def main (argv: list[str]) -> int:
    if _valid_arguments(argv):
        print(DISABLED_MESSAGE, file=sys.stderr)
        return 3
    print(USAGE_MESSAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
