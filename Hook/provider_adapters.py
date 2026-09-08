"""Provider-specific payload projection into KATLAB's metadata-only model."""

import re
from dataclasses import dataclass
from pathlib import Path

try:
    from .katlab_activity import (
        EVENT_VERSION,
        HookCheck,
        RegisteredRepo,
        match_hook_check,
        normalized_changed_paths,
        now_z,
        read_branch,
        repo_for_cwd,
        safe_text,
    )
except ImportError:  # Absolute script invocation from the Hook directory.
    from katlab_activity import (  # type: ignore
        EVENT_VERSION,
        HookCheck,
        RegisteredRepo,
        match_hook_check,
        normalized_changed_paths,
        now_z,
        read_branch,
        repo_for_cwd,
        safe_text,
    )


CLAUDE_FILE_TOOLS = {"Edit", "Write", "MultiEdit"}
ACTIVITY_KIND = {
    "SessionStart": "session_start",
    "SessionEnd": "session_end",
    "Stop": "turn_stop",
    "Interrupt": "turn_interrupt",
    "SubagentStart": "agent_start",
    "SubagentStop": "agent_stop",
    "PostToolUse": "tool_finished",
    "PostToolUseFailure": "tool_finished",
}
_PATCH_HEADER = re.compile(
    r"^\*\*\* (?P<kind>Update File|Add File|Delete File|Move to): (?P<path>.+)$"
)


@dataclass(frozen=True)
class FileCapture:
    repo: RegisteredRepo
    event: dict


def _dict (value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _codex_patch_paths (payload: dict) -> list[tuple[object, str]]:
    if payload.get("tool_name") != "apply_patch":
        return []
    command = _dict(payload.get("tool_input")).get("command")
    if not isinstance(command, str):
        return []
    paths: list[tuple[object, str]] = []
    operation = {
        "Update File": "update",
        "Add File": "add",
        "Delete File": "delete",
        "Move to": "move",
    }
    for line in command.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        match = _PATCH_HEADER.fullmatch(line)
        if match:
            paths.append((match.group("path").strip(), operation[match.group("kind")]))
    return paths


def changed_path_inputs (provider: str, payload: dict) -> list[tuple[object, str]]:
    tool = payload.get("tool_name")
    if provider == "claude" and tool in CLAUDE_FILE_TOOLS:
        file_path = _dict(payload.get("tool_input")).get("file_path")
        operation = "write" if tool == "Write" else "update"
        return [(file_path, operation)]
    if provider == "codex":
        return _codex_patch_paths(payload)
    return []


def _common_context (provider: str, payload: dict) -> dict:
    values = {
        "session_id": safe_text(payload.get("session_id"), 256),
        "turn_id": safe_text(payload.get("turn_id"), 256),
        "agent_id": safe_text(payload.get("agent_id"), 256),
        "parent_agent_id": safe_text(payload.get("parent_agent_id"), 256),
        "agent_type": safe_text(payload.get("agent_type"), 128),
        "model": safe_text(payload.get("model"), 128),
        "permission_mode": safe_text(payload.get("permission_mode"), 64),
        "tool_use_id": safe_text(payload.get("tool_use_id"), 256),
        "tool_name": safe_text(payload.get("tool_name"), 128),
    }
    return {key: value for key, value in values.items() if value is not None}


def _tool_class (tool_name: str | None) -> str | None:
    if not tool_name:
        return None
    if tool_name in CLAUDE_FILE_TOOLS or tool_name == "apply_patch":
        return "file"
    if tool_name in {"Bash", "exec_command"}:
        return "shell"
    if tool_name.startswith("mcp__"):
        return "mcp"
    return "other"


def file_captures (provider: str, payload: dict,
                   repos: list[RegisteredRepo], legacy: bool = False) -> list[FileCapture]:
    raw_paths = changed_path_inputs(provider, payload)
    changed = normalized_changed_paths(raw_paths, payload.get("cwd"), repos)
    captures: list[FileCapture] = []
    tool_name = safe_text(payload.get("tool_name"), 128) or "?"
    context = _common_context(provider, payload)
    captured_at = now_z()
    for repo, relative, operation in changed:
        event = {
            "v": EVENT_VERSION,
            "ts": captured_at,
            "tool": tool_name,
            "file": Path(*relative.parts).as_posix(),
            "session_id": context.get("session_id"),
            "branch": read_branch(repo.root),
        }
        if not legacy:
            event["provider"] = provider
            for name in ("turn_id", "agent_id", "tool_use_id"):
                if name in context:
                    event[name] = context[name]
            event["operation"] = operation
        captures.append(FileCapture(repo, event))
    return captures


def activity_record (provider: str, payload: dict,
                     repos: list[RegisteredRepo]) -> dict | None:
    event_name = payload.get("hook_event_name")
    if not isinstance(event_name, str) or event_name not in ACTIVITY_KIND:
        return None
    if provider == "claude" and event_name == "Interrupt":
        return None

    kind = ACTIVITY_KIND[event_name]
    changed = normalized_changed_paths(
        changed_path_inputs(provider, payload), payload.get("cwd"), repos,
    )
    repo_ids = list(dict.fromkeys(item[0].id for item in changed))
    if not repo_ids:
        cwd_repo = repo_for_cwd(payload.get("cwd"), repos)
        if cwd_repo is not None:
            repo_ids = [cwd_repo.id]

    context = _common_context(provider, payload)
    session_id = context.get("session_id")
    lifecycle = kind in {
        "session_start", "session_end", "turn_stop", "turn_interrupt",
        "agent_start", "agent_stop",
    }
    if not repo_ids and (not lifecycle or not session_id):
        return None

    record = {
        "provider": provider,
        "evidence_source": "hook",
        "kind": kind,
        "ts": now_z(),
        "delivery_class": "best_effort",
        "repo_ids": repo_ids,
        **context,
    }
    tool_name = context.get("tool_name")
    tool_class = _tool_class(tool_name)
    if tool_class is not None:
        record["tool_class"] = tool_class

    duration = payload.get("duration_ms")
    if isinstance(duration, int) and not isinstance(duration, bool) and 0 <= duration <= 86_400_000:
        record["duration_ms"] = duration

    if kind == "tool_finished":
        if provider == "claude" and event_name == "PostToolUse":
            record["outcome"] = "success"
        elif provider == "claude" and event_name == "PostToolUseFailure":
            record["outcome"] = "cancelled" if payload.get("is_interrupt") is True else "failure"
        else:
            record["outcome"] = "unknown"
    return record


def check_record (provider: str, payload: dict, repos: list[RegisteredRepo],
                  checks: list[HookCheck]) -> dict | None:
    event_name = payload.get("hook_event_name")
    if event_name not in {"PreToolUse", "PostToolUse", "PostToolUseFailure"}:
        return None
    matched = match_hook_check(payload, repos, checks)
    if matched is None:
        return None
    check, repo = matched
    context = _common_context(provider, payload)
    if not context.get("session_id") or not context.get("tool_use_id"):
        return None

    started = event_name == "PreToolUse"
    record = {
        "provider": provider,
        "evidence_source": "hook",
        "kind": "check_started" if started else "check_finished",
        "ts": now_z(),
        "delivery_class": "durable",
        "repo_ids": [repo.id],
        "check_id": check.id,
        "check_revision": check.revision,
        **context,
    }
    record["tool_class"] = "shell"
    if not started:
        if provider == "claude":
            if event_name == "PostToolUse":
                # Claude Code 2.1.258 exposes no trustworthy structured Bash exit
                # status here. PostToolUse proves tool completion, not an approved
                # check exit code; never parse stdout/stderr to guess one.
                record["outcome"] = "unknown"
            elif payload.get("is_interrupt") is True:
                record["outcome"] = "cancelled"
            else:
                record["outcome"] = "fail"
        else:
            # Codex 0.153.4 does not expose a trustworthy structured exit status
            # in PostToolUse. Never infer it from tool_response text.
            record["outcome"] = "unknown"
    return record
