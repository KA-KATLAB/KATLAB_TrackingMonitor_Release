"""Native focused tests for the independent Chronicle lease authorities."""

import os
import tempfile
import unittest
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

from Scripts.Chronicle import generate, safe_io


@unittest.skipUnless(os.name == "nt", "Chronicle leases require Windows native I/O")
class ChronicleLeaseTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.root = safe_io.bind_root(self.path)

    def tearDown (self) -> None:
        self.root.close()
        self.temp.cleanup()

    def test_writer_lease_is_exclusive_heartbeat_bound_and_reacquirable (self) -> None:
        lease = safe_io.acquire_chronicle_lease(self.root, "writer")
        self.assertEqual(lease.relative, safe_io.WRITER_LOCK_NAME)
        self.assertEqual(lease.owner.kind, "writer")
        self.assertEqual(lease.owner.name, safe_io.WRITER_LOCK_NAME)
        self.assertEqual(lease.owner.pid, os.getpid())
        self.assertRegex(lease.owner.nonce, r"^[0-9a-f]{32}$")
        self.assertGreater(lease.owner.process_creation_filetime, 0)
        self.assertEqual(lease.owner.canonical_bytes().count(b"\n"), 1)
        self.assertLessEqual(
            len(lease.owner.canonical_bytes()), safe_io.LEASE_RECORD_LIMIT,
        )
        lease.heartbeat()
        with self.assertRaises(safe_io.LeaseBusy):
            safe_io.acquire_chronicle_lease(self.root, "writer")
        lease.release()
        lease.release()
        with safe_io.acquire_chronicle_lease(self.root, "writer") as again:
            self.assertNotEqual(again.owner.nonce, lease.owner.nonce)

    def test_release_failure_remains_exactly_retryable (self) -> None:
        lease = safe_io.acquire_chronicle_lease(self.root, "writer")
        native_delete = safe_io._delete_handle
        calls = 0

        def fail_first_delete (handle):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise safe_io.SafeIOError("injected lease delete failure")
            return native_delete(handle)

        with patch.object(safe_io, "_delete_handle", side_effect=fail_first_delete):
            with self.assertRaises(safe_io.LeaseResidue):
                lease.release()
            self.assertTrue((self.path / safe_io.WRITER_LOCK_NAME).is_file())
            lease.release()
        self.assertFalse((self.path / safe_io.WRITER_LOCK_NAME).exists())
        with safe_io.acquire_chronicle_lease(self.root, "writer"):
            pass

    def test_acquisition_failure_retries_same_handle_rollback (self) -> None:
        native_delete = safe_io._delete_handle
        delete_calls = 0

        def fail_first_delete (handle):
            nonlocal delete_calls
            delete_calls += 1
            if delete_calls == 1:
                raise safe_io.SafeIOError("transient rollback delete")
            return native_delete(handle)

        with patch.object(
                safe_io, "_write_all",
                side_effect=safe_io.SafeIOError("partial lease record")), \
             patch.object(safe_io, "_delete_handle",
                          side_effect=fail_first_delete), \
             self.assertRaisesRegex(safe_io.SafeIOError,
                                    "partial lease record"):
            safe_io.acquire_chronicle_lease(self.root, "writer")
        self.assertEqual(delete_calls, 2)
        self.assertFalse((self.path / safe_io.WRITER_LOCK_NAME).exists())

    def test_persistent_acquisition_rollback_preserves_fatal_partial_residue (self) -> None:
        with patch.object(
                safe_io, "_write_all",
                side_effect=safe_io.SafeIOError("partial lease record")), \
             patch.object(
                 safe_io, "_delete_handle",
                 side_effect=safe_io.SafeIOError("persistent rollback delete")), \
             self.assertRaises(safe_io.LeaseResidue):
            safe_io.acquire_chronicle_lease(self.root, "writer")
        residue = self.root.read(
            safe_io.WRITER_LOCK_NAME, max_bytes=safe_io.LEASE_RECORD_LIMIT)
        self.assertEqual(residue.data, b"")
        self.assertTrue(safe_io.remove_existing_file(
            self.root, safe_io.WRITER_LOCK_NAME))

    def test_persistent_release_failure_is_preserved_for_later_retry (self) -> None:
        lease = safe_io.acquire_chronicle_lease(self.root, "writer")
        with patch.object(
                safe_io, "_delete_handle",
                side_effect=safe_io.SafeIOError("persistent delete failure")):
            with self.assertRaises(safe_io.LeaseResidue):
                lease.release()
            with self.assertRaises(safe_io.LeaseResidue):
                lease.release()
            residue = self.root.read(
                safe_io.WRITER_LOCK_NAME,
                max_bytes=safe_io.LEASE_RECORD_LIMIT)
            self.assertEqual(residue.identity, lease.identity)
            self.assertEqual(residue.data, lease.owner.canonical_bytes())
        lease.release()
        self.assertFalse((self.path / safe_io.WRITER_LOCK_NAME).exists())

    def test_loop_exits_fatally_when_writer_release_is_unresolved (self) -> None:
        native_delete = safe_io._delete_handle
        calls = 0

        def fail_first_delete (handle):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise safe_io.SafeIOError("injected writer release failure")
            return native_delete(handle)

        with patch.object(generate, "RUNTIME", self.path), \
             patch.object(generate, "_require_mutating_runtime"), \
             patch.object(generate, "run_once", return_value={"_changed": 0}), \
             patch.object(safe_io, "_delete_handle", side_effect=fail_first_delete):
            self.assertEqual(generate.loop(10, do_build=False), 1)
        self.assertEqual(calls, 2)  # failed writer release, successful loop release
        residue = self.root.read(
            safe_io.WRITER_LOCK_NAME, max_bytes=safe_io.LEASE_RECORD_LIMIT)
        self.assertEqual(
            safe_io.LeaseOwner.from_bytes(
                residue.data, kind="writer", name=safe_io.WRITER_LOCK_NAME,
            ).pid,
            os.getpid(),
        )
        self.assertTrue(safe_io.remove_existing_file(
            self.root, safe_io.WRITER_LOCK_NAME))

    def test_loop_and_writer_use_distinct_concurrent_names (self) -> None:
        with safe_io.acquire_chronicle_lease(self.root, "loop") as loop_lease:
            with safe_io.acquire_chronicle_lease(self.root, "writer") as writer_lease:
                self.assertNotEqual(loop_lease.relative, writer_lease.relative)
                self.assertNotEqual(loop_lease.identity, writer_lease.identity)
                loop_lease.heartbeat()
                writer_lease.heartbeat()

    def test_existing_residue_is_never_reclaimed_from_age_alone (self) -> None:
        self.root.close()
        (self.path / safe_io.LOOP_LOCK_NAME).write_bytes(
            b'{"v":1,"pid":999999,"stale":true}\n',
        )
        old = 946684800
        os.utime(self.path / safe_io.LOOP_LOCK_NAME, (old, old))
        self.root = safe_io.bind_root(self.path)
        with self.assertRaises(safe_io.LeaseResidue):
            safe_io.acquire_chronicle_lease(self.root, "loop")
        residue = self.root.read(
            safe_io.LOOP_LOCK_NAME, max_bytes=safe_io.LEASE_RECORD_LIMIT,
        )
        self.assertEqual(residue.data, b'{"v":1,"pid":999999,"stale":true}\n')

    def _leave_valid_dead_residue (self, kind: str) -> str:
        code = (
            "import os,sys;from Scripts.Chronicle import safe_io;"
            "r=safe_io.bind_root(sys.argv[2]);"
            "lease=safe_io.acquire_chronicle_lease(r,sys.argv[3]);"
            "print(lease.owner.nonce,flush=True);os._exit(0)"
        )
        child = subprocess.run(
            [sys.executable, "-I", "-S", "-B", "-c",
             "import sys;sys.path.insert(0,sys.argv[1]);exec(sys.argv[4])",
             str(Path(__file__).resolve().parents[1]), str(self.path), kind, code],
            check=True, capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return child.stdout.strip()

    def test_exact_dead_owner_record_is_reclaimed_automatically (self) -> None:
        prior_nonce = self._leave_valid_dead_residue("loop")
        self.assertTrue((self.path / safe_io.LOOP_LOCK_NAME).exists())
        with safe_io.acquire_chronicle_lease(self.root, "loop") as lease:
            self.assertNotEqual(lease.owner.nonce, prior_nonce)

    def test_ambiguous_owner_record_is_preserved (self) -> None:
        self._leave_valid_dead_residue("writer")
        before = (self.path / safe_io.WRITER_LOCK_NAME).read_bytes()
        with patch.object(
                safe_io, "observe_process",
                return_value=safe_io.ProcessState.AMBIGUOUS):
            with self.assertRaises(safe_io.LeaseResidue):
                safe_io.acquire_chronicle_lease(self.root, "writer")
        self.assertEqual(
            (self.path / safe_io.WRITER_LOCK_NAME).read_bytes(), before)

    def test_unknown_lease_kind_fails_before_creating_a_leaf (self) -> None:
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.acquire_chronicle_lease(self.root, "third")
        inventory = list(self.path.iterdir())
        self.assertEqual(inventory, [])

    def test_single_file_removal_is_identity_bound_and_absence_proved (self) -> None:
        self.root.write_if_changed("docs/architecture.md", b"diagram\n")
        self.assertTrue(safe_io.remove_existing_file(
            self.root, "docs/architecture.md",
        ))
        self.assertFalse(safe_io.remove_existing_file(
            self.root, "docs/architecture.md",
        ))


if __name__ == "__main__":
    unittest.main()
