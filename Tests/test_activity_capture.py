"""Focused isolated tests for provider-neutral hook capture."""

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from Hook import katlab_activity
from Hook.katlab_tracking_hook import parse_cli
from Hook.provider_adapters import activity_record, file_captures


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "Hook" / "katlab_tracking_hook.py"
FIXTURES = ROOT / "Tests" / "fixtures" / "hooks"


def _replace_tokens (value, replacements: dict[str, str]):
    if isinstance(value, str):
        for token, replacement in replacements.items():
            value = value.replace(token, replacement)
        return value
    if isinstance(value, list):
        return [_replace_tokens(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: _replace_tokens(item, replacements) for key, item in value.items()}
    return value


class CaptureTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo_a = self.root / "Repo A"
        self.repo_b = self.root / "Repo B"
        for repo in (self.repo_a, self.repo_b):
            (repo / ".git").mkdir(parents=True)
            (repo / ".git" / "HEAD").write_text(
                "ref: refs/heads/feature/synthetic\n", encoding="utf-8",
            )
        self.config = self.root / "repos.yaml"
        self.config.write_text(
            "server:\n  port: 8100\nrepos:\n"
            f"  - id: Repo_A\n    path: '{self.repo_a}'\n"
            f"  - id: Repo_B\n    path: '{self.repo_b}'\n",
            encoding="utf-8",
        )
        self.checks = self.root / "checks.json"
        self.checks.write_text(
            '{"schema_version":1,"checks":[]}\n', encoding="utf-8",
        )
        self.activity_root = self.root / "activity"
        self.env = os.environ.copy()
        self.env["KATLAB_TRACKER_CONFIG"] = str(self.config)
        self.env["KATLAB_TRACKER_ACTIVITY_DIR"] = str(self.activity_root)
        self.replacements = {
            "${REPO_A}": str(self.repo_a),
            "${REPO_B}": str(self.repo_b),
        }

    def tearDown (self) -> None:
        self.temp.cleanup()

    def fixture (self, name: str):
        value = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
        return _replace_tokens(value, self.replacements)

    def invoke (self, payload: object, *args: str, raw: bytes | None = None):
        return subprocess.run(
            [sys.executable, str(HOOK), *args],
            input=raw if raw is not None else json.dumps(payload).encode("utf-8"),
            capture_output=True,
            cwd=self.root,
            env=self.env,
            timeout=10,
            check=False,
        )

    def event_rows (self, repo: Path) -> list[dict]:
        path = repo / ".katlab_tracking" / "events.jsonl"
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def inbox_rows (self) -> list[dict]:
        inbox = self.activity_root / "activity_inbox"
        if not inbox.exists():
            return []
        return [json.loads(path.read_text(encoding="utf-8"))
                for path in sorted(inbox.glob("*.json"))]

    def test_cli_is_strict_and_legacy_omission_is_preserved (self) -> None:
        self.assertEqual(parse_cli([]), ("claude", "file", True))
        self.assertEqual(
            parse_cli(["--channel", "activity", "--provider", "codex"]),
            ("codex", "activity", False),
        )
        self.assertIsNone(parse_cli(["--provider", "other", "--channel", "file"]))
        self.assertIsNone(parse_cli(["--provider", "claude"]))
        self.assertIsNone(parse_cli(["--provider", "claude", "--provider", "codex"]))

    def test_legacy_claude_file_event_keeps_exact_six_field_shape (self) -> None:
        payload = self.fixture("claude_post_tool_success.json")["payload"]
        result = self.invoke(payload)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, b"")
        rows = self.event_rows(self.repo_a)
        self.assertEqual(len(rows), 1)
        self.assertEqual(list(rows[0]), ["v", "ts", "tool", "file", "session_id", "branch"])
        self.assertEqual(rows[0]["file"], "src/alpha.py")
        self.assertEqual(rows[0]["branch"], "feature/synthetic")

    def test_explicit_claude_file_event_adds_only_safe_correlations (self) -> None:
        payload = self.fixture("claude_post_tool_success.json")["payload"]
        result = self.invoke(payload, "--provider", "claude", "--channel", "file")
        self.assertEqual(result.returncode, 0)
        row = self.event_rows(self.repo_a)[0]
        self.assertEqual(row["provider"], "claude")
        self.assertEqual(row["tool_use_id"], "tool-claude-success")
        self.assertEqual(row["operation"], "update")
        self.assertNotIn("tool_input", row)
        self.assertNotIn("tool_response", row)

    def test_codex_patch_routes_deduplicated_paths_across_repositories (self) -> None:
        payload = self.fixture("codex_post_tool.json")["payload"]
        payload["tool_input"]["command"] += (
            "\n*** Update File: " + str(self.repo_a / "src" / "alpha.py")
        )
        result = self.invoke(payload, "--provider", "codex", "--channel", "file")
        self.assertEqual(result.returncode, 0)
        rows_a = self.event_rows(self.repo_a)
        rows_b = self.event_rows(self.repo_b)
        self.assertEqual([row["file"] for row in rows_a],
                         ["src/alpha.py", "src/alpha-renamed.py"])
        self.assertEqual([row["file"] for row in rows_b],
                         ["src/beta.py", "src/obsolete.py"])
        self.assertTrue(all(row["provider"] == "codex" for row in rows_a + rows_b))

    def test_relative_traversal_and_unregistered_paths_are_rejected (self) -> None:
        payload = self.fixture("codex_post_tool.json")["payload"]
        payload["tool_input"]["command"] = (
            "*** Begin Patch\n*** Add File: ../escape.py\n"
            f"*** Add File: {self.root / 'Outside' / 'x.py'}\n*** End Patch"
        )
        result = self.invoke(payload, "--provider", "codex", "--channel", "file")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.event_rows(self.repo_a), [])
        self.assertEqual(self.event_rows(self.repo_b), [])

    def test_activity_is_one_metadata_only_multi_repo_record (self) -> None:
        payload = self.fixture("codex_post_tool.json")["payload"]
        result = self.invoke(payload, "--provider", "codex", "--channel", "activity")
        self.assertEqual(result.returncode, 0)
        rows = self.inbox_rows()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["repo_ids"], ["Repo_A", "Repo_B"])
        self.assertEqual(row["kind"], "tool_finished")
        self.assertEqual(row["delivery_class"], "best_effort")
        forbidden = {
            "tool_input", "tool_response", "command", "prompt", "response",
            "transcript_path", "stdout", "stderr", "error",
        }
        self.assertTrue(forbidden.isdisjoint(row))
        self.assertNotIn("Synthetic", json.dumps(row))

    def test_check_channel_publishes_durable_correlated_metadata (self) -> None:
        self.checks.write_text(json.dumps({
            "schema_version": 1,
            "checks": [{
                "id": "synthetic-check",
                "label": "Synthetic check",
                "repo_ids": ["Repo_A"],
                "cwd": ".",
                "commands": ["synthetic-check --safe"],
                "accepted_exit_codes": [0],
                "evidence_sources": ["hook", "manual"],
            }],
        }), encoding="utf-8")
        base = self.fixture("claude_post_tool_failure.json")["payload"]
        start = dict(base, hook_event_name="PreToolUse")
        finish = dict(base, hook_event_name="PostToolUse")
        for payload in (start, finish):
            result = self.invoke(payload, "--provider", "claude", "--channel", "check")
            self.assertEqual(result.returncode, 0)
        rows = sorted(self.inbox_rows(), key=lambda row: row["kind"])
        self.assertEqual([row["kind"] for row in rows], ["check_finished", "check_started"])
        self.assertTrue(all(row["delivery_class"] == "durable" for row in rows))
        self.assertTrue(all(row["check_id"] == "synthetic-check" for row in rows))
        self.assertEqual(len({row["check_revision"] for row in rows}), 1)
        self.assertEqual(rows[0]["outcome"], "unknown")
        self.assertNotIn("command", json.dumps(rows))

    def test_codex_check_finish_is_unknown_without_structured_exit_status (self) -> None:
        self.checks.write_text(json.dumps({
            "schema_version": 1,
            "checks": [{
                "id": "synthetic-check", "label": "Synthetic check",
                "repo_ids": ["Repo_A"], "cwd": ".",
                "commands": ["synthetic-check --safe"],
                "evidence_sources": ["hook"],
            }],
        }), encoding="utf-8")
        payload = self.fixture("codex_post_tool.json")["payload"]
        payload["tool_name"] = "Bash"
        payload["tool_input"] = {"command": "synthetic-check --safe"}
        result = self.invoke(payload, "--provider", "codex", "--channel", "check")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.inbox_rows()[0]["outcome"], "unknown")

    def test_lifecycle_can_publish_zero_links_only_with_session (self) -> None:
        payload = {
            "hook_event_name": "SessionEnd",
            "session_id": "session-synthetic",
            "cwd": str(self.root / "Outside"),
        }
        result = self.invoke(payload, "--provider", "claude", "--channel", "activity")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.inbox_rows()[0]["repo_ids"], [])

        payload.pop("session_id")
        self.invoke(payload, "--provider", "claude", "--channel", "activity")
        self.assertEqual(len(self.inbox_rows()), 1)

    def test_all_fixture_lifecycle_rows_normalize_without_content (self) -> None:
        repos = katlab_activity.load_registered_repos(self.config)
        for fixture, provider in (("claude_lifecycle.json", "claude"),
                                  ("codex_lifecycle.json", "codex")):
            rows = self.fixture(fixture)["payloads"]
            normalized = [activity_record(provider, row, repos) for row in rows]
            self.assertTrue(all(row is not None for row in normalized))
            serialized = json.dumps(normalized)
            self.assertNotIn("last_assistant_message", serialized)
            self.assertNotIn("transcript_path", serialized)

    def test_optional_provider_control_text_is_omitted_before_publish (self) -> None:
        payload = self.fixture("claude_post_tool_success.json")["payload"]
        payload["model"] = "safe-looking\nprivate-tail"
        payload["agent_type"] = "worker\x7fhidden"
        result = self.invoke(payload, "--provider", "claude", "--channel", "activity")
        self.assertEqual(result.returncode, 0)
        row = self.inbox_rows()[0]
        self.assertNotIn("model", row)
        self.assertNotIn("agent_type", row)
        self.assertNotIn("private-tail", json.dumps(row))

    def test_malformed_oversized_unknown_and_bad_registry_always_exit_zero (self) -> None:
        cases = [
            self.invoke({}, raw=b"not json"),
            self.invoke({}, raw=b"{" + b"x" * (katlab_activity.MAX_STDIN_BYTES + 1)),
            self.invoke({}, "--provider", "unknown", "--channel", "file"),
            self.invoke({}, "--provider", "claude", "--channel", "unknown"),
        ]
        self.assertTrue(all(case.returncode == 0 for case in cases))
        self.assertTrue(all(case.stdout == b"" and case.stderr == b"" for case in cases))

        for content in ("", "repos:\n", "repos:\n  - id: Repo_A\n    path: unquoted\n"):
            self.config.write_text(content, encoding="utf-8")
            result = self.invoke(self.fixture("claude_post_tool_success.json")["payload"])
            self.assertEqual(result.returncode, 0)
        self.config.unlink()
        self.assertEqual(self.invoke({}).returncode, 0)
        self.assertEqual(self.event_rows(self.repo_a), [])
        self.assertEqual(self.inbox_rows(), [])

    def test_registry_requires_unique_complete_single_quoted_entries (self) -> None:
        self.assertEqual(len(katlab_activity.load_registered_repos(self.config)), 2)
        self.config.write_text(
            "repos:\n"
            f"  - id: 'Repo_A'\n    path: '{self.repo_a}'\n"
            f'  - id: "Repo_B"\n    path: \'{self.repo_b}\'\n',
            encoding="utf-8",
        )
        self.assertEqual(
            [repo.id for repo in katlab_activity.load_registered_repos(self.config)],
            ["Repo_A", "Repo_B"],
        )
        self.config.write_text(
            "repos:\n  - id: Repo_A\n    path: 'X:\\A'\n"
            "  - id: Repo_A\n    path: 'X:\\B'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

        self.config.write_text(
            "repos:\n  - id: Repo_A\n    path: 'relative/repo'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

        self.config.write_text(
            "repos:\n"
            f"  - id: Repo_A\n    path: '{self.repo_a}'\n"
            "    plan_globs:\n      - '../PLAN_*.txt'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

        self.config.write_text(
            "repos:\n"
            "  - id: Repo_A\n"
            "    ignored:\n"
            "      - id: Repo_B\n"
            f"        path: '{self.repo_b}'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

        self.config.write_text(
            "repos:\n"
            "  - id: Repo_A\n"
            "    ignored:\n"
            f"      path: '{self.repo_b}'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

        self.config.write_text(
            "repos:\n"
            f"  - id: Repo_A\n    path: '{self.repo_a}'\n"
            "repos:\n"
            f"  - id: Repo_B\n    path: '{self.repo_b}'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

        for duplicate_header in (
            "repos: # duplicate", "repos :", "'repos':", '"repos":',
            '"\\u0072epos":', "!!str repos:", "? repos\n:",
        ):
            with self.subTest(duplicate_header=duplicate_header):
                self.config.write_text(
                    "repos:\n"
                    f"  - id: Repo_A\n    path: '{self.repo_a}'\n"
                    f"{duplicate_header}\n"
                    f"  - id: Repo_B\n    path: '{self.repo_b}'\n",
                    encoding="utf-8",
                )
                self.assertEqual(
                    katlab_activity.load_registered_repos(self.config), [],
                )

        self.config.write_text(
            "unknown_root: true\nrepos:\n"
            f"  - id: Repo_A\n    path: '{self.repo_a}'\n",
            encoding="utf-8",
        )
        self.assertEqual(katlab_activity.load_registered_repos(self.config), [])

    def test_activity_runtime_cannot_contain_a_monitored_repository (self) -> None:
        repos = katlab_activity.load_registered_repos(self.config)
        with patch.dict(os.environ, {
            "KATLAB_TRACKER_ACTIVITY_DIR": str(self.root),
        }):
            with self.assertRaises(katlab_activity.CaptureInputError):
                katlab_activity.activity_root(repos)

    def test_publish_failure_removes_temporary_file (self) -> None:
        record = {
            "provider": "claude", "evidence_source": "hook",
            "kind": "session_start", "ts": "2026-01-01T00:00:00Z",
            "delivery_class": "best_effort", "repo_ids": ["Repo_A"],
            "session_id": "session-synthetic",
        }
        with patch.dict(os.environ, {
            "KATLAB_TRACKER_ACTIVITY_DIR": str(self.activity_root),
        }), patch("Hook.katlab_activity.os.replace", side_effect=OSError("synthetic")):
            with self.assertRaises(OSError):
                katlab_activity.publish_activity(record, durable=False)
        inbox = self.activity_root / "activity_inbox"
        self.assertEqual(list(inbox.iterdir()), [])

    def test_write_failure_does_not_create_an_event_line (self) -> None:
        repos = katlab_activity.load_registered_repos(self.config)
        payload = self.fixture("claude_post_tool_success.json")["payload"]
        capture = file_captures("claude", payload, repos)[0]
        with patch("Hook.katlab_activity.os.open", side_effect=OSError("synthetic")):
            with self.assertRaises(OSError):
                katlab_activity.append_file_event(capture.repo, capture.event)
        self.assertEqual(self.event_rows(self.repo_a), [])

    def test_fixture_corpus_is_synthetic_and_version_pinned (self) -> None:
        files = sorted(FIXTURES.glob("*.json"))
        self.assertEqual(len(files), 5)
        for path in files:
            text = path.read_text(encoding="utf-8")
            value = json.loads(text)
            self.assertRegex(value["provider_version"], r"^(Claude Code|Codex CLI) \d")
            self.assertNotIn("C:\\Users\\ADMIN", text)
            self.assertNotIn("D:\\KATLAB", text)


if __name__ == "__main__":
    unittest.main()
