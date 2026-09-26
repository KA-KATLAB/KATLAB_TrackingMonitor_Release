"""Windows launcher regressions; all spawned processes are finite scratch fixtures."""

import contextlib
import ctypes
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from Scripts import launch_hidden as launcher


REPO = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt", "Windows launcher contract")
class HiddenLauncherTests(unittest.TestCase):
    def test_popen_contract_and_parent_log_closure (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log_path = root / "new logs" / "tracker.log"
            captured = {}
            child = MagicMock(pid=123)

            def spawn (command, **kwargs):
                captured.update(kwargs)
                self.assertEqual(command, ["pythonw.exe", "-u", "-m", "sample"])
                kwargs["stdout"].write(b"existing output\n")
                return child

            with patch.object(launcher.subprocess, "Popen", side_effect=spawn):
                result = launcher.launch_hidden(
                    ["pythonw.exe", "-u", "-m", "sample"], cwd=root, log_path=log_path)
            self.assertIs(result, child)
            self.assertEqual(captured["cwd"], str(root))
            self.assertEqual(captured["stdin"], subprocess.DEVNULL)
            self.assertEqual(captured["stderr"], subprocess.STDOUT)
            self.assertEqual(captured["creationflags"], subprocess.CREATE_NO_WINDOW)
            self.assertFalse(captured["shell"])
            self.assertTrue(captured["close_fds"])
            self.assertNotIn("env", captured)  # preserve the BAT's demo/config environment
            self.assertTrue(captured["stdout"].closed)
            self.assertEqual(log_path.read_bytes(), b"existing output\n")
            child.wait.assert_not_called()
            child.__enter__.assert_not_called()

    def test_spawn_error_closes_log_and_preserves_existing_bytes (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / "tracker.log"
            log.write_bytes(b"previous\n")
            handles = []

            def fail (*_args, **kwargs):
                handles.append(kwargs["stdout"])
                raise OSError("spawn refused")

            with patch.object(launcher.subprocess, "Popen", side_effect=fail):
                with self.assertRaisesRegex(OSError, "spawn refused"):
                    launcher.launch_hidden(["missing.exe"], cwd=root, log_path=log)
            self.assertTrue(handles[0].closed)
            self.assertEqual(log.read_bytes(), b"previous\n")

    def test_log_open_or_directory_failure_never_spawns (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / "file"
            file.write_bytes(b"keep")
            for log_path in (root, file / "tracker.log"):
                with self.subTest(log_path=log_path):
                    with patch.object(launcher.subprocess, "Popen") as spawn:
                        with self.assertRaises(OSError):
                            launcher.launch_hidden(["unused.exe"], cwd=root,
                                                   log_path=log_path)
                        spawn.assert_not_called()

    def test_missing_executable_reports_native_failure (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(OSError):
                launcher.launch_hidden([str(root / "missing.exe")], cwd=root,
                                       log_path=root / "log.txt")

    def test_cli_modes_keep_venv_gui_interpreter_and_existing_log_paths (self):
        for mode, relative in (("tracker", "data/logs/tracker.log"),
                               ("demo", "Demo/runtime/demo.log")):
            with self.subTest(mode=mode), patch.object(launcher, "launch_hidden") as spawn:
                spawn.return_value.pid = 123
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    self.assertEqual(launcher.main([mode]), 0)
                spawn.assert_called_once_with(
                    [str(Path(sys.executable).with_name("pythonw.exe")),
                     "-u", "-m", "Backend.app.main"],
                    cwd=REPO, log_path=REPO / relative)
                self.assertIn("Launch requested (PID 123)", output.getvalue())

    def test_cli_spawn_failure_is_visible_and_nonzero (self):
        with patch.object(launcher, "launch_hidden", side_effect=OSError("denied")):
            output, errors = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertEqual(launcher.main(["tracker"]), 1)
            self.assertEqual(output.getvalue(), "")
            self.assertIn("[ABORT] Hidden launch failed: denied", errors.getvalue())

    def test_invalid_mode_never_launches (self):
        with patch.object(launcher, "launch_hidden") as spawn:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as exc:
                launcher.main(["anything"])
            self.assertEqual(exc.exception.code, 2)
            spawn.assert_not_called()

    def test_non_windows_refuses_before_io (self):
        root = REPO
        with patch.object(launcher.os, "name", "posix"):
            with self.assertRaisesRegex(OSError, "requires Windows"):
                launcher.launch_hidden(["unused"], cwd=root, log_path=root)

    def test_both_batch_callers_abort_before_browser_and_keep_guards (self):
        for relative, mode in (("Scripts/start_tracking_monitor.bat", "tracker"),
                               ("Scripts/Demo/start_demo.bat", "demo")):
            with self.subTest(mode=mode):
                source = (REPO / relative).read_text(encoding="utf-8")
                self.assertNotIn('start "" /b cmd /c', source.lower())
                line = f'"%PY%" Scripts\\launch_hidden.py {mode}\n'
                self.assertEqual(source.count(line), 1)
                tail = source.split(line, 1)[1]
                self.assertTrue(tail.startswith("if errorlevel 1 (\n"))
                self.assertLess(tail.index("exit /b 1"), tail.index('start "" "http'))
                self.assertIn("netstat -ano", source.split(line, 1)[0])
                self.assertIn("move /y", source.split(line, 1)[0])
                self.assertTrue(tail.endswith("endlocal\nexit /b 0\n"))
                self.assertNotRegex(source, r"(?im)^exit(?:\s+\d+)?\s*$")
        for relative, start in (("Scripts/restart_tracking_monitor.bat", "start_tracking_monitor.bat"),
                                ("Scripts/Demo/restart_demo.bat", "start_demo.bat")):
            source = (REPO / relative).read_text(encoding="utf-8")
            self.assertIn(f'call "%~dp0{start}"', source)
            self.assertTrue(source.endswith("exit /b %errorlevel%\n"))
            self.assertNotRegex(source, r"(?im)^\s*@?start\s")

    def test_actual_restart_batches_exit_and_propagate_start_result (self):
        # Copy actual entrypoints, stub only their side-effecting stop/start
        # dependencies. Never run the production stopper, backend or browser.
        entries = (
            ("Scripts/restart_tracking_monitor.bat", "stop_tracking_monitor.bat",
             "start_tracking_monitor.bat"),
            ("Scripts/Demo/restart_demo.bat", "stop_demo.bat", "start_demo.bat"),
        )
        for relative, stop, start in entries:
            source = (REPO / relative).read_text(encoding="utf-8")
            # Refuse a regressed bare START before executing it: CMD /K could
            # otherwise outlive a fixture timeout and leave its own console.
            self.assertNotRegex(source, r"(?im)^\s*@?start\s")
            self.assertIn(f'call "%~dp0{start}"', source)
            self.assertTrue(source.endswith("exit /b %errorlevel%\n"))
            for result_code in (0, 7):
                with self.subTest(relative=relative, result=result_code):
                    with tempfile.TemporaryDirectory(prefix="katlab restart ") as directory:
                        root = Path(directory) / "space & unicode é"
                        root.mkdir()
                        restart = root / Path(relative).name
                        restart.write_text(source, encoding="utf-8")
                        (root / stop).write_text(
                            '@echo off\necho stop>"%~dp0order.txt"\nexit /b 0\n',
                            encoding="utf-8")
                        (root / start).write_text(
                            '@echo off\necho start>>"%~dp0order.txt"\n'
                            f'exit /b {result_code}\n', encoding="utf-8")
                        startup = subprocess.STARTUPINFO()
                        startup.dwFlags = subprocess.STARTF_USESHOWWINDOW
                        startup.wShowWindow = subprocess.SW_HIDE
                        cmd = os.path.join(os.environ["SystemRoot"], "System32", "cmd.exe")
                        result = subprocess.run(
                            f'"{cmd}" /d /s /c ""{restart}""',
                            cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NEW_CONSOLE,
                            startupinfo=startup, timeout=5, check=False)
                        self.assertEqual(result.returncode, result_code,
                                         result.stderr.decode(errors="replace"))
                        self.assertEqual((root / "order.txt").read_text().splitlines(),
                                         ["stop", "start"])

    def test_real_console_parent_exits_child_stays_console_free_and_logs (self):
        # Exercise the actual venv redirector + base pythonw, not a mocked Popen.
        pythonw = Path(sys.executable).with_name("pythonw.exe")
        self.assertTrue(pythonw.is_file())
        with tempfile.TemporaryDirectory(prefix="katlab launcher ") as directory:
            root = Path(directory) / "space & unicode é"
            root.mkdir()
            ready, release = root / "ready.json", root / "release"
            log = root / "child.log"
            log.write_bytes(b"previous\n")
            child_script = root / "child.py"
            child_script.write_text(
                "import ctypes,json,os,pathlib,sys,time\n"
                "root=pathlib.Path.cwd()\n"
                "ctypes.windll.kernel32.GetConsoleWindow.restype=ctypes.c_void_p\n"
                "data={'pid':os.getpid(),'cwd':str(root),'arg':sys.argv[1],"
                "'env':os.environ.get('KATLAB_LAUNCH_TEST'),"
                "'console':ctypes.windll.kernel32.GetConsoleWindow(),"
                "'cp':ctypes.windll.kernel32.GetConsoleCP(),'stdin':sys.stdin.read()}\n"
                "print('stdout before',flush=True)\n"
                "print('stderr before',file=sys.stderr,flush=True)\n"
                "(root/'ready.tmp').write_text(json.dumps(data),encoding='utf-8')\n"
                "(root/'ready.tmp').replace(root/'ready.json')\n"
                "deadline=time.monotonic()+15\n"
                "while not (root/'release').exists() and time.monotonic()<deadline:\n"
                "    time.sleep(.02)\n"
                "print('stdout after parent exit',flush=True)\n"
                "print('stderr after parent exit',file=sys.stderr,flush=True)\n",
                encoding="utf-8")
            argument = 'spaces & | < > ! % ^ " é'
            parent_script = root / "parent.py"
            parent_script.write_text(
                "import ctypes,json,pathlib,sys\n"
                f"sys.path.insert(0,{str(REPO)!r})\n"
                "from Scripts.launch_hidden import launch_hidden\n"
                f"process=launch_hidden({[str(pythonw), '-u', str(child_script), argument]!r},"
                f"cwd=pathlib.Path({str(root)!r}),log_path=pathlib.Path({str(log)!r}))\n"
                "print(json.dumps({'cp':ctypes.windll.kernel32.GetConsoleCP(),'pid':process.pid}))\n",
                encoding="utf-8")
            environment = os.environ.copy()
            environment["KATLAB_LAUNCH_TEST"] = "inherited demo-like value"
            startup = subprocess.STARTUPINFO()
            startup.dwFlags = subprocess.STARTF_USESHOWWINDOW
            startup.wShowWindow = subprocess.SW_HIDE
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
            kernel.OpenProcess.restype = ctypes.c_void_p
            kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
            kernel.WaitForSingleObject.restype = ctypes.c_ulong
            kernel.CloseHandle.argtypes = [ctypes.c_void_p]
            handle = None
            try:
                cmd = os.path.join(os.environ["SystemRoot"], "System32", "cmd.exe")
                # CMD has its own quote grammar; Python's argv quoting targets C
                # runtimes, so pass one explicit /s /c command line here only.
                result = subprocess.run(
                    f'"{cmd}" /d /s /c ""{sys.executable}" "{parent_script}""',
                    cwd=root, env=environment, stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NEW_CONSOLE,
                    startupinfo=startup, timeout=8, check=False)
                self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
                parent = json.loads(result.stdout)
                handle = kernel.OpenProcess(0x00100000, False, parent["pid"])
                self.assertTrue(handle)
                self.assertGreater(parent["cp"], 0)
                deadline = time.monotonic() + 5
                while not ready.is_file() and time.monotonic() < deadline:
                    time.sleep(.02)
                data = json.loads(ready.read_text(encoding="utf-8"))
                self.assertEqual(kernel.WaitForSingleObject(handle, 0), 258)  # still running
                self.assertFalse(data["console"])
                self.assertEqual(data["cp"], 0)
                self.assertEqual(data["stdin"], "")
                self.assertEqual(data["cwd"], str(root))
                self.assertEqual(data["arg"], argument)
                self.assertEqual(data["env"], environment["KATLAB_LAUNCH_TEST"])
                self.assertNotIn(b"after parent exit", log.read_bytes())
            finally:
                release.touch()  # cooperative, fixture-only shutdown; never kill user PIDs
                if handle:
                    wait = kernel.WaitForSingleObject(handle, 10000)
                    kernel.CloseHandle(handle)
                    self.assertEqual(wait, 0, "fixture did not exit after release")
            self.assertEqual(log.read_bytes().splitlines(), [
                b"previous", b"stdout before", b"stderr before",
                b"stdout after parent exit", b"stderr after parent exit"])


if __name__ == "__main__":
    unittest.main()
