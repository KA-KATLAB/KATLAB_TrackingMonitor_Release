"""Focused tests for the v0.3.0.3 disabled Scribe command surface."""

import contextlib
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIBE_SOURCE = ROOT / "Scripts" / "Chronicle" / "scribe.py"
SCRIBE_BAT = ROOT / "Scripts" / "Chronicle" / "scribe.bat"
DISABLED_LINE = (
    "[DISABLED] KATLAB Scribe is disabled in v0.3.0.3; "
    "reviewed integration required.\n"
)
USAGE_LINE = (
    "Usage: scribe.py [--force | --day YYYY-MM-DD [--force] | "
    "--week YYYY-Www [--force] | --release REPO vX.Y.Z.W [--force]]\n"
)
SEALED_BOOTSTRAP = (
    "import json,sys\n"
    "payload=json.loads(sys.stdin.buffer.read().decode('ascii'))\n"
    "source=bytes.fromhex(payload['source_hex'])\n"
    "namespace={'__name__':'katlab_sealed_scribe'}\n"
    "exec(compile(source,payload['filename'],'exec'),namespace)\n"
    "raise SystemExit(namespace['main'](payload['argv']))\n"
)


def _load_sealed_source () -> dict:
    source = SCRIBE_SOURCE.read_bytes()
    namespace = {"__name__": "katlab_sealed_scribe"}
    exec(compile(source, str(SCRIBE_SOURCE), "exec"), namespace)
    return namespace


class DisabledScribeTests(unittest.TestCase):
    def invoke_main (self, argv: list[str]):
        payload = json.dumps({
            "source_hex": SCRIBE_SOURCE.read_bytes().hex(),
            "filename": str(SCRIBE_SOURCE),
            "argv": argv,
        }, ensure_ascii=True, separators=(",", ":")).encode("ascii")
        result = subprocess.run(
            [sys.executable, "-I", "-S", "-B", "-c", SEALED_BOOTSTRAP],
            input=payload,
            cwd=ROOT,
            capture_output=True,
            timeout=10,
            check=False,
        )
        return (
            result.returncode,
            result.stdout.decode("ascii").replace("\r\n", "\n"),
            result.stderr.decode("ascii").replace("\r\n", "\n"),
        )

    def test_all_eight_supported_vectors_are_disabled (self) -> None:
        vectors = [
            [],
            ["--force"],
            ["--day", "2024-02-29"],
            ["--day", "2024-02-29", "--force"],
            ["--week", "2020-W53"],
            ["--week", "2020-W53", "--force"],
            ["--release", "EA_Dev-2", "v0.3.0.3"],
            ["--release", "EA_Dev-2", "v0.3.0.3", "--force"],
        ]
        for vector in vectors:
            with self.subTest(vector=vector):
                code, stdout, stderr = self.invoke_main(vector)
                self.assertEqual(code, 3)
                self.assertEqual(stdout, "")
                self.assertEqual(stderr, DISABLED_LINE)

    def test_invalid_vectors_emit_only_usage (self) -> None:
        vectors = [
            ["--day", "2023-02-29"],
            ["--day", "2024-2-29"],
            ["--week", "2021-W53"],
            ["--week", "2020-W00"],
            ["--release", "bad repo", "v0.3.0.3"],
            ["--release", "repo", "0.3.0.3"],
            ["--force", "--force"],
            ["--force", "--day", "2024-02-29"],
            ["--day", "2024-02-29", "--force", "extra"],
            ["--day", "2024-02-29", "\t"],
            ["--release", "r\N{LATIN SMALL LETTER E WITH ACUTE}po", "v0.3.0.3"],
            ["--unknown"],
        ]
        for vector in vectors:
            with self.subTest(vector=vector):
                code, stdout, stderr = self.invoke_main(vector)
                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                self.assertEqual(stderr, USAGE_LINE)

    def test_import_compatible_auto_tick_is_inert (self) -> None:
        namespace = _load_sealed_source()
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertIsNone(namespace["auto_tick"]({"untrusted": object()}))
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue(), "")

    def test_public_batch_ignores_arguments_and_is_disabled (self) -> None:
        source = SCRIBE_BAT.read_text(encoding="ascii")
        lowered = source.lower()
        self.assertNotIn("python", lowered)
        self.assertNotIn("claude", lowered)
        self.assertNotIn("where", lowered)
        self.assertNotIn("pause", lowered)
        self.assertNotIn("%*", source)
        for digit in range(1, 10):
            self.assertNotIn(f"%{digit}", source)

        for arguments in ([], ["--release", "ignored", "v9.9.9.9"]):
            with self.subTest(arguments=arguments):
                result = subprocess.run(
                    ["cmd.exe", "/d", "/c", "call", str(SCRIBE_BAT),
                     *arguments],
                    cwd=ROOT,
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                self.assertEqual(result.returncode, 3)
                self.assertEqual(result.stdout, b"")
                self.assertEqual(
                    result.stderr.decode("ascii").replace("\r\n", "\n"),
                    DISABLED_LINE,
                )


if __name__ == "__main__":
    unittest.main()
