"""Reviewed install policy and installed StaticFiles contract, not a security audit."""

import os
from pathlib import Path
import stat
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi.staticfiles import StaticFiles
import starlette.staticfiles as staticfiles_module


ROOT = Path(__file__).resolve().parents[1]


class BackendRequirementsTests(unittest.TestCase):
    def requirements (self):
        return [entry for line in (ROOT / "Backend/requirements.txt").read_text(
            encoding="utf-8").splitlines()
            if (entry := line.split("#", 1)[0].strip())]

    def test_reviewed_starlette_floor_is_required_once (self):
        entries = [entry for entry in self.requirements()
                   if entry.lower().startswith("starlette")]
        self.assertEqual(entries, ["starlette>=1.3.1"])

    def test_other_backend_requirements_are_unchanged (self):
        entries = [entry for entry in self.requirements()
                   if not entry.lower().startswith("starlette")]
        self.assertEqual(entries, [
            "fastapi>=0.115", "uvicorn[standard]>=0.30", "watchfiles>=0.24", "pyyaml>=6.0",
        ])

    def test_normal_and_demo_install_the_reviewed_manifest (self):
        for relative in ("Scripts/start_tracking_monitor.bat", "Scripts/Demo/start_demo.bat"):
            with self.subTest(launcher=relative):
                text = (ROOT / relative).read_text(encoding="utf-8")
                commands = [line.strip() for line in text.splitlines()
                            if "-m pip install" in line]
                self.assertEqual(commands, [
                    '"%PY%" -m pip install -q -r Backend\\requirements.txt',
                    '"%PY%" -m pip install -q -r Backend\\requirements.txt',
                ])
                self.assertIn("if defined FRESH_VENV (", text)
                self.assertIn("if not defined FRESH_VENV (", text)

    def test_fastapi_uses_the_installed_starlette_staticfiles (self):
        self.assertIs(StaticFiles, staticfiles_module.StaticFiles)

    def test_absolute_and_unc_lookup_rejects_before_filesystem_io (self):
        # Construct locally before installing the module-local OS proxy. Only
        # lexical path operations remain available; no remote path is resolved.
        with TemporaryDirectory(prefix="katlab-staticfiles-") as directory:
            files = StaticFiles(directory=directory)
            realpath = Mock(side_effect=AssertionError("rejected path reached realpath"))
            stat_call = Mock(side_effect=AssertionError("rejected path reached stat"))
            guarded_os = SimpleNamespace(
                path=SimpleNamespace(join=os.path.join, abspath=os.path.abspath,
                                     commonpath=os.path.commonpath, realpath=realpath),
                stat=stat_call,
            )
            with patch.object(staticfiles_module, "os", guarded_os):
                for requested in ("/outside.js", "\\outside.js",
                                  "//fixture.invalid/share/asset.js",
                                  "\\\\fixture.invalid\\share\\asset.js"):
                    with self.subTest(path=requested):
                        self.assertEqual(files.lookup_path(requested), ("", None))
                        realpath.assert_not_called()
                        stat_call.assert_not_called()
            # Restore upstream globals before TemporaryDirectory cleanup.

    def test_relative_local_asset_lookup_remains_available (self):
        with TemporaryDirectory(prefix="katlab-staticfiles-") as directory:
            asset = Path(directory) / "bundle.js"
            payload = b"/* local fixture */"
            asset.write_bytes(payload)
            files = StaticFiles(directory=directory)
            full_path, details = files.lookup_path("bundle.js")
            self.assertEqual(Path(full_path), asset.resolve())
            self.assertIsNotNone(details)
            self.assertTrue(stat.S_ISREG(details.st_mode))
            self.assertEqual(details.st_size, len(payload))
            self.assertEqual(Path(full_path).read_bytes(), payload)


if __name__ == "__main__":
    unittest.main()
