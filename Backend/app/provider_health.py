"""Read-only, content-free provider capability health."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import db


HOOK_MARKER = "katlab_tracking_hook.py"
HOOK_PATH = (
    Path(__file__).resolve().parents[2] / "Hook" / HOOK_MARKER
).resolve(strict=False)
RECENT_SECONDS = 24 * 60 * 60
DEFAULT_SETTINGS = {
    "claude": Path.home() / ".claude" / "settings.json",
    "codex": Path.home() / ".codex" / "hooks.json",
}

COMMON = (
    ("SessionStart", None, "activity", True),
    ("SessionEnd", None, "activity", True),
    ("SubagentStart", None, "activity", True),
    ("SubagentStop", None, "activity", True),
    ("Stop", None, "activity", True),
    ("PreToolUse", "^Bash$", "check", False),
    ("PostToolUse", "^Bash$", "check", False),
    ("PostToolUse", None, "activity", True),
)
EXPECTED = {
    "claude": COMMON + (
        ("PostToolUse", "^(Edit|Write|MultiEdit)$", "legacy-file", False),
        ("PostToolUseFailure", "^Bash$", "check", False),
        ("PostToolUseFailure", None, "activity", True),
    ),
    "codex": COMMON + (
        ("PostToolUse", "^apply_patch$", "file", False),
        ("Interrupt", None, "activity", True),
    ),
}


def _epoch (value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, OSError, OverflowError):
        return None


def _handlers (value: dict):
    hooks = value.get("hooks")
    if not isinstance(hooks, dict):
        return
    for event, groups in hooks.items():
        if not isinstance(event, str) or not isinstance(groups, list):
            continue
        for group in groups:
            if not isinstance(group, dict) or not isinstance(group.get("hooks"), list):
                continue
            matcher = group.get("matcher")
            for handler in group["hooks"]:
                if isinstance(handler, dict):
                    yield event, matcher, handler


def _is_katlab_command (command: object) -> bool:
    if not isinstance(command, str):
        return False
    expected = f'"{os.path.normcase(str(HOOK_PATH))}"'
    return expected in os.path.normcase(command)


def _hook_arguments (command: str) -> list[str] | None:
    normalized = os.path.normcase(command.strip())
    hook_token = f'"{os.path.normcase(str(HOOK_PATH))}"'
    if normalized.count(hook_token) != 1:
        return None
    prefix, arguments = normalized.split(hook_token, 1)
    if not prefix.strip():
        return None
    return arguments.split()


def _signature_matches (provider: str, expected: tuple, observed: tuple) -> bool:
    event, matcher, channel, asynchronous = expected
    got_event, got_matcher, handler = observed
    command = handler.get("command")
    async_value = handler.get("async", False)
    if (got_event != event or got_matcher != matcher
            or handler.get("type") != "command" or not isinstance(command, str)
            or not _is_katlab_command(command)
            or not isinstance(async_value, bool) or async_value != asynchronous):
        return False
    arguments = _hook_arguments(command)
    if arguments is None:
        return False
    if channel == "legacy-file":
        return arguments == []
    return arguments in (
        ["--provider", provider, "--channel", channel],
        ["--channel", channel, "--provider", provider],
    )


def validate_provider_settings (provider: str, path: Path) -> tuple[bool, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return False, "settings_missing"
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False, "settings_invalid"
    if not isinstance(value, dict):
        return False, "settings_invalid"
    observed = list(_handlers(value))
    katlab = [
        row for row in observed
        if _is_katlab_command(row[2].get("command"))
    ]
    expected = EXPECTED[provider]
    if len(katlab) != len(expected):
        return False, "registration_incomplete"
    if any(sum(_signature_matches(provider, item, row) for row in katlab) != 1
           for item in expected):
        return False, "registration_invalid"
    return True, "configured"


def provider_health (settings_paths: dict[str, Path] | None = None,
                     now: str | None = None) -> list[dict]:
    paths = settings_paths or DEFAULT_SETTINGS
    now_epoch = _epoch(now) if now is not None else datetime.now(timezone.utc).timestamp()
    adapter_present = HOOK_PATH.is_file() and (
        HOOK_PATH.parent / "provider_adapters.py"
    ).is_file()
    rows = []
    for provider in ("claude", "codex"):
        valid, state = validate_provider_settings(provider, paths[provider])
        last = db.get_provider_last_activity(provider)
        last_epoch = _epoch(last)
        recent = (
            now_epoch is not None and last_epoch is not None
            and 0 <= now_epoch - last_epoch <= RECENT_SECONDS
        )
        rows.append({
            "provider": provider,
            "adapter_present": adapter_present,
            "configuration_valid": valid,
            "configuration_state": state,
            "recently_observed": recent,
            "last_observed_at": last,
        })
    return rows
