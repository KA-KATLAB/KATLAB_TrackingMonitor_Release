"""Isolated retained-handle Chronicle runtime inventory and sweep tests."""

import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from Scripts.Chronicle import safe_io
from Scripts.Chronicle.safe_io import (
    RuntimeInventory,
    SafeIOError,
    bind_root,
    inventory_runtime_tree,
    read_existing_file,
    remove_existing_file,
    sweep_runtime_tree,
)


class ChronicleRuntimeIOTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runtime = self.root / "runtime"
        self.runtime.mkdir()
        self.bound = bind_root(self.root)

    def tearDown (self) -> None:
        self.bound.close()
        self.temp.cleanup()

    def write (self, relative: str, data: bytes) -> Path:
        path = self.runtime.joinpath(*relative.split("/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_recursive_inventory_is_stable_sorted_and_closed (self) -> None:
        self.write("nested/page.md", b"page\n")
        self.write("index.md", b"index\n")
        (self.runtime / "empty").mkdir()

        inventory = inventory_runtime_tree(self.bound, "runtime")

        self.assertIsInstance(inventory, RuntimeInventory)
        assert inventory is not None
        self.assertEqual(
            [entry.relative_path for entry in inventory.entries],
            ["empty", "index.md", "nested", "nested/page.md"],
        )
        by_path = {entry.relative_path: entry for entry in inventory.entries}
        self.assertEqual(by_path["empty"].kind, "directory")
        self.assertIsNone(by_path["empty"].length)
        self.assertIsNone(by_path["empty"].sha256)
        self.assertEqual(by_path["index.md"].kind, "file")
        self.assertEqual(by_path["index.md"].length, 6)
        self.assertEqual(
            by_path["index.md"].sha256, hashlib.sha256(b"index\n").hexdigest(),
        )
        self.assertRegex(inventory.root_identity.file_id, r"^[0-9a-f]{32}$")

    def test_safe_existing_file_distinguishes_absence_from_unsafe_state (self) -> None:
        leaf = self.write("state.json", b"{}\n")
        bound = read_existing_file(
            self.bound, "runtime/state.json", max_bytes=32,
        )
        assert bound is not None
        self.assertEqual(bound.data, b"{}\n")
        self.assertEqual(bound.sha256, hashlib.sha256(b"{}\n").hexdigest())
        self.assertIsNone(read_existing_file(
            self.bound, "runtime/missing.json", max_bytes=32,
        ))
        with self.assertRaises(SafeIOError):
            read_existing_file(self.bound, "runtime", max_bytes=32)
        with self.assertRaises(SafeIOError):
            read_existing_file(self.bound, "runtime/../state.json", max_bytes=32)
        self.assertTrue(leaf.exists())

    def test_optional_missing_inventory_is_none_but_required_missing_fails (self) -> None:
        self.assertIsNone(inventory_runtime_tree(
            self.bound, "missing", allow_missing=True,
        ))
        with self.assertRaises(SafeIOError):
            inventory_runtime_tree(self.bound, "missing")

    def test_inventory_rejects_drift_between_complete_passes (self) -> None:
        self.write("index.md", b"index")
        original = safe_io._inventory_runtime_tree_once
        calls = 0

        def observe (*args, **kwargs):
            nonlocal calls
            result = original(*args, **kwargs)
            calls += 1
            if calls == 1:
                self.write("inserted.md", b"inserted")
            return result

        with patch.object(
                safe_io, "_inventory_runtime_tree_once", side_effect=observe):
            with self.assertRaisesRegex(SafeIOError, "between observations"):
                inventory_runtime_tree(self.bound, "runtime")
        self.assertTrue((self.runtime / "inserted.md").exists())

    def test_native_inventory_continues_across_multiple_query_buffers (self) -> None:
        many = self.runtime / "many"
        many.mkdir()
        for index in range(600):
            (many / f"entry-{index:04d}-long-name.md").write_bytes(b"")

        inventory = inventory_runtime_tree(
            self.bound, "runtime/many", max_entries=700,
        )

        assert inventory is not None
        self.assertEqual(len(inventory.entries), 600)
        self.assertEqual(inventory.entries[0].relative_path,
                         "entry-0000-long-name.md")
        self.assertEqual(inventory.entries[-1].relative_path,
                         "entry-0599-long-name.md")

    def test_native_directory_enumeration_has_its_own_hard_bound (self) -> None:
        for name in ("one.md", "two.md", "three.md"):
            self.write(name, b"")
        handle = safe_io._open_native(str(self.runtime), directory=True)
        try:
            with patch.object(safe_io, "_RUNTIME_ENTRY_LIMIT", 2):
                with self.assertRaisesRegex(
                        SafeIOError, "native directory inventory"):
                    safe_io._directory_items_from_handle(handle)
        finally:
            safe_io._close_handle(handle)

    def test_recursive_expected_sweep_removes_only_exact_stale_tree (self) -> None:
        keep = self.write("owned/keep.md", b"keep")
        stale = self.write("owned/stale.md", b"stale")
        nested = self.write("owned/obsolete/nested/stale.md", b"nested")

        removed = sweep_runtime_tree(
            self.bound, "runtime/owned", {"keep.md"},
        )

        self.assertEqual(removed, ("obsolete/nested/stale.md", "stale.md"))
        self.assertTrue(keep.is_file())
        self.assertFalse(stale.exists())
        self.assertFalse(nested.exists())
        self.assertFalse((self.runtime / "owned" / "obsolete").exists())
        inventory = inventory_runtime_tree(self.bound, "runtime/owned")
        assert inventory is not None
        self.assertEqual(
            [(entry.relative_path, entry.kind) for entry in inventory.entries],
            [("keep.md", "file")],
        )

    def test_sweep_preserves_same_identity_file_rewritten_after_inventory (self) -> None:
        stale = self.write("owned/stale.md", b"first")
        before = self.bound.read("runtime/owned/stale.md", max_bytes=16)
        original = safe_io._remove_exact_runtime_file

        def rewrite_then_remove (*args, **kwargs):
            stale.write_bytes(b"other")
            return original(*args, **kwargs)

        with patch.object(
                safe_io, "_remove_exact_runtime_file",
                side_effect=rewrite_then_remove):
            with self.assertRaisesRegex(SafeIOError, "content changed"):
                sweep_runtime_tree(self.bound, "runtime/owned", set())

        after = self.bound.read("runtime/owned/stale.md", max_bytes=16)
        self.assertEqual(after.identity, before.identity)
        self.assertEqual(after.data, b"other")

    def test_single_remove_preserves_same_identity_file_rewritten_after_read (self) -> None:
        stale = self.write("stale.md", b"first")
        before = self.bound.read("runtime/stale.md", max_bytes=16)
        original = safe_io._remove_exact_runtime_file

        def rewrite_then_remove (*args, **kwargs):
            stale.write_bytes(b"other")
            return original(*args, **kwargs)

        with patch.object(
                safe_io, "_remove_exact_runtime_file",
                side_effect=rewrite_then_remove):
            with self.assertRaisesRegex(SafeIOError, "content changed"):
                remove_existing_file(
                    self.bound, "runtime/stale.md", max_bytes=16,
                )

        after = self.bound.read("runtime/stale.md", max_bytes=16)
        self.assertEqual(after.identity, before.identity)
        self.assertEqual(after.data, b"other")

    def test_unsafe_hard_link_aborts_before_any_sweep_and_is_preserved (self) -> None:
        external = (self.root / "external.txt")
        external.write_bytes(b"linked")
        owned = self.runtime / "owned"
        owned.mkdir()
        alien = owned / "alien.md"
        os.link(external, alien)
        stale = self.write("owned/stale.md", b"stale")

        with self.assertRaises(SafeIOError):
            sweep_runtime_tree(self.bound, "runtime/owned", set())

        self.assertTrue(alien.exists())
        self.assertTrue(external.exists())
        self.assertTrue(stale.exists())

    def test_named_stream_aborts_before_sweep_and_is_preserved (self) -> None:
        alien = self.write("owned/alien.md", b"alien")
        stale = self.write("owned/stale.md", b"stale")
        try:
            with open(str(alien) + ":unexpected", "wb") as stream:
                stream.write(b"stream")
        except OSError as exc:
            self.skipTest(f"named streams unavailable on test volume: {exc}")

        with self.assertRaises(SafeIOError):
            sweep_runtime_tree(self.bound, "runtime/owned", set())

        self.assertTrue(alien.exists())
        self.assertTrue(stale.exists())

    def test_reparse_directory_aborts_before_sweep_and_is_preserved (self) -> None:
        target = self.root / "external-directory"
        target.mkdir()
        owned = self.runtime / "owned"
        owned.mkdir()
        junction = owned / "junction"
        try:
            os.symlink(target, junction, target_is_directory=True)
        except OSError:
            created = subprocess.run(
                ["cmd.exe", "/d", "/c", "mklink", "/J", str(junction), str(target)],
                capture_output=True, check=False,
            )
            if created.returncode != 0:
                self.skipTest("directory reparse points unavailable on test volume")
        stale = self.write("owned/stale.md", b"stale")

        with self.assertRaises(SafeIOError):
            sweep_runtime_tree(self.bound, "runtime/owned", set())

        self.assertTrue(junction.is_symlink() or junction.is_junction())
        self.assertTrue(target.is_dir())
        self.assertTrue(stale.exists())

    def test_expected_path_ambiguity_fails_before_deletion (self) -> None:
        stale = self.write("owned/stale.md", b"stale")
        invalid_sets = (
            {"Page.md", "page.md"},
            {"file.md", "file.md/child.md"},
            {"../escape.md"},
            {"CON.txt"},
        )
        for expected in invalid_sets:
            with self.subTest(expected=expected):
                with self.assertRaises(SafeIOError):
                    sweep_runtime_tree(self.bound, "runtime/owned", expected)
                self.assertTrue(stale.exists())

        with self.assertRaisesRegex(SafeIOError, "expected runtime file"):
            sweep_runtime_tree(
                self.bound, "runtime/owned", {"missing.md"},
            )
        self.assertTrue(stale.exists())

    def test_inventory_bounds_fail_without_mutation (self) -> None:
        leaf = self.write("large.bin", b"12345")
        with self.assertRaises(SafeIOError):
            inventory_runtime_tree(
                self.bound, "runtime", max_file_bytes=4,
            )
        self.assertEqual(leaf.read_bytes(), b"12345")


if __name__ == "__main__":
    unittest.main()
