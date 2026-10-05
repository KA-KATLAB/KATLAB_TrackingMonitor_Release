"""Owned-stop proofs; native termination targets only an explicitly spawned fixture."""

from dataclasses import asdict, replace
import ctypes
import http.client
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import MagicMock, patch

from Scripts import lifecycle_process as owned


REPO = Path(__file__).resolve().parents[1]
ROOT_IMAGE = owned._path_key(r"C:\Fixture Repo\café\.venv\Scripts\pythonw.exe")
BASE_IMAGE = owned._path_key(r"C:\Fixture Python\pythonw.exe")
COMMAND = subprocess.list2cmdline([ROOT_IMAGE, "-u", "-m", "Backend.app.main"])
AUTHORITY = owned._Authority(ROOT_IMAGE, BASE_IMAGE)


def records () -> dict[int, owned._Process]:
    return {
        100: owned._Process(100, 77, 10000, ROOT_IMAGE, COMMAND),
        101: owned._Process(101, 100, 20000, BASE_IMAGE, COMMAND),
        102: owned._Process(102, 101, 30000, r"C:\Tools\git.exe", None),
        900: owned._Process(900, 0, None, None, None),
    }


class FakeLease:
    def __init__ (self, pid, created, events, *, live=True):
        self.pid, self.created = pid, created
        self.events, self.live, self.closed = events, live, False

    def alive (self):
        if self.closed:
            raise owned.ProcessOwnershipError("Fixture lease closed")
        return self.live

    def terminate (self):
        if self.live:
            self.events.append(("terminate", self.pid))
        self.live = False

    def wait_exit (self, deadline):
        self.events.append(("wait", self.pid))

    def close (self):
        self.closed = True
        self.events.append(("close", self.pid))


@unittest.skipUnless(os.name == "nt", "Windows ownership contract")
class ProcessOwnershipTests(unittest.TestCase):
    def test_snapshot_roundtrip_and_unrelated_null_metadata (self):
        fixture = records()
        self.assertEqual(owned._parse_snapshot(
            json.dumps([asdict(row) for row in fixture.values()]).encode(), {101}), fixture)

    def test_snapshot_rejects_malformed_shape_duplicate_ids_and_nonfinite (self):
        row = asdict(records()[100])
        malformed = [b"", b"{}", b"[]", b"[", b"\xff", b"[NaN]",
                     json.dumps([row, row]).encode(),
                     b'[{"pid":1,"pid":2}]']
        for field, value in (("pid", True), ("pid", -1), ("parent", 1.5),
                             ("created", True), ("created", 0), ("image", []),
                             ("command", "embedded\0text")):
            malformed.append(json.dumps([{**row, field: value}]).encode())
        for data in malformed:
            with self.subTest(data=data[:40]), self.assertRaises(owned.ProcessOwnershipError):
                owned._parse_snapshot(data, {100})
        with patch.object(owned, "MAX_SNAPSHOT_BYTES", 2):
            with self.assertRaises(owned.ProcessOwnershipError):
                owned._parse_snapshot(b"[{}]", {100})

    def test_snapshot_does_not_accept_unrequested_private_commands (self):
        fixture = records()
        fixture[900] = replace(fixture[900], command="PRIVATE_FIXTURE_COMMAND")
        with self.assertRaises(owned.ProcessOwnershipError) as error:
            owned._parse_snapshot(json.dumps([asdict(row) for row in fixture.values()]).encode(), {101})
        self.assertNotIn("PRIVATE_FIXTURE_COMMAND", str(error.exception))

    def test_snapshot_count_is_bounded_before_graph_selection (self):
        data = json.dumps([asdict(row) for row in records().values()]).encode()
        with patch.object(owned, "MAX_PROCESSES", 2):
            with self.assertRaises(owned.ProcessOwnershipError):
                owned._parse_snapshot(data, {101})

    def test_windows_argument_parser_handles_spaces_unicode_and_exact_flags (self):
        self.assertEqual(owned._split_command(COMMAND),
                         (ROOT_IMAGE, "-u", "-m", "Backend.app.main"))
        self.assertEqual(owned._path_key("\\\\?\\" + ROOT_IMAGE), ROOT_IMAGE)
        for command in ("", " ", COMMAND + " extra", COMMAND.replace("-m", "-c"),
                        COMMAND.replace("Backend.app.main", "Other.main")):
            with self.subTest(command=command):
                fixture = records()
                fixture[101] = replace(fixture[101], command=command)
                with self.assertRaises(owned.ProcessOwnershipError):
                    owned._select_processes(fixture, {101}, AUTHORITY)

    def test_venv_and_base_listener_select_only_exact_owned_descendants (self):
        for pids in ({100}, {101}, {100, 101}):
            with self.subTest(pids=pids):
                roots, selected = owned._select_processes(records(), pids, AUTHORITY)
                self.assertEqual(roots, (100,))
                self.assertEqual([row.pid for row in selected], [100, 101, 102])
                self.assertNotIn(77, [row.pid for row in selected])
                self.assertNotIn(900, [row.pid for row in selected])

    def test_foreign_image_root_argv_and_missing_or_reused_parent_refuse (self):
        variants = []
        for pid, changes in (
            (101, {"image": r"C:\Other Python\pythonw.exe"}),
            (100, {"image": r"C:\Other Repo\.venv\Scripts\pythonw.exe"}),
            (100, {"command": COMMAND + " extra"}),
            (101, {"parent": 555}), (100, {"created": 20001}),
            (101, {"created": None}), (100, {"image": None}),
        ):
            fixture = records()
            fixture[pid] = replace(fixture[pid], **changes)
            variants.append(fixture)
        for fixture in variants:
            with self.subTest(fixture=fixture), self.assertRaises(owned.ProcessOwnershipError):
                owned._select_processes(fixture, {101}, AUTHORITY)
        with self.assertRaises(owned.ProcessOwnershipError):
            owned._select_processes(records(), {101, 900}, AUTHORITY)

    def test_mixed_listener_preparation_refuses_before_opening_any_target (self):
        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=records()),
              patch.object(owned, "_open_verified") as opened):
            with self.assertRaises(owned.ProcessOwnershipError):
                with owned.prepare_owned_processes(REPO, {101, 900}, time.monotonic() + 10):
                    self.fail("Mixed ownership must never yield")
            opened.assert_not_called()

    def test_stop_interpreter_outside_repository_venv_is_rejected (self):
        with patch.object(owned.sys, "executable", sys._base_executable):
            with self.assertRaises(owned.ProcessOwnershipError):
                owned._authority(REPO)

    def test_cycle_depth_size_and_invalid_descendant_identity_refuse (self):
        fixture = records()
        fixture[100] = replace(fixture[100], parent=102)
        fixture[101] = replace(fixture[101], created=10000)
        fixture[102] = replace(fixture[102], created=10000)
        with self.assertRaises(owned.ProcessOwnershipError):
            owned._select_processes(fixture, {101}, AUTHORITY)
        for limit in ("MAX_SELECTED_PROCESSES", "MAX_TREE_DEPTH"):
            with patch.object(owned, limit, 1), self.assertRaises(owned.ProcessOwnershipError):
                owned._select_processes(records(), {101}, AUTHORITY)
        fixture = records()
        fixture[102] = replace(fixture[102], image=None)
        with self.assertRaises(owned.ProcessOwnershipError):
            owned._select_processes(fixture, {101}, AUTHORITY)

    def test_preparation_acquires_every_lease_before_mutation_and_closes_all (self):
        events, leases = [], {}

        def acquire (row, **kwargs):
            events.append(("open", row.pid))
            leases[row.pid] = FakeLease(row.pid, row.created + 1, events)
            return leases[row.pid]

        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=records()),
              patch.object(owned, "_open_verified", side_effect=acquire) as opened):
            with owned.prepare_owned_processes(REPO, {101}, time.monotonic() + 10) as group:
                self.assertEqual(events, [("open", 100), ("open", 101), ("open", 102)])
                group.terminate_and_wait(time.monotonic() + 10)
            self.assertEqual([pid for action, pid in events if action == "terminate"],
                             [100, 101, 102])
            self.assertTrue(all(lease.closed for lease in leases.values()))
            self.assertEqual(opened.call_args_list[0].kwargs,
                             {"essential": True, "allow_absent": False})
            self.assertEqual(opened.call_args_list[2].kwargs,
                             {"essential": False, "allow_absent": True})

    def test_partial_acquisition_failure_closes_earlier_handles_without_mutation (self):
        events = []
        first = FakeLease(100, 10001, events)
        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=records()),
              patch.object(owned, "_open_verified", side_effect=[
                  first, owned.ProcessOwnershipError("Fixture denial")])):
            with self.assertRaises(owned.ProcessOwnershipError):
                with owned.prepare_owned_processes(REPO, {101}, time.monotonic() + 10):
                    self.fail("Preparation yielded after acquisition failed")
        self.assertEqual(events, [("close", 100)])

    def test_partial_termination_failure_closes_all_and_does_not_claim_success (self):
        events = []
        leases = [FakeLease(row.pid, row.created, events)
                  for row in list(records().values())[:3]]
        leases[1].terminate = MagicMock(side_effect=owned.ProcessOwnershipError("Fixture denial"))
        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=records()),
              patch.object(owned, "_open_verified", side_effect=leases)):
            with self.assertRaises(owned.ProcessOwnershipError):
                with owned.prepare_owned_processes(REPO, {101}, time.monotonic() + 10) as group:
                    group.terminate_and_wait(time.monotonic() + 10)
        self.assertEqual([pid for action, pid in events if action == "terminate"], [100])
        self.assertTrue(all(lease.closed for lease in leases))

    def test_same_bucket_native_parent_order_is_still_checked (self):
        fixture = records()
        fixture[101] = replace(fixture[101], created=10000)
        events = []
        leases = [FakeLease(100, 10009, events), FakeLease(101, 10001, events),
                  FakeLease(102, 30000, events)]
        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=fixture),
              patch.object(owned, "_open_verified", side_effect=leases)):
            with self.assertRaises(owned.ProcessOwnershipError):
                with owned.prepare_owned_processes(REPO, {101}, time.monotonic() + 10):
                    self.fail("Reversed native ancestry must not yield")
        self.assertTrue(all(lease.closed for lease in leases))
        self.assertFalse(any(action == "terminate" for action, _ in events))

    def test_absent_leaf_is_omitted_but_missing_intermediate_is_not_allowed (self):
        fixture = records()
        fixture[103] = owned._Process(103, 102, 40000, r"C:\Tools\child.exe", None)
        events = []

        def acquire (row, *, essential, allow_absent):
            if row.pid == 102:
                self.assertFalse(essential)
                self.assertFalse(allow_absent)
                return FakeLease(row.pid, row.created, events, live=False)
            if row.pid == 103:
                self.assertFalse(essential)
                self.assertTrue(allow_absent)
                return None
            return FakeLease(row.pid, row.created, events)

        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=fixture),
              patch.object(owned, "_open_verified", side_effect=acquire)):
            with owned.prepare_owned_processes(REPO, {101}, time.monotonic() + 10) as group:
                group.terminate_and_wait(time.monotonic() + 10)
        self.assertEqual([pid for action, pid in events if action == "terminate"], [100, 101])

    def test_context_failure_or_deadline_closes_all_leases_without_termination (self):
        events = []
        leases = [FakeLease(row.pid, row.created, events)
                  for row in list(records().values())[:3]]
        with (patch.object(owned, "_authority", return_value=AUTHORITY),
              patch.object(owned, "_query_snapshot", return_value=records()),
              patch.object(owned, "_open_verified", side_effect=leases)):
            with self.assertRaisesRegex(RuntimeError, "listener changed"):
                with owned.prepare_owned_processes(REPO, {101}, time.monotonic() + 10):
                    raise RuntimeError("listener changed")
        self.assertTrue(all(lease.closed for lease in leases))
        self.assertFalse(any(action == "terminate" for action, _ in events))
        with patch.object(owned, "_authority") as authority:
            with self.assertRaises(owned.ProcessOwnershipError):
                with owned.prepare_owned_processes(REPO, {101}, time.monotonic() - 1):
                    self.fail("Expired preparation must not yield")
            authority.assert_not_called()

    def test_invalid_listener_inputs_never_query_metadata (self):
        for pids in (set(), {0}, {4}, {True}, {-1}, {2**32}, [101]):
            with self.subTest(pids=pids), patch.object(owned, "_query_snapshot") as query:
                with self.assertRaises(owned.ProcessOwnershipError):
                    with owned.prepare_owned_processes(REPO, pids, time.monotonic() + 10):
                        self.fail("Invalid listeners must not yield")
                query.assert_not_called()

    def test_query_script_limits_rows_and_projects_only_needed_commands (self):
        script = owned._query_script({101})
        self.assertIn("$initial=@(101)", script)
        self.assertIn("$row.ParentProcessId", script)
        self.assertIn("$commands.ContainsKey", script)
        self.assertIn("ToUniversalTime().ToFileTimeUtc()", script)
        self.assertIn(str(owned.MAX_PROCESSES), script)
        self.assertNotIn(str(REPO), script)

    def test_capture_drains_final_write_after_observing_child_exit (self):
        child = MagicMock()
        child.stdout, child.stderr = io.BytesIO(), io.BytesIO()
        child.poll.return_value = 0
        calls = 0

        def drain (pipe, target, limit):
            nonlocal calls
            calls += 1
            if calls == 3:  # child wrote after both initial empty peeks
                self.assertIs(pipe, child.stdout)
                target.extend(b"[{}]")
                return True
            return False

        with (patch.object(owned.subprocess, "Popen", return_value=child) as spawn,
              patch.object(owned, "_drain_pipe", side_effect=drain)):
            self.assertEqual(owned._capture_query(["fixture"], time.monotonic() + 10), b"[{}]")
        self.assertEqual(calls, 6)
        self.assertTrue(child.stdout.closed and child.stderr.closed)
        child.kill.assert_not_called()
        self.assertFalse(spawn.call_args.kwargs["shell"])
        self.assertEqual(spawn.call_args.kwargs["creationflags"], subprocess.CREATE_NO_WINDOW)

    def test_capture_failure_kills_only_its_owned_query_child_and_closes_pipes (self):
        child = MagicMock()
        child.stdout, child.stderr = io.BytesIO(), io.BytesIO()
        child.poll.return_value = None
        with (patch.object(owned.subprocess, "Popen", return_value=child),
              patch.object(owned, "_drain_pipe", side_effect=owned.ProcessOwnershipError("Fixture limit"))):
            with self.assertRaises(owned.ProcessOwnershipError):
                owned._capture_query(["fixture"], time.monotonic() + 10)
        child.kill.assert_called_once_with()
        self.assertTrue(child.stdout.closed and child.stderr.closed)

    def test_capture_deadline_cleans_up_without_starting_another_query (self):
        child = MagicMock()
        child.stdout, child.stderr = io.BytesIO(), io.BytesIO()
        child.poll.return_value = None
        with (patch.object(owned.subprocess, "Popen", return_value=child) as spawn,
              patch.object(owned, "_remaining", side_effect=[
                  1, owned.ProcessOwnershipError("Fixture deadline")])):
            with self.assertRaises(owned.ProcessOwnershipError):
                owned._capture_query(["fixture"], time.monotonic() + 1)
        self.assertEqual(spawn.call_count, 1)
        child.kill.assert_called_once_with()
        self.assertTrue(child.stdout.closed and child.stderr.closed)

    def test_native_pipe_cap_rejects_before_oversized_append (self):
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, b"1234")
            with os.fdopen(read_fd, "rb", buffering=0) as reader:
                read_fd = None
                target = bytearray()
                with self.assertRaises(owned.ProcessOwnershipError):
                    owned._drain_pipe(reader, target, 3)
                self.assertEqual(target, b"")
        finally:
            if read_fd is not None:
                os.close(read_fd)
            os.close(write_fd)

    def test_capture_errors_never_echo_stderr (self):
        child = MagicMock()
        child.stdout, child.stderr = io.BytesIO(), io.BytesIO()
        child.poll.return_value = 1
        emitted = False

        def drain (pipe, target, limit):
            nonlocal emitted
            if pipe is child.stderr and not emitted:
                emitted = True
                target.extend(b"PRIVATE_FIXTURE_COMMAND")
                return True
            return False

        with (patch.object(owned.subprocess, "Popen", return_value=child),
              patch.object(owned, "_drain_pipe", side_effect=drain)):
            with self.assertRaises(owned.ProcessOwnershipError) as error:
                owned._capture_query(["fixture"], time.monotonic() + 10)
        self.assertNotIn("PRIVATE_FIXTURE_COMMAND", str(error.exception))


@unittest.skipUnless(os.name == "nt", "Windows native-handle contract")
class NativeLeaseMockTests(unittest.TestCase):
    def setUp (self):
        self.kernel_patch = patch.object(owned, "_kernel")
        self.kernel = self.kernel_patch.start()
        self.addCleanup(self.kernel_patch.stop)
        self.kernel.OpenProcess.return_value = 12345
        self.kernel.CloseHandle.return_value = True
        self.kernel.WaitForSingleObject.return_value = owned._WAIT_RUNNING
        self.kernel.TerminateProcess.return_value = True
        self.identity_patch = patch.object(owned, "_handle_identity", return_value=(BASE_IMAGE, 20004))
        self.identity = self.identity_patch.start()
        self.addCleanup(self.identity_patch.stop)

    def test_exact_microsecond_bucket_retains_full_native_stamp (self):
        lease = owned._open_verified(records()[101], essential=True)
        self.assertEqual(lease.created, 20004)
        lease.close()
        lease.close()
        self.kernel.CloseHandle.assert_called_once_with(12345)
        self.kernel.TerminateProcess.assert_not_called()

    def test_wrong_image_adjacent_bucket_and_essential_death_close_before_error (self):
        for image, created, state in ((ROOT_IMAGE, 20004, owned._WAIT_RUNNING),
                                      (BASE_IMAGE, 19999, owned._WAIT_RUNNING),
                                      (BASE_IMAGE, 20010, owned._WAIT_RUNNING),
                                      (BASE_IMAGE, 20004, owned._WAIT_SIGNALED)):
            with self.subTest(image=image, created=created, state=state):
                self.kernel.CloseHandle.reset_mock()
                self.identity.return_value = image, created
                self.kernel.WaitForSingleObject.return_value = state
                with self.assertRaises(owned.ProcessOwnershipError):
                    owned._open_verified(records()[101], essential=True)
                self.kernel.CloseHandle.assert_called_once_with(12345)
        self.kernel.TerminateProcess.assert_not_called()

    def test_verified_signaled_descendant_is_kept_without_termination (self):
        self.kernel.WaitForSingleObject.return_value = owned._WAIT_SIGNALED
        lease = owned._open_verified(records()[101], essential=False)
        self.assertIsNotNone(lease)
        lease.terminate()
        lease.close()
        self.kernel.TerminateProcess.assert_not_called()

    def test_only_absent_nonessential_leaf_can_be_omitted (self):
        for essential, allowed, error, succeeds in (
            (False, True, 87, True), (False, False, 87, False),
            (True, True, 87, False), (False, True, 5, False),
            (False, True, 6, False),
        ):
            with self.subTest(essential=essential, allowed=allowed, error=error):
                def absent (*_args):
                    ctypes.set_last_error(error)
                    return None
                self.kernel.OpenProcess.side_effect = absent
                if succeeds:
                    self.assertIsNone(owned._open_verified(
                        records()[101], essential=essential, allow_absent=allowed))
                else:
                    with self.assertRaises(owned.ProcessOwnershipError):
                        owned._open_verified(records()[101], essential=essential,
                                             allow_absent=allowed)
        self.kernel.CloseHandle.assert_not_called()
        self.kernel.TerminateProcess.assert_not_called()

    def test_root_job_cascade_exit_between_check_and_terminate_converges (self):
        lease = owned._ProcessLease(101, 12345, 20004)
        self.kernel.WaitForSingleObject.side_effect = [owned._WAIT_RUNNING, owned._WAIT_SIGNALED]
        self.kernel.TerminateProcess.return_value = False
        lease.terminate()
        self.kernel.TerminateProcess.assert_called_once_with(12345, 1)
        self.kernel.OpenProcess.assert_not_called()

    def test_failed_termination_of_still_live_or_unknown_handle_is_failure (self):
        for state in (owned._WAIT_RUNNING, 0xFFFFFFFF):
            with self.subTest(state=state):
                lease = owned._ProcessLease(101, 12345, 20004)
                self.kernel.WaitForSingleObject.side_effect = [owned._WAIT_RUNNING, state]
                self.kernel.TerminateProcess.return_value = False
                with self.assertRaises(owned.ProcessOwnershipError):
                    lease.terminate()
        self.kernel.OpenProcess.assert_not_called()

    def test_native_wait_uses_remaining_budget_not_new_per_process_timeout (self):
        self.kernel.WaitForSingleObject.return_value = owned._WAIT_SIGNALED
        lease = owned._ProcessLease(101, 12345, 20004)
        with patch.object(owned, "_monotonic", return_value=9.75):
            lease.wait_exit(10)
        self.kernel.WaitForSingleObject.assert_called_once_with(12345, 250)
        self.kernel.WaitForSingleObject.reset_mock()
        with patch.object(owned, "_monotonic", return_value=10):
            with self.assertRaises(owned.ProcessOwnershipError):
                lease.wait_exit(10)
        self.kernel.WaitForSingleObject.assert_not_called()

    def test_group_cannot_extend_deadline_or_mutate_after_context_closed (self):
        events = []
        lease = FakeLease(101, 20004, events)
        group = owned._OwnedProcesses((lease,), (101,), 10)
        with patch.object(owned, "_monotonic", return_value=11):
            with self.assertRaises(owned.ProcessOwnershipError):
                group.terminate_and_wait(100)
        self.assertEqual(events, [])
        lease.close()
        with patch.object(owned, "_monotonic", return_value=1):
            with self.assertRaises(owned.ProcessOwnershipError):
                group.terminate_and_wait(10)
        self.assertEqual(events, [("close", 101)])

    def test_unknown_handle_before_first_mutation_prevents_all_termination (self):
        events = []
        first = FakeLease(100, 10000, events)
        second = FakeLease(101, 20000, events)
        second.alive = MagicMock(side_effect=owned.ProcessOwnershipError("Fixture unknown"))
        group = owned._OwnedProcesses((first, second), (100,), time.monotonic() + 10)
        with self.assertRaises(owned.ProcessOwnershipError):
            group.terminate_and_wait(time.monotonic() + 10)
        self.assertEqual(events, [])

    def test_async_wait_timeout_is_not_success (self):
        lease = owned._ProcessLease(101, 12345, 20004)
        with self.assertRaises(owned.ProcessOwnershipError):
            lease.wait_exit(time.monotonic() + 0.01)

    def test_essential_exit_after_preparation_is_same_handle_convergence (self):
        self.kernel.WaitForSingleObject.return_value = owned._WAIT_SIGNALED
        lease = owned._ProcessLease(101, 12345, 20004)
        group = owned._OwnedProcesses((lease,), (101,), time.monotonic() + 10)
        group.terminate_and_wait(time.monotonic() + 10)
        self.kernel.TerminateProcess.assert_not_called()
        self.kernel.OpenProcess.assert_not_called()


@unittest.skipUnless(os.name == "nt", "Windows isolated native checks")
class OwnedNativeFixtureTests(unittest.TestCase):
    def test_current_identity_query_and_repository_authority (self):
        rows = owned._query_snapshot({os.getpid()}, time.monotonic() + 15)
        lease = owned._open_verified(rows[os.getpid()], essential=True)
        try:
            self.assertEqual(lease.created // 10, rows[os.getpid()].created // 10)
            self.assertTrue(lease.alive())
            self.assertTrue(owned._authority(REPO).root_image.endswith("pythonw.exe"))
        finally:
            lease.close()  # never terminate the test runner

    def test_foreign_http_listener_survives_rejection_then_owned_fixture_is_stopped (self):
        # Use the base interpreter directly so this finite scratch child has no
        # venv redirector or product entrypoint. Popen keeps its original handle.
        fixture = (
            "from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler\n"
            "import json, time\n"
            "class Handler(BaseHTTPRequestHandler):\n"
            " def do_GET(self):\n"
            "  body=b'fixture-alive'\n"
            "  self.send_response(200)\n"
            "  self.send_header('Content-Length',str(len(body)))\n"
            "  self.end_headers()\n"
            "  self.wfile.write(body)\n"
            " def log_message(self,*args): pass\n"
            "server=ThreadingHTTPServer(('127.0.0.1',0),Handler)\n"
            "server.daemon_threads=True\n"
            "server.timeout=.1\n"
            "print(json.dumps({'port':server.server_address[1]}),flush=True)\n"
            "deadline=time.monotonic()+20\n"
            "while time.monotonic()<deadline: server.handle_request()\n"
            "server.server_close()\n"
        )
        deadline = time.monotonic() + 15
        child = subprocess.Popen(
            [sys._base_executable, "-u", "-c", fixture],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, bufsize=0,
            stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        lease = None
        try:
            original_image, original_created = owned._handle_identity(int(child._handle))
            announcement = bytearray()
            ready_deadline = min(deadline, time.monotonic() + 5)
            while b"\n" not in announcement:
                self.assertLess(time.monotonic(), ready_deadline, "fixture HTTP startup timed out")
                self.assertIsNone(child.poll(), "fixture exited before HTTP startup")
                if not owned._drain_pipe(child.stdout, announcement, 1024):
                    time.sleep(0.01)
            port = json.loads(announcement)["port"]
            self.assertIs(type(port), int)
            self.assertTrue(1 <= port <= 65535)

            def assert_http_alive ():
                connection = http.client.HTTPConnection(
                    "127.0.0.1", port, timeout=min(2, owned._remaining(deadline)))
                try:
                    connection.request("GET", "/fixture")
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.read(32), b"fixture-alive")
                finally:
                    connection.close()

            assert_http_alive()
            rows = owned._query_snapshot({child.pid}, deadline)
            row = rows[child.pid]
            self.assertEqual(owned._path_key(row.image), original_image)
            self.assertEqual(row.created // 10, original_created // 10)
            # Public ownership preparation must refuse this foreign command.
            with self.assertRaises(owned.ProcessOwnershipError):
                with owned.prepare_owned_processes(REPO, {child.pid}, deadline):
                    self.fail("Foreign fixture must never become an owned target")
            self.assertIsNone(child.poll(), "rejected foreign fixture must remain alive")
            assert_http_alive()
            lease = owned._open_verified(row, essential=True)
            self.assertEqual(lease.created, original_created)
            group = owned._OwnedProcesses((lease,), (child.pid,), deadline)
            group.terminate_and_wait(deadline)
            self.assertIsNotNone(child.poll())
        finally:
            if lease is not None:
                lease.close()
            if child.poll() is None:
                child.kill()  # exact Popen-owned fixture handle, never a discovered PID
            child.wait(timeout=5)
            child.stdout.close()


if __name__ == "__main__":
    unittest.main()
