"""Tests for read-only Claude/Codex hook configuration rendering."""

import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from Scripts import render_hook_config as hook_config
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

    def test_preflight_bounds_native_bytes_without_changing_settings (self) -> None:
        limit = hook_config.PREFLIGHT_MAX_BYTES
        self.assertEqual(limit, 1_048_576)
        prefix, suffix = b'{"note":"', b'"}'
        room = limit - len(prefix) - len(suffix)
        multibyte = prefix + ("é" * (room // 2)).encode("utf-8") + b"x" * (room % 2) + suffix
        cases = [(b"{}" + b" " * (size - 2), size <= limit)
                 for size in (limit - 1, limit, limit + 1)]
        cases.extend([(multibyte, True), (multibyte[:-2] + b"x" + suffix, False)])
        with tempfile.TemporaryDirectory() as directory:
            settings = Path(directory) / "settings.json"
            for raw, accepted in cases:
                with self.subTest(bytes=len(raw), accepted=accepted):
                    settings.write_bytes(raw)
                    if accepted:
                        self.assertEqual(existing_katlab_registrations(settings), 0)
                    else:
                        with self.assertRaisesRegex(ValueError, "^settings file exceeds the 1 MiB preflight limit$"):
                            existing_katlab_registrations(settings)
                    self.assertEqual(settings.read_bytes(), raw)
            self.assertEqual([path.name for path in Path(directory).iterdir()], ["settings.json"])

    def test_preflight_reads_detection_byte_closes_and_refuses_before_decode (self) -> None:
        oversized = MagicMock()
        oversized.__len__.return_value = hook_config.PREFLIGHT_MAX_BYTES + 1
        for raw, read_error, expected_error in (
                (b"{}", None, None), (b"\xff", None, UnicodeDecodeError),
                (oversized, None, ValueError),
                (None, OSError("PRIVATE_READ_FAILURE"), OSError)):
            with self.subTest(error=expected_error), \
                 patch.object(Path, "exists", return_value=True), \
                 patch.object(Path, "open") as opened, \
                 patch.object(hook_config.json, "loads", wraps=json.loads) as loads:
                context = opened.return_value
                stream = context.__enter__.return_value
                stream.read.return_value = raw
                stream.read.side_effect = read_error
                if expected_error is None:
                    self.assertEqual(existing_katlab_registrations(Path("fixture")), 0)
                    loads.assert_called_once_with("{}")
                else:
                    with self.assertRaises(expected_error):
                        existing_katlab_registrations(Path("fixture"))
                    loads.assert_not_called()
                opened.assert_called_once_with("rb")
                stream.read.assert_called_once_with(hook_config.PREFLIGHT_MAX_BYTES + 1)
                context.__exit__.assert_called_once()
                if read_error is None:
                    context.__exit__.assert_called_once_with(None, None, None)
        oversized.decode.assert_not_called()

    def test_missing_preflight_returns_before_open_or_parse (self) -> None:
        with patch.object(Path, "exists", return_value=False), \
             patch.object(Path, "open") as opened, \
             patch.object(hook_config.json, "loads") as loads:
            self.assertEqual(existing_katlab_registrations(Path("missing.json")), 0)
            opened.assert_not_called()
            loads.assert_not_called()

    def test_preflight_retains_value_substring_and_rendered_registration_counts (self) -> None:
        reference = str(hook_config.HOOK)
        samples = [({
            reference: "keys are not scanned",
            "nested": [reference, {"value": "prefix " + reference + " suffix"},
                       reference + " " + reference, 5, True, None],
            "relative": "katlab_tracking_hook.py",
        }, 3), (render_config("claude"), 11), (render_config("codex"), 10)]
        with tempfile.TemporaryDirectory() as directory:
            settings = Path(directory) / "settings.json"
            for data, count in samples:
                raw = json.dumps(data).encode("utf-8")
                settings.write_bytes(raw)
                with self.subTest(count=count):
                    self.assertEqual(existing_katlab_registrations(settings), count)
                    self.assertEqual(settings.read_bytes(), raw)

    def test_cli_handles_decoder_and_partial_walker_recursion_privately (self) -> None:
        def partial_walk (_value):
            yield str(hook_config.HOOK)
            raise RecursionError("PRIVATE_WALK_FAILURE")

        for provider in ("claude", "codex"):
            for stage in ("decoder", "walker"):
                out, err = io.StringIO(), io.StringIO()
                with self.subTest(provider=provider, stage=stage), \
                     patch.object(Path, "exists", return_value=True), \
                     patch.object(Path, "open") as opened, \
                     patch.object(hook_config, "render_config") as render, \
                     contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    opened.return_value.__enter__.return_value.read.return_value = b"{}"
                    failure = (patch.object(hook_config.json, "loads", side_effect=RecursionError("PRIVATE_JSON_FAILURE"))
                               if stage == "decoder" else patch.object(hook_config, "_strings", side_effect=partial_walk))
                    with failure:
                        self.assertEqual(hook_config.main([
                            "--provider", provider, "--preflight", "fixture.json",
                        ]), 2)
                    render.assert_not_called()
                self.assertEqual(out.getvalue(), "")
                self.assertEqual(err.getvalue(), "PREFLIGHT ERROR: settings JSON is too deeply nested\n")

    def test_cli_does_not_swallow_unexpected_errors_or_interruptions (self) -> None:
        for stage in ("decoder", "walker"):
            for error_type in (RuntimeError, MemoryError, KeyboardInterrupt, SystemExit):
                out, err = io.StringIO(), io.StringIO()

                def partial_walk (_value):
                    yield str(hook_config.HOOK)
                    raise error_type("PRIVATE_UNEXPECTED_FAILURE")

                with self.subTest(stage=stage, error=error_type), \
                     patch.object(Path, "exists", return_value=True), \
                     patch.object(Path, "open") as opened, \
                     patch.object(hook_config, "render_config") as render, \
                     contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    opened.return_value.__enter__.return_value.read.return_value = b"{}"
                    failure = (patch.object(hook_config.json, "loads", side_effect=error_type("PRIVATE_UNEXPECTED_FAILURE"))
                               if stage == "decoder" else patch.object(hook_config, "_strings", side_effect=partial_walk))
                    with failure, self.assertRaises(error_type):
                        hook_config.main(["--provider", "claude", "--preflight", "fixture.json"])
                    render.assert_not_called()
                self.assertEqual(out.getvalue(), "")
                self.assertEqual(err.getvalue(), "")

    def test_real_stdlib_cli_preflight_result_matrix_never_modifies_fixtures (self) -> None:
        depth = 5000
        cases = [
            ("normal", b"{}", 0), ("missing", None, 0), ("non_object", b"[]", 2),
            ("malformed", b"{", 2), ("encoding", b"\xff", 2), ("bom", b"\xef\xbb\xbf{}", 2),
            ("oversized", b"{}" + b" " * hook_config.PREFLIGHT_MAX_BYTES, 2),
            ("deep", b'{"value":' + b"[" * depth + b"0" + b"]" * depth + b"}", 2),
            ("collision", json.dumps({"note": str(hook_config.HOOK)}).encode("utf-8"), 3),
        ]
        with tempfile.TemporaryDirectory() as directory:
            for provider in ("claude", "codex"):
                for name, raw, expected in cases:
                    settings = Path(directory) / f"{provider}-{name}.json"
                    if raw is not None:
                        settings.write_bytes(raw)
                    with self.subTest(provider=provider, case=name):
                        result = subprocess.run(
                            [sys.executable, "-S", "-B", str(SCRIPT), "--provider", provider,
                             "--preflight", str(settings)],
                            capture_output=True, text=True, check=False, timeout=10,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                        )
                        self.assertEqual(result.returncode, expected, result.stderr)
                        if expected == 0:
                            self.assertEqual(json.loads(result.stdout), render_config(provider))
                            self.assertEqual(result.stderr, "PREFLIGHT OK: no existing KATLAB hook reference.\n")
                        else:
                            self.assertEqual(result.stdout, "")
                            self.assertTrue(result.stderr.startswith("PREFLIGHT STOP:" if expected == 3 else "PREFLIGHT ERROR:"))
                            self.assertNotIn("Traceback", result.stderr)
                            self.assertEqual(len(result.stderr.splitlines()), 1)
                            if name == "deep":
                                self.assertEqual(result.stderr, "PREFLIGHT ERROR: settings JSON is too deeply nested\n")
                        self.assertEqual(settings.read_bytes() if settings.exists() else None, raw)


if __name__ == "__main__":
    unittest.main()
