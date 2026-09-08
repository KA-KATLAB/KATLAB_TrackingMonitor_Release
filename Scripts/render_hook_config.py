"""Render merge-ready KATLAB hook snippets without changing provider settings."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Iterator


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "Hook" / "katlab_tracking_hook.py"
PROVIDER_BASELINES = {
    "claude": "Claude Code 2.1.258",
    "codex": "Codex CLI 0.153.4",
}


def _quoted (value: Path) -> str:
    text = str(value.resolve(strict=False))
    if '"' in text or "\n" in text or "\r" in text:
        raise ValueError("hook command paths cannot contain quotes or newlines")
    return f'"{text}"'


def hook_command (provider: str, channel: str, *, legacy: bool = False,
                  python_path: Path | None = None,
                  hook_path: Path | None = None) -> str:
    command = f"{_quoted(python_path or Path(sys.executable))} {_quoted(hook_path or HOOK)}"
    if not legacy:
        command += f" --provider {provider} --channel {channel}"
    return command


def _handler (command: str, *, asynchronous: bool) -> dict:
    value = {"type": "command", "command": command, "timeout": 10}
    if asynchronous:
        value["async"] = True
    return value


def _group (command: str, *, matcher: str | None = None,
            asynchronous: bool = False) -> dict:
    value = {"hooks": [_handler(command, asynchronous=asynchronous)]}
    if matcher is not None:
        value["matcher"] = matcher
    return value


def render_config (provider: str, *, python_path: Path | None = None,
                   hook_path: Path | None = None) -> dict:
    """Return only the provider's mergeable ``hooks`` object."""
    if provider not in PROVIDER_BASELINES:
        raise ValueError(f"unsupported provider: {provider}")

    def command (channel: str, *, legacy: bool = False) -> str:
        return hook_command(
            provider, channel, legacy=legacy,
            python_path=python_path, hook_path=hook_path,
        )

    activity = command("activity")
    check = command("check")
    hooks: dict[str, list[dict]] = {
        "SessionStart": [_group(activity, asynchronous=True)],
        "SessionEnd": [_group(activity, asynchronous=True)],
        "SubagentStart": [_group(activity, asynchronous=True)],
        "SubagentStop": [_group(activity, asynchronous=True)],
        "Stop": [_group(activity, asynchronous=True)],
        "PreToolUse": [_group(check, matcher="^Bash$", asynchronous=False)],
        "PostToolUse": [],
    }

    if provider == "claude":
        hooks["PostToolUse"].extend([
            _group(
                command("file", legacy=True),
                matcher="^(Edit|Write|MultiEdit)$", asynchronous=False,
            ),
            _group(check, matcher="^Bash$", asynchronous=False),
            _group(activity, asynchronous=True),
        ])
        hooks["PostToolUseFailure"] = [
            _group(check, matcher="^Bash$", asynchronous=False),
            _group(activity, asynchronous=True),
        ]
    else:
        hooks["PostToolUse"].extend([
            _group(command("file"), matcher="^apply_patch$", asynchronous=False),
            _group(check, matcher="^Bash$", asynchronous=False),
            _group(activity, asynchronous=True),
        ])
        hooks["Interrupt"] = [_group(activity, asynchronous=True)]

    return {"hooks": hooks}


def _strings (value: object) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)


def existing_katlab_registrations (settings_path: Path,
                                   hook_path: Path | None = None) -> int:
    """Count existing references; read only and fail loudly on invalid JSON."""
    if not settings_path.exists():
        return 0
    value = json.loads(settings_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("settings root must be a JSON object")
    expected = os.path.normcase(str((hook_path or HOOK).resolve(strict=False)))
    return sum(
        1 for text in _strings(value)
        if expected in os.path.normcase(text)
    )


def parse_args (args: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a KATLAB hook snippet; never write provider settings.",
    )
    parser.add_argument("--provider", choices=sorted(PROVIDER_BASELINES), required=True)
    parser.add_argument(
        "--preflight", type=Path,
        help="Read an existing user settings JSON file and reject KATLAB collisions.",
    )
    return parser.parse_args(args)


def main (args: list[str] | None = None) -> int:
    options = parse_args(args)
    if options.preflight is not None:
        try:
            count = existing_katlab_registrations(options.preflight)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
            print(f"PREFLIGHT ERROR: {exc}", file=sys.stderr)
            return 2
        if count:
            print(
                f"PREFLIGHT STOP: found {count} existing KATLAB hook reference(s); "
                "review and merge without duplication.",
                file=sys.stderr,
            )
            return 3
        print("PREFLIGHT OK: no existing KATLAB hook reference.", file=sys.stderr)

    print(json.dumps(render_config(options.provider), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
