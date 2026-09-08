"""KATLAB's failure-swallowing provider entry point and fail-closed capture router.

No arguments preserves the installed Claude PostToolUse file channel. New
registrations explicitly select a provider and channel. Every failure is swallowed
at this boundary so editor/agent execution always receives exit status zero.
"""

import sys

try:
    from .katlab_activity import (
        append_file_event,
        load_hook_checks,
        load_registered_repos,
        publish_activity,
        read_bounded_json,
    )
    from .provider_adapters import activity_record, check_record, file_captures
except ImportError:  # Absolute invocation from Claude/Codex settings.
    from katlab_activity import (  # type: ignore
        append_file_event,
        load_hook_checks,
        load_registered_repos,
        publish_activity,
        read_bounded_json,
    )
    from provider_adapters import activity_record, check_record, file_captures  # type: ignore


PROVIDERS = {"claude", "codex"}
CHANNELS = {"file", "activity", "check"}


def parse_cli (args: list[str]) -> tuple[str, str, bool] | None:
    if not args:
        return "claude", "file", True
    if len(args) != 4:
        return None
    values: dict[str, str] = {}
    for index in (0, 2):
        key = args[index]
        if key not in {"--provider", "--channel"} or key in values:
            return None
        values[key] = args[index + 1]
    provider = values.get("--provider")
    channel = values.get("--channel")
    if provider not in PROVIDERS or channel not in CHANNELS:
        return None
    return provider, channel, False


def run (args: list[str] | None = None) -> None:
    selection = parse_cli(list(sys.argv[1:] if args is None else args))
    if selection is None:
        return
    provider, channel, legacy = selection

    repos = load_registered_repos()
    if not repos:
        return
    payload = read_bounded_json(sys.stdin.buffer)

    if channel == "file":
        for capture in file_captures(provider, payload, repos, legacy=legacy):
            try:
                append_file_event(capture.repo, capture.event)
            except Exception:
                continue
        return

    if channel == "activity":
        record = activity_record(provider, payload, repos)
        if record is not None:
            publish_activity(record, durable=False, repos=repos)
        return

    checks = load_hook_checks(repos)
    record = check_record(provider, payload, repos, checks)
    if record is not None:
        publish_activity(record, durable=True, repos=repos)


def main () -> None:
    try:
        run()
    except Exception:
        pass


if __name__ == "__main__":
    main()
    raise SystemExit(0)
