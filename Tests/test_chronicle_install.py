"""Installer dispatch tests; never install packages or fetch real assets."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


INSTALL = Path(__file__).resolve().parents[1] / "Scripts" / "Chronicle" / "install.bat"


@unittest.skipUnless(os.name == "nt", "Windows batch dispatch")
class ChronicleInstallTests(unittest.TestCase):
    def setUp (self):
        self.temp = tempfile.TemporaryDirectory(prefix="katlab-install-test-")
        self.root = Path(self.temp.name)
        self.script = self.root / "install.bat"
        self.script.write_bytes(INSTALL.read_bytes())
        # A local fixture replaces all production transport/mutation authority.
        (self.root / "safe_io.py").write_text(
            "from dataclasses import dataclass\n"
            "import os, runpy, site, sys\n"
            "@dataclass\n"
            "class LoadedWithModuleIdentity:\n"
            "    value: int = 1\n"
            "def require_expected_interpreter():\n"
            "    print('FIXTURE-PROOF')\n"
            "    if os.environ.get('KATLAB_TEST_PROOF_FAILURE') == '1':\n"
            "        raise RuntimeError('synthetic proof failure')\n"
            "    site.main = lambda: print('FIXTURE-SITE')\n"
            "    runpy.run_module = lambda name, run_name=None: "
            "print('FIXTURE-PIP:' + name + ':' + str(run_name))\n"
            "if __name__ == '__main__':\n"
            "    print('FIXTURE-ASSET:' + ','.join(sys.argv[1:]))\n"
            "    raise SystemExit(int(os.environ.get('KATLAB_TEST_ASSET_EXIT', '7')))\n",
            encoding="utf-8")
        self.addCleanup(self.temp.cleanup)

    def run_install (self, *arguments, interpreter=None,
                     tracker_config=None, demo=None, proof_failure=False,
                     asset_exit=None):
        env = os.environ.copy()
        env.pop("KATLAB_TRACKER_CONFIG", None)
        env.pop("KATLAB_TRACKER_DEMO", None)
        env["KATLAB_CHRONICLE_PYTHON"] = (
            sys.executable if interpreter is None else interpreter)
        env.pop("KATLAB_TEST_PROOF_FAILURE", None)
        env.pop("KATLAB_TEST_ASSET_EXIT", None)
        if tracker_config is not None:
            env["KATLAB_TRACKER_CONFIG"] = tracker_config
        if demo is not None:
            env["KATLAB_TRACKER_DEMO"] = demo
        if proof_failure:
            env["KATLAB_TEST_PROOF_FAILURE"] = "1"
        if asset_exit is not None:
            env["KATLAB_TEST_ASSET_EXIT"] = str(asset_exit)
        return subprocess.run(
            [os.environ.get("COMSPEC", r"C:\Windows\System32\cmd.exe"),
             "/d", "/c", str(self.script), *arguments],
            cwd=self.root, env=env, capture_output=True, text=True,
            timeout=10, creationflags=subprocess.CREATE_NO_WINDOW,
        )

    def test_unknown_extra_and_empty_arguments_reject_before_helper (self):
        for arguments in (("--unknown",), ("--mermaid-only", "extra"),
                          ("--mermaid-only", ""), ("",)):
            with self.subTest(arguments=arguments):
                result = self.run_install(*arguments)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertIn("Usage: install.bat", result.stderr)

    def test_mermaid_only_skips_pip_and_propagates_helper_failure (self):
        result = self.run_install("--mermaid-only")
        self.assertEqual(result.returncode, 7, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "FIXTURE-ASSET:fetch-mermaid")
        self.assertEqual(result.stderr, "")

    def test_relative_interpreter_override_rejects_before_launch (self):
        result = self.run_install("--mermaid-only", interpreter="python.exe")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn("must be an absolute Windows path", result.stderr)
        self.assertNotIn("FIXTURE-ASSET", result.stderr)

    def test_controlled_modes_reject_after_grammar_before_python_helper_or_pip (self):
        fake_python = self.root / "python-fixture.bat"
        fake_python.write_text(
            "@echo INTERPRETER-LAUNCHED\r\n@exit /b 9\r\n", encoding="ascii")
        for arguments, controls in (
            ((), {"tracker_config": str(self.root / "repos.yaml")}),
            (("--mermaid-only",), {"demo": "1"}),
        ):
            with self.subTest(arguments=arguments, controls=controls):
                result = self.run_install(
                    *arguments, interpreter=str(fake_python), **controls)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertIn("explicit-config mode", result.stderr)
                self.assertNotIn("INTERPRETER-LAUNCHED", result.stdout + result.stderr)
                self.assertNotIn("FIXTURE-ASSET", result.stdout + result.stderr)

        # Invalid grammar remains usage/2 even when a controlled-mode variable is set.
        invalid = self.run_install(
            "--unknown", interpreter=str(fake_python), demo="1")
        self.assertEqual(invalid.returncode, 2, invalid.stdout + invalid.stderr)
        self.assertIn("Usage: install.bat", invalid.stderr)
        self.assertNotIn("INTERPRETER-LAUNCHED", invalid.stdout + invalid.stderr)

    def test_helper_bootstrap_propagates_verified_fetch_success (self):
        (self.root / "safe_io.py").write_text(
            "import sys\nprint('INSTALLED:' + sys.argv[1])\nraise SystemExit(0)\n",
            encoding="utf-8",
        )
        result = self.run_install("--mermaid-only")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "INSTALLED:fetch-mermaid")
        self.assertEqual(result.stderr, "")

    def test_no_argument_order_is_pip_then_two_fixed_asset_tokens (self):
        source = INSTALL.read_text(encoding="utf-8")
        pip_at = source.index("runpy.run_module('pip'")
        bootswatch_at = source.index("call :asset fetch-bootswatch")
        mermaid_at = source.index("call :asset fetch-mermaid", bootswatch_at)
        self.assertLess(pip_at, bootswatch_at)
        self.assertLess(bootswatch_at, mermaid_at)

    def test_no_argument_bootstrap_proves_interpreter_before_site_pip_and_assets (self):
        result = self.run_install(asset_exit=0)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        output = result.stdout
        proof_at = output.index("FIXTURE-PROOF")
        site_at = output.index("FIXTURE-SITE")
        pip_at = output.index("FIXTURE-PIP:pip:__main__")
        bootswatch_at = output.index("FIXTURE-ASSET:fetch-bootswatch")
        mermaid_at = output.index("FIXTURE-ASSET:fetch-mermaid")
        self.assertLess(proof_at, site_at)
        self.assertLess(site_at, pip_at)
        self.assertLess(pip_at, bootswatch_at)
        self.assertLess(bootswatch_at, mermaid_at)
        self.assertIn("Done.", output)

    def test_native_interpreter_proof_failure_prevents_pip_and_assets (self):
        result = self.run_install(proof_failure=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("FIXTURE-PROOF", result.stdout)
        self.assertNotIn("FIXTURE-SITE", result.stdout)
        self.assertNotIn("FIXTURE-PIP", result.stdout)
        self.assertNotIn("FIXTURE-ASSET", result.stdout)
        self.assertIn("pip install failed", result.stderr)

    def test_wrapper_has_no_asset_transport_or_destructive_commands (self):
        source = INSTALL.read_text(encoding="utf-8")
        self.assertNotIn("curl ", source.lower())
        self.assertNotIn("https://", source)
        self.assertNotIn("del ", source.lower())
        self.assertIn('"%~dp0requirements.txt"', source)
        self.assertIn("-I -S -B -c", source)
        self.assertNotIn("pending", source.lower())


if __name__ == "__main__":
    unittest.main()
