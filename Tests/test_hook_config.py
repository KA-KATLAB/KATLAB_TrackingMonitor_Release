"""Tests for read-only Claude/Codex hook configuration rendering."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from Scripts.render_hook_config import (
    existing_katlab_registrations,
    render_config,
)


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "Scripts" / "render_hook_config.py"


def _handlers (config: dict):
    for groups in config["hooks"].values():
        for group in groups:
            yield group, group["hooks"][0]


class HookConfigTests(unittest.TestCase):
    def test_claude_schema_covers_supported_events_and_delivery_classes (self) -> None:
        config = render_config(
            "claude", python_path=Path("C:/Synthetic/python.exe"),
            hook_path=Path("C:/Synthetic/katlab_tracking_hook.py"),
        )
        self.assertEqual(set(config), {"hooks"})
        self.assertEqual(set(config["hooks"]), {
            "SessionStart", "SessionEnd", "SubagentStart", "SubagentStop",
            "Stop", "PreToolUse", "PostToolUse", "PostToolUseFailure",
        })
        post = config["hooks"]["PostToolUse"]
        self.assertEqual(post[0]["matcher"], "^(Edit|Write|MultiEdit)$")
        self.assertNotIn("--channel file", post[0]["hooks"][0]["command"])
        self.assertFalse(post[0]["hooks"][0].get("async", False))
        self.assertFalse(post[1]["hooks"][0].get("async", False))
        self.assertTrue(post[2]["hooks"][0]["async"])

    def test_codex_schema_adds_interrupt_and_supported_tool_routes (self) -> None:
        config = render_config(
            "codex", python_path=Path("C:/Synthetic/python.exe"),
            hook_path=Path("C:/Synthetic/katlab_tracking_hook.py"),
        )
        self.assertIn("Interrupt", config["hooks"])
        self.assertNotIn("PostToolUseFailure", config["hooks"])
        post = config["hooks"]["PostToolUse"]
        self.assertEqual(post[0]["matcher"], "^apply_patch$")
        self.assertIn("--provider codex --channel file", post[0]["hooks"][0]["command"])
        self.assertEqual(config["hooks"]["PreToolUse"][0]["matcher"], "^Bash$")

    def test_all_general_activity_is_async_and_file_check_are_sync (self) -> None:
        for provider in ("claude", "codex"):
            for _, handler in _handlers(render_config(provider)):
                command = handler["command"]
                if "--channel activity" in command:
                    self.assertIs(handler.get("async"), True)
                else:
                    self.assertNotIn("async", handler)

    def test_preflight_counts_references_without_writing (self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = root / "settings.json"
            hook = root / "katlab_tracking_hook.py"
            original = json.dumps({
                "hooks": {"Stop": [{"hooks": [{
                    "command": f'python "{hook}" --provider claude --channel activity',
                }]}]},
            })
            settings.write_text(original, encoding="utf-8")
            self.assertEqual(existing_katlab_registrations(settings, hook), 1)
            self.assertEqual(settings.read_text(encoding="utf-8"), original)
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["settings.json"])

    def test_cli_refuses_collision_and_never_changes_settings (self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            settings = Path(directory) / "settings.json"
            original = json.dumps({"note": str(ROOT / "Hook" / "katlab_tracking_hook.py")})
            settings.write_text(original, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--provider", "codex",
                 "--preflight", str(settings)],
                capture_output=True, text=True, check=False, timeout=10,
            )
            self.assertEqual(result.returncode, 3)
            self.assertEqual(result.stdout, "")
            self.assertIn("PREFLIGHT STOP", result.stderr)
            self.assertEqual(settings.read_text(encoding="utf-8"), original)

    def test_cli_output_is_merge_ready_json (self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--provider", "claude"],
            capture_output=True, text=True, check=False, timeout=10,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(set(json.loads(result.stdout)), {"hooks"})
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main()
