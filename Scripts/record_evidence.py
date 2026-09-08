"""Record explicit KATLAB verification evidence without touching source repos."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from Backend.app.plan_parser import (  # noqa: E402
    PlanReadError,
    acquire_stable_plan_bytes,
    parse_plan_bytes,
)
from Backend.app.resolver import glob_to_regex  # noqa: E402
from Hook.katlab_activity import (  # noqa: E402
    CaptureInputError,
    CONFIG_ENV,
    DEFAULT_CONFIG_PATH,
    load_hook_checks,
    load_registered_repos,
    now_z,
    publish_activity,
)


REVIEW_OUTCOMES = {"clean", "finding"}
CHECK_OUTCOMES = {"pass", "fail", "cancelled"}


class EvidenceInputError(Exception):
    """One safe operator-facing validation failure."""


def _relative_plan (value: str) -> str:
    if not value or len(value) > 1_024 or "\x00" in value or "\\" in value or ":" in value:
        raise EvidenceInputError("plan must be one normalized repository-relative path")
    path = PurePosixPath(value)
    if (path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts)
            or path.as_posix() != value):
        raise EvidenceInputError("plan must be one normalized repository-relative path")
    return path.as_posix()


def _selected_plan (repo_root: Path, relative: str) -> Path:
    try:
        root = repo_root.resolve(strict=True)
        candidate = (root / Path(*PurePosixPath(relative).parts)).resolve(strict=True)
        candidate.relative_to(root)
    except (OSError, ValueError) as exc:
        raise EvidenceInputError("plan is unavailable or outside the repository") from exc
    if not candidate.is_file():
        raise EvidenceInputError("plan is unavailable or outside the repository")
    return candidate


def parse_args (args: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record explicit KATLAB verification evidence.",
    )
    parser.add_argument("--repo", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--check", required=True)
    parser.add_argument("--outcome", required=True)
    return parser.parse_args(args)


def build_record (options: argparse.Namespace) -> tuple[dict, list]:
    config_path = Path(os.environ.get(CONFIG_ENV) or DEFAULT_CONFIG_PATH)
    repos = load_registered_repos(config_path)
    if not repos:
        raise EvidenceInputError("repository registry is unavailable or invalid")
    repo = next((item for item in repos if item.id == options.repo), None)
    if repo is None:
        raise EvidenceInputError("repository ID is not registered")

    relative = _relative_plan(options.plan)
    if not any(glob_to_regex(pattern).match(relative) for pattern in repo.plan_globs):
        raise EvidenceInputError("plan is outside the repository's configured plan_globs")
    path = _selected_plan(repo.root, relative)
    try:
        parsed = parse_plan_bytes(
            acquire_stable_plan_bytes(path), "selected plan",
        )
    except PlanReadError as exc:
        raise EvidenceInputError("plan could not be read stably") from exc
    if parsed.fatal or parsed.warnings:
        raise EvidenceInputError("plan is not currently usable")
    if not any(requirement.id == options.check for requirement in parsed.requirements):
        raise EvidenceInputError("plan does not declare the selected check")

    if options.check.startswith("review:"):
        if options.outcome not in REVIEW_OUTCOMES:
            raise EvidenceInputError("review outcome must be clean or finding")
        kind = "review_result"
    else:
        checks = load_hook_checks(repos, config_path.parent / "checks.json")
        check = next((item for item in checks if item.id == options.check), None)
        if (check is None or repo.id not in check.repo_ids
                or "manual" not in check.evidence_sources):
            raise EvidenceInputError("check is not approved for manual evidence")
        if options.outcome not in CHECK_OUTCOMES:
            raise EvidenceInputError("check outcome must be pass, fail, or cancelled")
        kind = "check_finished"

    return ({
        "provider": "manual",
        "evidence_source": "manual",
        "kind": kind,
        "ts": now_z(),
        "delivery_class": "durable",
        "repo_ids": [repo.id],
        "plan_repo_id": repo.id,
        "plan_file": relative,
        "check_id": options.check,
        "outcome": options.outcome,
    }, repos)


def main (args: list[str] | None = None) -> int:
    options = parse_args(args)
    try:
        record, repos = build_record(options)
        publish_activity(record, durable=True, repos=repos)
    except (EvidenceInputError, CaptureInputError, OSError,
            UnicodeError, ValueError) as exc:
        print(f"EVIDENCE ERROR: {exc}", file=sys.stderr)
        return 2
    print("Evidence recorded; TrackingMonitor will ingest it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
