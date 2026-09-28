"""Windows launcher regressions; all spawned processes are finite scratch fixtures."""

import builtins
import contextlib
import ctypes
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
from typing import Callable
import unittest
from unittest.mock import MagicMock, patch

from Backend.app import config as backend_config
from Scripts import launch_hidden as launcher
from Scripts import lifecycle_port as lifecycle


REPO = Path(__file__).resolve().parents[1]
NETSTAT_HEADER = "Active Connections\n\n  Proto  Local Address  Foreign Address  State  PID\n"


def netstat_row (port: int, pid: int, *, host: str = "127.0.0.1") -> str:
    return f"  TCP  {host}:{port}  0.0.0.0:0  LISTENING  {pid}\n"


def command_result (name: str, code: int = 0, output: str = "") \
        -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([name], code, output, "")


def monotonic_values (*values: float) -> Callable[[], float]:
    values_iter = iter(values)
    return lambda: next(values_iter, values[-1])


def healthy_response (repo_ids: tuple[str, ...], *, version: str | None = None,
                      alive: int = 2, total: int = 2) -> dict:
    return {
        "success": True,
        "data": {
            "server": {
                "version": lifecycle.__version__ if version is None else version,
                "watchers_alive": alive,
                "watchers_total": total,
            },
            "repos": [{"id": repo_id} for repo_id in repo_ids],
        },
        "message": "OK",
        "timestamp": "2026-09-28T00:00:00Z",
    }


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
                preflight = f'"%PY%" -m Scripts.lifecycle_port preflight {mode}'
                line = f'"%PY%" Scripts\\launch_hidden.py {mode}\n'
                ready = f'"%PY%" -m Scripts.lifecycle_port ready {mode}'
                self.assertEqual(source.count(preflight), 1)
                self.assertEqual(source.count(line), 1)
                self.assertEqual(source.count(ready), 1)
                self.assertLess(source.index(preflight), source.index(line))
                self.assertLess(source.index(line), source.index(ready))
                self.assertIn("if errorlevel 10 if not errorlevel 11 (", source)
                self.assertNotIn("%errorlevel%", source.lower())
                self.assertLess(source.index(preflight), source.index(
                    "if not defined FRESH_VENV ("))
                tail = source.split(line, 1)[1]
                self.assertTrue(tail.startswith("if errorlevel 1 (\n"))
                self.assertLess(tail.index("exit /b 1"), tail.index(ready))
                self.assertNotIn("netstat -ano", source)
                self.assertNotRegex(source, r'(?im)^\s*start\s+""\s+"http')
                self.assertIn("move /y", source.split(line, 1)[0])
                self.assertTrue(tail.endswith("endlocal\nexit /b 0\n"))
                self.assertNotRegex(source, r"(?im)^exit(?:\s+\d+)?\s*$")
        for relative, start in (("Scripts/restart_tracking_monitor.bat", "start_tracking_monitor.bat"),
                                ("Scripts/Demo/restart_demo.bat", "start_demo.bat")):
            source = (REPO / relative).read_text(encoding="utf-8")
            self.assertIn(f'call "%~dp0{start}"', source)
            self.assertIn("if errorlevel 1", source)
            self.assertIn('set "ERRORLEVEL="', source)
            self.assertLess(source.index('set "ERRORLEVEL="'), source.index("call "))
            self.assertTrue(source.endswith("exit /b %errorlevel%\n"))
            self.assertNotRegex(source, r"(?im)^\s*@?start\s")
        for relative, mode in (("Scripts/stop_tracking_monitor.bat", "tracker"),
                               ("Scripts/Demo/stop_demo.bat", "demo")):
            with self.subTest(mode=mode):
                source = (REPO / relative).read_text(encoding="utf-8")
                self.assertEqual(source.count(
                    f'"%PY%" -m Scripts.lifecycle_port stop {mode}'), 1)
                self.assertNotIn("netstat -ano", source)
                self.assertNotIn("taskkill", source.lower())
                self.assertNotIn("timeout.exe", source.lower())
                self.assertNotIn("pause", source.lower())
        for relative in ("Scripts/start_tracking_monitor.bat",
                         "Scripts/stop_tracking_monitor.bat",
                         "Scripts/Demo/start_demo.bat",
                         "Scripts/Demo/stop_demo.bat"):
            with self.subTest(relative=relative):
                source = (REPO / relative).read_text(encoding="utf-8")
                self.assertEqual(source.split("cd /d", 1)[1].splitlines()[1],
                                 "if errorlevel 1 (")
        for relative in ("Scripts/Demo/start_demo.bat", "Scripts/Demo/stop_demo.bat"):
            with self.subTest(relative=relative):
                source = (REPO / relative).read_text(encoding="utf-8")
                self.assertLess(source.index('set "CD="'), source.index("cd /d"))
                self.assertLess(source.index("cd /d"), source.index("%cd%"))

    def test_actual_restart_batches_fail_closed_and_propagate_result (self):
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
            self.assertIn('set "ERRORLEVEL="', source)
            for stop_code, start_code, expected in ((0, 0, 0), (0, 7, 7), (9, 0, 9)):
                with self.subTest(relative=relative, stop=stop_code, start=start_code):
                    with tempfile.TemporaryDirectory(prefix="katlab restart ") as directory:
                        root = Path(directory) / "space & unicode é"
                        root.mkdir()
                        restart = root / Path(relative).name
                        restart.write_text(source, encoding="utf-8")
                        (root / stop).write_text(
                            '@echo off\necho stop>"%~dp0order.txt"\n'
                            f'exit /b {stop_code}\n',
                            encoding="utf-8")
                        (root / start).write_text(
                            '@echo off\necho start>>"%~dp0order.txt"\n'
                            f'exit /b {start_code}\n', encoding="utf-8")
                        startup = subprocess.STARTUPINFO()
                        startup.dwFlags = subprocess.STARTF_USESHOWWINDOW
                        startup.wShowWindow = subprocess.SW_HIDE
                        cmd = os.path.join(os.environ["SystemRoot"], "System32", "cmd.exe")
                        environment = os.environ.copy()
                        environment["ERRORLEVEL"] = "10"
                        result = subprocess.run(
                            f'"{cmd}" /d /s /c ""{restart}""',
                            cwd=root, env=environment, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NEW_CONSOLE,
                            startupinfo=startup, timeout=5, check=False)
                        self.assertEqual(result.returncode, expected,
                                         result.stderr.decode(errors="replace"))
                        self.assertEqual((root / "order.txt").read_text().splitlines(),
                                         ["stop", "start"] if stop_code == 0 else ["stop"])

    def test_actual_start_preflight_guard_ignores_inherited_errorlevel (self):
        cmd = os.path.join(os.environ["SystemRoot"], "System32", "cmd.exe")
        for relative, mode in (("Scripts/start_tracking_monitor.bat", "tracker"),
                               ("Scripts/Demo/start_demo.bat", "demo")):
            source = (REPO / relative).read_text(encoding="utf-8")
            helper_line = f'"%PY%" -m Scripts.lifecycle_port preflight {mode}\n'
            self.assertEqual(source.count(helper_line), 1)
            guard = source.split(helper_line, 1)[1].split("\n\n", 1)[0]
            self.assertIn("if errorlevel 10 if not errorlevel 11 (", guard)
            self.assertIn("if errorlevel 1 (", guard)
            self.assertNotIn("%errorlevel%", guard.lower())
            self.assertEqual(guard.count("exit /b"), 2)
            for helper_code, expected, continued in ((0, 0, True), (1, 1, False),
                                                     (10, 0, False)):
                with self.subTest(mode=mode, helper=helper_code):
                    with tempfile.TemporaryDirectory(prefix="katlab preflight ") as directory:
                        root = Path(directory) / "space & unicode é"
                        root.mkdir()
                        batch = root / "preflight.bat"
                        helper = root / "helper.bat"
                        # Only the helper invocation is replaced. The conditional
                        # guard is copied verbatim from the actual start script.
                        batch.write_text(
                            '@echo off\nsetlocal\ncall "%~dp0helper.bat"\n'
                            + guard + '\n'
                            + 'echo continued>"%~dp0continued.txt"\nexit /b 0\n',
                            encoding="utf-8")
                        helper.write_text(f'@echo off\nexit /b {helper_code}\n',
                                          encoding="utf-8")
                        environment = os.environ.copy()
                        environment["ERRORLEVEL"] = "10"
                        result = subprocess.run(
                            f'"{cmd}" /d /s /c ""{batch}""', cwd=root, env=environment,
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=5, check=False)
                        self.assertEqual(result.returncode, expected,
                                         result.stderr.decode(errors="replace"))
                        self.assertEqual((root / "continued.txt").exists(), continued)

    def test_demo_batch_config_path_ignores_inherited_cd_shadow (self):
        marker = 'set "KATLAB_TRACKER_ACTIVITY_DIR=%cd%\\Demo\\runtime\\activity"\n'
        cmd = os.path.join(os.environ["SystemRoot"], "System32", "cmd.exe")
        for relative in ("Scripts/Demo/start_demo.bat", "Scripts/Demo/stop_demo.bat"):
            with self.subTest(relative=relative):
                source = (REPO / relative).read_text(encoding="utf-8")
                self.assertEqual(source.count(marker), 1)
                # Execute only the actual environment-setup prefix in a scratch
                # tree; no bootstrap, backend, browser, or real stopper runs.
                fixture = source.split(marker, 1)[0] + marker
                fixture += "echo CONFIG=%KATLAB_TRACKER_CONFIG%\nexit /b 0\n"
                with tempfile.TemporaryDirectory(prefix="katlab cd shadow ") as directory:
                    root = Path(directory) / "repo with spaces"
                    demo_scripts = root / "Scripts" / "Demo"
                    demo_scripts.mkdir(parents=True)
                    batch = demo_scripts / "fixture.bat"
                    batch.write_text(fixture, encoding="utf-8")
                    environment = os.environ.copy()
                    environment["CD"] = r"C:\shadow\wrong"
                    result = subprocess.run(
                        f'"{cmd}" /d /s /c ""{batch}""', cwd=demo_scripts,
                        env=environment, stdin=subprocess.DEVNULL,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        timeout=5, check=False)
                    self.assertEqual(result.returncode, 0,
                                     result.stderr.decode(errors="replace"))
                    expected = str(root / "Demo" / "runtime" / "repos.demo.yaml")
                    self.assertIn("CONFIG=" + expected, result.stdout.decode(errors="replace"))
                    self.assertNotIn("C:\\shadow\\wrong", result.stdout.decode(errors="replace"))

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


@unittest.skipUnless(os.name == "nt", "Windows lifecycle contract")
class LifecyclePortTests(unittest.TestCase):
    def setUp (self):
        self.profile = lifecycle.Profile("127.0.0.1", 8100, ("EA_Dev", "UM_Dev"))

    @staticmethod
    def _write_config (root: Path, relative: str, source: str) -> Path:
        config = root / relative
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(source, encoding="utf-8")
        (config.parent / "checks.json").write_text(
            '{"schema_version":1,"checks":[]}', encoding="utf-8")
        return config

    def test_exact_tcp_listener_parser_deduplicates_and_ignores_other_rows (self):
        output = (NETSTAT_HEADER
                  + netstat_row(8100, 234)
                  + netstat_row(8100, 234, host="[::]")
                  + netstat_row(18100, 999)
                  + "  TCP  127.0.0.1:8100  127.0.0.1:41000  ESTABLISHED  700\n"
                  + "  TCP  127.0.0.1:8100  127.0.0.1:41001  TIME_WAIT  0\n"
                  + "  UDP  0.0.0.0:8100  *:*  800\n")
        self.assertEqual(lifecycle.parse_listening_pids(output, 8100), {234})
        self.assertEqual(lifecycle.parse_listening_pids(output, 8101), set())
        self.assertEqual(lifecycle.parse_listening_pids(NETSTAT_HEADER, 8100), set())
        for malformed in ("", "access denied", NETSTAT_HEADER +
                          "  TCP  127.0.0.1:8100  0.0.0.0:0  LISTENING  nope\n",
                          NETSTAT_HEADER +
                          "  TCP  127.0.0.1:8100  0.0.0.0:0  L1STENING  123\n",
                          NETSTAT_HEADER +
                          "  TCP  127.0.0.1:8100  0.0.0.0:0  LISTENING\n",
                          NETSTAT_HEADER +
                          "  TCP  127.0.0.1:٨١٠٠  0.0.0.0:0  LISTENING  123\n",
                          NETSTAT_HEADER +
                          "  TCP  127.0.0.1:8100  0.0.0.0:0  LISTENING  ١٢٣\n",
                          NETSTAT_HEADER +
                          "  TCP  127.0.0.1:8100  0.0.0.0:0  LISTENING  "
                          + "9" * 5000 + "\n",
                          NETSTAT_HEADER +
                          "  TCP  127.0.0.1:" + "8" * 5000 +
                          "  0.0.0.0:0  LISTENING  123\n"):
            with self.subTest(malformed=malformed), self.assertRaises(lifecycle.LifecycleError):
                lifecycle.parse_listening_pids(malformed, 8100)

    def test_netstat_size_and_pid_caps_fail_before_taskkill (self):
        with patch.object(lifecycle, "MAX_NETSTAT_CHARS", 32):
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.parse_listening_pids(NETSTAT_HEADER, 8100)
        occupied = NETSTAT_HEADER + "".join(netstat_row(8100, pid) for pid in (10, 11, 12))
        with (patch.object(lifecycle, "MAX_LISTENER_PIDS", 2),
              patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_run_command", return_value=command_result(
                  "netstat", output=occupied)) as run):
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.stop("tracker")
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0], ["netstat", "-ano"])

    def test_netstat_child_uses_bounded_hidden_subprocess (self):
        with patch.object(lifecycle.subprocess, "run", return_value=command_result("netstat")) \
                as child:
            lifecycle._run_command(["netstat", "-ano"])
            child.assert_called_once()
            kwargs = child.call_args.kwargs
            self.assertEqual(kwargs["timeout"], lifecycle.COMMAND_TIMEOUT_SECONDS)
            self.assertEqual(kwargs["creationflags"], subprocess.CREATE_NO_WINDOW)
            self.assertTrue(kwargs["capture_output"])
            self.assertFalse(kwargs["check"])

    def test_stop_no_listener_is_success_without_taskkill_or_sleep (self):
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_run_command", return_value=command_result(
                  "netstat", output=NETSTAT_HEADER)) as run,
              patch.object(lifecycle, "_sleep") as sleep):
            self.assertEqual(lifecycle.stop("tracker"), 0)
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0], ["netstat", "-ano"])
            sleep.assert_not_called()

    def test_stop_waits_for_port_clear_not_taskkill_exit_code (self):
        occupied = NETSTAT_HEADER + netstat_row(8100, 4321)
        for kill_code, snapshots in ((0, [occupied, NETSTAT_HEADER]),
                                     (7, [occupied, NETSTAT_HEADER]),
                                     (0, [occupied, occupied, NETSTAT_HEADER])):
            with self.subTest(kill_code=kill_code, count=len(snapshots)):
                results = iter([command_result("netstat", output=snapshots[0]),
                                command_result("taskkill", code=kill_code)]
                               + [command_result("netstat", output=state)
                                  for state in snapshots[1:]])
                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_run_command", side_effect=lambda *_, **__: next(results))
                      as run,
                      patch.object(lifecycle, "_monotonic", return_value=0),
                      patch.object(lifecycle, "_sleep") as sleep):
                    self.assertEqual(lifecycle.stop("tracker"), 0)
                    self.assertEqual(run.call_args_list[1].args[0],
                                     ["taskkill", "/pid", "4321", "/t", "/f"])
                    self.assertEqual(sleep.call_count, len(snapshots) - 2)

    def test_stop_bounds_each_kill_to_remaining_deadline (self):
        occupied = (NETSTAT_HEADER + netstat_row(8100, 1111)
                    + netstat_row(8100, 2222))
        results = iter([command_result("netstat", output=occupied),
                        command_result("taskkill"),
                        command_result("netstat", output=NETSTAT_HEADER)])
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_run_command", side_effect=lambda *_, **__: next(results))
              as run,
              patch.object(lifecycle, "_monotonic", side_effect=monotonic_values(
                  0, 14.8, 16, 16))):
            self.assertEqual(lifecycle.stop("tracker"), 0)
            kills = [call for call in run.call_args_list
                     if call.args[0][0] == "taskkill"]
            self.assertEqual(len(kills), 1)
            self.assertEqual(kills[0].args[0][2], "1111")
            self.assertAlmostEqual(kills[0].kwargs["timeout"], 0.2)

    def test_timed_out_taskkill_requires_observed_port_clear (self):
        occupied = NETSTAT_HEADER + netstat_row(8100, 4321)
        for final_output, should_succeed in ((NETSTAT_HEADER, True), (occupied, False)):
            with self.subTest(clear=should_succeed):
                snapshots = iter((occupied, final_output))

                def run (argv, **kwargs):
                    if argv[0] == "taskkill":
                        raise subprocess.TimeoutExpired(argv, kwargs["timeout"])
                    return command_result("netstat", output=next(snapshots))

                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_run_command", side_effect=run),
                      patch.object(lifecycle, "_monotonic", side_effect=monotonic_values(
                          0, 0, 0, 16))):
                    if should_succeed:
                        self.assertEqual(lifecycle.stop("tracker"), 0)
                    else:
                        with self.assertRaises(lifecycle.LifecycleError):
                            lifecycle.stop("tracker")

    def test_stop_refuses_persistent_or_unverifiable_listener (self):
        occupied = NETSTAT_HEADER + netstat_row(8100, 4321)
        for kill_code in (0, 7):
            with self.subTest(kill_code=kill_code):
                results = iter([command_result("netstat", output=occupied),
                                command_result("taskkill", code=kill_code),
                                command_result("netstat", output=occupied)])
                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_run_command", side_effect=lambda *_, **__: next(results)),
                      patch.object(lifecycle, "_monotonic", side_effect=monotonic_values(
                          0, 0, 0, 16)),
                      patch.object(lifecycle, "_sleep") as sleep):
                    with self.assertRaises(lifecycle.LifecycleError):
                        lifecycle.stop("tracker")
                    sleep.assert_not_called()
        for results, kill_expected in (
                ([command_result("netstat", code=1)], False),
                ([command_result("netstat", output=occupied),
                  command_result("taskkill"), command_result("netstat", code=1)], True)):
            with self.subTest(initial=not kill_expected):
                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_run_command", side_effect=results) as run,
                      patch.object(lifecycle, "_monotonic", return_value=0)):
                    with self.assertRaises(lifecycle.LifecycleError):
                        lifecycle.stop("tracker")
                    self.assertEqual(any(call.args[0][0] == "taskkill"
                                         for call in run.call_args_list), kill_expected)

    def test_stop_refuses_system_pids_and_bad_pid_before_taskkill (self):
        for output in (NETSTAT_HEADER + netstat_row(8100, 0),
                       NETSTAT_HEADER + netstat_row(8100, 4),
                       NETSTAT_HEADER +
                       "  TCP  127.0.0.1:8100  0.0.0.0:0  LISTENING  bad\n"):
            with self.subTest(output=output):
                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_run_command", return_value=command_result(
                          "netstat", output=output)) as run):
                    with self.assertRaises(lifecycle.LifecycleError):
                        lifecycle.stop("tracker")
                    self.assertEqual(run.call_count, 1)
                    self.assertEqual(run.call_args.args[0], ["netstat", "-ano"])

    def test_preflight_accepts_only_matching_healthy_application (self):
        good = healthy_response(self.profile.repo_ids)
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_listening_pids", return_value={4321}),
              patch.object(lifecycle, "_fetch_health", return_value=good),
              patch.object(lifecycle, "_open_browser", return_value=True) as browser):
            self.assertEqual(lifecycle.preflight("tracker"), 10)
            browser.assert_called_once_with(self.profile)
        cases = (
            healthy_response(self.profile.repo_ids, version="0.0.0.0"),
            healthy_response(("UM_Dev", "EA_Dev")),
            healthy_response(("Demo_One",)),
            healthy_response(self.profile.repo_ids, alive=1, total=2),
            healthy_response(self.profile.repo_ids, alive=0, total=0),
            {"success": False, "data": good["data"], "message": "OK", "timestamp": "now"},
            {"success": True, "data": good["data"]},
            {"success": True, "data": {"server": good["data"]["server"], "repos": None},
             "message": "OK", "timestamp": "now"},
        )
        for payload in cases:
            with self.subTest(payload=payload):
                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_listening_pids", return_value={4321}),
                      patch.object(lifecycle, "_fetch_health", return_value=payload),
                      patch.object(lifecycle, "_open_browser") as browser):
                    with self.assertRaises(lifecycle.LifecycleError):
                        lifecycle.preflight("tracker")
                    browser.assert_not_called()

    def test_preflight_clear_port_does_not_probe_or_open_browser (self):
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_listening_pids", return_value=set()),
              patch.object(lifecycle, "_fetch_health") as health,
              patch.object(lifecycle, "_open_browser") as browser):
            self.assertEqual(lifecycle.preflight("tracker"), 0)
            health.assert_not_called()
            browser.assert_not_called()

    def test_preflight_refuses_system_owned_listener_without_http_or_browser (self):
        for pid in (0, 4):
            with self.subTest(pid=pid):
                with (patch.object(lifecycle, "load_profile", return_value=self.profile),
                      patch.object(lifecycle, "_listening_pids", return_value={pid}),
                      patch.object(lifecycle, "_fetch_health") as health,
                      patch.object(lifecycle, "_open_browser") as browser):
                    with self.assertRaises(lifecycle.LifecycleError):
                        lifecycle.preflight("tracker")
                    health.assert_not_called()
                    browser.assert_not_called()

    def test_empty_repo_profile_is_valid_if_its_watchers_are_alive (self):
        profile = lifecycle.Profile("127.0.0.1", 8100, ())
        with (patch.object(lifecycle, "load_profile", return_value=profile),
              patch.object(lifecycle, "_listening_pids", return_value={4321}),
              patch.object(lifecycle, "_fetch_health", return_value=healthy_response(())),
              patch.object(lifecycle, "_open_browser", return_value=True)):
            self.assertEqual(lifecycle.preflight("tracker"), 10)

    def test_ready_waits_for_health_then_opens_browser_once (self):
        bad = healthy_response(self.profile.repo_ids, alive=1)
        good = healthy_response(self.profile.repo_ids)
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_fetch_health", side_effect=[bad, good]) as health,
              patch.object(lifecycle, "_open_browser", return_value=True) as browser,
              patch.object(lifecycle, "_monotonic", side_effect=[0, 1]),
              patch.object(lifecycle, "_sleep") as sleep):
            self.assertEqual(lifecycle.ready("tracker"), 0)
            self.assertEqual(health.call_count, 2)
            sleep.assert_called_once_with(lifecycle.POLL_SECONDS)
            browser.assert_called_once_with(self.profile)
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_fetch_health", return_value=bad),
              patch.object(lifecycle, "_open_browser") as browser,
              patch.object(lifecycle, "_monotonic", side_effect=[0, 46]),
              patch.object(lifecycle, "_sleep") as sleep):
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.ready("tracker")
            browser.assert_not_called()
            sleep.assert_not_called()
        absent_demo = lifecycle.Profile("127.0.0.1", 8101, (), False)
        with (patch.object(lifecycle, "load_profile", return_value=absent_demo),
              patch.object(lifecycle, "_fetch_health") as health,
              patch.object(lifecycle, "_open_browser") as browser):
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.ready("demo")
            health.assert_not_called()
            browser.assert_not_called()

    def test_http_probe_uses_configured_host_no_proxy_and_no_redirect (self):
        self.assertEqual(lifecycle.Profile("0.0.0.0", 8100, ()).origin,
                         "http://127.0.0.1:8100")
        self.assertEqual(lifecycle.Profile("::", 8100, ()).origin,
                         "http://[::1]:8100")
        self.assertEqual(lifecycle.Profile("::1", 8100, ()).origin,
                         "http://[::1]:8100")
        self.assertEqual(lifecycle.Profile("[::1]", 8100, ()).origin,
                         "http://[::1]:8100")
        profile = lifecycle.Profile("localhost", 8123, ())
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'{"success": true}'
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = response
        with patch.object(lifecycle.request, "build_opener", return_value=opener) as build:
            self.assertEqual(lifecycle._fetch_health(profile), {"success": True})
            self.assertEqual(build.call_args.args[0].proxies, {})
            self.assertIsNone(build.call_args.args[1].redirect_request(
                None, None, 302, "redirect", {}, "http://example.invalid"))
            request_arg = opener.open.call_args.args[0]
            self.assertEqual(request_arg.full_url, "http://localhost:8123/api/health")
            self.assertEqual(opener.open.call_args.kwargs["timeout"],
                             lifecycle.HTTP_TIMEOUT_SECONDS)

    def test_http_probe_rejects_redirect_status_and_oversized_body (self):
        response = MagicMock()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = response
        with patch.object(lifecycle.request, "build_opener", return_value=opener):
            response.status = 302
            response.read.return_value = b'{}'
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle._fetch_health(self.profile)
            response.status = 200
            response.read.return_value = b"x" * 33
            with patch.object(lifecycle, "MAX_HEALTH_BYTES", 32):
                with self.assertRaises(lifecycle.LifecycleError):
                    lifecycle._fetch_health(self.profile)

    def test_redirect_or_browser_error_cannot_report_preflight_success (self):
        from urllib.error import HTTPError

        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_listening_pids", return_value={4321}),
              patch.object(lifecycle, "_fetch_health", side_effect=HTTPError(
                  self.profile.origin + "/api/health", 302, "redirect", {}, None)),
              patch.object(lifecycle, "_open_browser") as browser,
              contextlib.redirect_stderr(io.StringIO()) as errors):
            self.assertEqual(lifecycle.main(["preflight", "tracker"]), 1)
            browser.assert_not_called()
            self.assertIn("[ABORT]", errors.getvalue())
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_listening_pids", return_value={4321}),
              patch.object(lifecycle, "_fetch_health", return_value=healthy_response(
                  self.profile.repo_ids)),
              patch.object(lifecycle.webbrowser, "open", side_effect=OSError("no browser")),
              contextlib.redirect_stderr(io.StringIO()) as errors):
            self.assertEqual(lifecycle.main(["preflight", "tracker"]), 1)
            self.assertIn("[ABORT]", errors.getvalue())
            self.assertNotIn("Traceback", errors.getvalue())
            self.assertNotIn("no browser", errors.getvalue())
        with (patch.object(lifecycle, "load_profile", return_value=self.profile),
              patch.object(lifecycle, "_listening_pids", return_value={4321}),
              patch.object(lifecycle, "_fetch_health", side_effect=RecursionError(
                  "nested JSON")),
              patch.object(lifecycle, "_open_browser") as browser,
              contextlib.redirect_stderr(io.StringIO()) as errors):
            self.assertEqual(lifecycle.main(["preflight", "tracker"]), 1)
            browser.assert_not_called()
            self.assertNotIn("Traceback", errors.getvalue())

    def test_production_backend_port_defaults_and_invalid_config_fail_closed (self):
        for source in ("repos: []\n", "server:\n  host: 127.0.0.1\nrepos: []\n"):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self._write_config(root, "Config/repos.yaml", source)
                with (patch.dict(os.environ, {}, clear=True),
                      patch.object(lifecycle, "REPO_ROOT", root)):
                    profile = lifecycle.load_profile("tracker")
                    self.assertEqual(profile.port, 8100)
                    self.assertEqual(profile.repo_ids, ())
        invalid = (
            "server: [\nrepos: []\n",
            "server:\n  port: 8100\n  port: 8100\nrepos: []\n",
            "server:\n  port: 65536\nrepos: []\n",
        )
        for source in invalid:
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self._write_config(root, "Config/repos.yaml", source)
                with (patch.dict(os.environ, {}, clear=True),
                      patch.object(lifecycle, "REPO_ROOT", root),
                      patch.object(lifecycle, "_run_command") as run,
                      contextlib.redirect_stderr(io.StringIO())):
                    self.assertEqual(lifecycle.main(["stop", "tracker"]), 1)
                    run.assert_not_called()
        with (patch.dict(os.environ, {}, clear=True),
              patch.object(backend_config, "load_config_snapshot", side_effect=OSError("unreadable")),
              patch.object(lifecycle, "_run_command") as run,
              contextlib.redirect_stderr(io.StringIO())):
            self.assertEqual(lifecycle.main(["stop", "tracker"]), 1)
            run.assert_not_called()

    def test_production_inherited_overrides_fail_before_config_or_netstat (self):
        for key in lifecycle._PRODUCTION_OVERRIDES:
            with self.subTest(key=key):
                with (patch.dict(os.environ, {key: "unexpected"}, clear=True),
                      patch.object(backend_config, "load_config_snapshot") as config,
                      patch.object(lifecycle, "_run_command") as run,
                      contextlib.redirect_stderr(io.StringIO())):
                    self.assertEqual(lifecycle.main(["stop", "tracker"]), 1)
                    config.assert_not_called()
                    run.assert_not_called()

    def test_missing_backend_config_dependency_aborts_without_traceback (self):
        original_import = builtins.__import__

        def import_without_backend_config (name, *args, **kwargs):
            if name == "Backend.app.config":
                raise ImportError("PyYAML missing")
            return original_import(name, *args, **kwargs)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_config(root, "Config/repos.yaml", "repos: []\n")
            with (patch.dict(os.environ, {}, clear=True),
                  patch.object(lifecycle, "REPO_ROOT", root),
                  patch.object(builtins, "__import__", side_effect=import_without_backend_config),
                  patch.object(lifecycle, "_run_command") as run,
                  contextlib.redirect_stderr(io.StringIO()) as errors):
                self.assertEqual(lifecycle.main(["stop", "tracker"]), 1)
                run.assert_not_called()
                self.assertIn("[ABORT]", errors.getvalue())
                self.assertNotIn("Traceback", errors.getvalue())
                self.assertNotIn("PyYAML", errors.getvalue())

    def test_demo_absent_config_never_kills_unknown_listener (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (patch.dict(os.environ, {}, clear=True),
                  patch.object(lifecycle, "REPO_ROOT", root)):
                profile = lifecycle.load_profile("demo")
                self.assertEqual((profile.host, profile.port, profile.repo_ids,
                                  profile.config_exists), ("127.0.0.1", 8101, (), False))
                with patch.object(lifecycle, "_run_command", return_value=command_result(
                        "netstat", output=NETSTAT_HEADER)) as run:
                    self.assertEqual(lifecycle.stop("demo"), 0)
                    self.assertEqual(run.call_count, 1)
                    self.assertEqual(run.call_args.args[0], ["netstat", "-ano"])
                occupied = NETSTAT_HEADER + netstat_row(8101, 4321)
                with patch.object(lifecycle, "_run_command", return_value=command_result(
                        "netstat", output=occupied)) as run:
                    with self.assertRaises(lifecycle.LifecycleError):
                        lifecycle.stop("demo")
                    self.assertEqual(run.call_count, 1)
                    self.assertEqual(run.call_args.args[0], ["netstat", "-ano"])

    def test_demo_present_config_requires_exact_port_before_netstat (self):
        for source in ("server:\n  host: 127.0.0.1\nrepos: []\n",
                       "server:\n  port: 8102\nrepos: []\n",
                       "server:\n  port: bad\nrepos: []\n"):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self._write_config(root, "Demo/runtime/repos.demo.yaml", source)
                with (patch.dict(os.environ, {}, clear=True),
                      patch.object(lifecycle, "REPO_ROOT", root),
                      patch.object(lifecycle, "_run_command") as run,
                      contextlib.redirect_stderr(io.StringIO())):
                    self.assertEqual(lifecycle.main(["stop", "demo"]), 1)
                    run.assert_not_called()

    def test_broken_demo_config_link_is_not_treated_as_absent (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            symlink_stat = MagicMock(st_mode=stat.S_IFLNK, st_file_attributes=0)
            with (patch.dict(os.environ, {}, clear=True),
                  patch.object(lifecycle, "REPO_ROOT", root),
                  patch.object(Path, "lstat", return_value=symlink_stat),
                  patch.object(backend_config, "load_config_snapshot") as config,
                  patch.object(lifecycle, "_run_command") as run,
                  contextlib.redirect_stderr(io.StringIO())):
                self.assertEqual(lifecycle.main(["stop", "demo"]), 1)
                config.assert_not_called()
                run.assert_not_called()

    def test_demo_static_status_config_loads_for_stop_without_parent_flag (self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Demo/runtime/demo_repo/.git").mkdir(parents=True)
            source = ("server:\n  host: 127.0.0.1\n  port: 8101\n"
                      "repos:\n  - id: Demo_One\n    path: 'Demo/runtime/demo_repo'\n"
                      "    demo: true\n    static_status:\n      clean: true\n"
                      "      count: 0\n      branch: main\n      dirty_paths: []\n")
            self._write_config(root, "Demo/runtime/repos.demo.yaml", source)
            with (patch.dict(os.environ, {}, clear=True),
                  patch.object(lifecycle, "REPO_ROOT", root),
                  patch.object(backend_config, "REPO_ROOT", root)):
                self.assertNotIn("KATLAB_TRACKER_DEMO", os.environ)
                profile = lifecycle.load_profile("demo")
                self.assertEqual(profile.repo_ids, ("Demo_One",))
                self.assertEqual(os.environ.get("KATLAB_TRACKER_DEMO"), "1")
                with patch.object(lifecycle, "_run_command", return_value=command_result(
                        "netstat", output=NETSTAT_HEADER)):
                    self.assertEqual(lifecycle.stop("demo"), 0)

    def test_module_cli_import_is_safe_without_arguments (self):
        environment = {key: value for key, value in os.environ.items()
                       if not key.startswith("KATLAB_TRACKER_")}
        result = subprocess.run(
            [sys.executable, "-m", "Scripts.lifecycle_port"], cwd=REPO,
            env=environment, stdin=subprocess.DEVNULL, capture_output=True,
            text=True, timeout=8, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Usage: python -m Scripts.lifecycle_port", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
