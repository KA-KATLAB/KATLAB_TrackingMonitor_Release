"""Focused native and pure-contract tests for Chronicle safe I/O."""

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from Backend.app.chronicle_auth import response_mac
from Scripts.Chronicle import safe_io


KEY = bytes(range(32))
NONCE = base64.urlsafe_b64encode(bytes(range(32, 64))).rstrip(b"=")


class IdentityAndNativeIOTests(unittest.TestCase):
    def test_file_identity_shape_and_bound_same_handle_read (self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, "value.txt")
            path.write_bytes(b"bound bytes")
            bound = safe_io.read_bound_file(path, max_bytes=32)
            self.assertEqual(bound.data, b"bound bytes")
            self.assertEqual(
                bound.sha256,
                "dac4821fc2be9d6737a911d0fc194389d3da1271fdd4a598f6f080759cac6755",
            )
            self.assertRegex(bound.identity.volume_serial, r"^[0-9a-f]{16}$")
            self.assertRegex(bound.identity.file_id, r"^[0-9a-f]{32}$")
            self.assertRegex(bound.identity.canonical_path_digest, r"^[0-9a-f]{64}$")
            self.assertRegex(
                bound.canonical_path,
                r"^\\\\\?\\Volume\{[0-9a-fA-F-]{36}\}\\",
            )
            self.assertEqual(bound.identity.as_dict(), {
                "volume_serial": bound.identity.volume_serial,
                "file_id": bound.identity.file_id,
                "canonical_path_digest": bound.identity.canonical_path_digest,
            })

    def test_read_rejects_bounds_hardlinks_and_alternate_streams (self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, "value.txt")
            path.write_bytes(b"1234")
            with self.assertRaises(safe_io.SafeIOError):
                safe_io.read_bound_file(path, max_bytes=3)

            link = Path(folder, "linked.txt")
            os.link(path, link)
            with self.assertRaises(safe_io.SafeIOError):
                safe_io.read_bound_file(path, max_bytes=4)
            link.unlink()

            with open(str(path) + ":named", "wb") as stream:
                stream.write(b"hidden")
            with self.assertRaises(safe_io.SafeIOError):
                safe_io.read_bound_file(path, max_bytes=4)

    def test_atomic_nested_write_update_and_no_replace_rename (self):
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                self.assertTrue(root.write_if_changed("nested/value.txt", b"one"))
                self.assertFalse(root.write_if_changed("nested/value.txt", b"one"))
                self.assertTrue(root.write_if_changed("nested/value.txt", b"two"))
                self.assertEqual(root.read("nested/value.txt", max_bytes=3).data, b"two")
                self.assertEqual(
                    sorted(item.name for item in Path(folder, "nested").iterdir()),
                    ["value.txt"],
                )
                root.write_if_changed("nested/source.txt", b"source")
                root.rename_no_replace("nested/source.txt", "nested/moved.txt")
                self.assertEqual(root.read("nested/moved.txt", max_bytes=6).data, b"source")
                root.write_if_changed("nested/occupied.txt", b"occupied")
                with self.assertRaises(safe_io.SafeIOError):
                    root.rename_no_replace("nested/moved.txt", "nested/occupied.txt")
                self.assertEqual(root.read("nested/moved.txt", max_bytes=6).data, b"source")

    def test_atomic_write_sibling_names_do_not_exceed_full_target_limit (self):
        names = (
            "a" * 252 + ".md",
            "\U0001f600" * 126 + ".md",
        )
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                for name in names:
                    with self.subTest(name_kind="unicode" if name[0] == "\U0001f600" else "ascii"):
                        self.assertEqual(len(name.encode("utf-16le")) // 2, 255)
                        self.assertTrue(root.write_if_changed(name, b"prior"))
                        self.assertTrue(root.write_if_changed(name, b"updated"))

                        native_delete = safe_io._delete_handle
                        calls = 0

                        def fail_first_delete (handle):
                            nonlocal calls
                            calls += 1
                            if calls == 1:
                                raise safe_io.SafeIOError(
                                    "injected post-promotion failure")
                            return native_delete(handle)

                        with patch.object(
                                safe_io, "_delete_handle",
                                side_effect=fail_first_delete):
                            with self.assertRaises(safe_io.SafeIOError):
                                root.write_if_changed(name, b"candidate")
                        self.assertEqual(
                            root.read(name, max_bytes=16).data, b"updated")

                self.assertEqual(
                    {item.name for item in Path(folder).iterdir()}, set(names))

    def test_hostile_paths_fail_before_mutation (self):
        hostile = (
            "sub/file:stream", "sub/./file", "sub/../file", "sub//file",
            "sub\\\\file", "NUL.txt", "sub/COM1.log", "sub/trailing.",
            "sub/trailing ", "/absolute.txt", "C:\\absolute.txt",
        )
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                for relative in hostile:
                    with self.subTest(relative=relative):
                        with self.assertRaises(safe_io.SafeIOError):
                            root.write_if_changed(relative, b"must not exist")
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_post_promotion_failure_restores_prior_file (self):
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                root.write_if_changed("nested/value.txt", b"prior")
                native_delete = safe_io._delete_handle
                calls = 0

                def fail_first_delete (handle):
                    nonlocal calls
                    calls += 1
                    if calls == 1:
                        raise safe_io.SafeIOError("injected post-promotion failure")
                    return native_delete(handle)

                with patch.object(safe_io, "_delete_handle", side_effect=fail_first_delete):
                    with self.assertRaises(safe_io.SafeIOError):
                        root.write_if_changed("nested/value.txt", b"candidate")
                self.assertEqual(
                    root.read("nested/value.txt", max_bytes=16).data, b"prior")
                self.assertEqual(
                    sorted(item.name for item in Path(folder, "nested").iterdir()),
                    ["value.txt"],
                )

    def test_same_identity_in_place_race_is_preserved_and_rejected (self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder, "nested", "value.txt")
            with safe_io.bind_root(folder) as root:
                root.write_if_changed("nested/value.txt", b"prior")
                native_open = safe_io._open_native
                injected = False

                def race_before_backup_open (path, **kwargs):
                    nonlocal injected
                    if (not injected and kwargs.get("delete")
                            and Path(path) == target):
                        injected = True
                        target.write_bytes(b"rival")
                    return native_open(path, **kwargs)

                with patch.object(
                        safe_io, "_open_native", side_effect=race_before_backup_open):
                    with self.assertRaises(safe_io.SafeIOError):
                        root.write_if_changed("nested/value.txt", b"newer")
                self.assertTrue(injected)
                self.assertEqual(root.read("nested/value.txt", max_bytes=8).data, b"rival")
                self.assertEqual(
                    sorted(item.name for item in target.parent.iterdir()),
                    ["value.txt"],
                )

    def test_first_post_promotion_query_failure_restores_without_unbound_state (self):
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                root.write_if_changed("value.txt", b"prior")
                native_rename = safe_io._rename_handle
                native_facts = safe_io._handle_facts
                promoted_handle = None
                injected = False

                def observe_promotion (handle, directory, destination):
                    nonlocal promoted_handle
                    result = native_rename(handle, directory, destination)
                    if destination == "value.txt":
                        promoted_handle = handle
                    return result

                def fail_first_promoted_query (handle, **kwargs):
                    nonlocal injected
                    if handle == promoted_handle and not injected:
                        injected = True
                        raise safe_io.SafeIOError("injected promoted metadata failure")
                    return native_facts(handle, **kwargs)

                with patch.object(safe_io, "_rename_handle", side_effect=observe_promotion), \
                     patch.object(safe_io, "_handle_facts", side_effect=fail_first_promoted_query):
                    with self.assertRaisesRegex(safe_io.SafeIOError, "injected promoted metadata failure"):
                        root.write_if_changed("value.txt", b"candidate")
                self.assertTrue(injected)
                self.assertEqual(root.read("value.txt", max_bytes=16).data, b"prior")
                self.assertEqual([item.name for item in Path(folder).iterdir()], ["value.txt"])

    def test_directory_swap_promotion_failure_restores_prior_target (self):
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                root.write_if_changed("site/index.html", b"prior")
                root.write_if_changed("site.new/index.html", b"candidate")
                native_rename = safe_io._rename_handle
                calls = 0

                def fail_promotion (handle, directory, destination):
                    nonlocal calls
                    calls += 1
                    if calls == 2:
                        raise safe_io.SafeIOError("injected directory promotion failure")
                    return native_rename(handle, directory, destination)

                with patch.object(safe_io, "_rename_handle", side_effect=fail_promotion):
                    with self.assertRaises(safe_io.SafeIOError):
                        root.swap_directories("site.new", "site", "site.old")
                self.assertEqual(root.read("site/index.html", max_bytes=16).data, b"prior")
                self.assertEqual(
                    root.read("site.new/index.html", max_bytes=16).data, b"candidate")
                self.assertFalse(Path(folder, "site.old").exists())

    def test_nested_junction_is_never_followed (self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as outside:
            link = Path(folder, "linked")
            created = subprocess.run(
                ["cmd", "/d", "/c", "mklink", "/J", str(link), str(outside)],
                check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True,
            )
            if created.returncode != 0:
                self.skipTest(f"junction creation unavailable: {created.stderr.strip()}")
            try:
                with safe_io.bind_root(folder) as root:
                    with self.assertRaises(safe_io.SafeIOError):
                        root.write_if_changed("linked/escape.txt", b"no")
                self.assertFalse(Path(outside, "escape.txt").exists())
            finally:
                os.rmdir(link)

    def test_source_capture_never_opens_excluded_or_nonmatching_files (self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ("README.md", "LICENSE", "AGENTS.md", "CLAUDE.md"):
                (root / name).write_text(name, encoding="utf-8")
            for name in ("Claude_Info", "Codex_Info", "Docs"):
                (root / name).mkdir()
            (root / "Claude_Info" / "a.md").write_text("a", encoding="utf-8")
            (root / "Codex_Info" / "b.md").write_text("b", encoding="utf-8")
            (root / "Docs" / "nested").mkdir()
            (root / "Docs" / "nested" / "c.md").write_text("c", encoding="utf-8")
            (root / "Docs" / "do-not-open.bin").write_bytes(b"trap")
            original = safe_io._open_native

            def guarded (path, **kwargs):
                if Path(path).name in ("CLAUDE.md", "do-not-open.bin"):
                    raise AssertionError("excluded or nonmatching source was opened")
                return original(path, **kwargs)

            with patch.object(safe_io, "_open_native", side_effect=guarded):
                snapshot = safe_io.capture_chronicle_sources(root)
            self.assertEqual(
                {entry.relative_path for entry in snapshot.entries},
                {"README.md", "LICENSE", "AGENTS.md", "Claude_Info/a.md",
                 "Codex_Info/b.md", "Docs/nested/c.md"},
            )

    def test_private_file_has_read_compatible_owner_lifecycle (self):
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                owned = safe_io.create_private_owned_file(
                    root, ".chronicle_capability.json", b"secret\n", max_bytes=32)
                observed = safe_io.read_private_owned_file(
                    root, ".chronicle_capability.json", max_bytes=32)
                self.assertIsNotNone(observed)
                self.assertEqual(observed.data, b"secret\n")
                self.assertEqual(observed.identity, owned.identity)
                with self.assertRaises(safe_io.SafeIOError):
                    safe_io.create_private_owned_file(
                        root, ".chronicle_capability.json", b"replacement\n",
                        max_bytes=32)
                self.assertEqual(safe_io.read_private_owned_file(
                    root, ".chronicle_capability.json", max_bytes=32).data,
                    b"secret\n")
                owned.remove()
                owned.remove()
                self.assertIsNone(safe_io.read_private_owned_file(
                    root, ".chronicle_capability.json", max_bytes=32))

    def test_private_reader_rejects_ordinary_acl_and_remove_rechecks_bytes (self):
        with tempfile.TemporaryDirectory() as folder:
            ordinary = Path(folder, "ordinary.json")
            ordinary.write_bytes(b"ordinary")
            with safe_io.bind_root(folder) as root:
                with self.assertRaises(safe_io.SafeIOError):
                    safe_io.read_private_owned_file(
                        root, "ordinary.json", max_bytes=32)
                owned = safe_io.create_private_owned_file(
                    root, "private.json", b"owned", max_bytes=32)
                owned.close()
                Path(folder, "private.json").write_bytes(b"rival")
                with self.assertRaises(safe_io.SafeIOError):
                    owned.remove()
                self.assertEqual(Path(folder, "private.json").read_bytes(), b"rival")

    def test_failed_private_create_retains_partial_writer_for_exact_retry (self):
        for stage in ("write", "postcheck", "dacl"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as folder:
                path = Path(folder, "private.json")
                with safe_io.bind_root(folder) as root:
                    native_delete = safe_io._delete_handle
                    delete_calls = 0

                    def fail_first_delete (handle):
                        nonlocal delete_calls
                        delete_calls += 1
                        if delete_calls == 1:
                            raise safe_io.SafeIOError("injected rollback delete")
                        return native_delete(handle)

                    if stage == "write":
                        stage_patch = patch.object(
                            safe_io, "_write_all",
                            side_effect=safe_io.SafeIOError("write"))
                    elif stage == "postcheck":
                        stage_patch = patch.object(
                            safe_io, "_assert_single_unnamed_stream",
                            side_effect=[None, safe_io.SafeIOError("postcheck")])
                    else:
                        stage_patch = patch.object(
                            safe_io, "_verify_private_dacl",
                            side_effect=safe_io.SafeIOError("dacl"))
                    cleanup = None
                    with patch.object(
                            safe_io, "_delete_handle",
                            side_effect=fail_first_delete):
                        try:
                            with stage_patch, self.assertRaises(
                                    safe_io.PrivateCreationError) as raised:
                                safe_io.create_private_owned_file(
                                    root, "private.json", b"secret", max_bytes=32)
                            cleanup = raised.exception.cleanup
                            self.assertIsInstance(
                                raised.exception.operation_error,
                                safe_io.SafeIOError)
                            self.assertTrue(path.exists())
                            cleanup.remove()
                        finally:
                            if cleanup is not None and not cleanup._removed:
                                with patch.object(
                                        safe_io, "_delete_handle",
                                        side_effect=native_delete):
                                    cleanup.remove()
                    self.assertEqual(delete_calls, 2)
                    self.assertFalse(path.exists())

    def test_failed_private_reader_reopen_retains_complete_file_for_retry (self):
        with tempfile.TemporaryDirectory() as folder:
            with safe_io.bind_root(folder) as root:
                native_open = safe_io._open_native

                def fail_readonly_leaf (path, **kwargs):
                    if (not kwargs.get("directory", False)
                            and not kwargs.get("write", False)
                            and not kwargs.get("delete", False)):
                        raise safe_io.SafeIOError("reader reopen")
                    return native_open(path, **kwargs)

                cleanup = None
                try:
                    with patch.object(safe_io, "_open_native",
                                      side_effect=fail_readonly_leaf), \
                         patch.object(
                             safe_io, "remove_private_existing_file",
                             side_effect=safe_io.SafeIOError("rollback delete")), \
                         self.assertRaises(safe_io.PrivateCreationError) as raised:
                        safe_io.create_private_owned_file(
                            root, "private.json", b"complete", max_bytes=32)
                    cleanup = raised.exception.cleanup
                    self.assertEqual(cleanup._complete.data, b"complete")
                    cleanup.remove()
                finally:
                    if cleanup is not None and not cleanup._removed:
                        cleanup.remove()
                self.assertFalse(Path(folder, "private.json").exists())

    def test_private_creation_cleanup_never_adopts_replacement_name (self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, "private.json")
            with safe_io.bind_root(folder) as root:
                native_delete = safe_io._delete_handle
                with patch.object(
                        safe_io, "_write_all",
                        side_effect=safe_io.SafeIOError("write")), \
                     patch.object(
                         safe_io, "_delete_handle",
                         side_effect=safe_io.SafeIOError("rollback delete")), \
                     self.assertRaises(safe_io.PrivateCreationError) as raised:
                    safe_io.create_private_owned_file(
                        root, "private.json", b"partial", max_bytes=32)
                cleanup = raised.exception.cleanup
                writer = cleanup._writer
                native_close = safe_io._close_handle
                replaced = False

                def close_and_replace (handle):
                    nonlocal replaced
                    native_close(handle)
                    if handle == writer and not replaced:
                        replaced = True
                        path.write_bytes(b"replacement")

                try:
                    with patch.object(safe_io, "_delete_handle",
                                      side_effect=native_delete), \
                         patch.object(safe_io, "_close_handle",
                                      side_effect=close_and_replace):
                        cleanup.remove()
                    cleanup.remove()
                    self.assertEqual(path.read_bytes(), b"replacement")
                finally:
                    if not cleanup._removed:
                        with patch.object(
                                safe_io, "_delete_handle",
                                side_effect=native_delete):
                            cleanup.remove()

    def test_process_stamp_live_dead_and_native_bounds (self):
        current = safe_io.current_process_stamp()
        self.assertIs(safe_io.observe_process(current), safe_io.ProcessState.LIVE)
        for values in ((0, 1), (0x1_0000_0000, 1),
                       (1, 0), (1, 0x1_0000_0000_0000_0000)):
            with self.subTest(values=values), self.assertRaises(ValueError):
                safe_io.ProcessStamp(*values)
        code = (
            "from Scripts.Chronicle.safe_io import current_process_stamp;"
            "s=current_process_stamp();"
            "print(f'{s.pid}:{s.creation_filetime}',flush=True)"
        )
        child = subprocess.run(
            [os.environ.get("KATLAB_CHRONICLE_PYTHON", sys.executable),
             "-I", "-S", "-B", "-c",
             "import sys,runpy;sys.path.insert(0,sys.argv[1]);exec(sys.argv[2])",
             str(Path(__file__).resolve().parents[1]), code],
            check=True, capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        pid, created = map(int, child.stdout.strip().split(":"))
        self.assertIs(
            safe_io.observe_process(safe_io.ProcessStamp(pid, created)),
            safe_io.ProcessState.DEAD,
        )

    def test_private_crash_residue_can_be_exactly_observed_and_removed (self):
        with tempfile.TemporaryDirectory() as folder:
            code = (
                "import json,os;from Scripts.Chronicle import safe_io;"
                "r=safe_io.bind_root(sys.argv[2]);"
                "o=safe_io.create_private_owned_file(r,'.cap',b'crash',max_bytes=32);"
                "s=safe_io.current_process_stamp();"
                "print(json.dumps([s.pid,s.creation_filetime]),flush=True);os._exit(0)"
            )
            child = subprocess.run(
                [os.environ.get("KATLAB_CHRONICLE_PYTHON", sys.executable),
                 "-I", "-S", "-B", "-c",
                 "import sys;sys.path.insert(0,sys.argv[1]);exec(sys.argv[3])",
                 str(Path(__file__).resolve().parents[1]), folder, code],
                check=True, capture_output=True, text=True, timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            pid, created = json.loads(child.stdout)
            self.assertIs(safe_io.observe_process(
                safe_io.ProcessStamp(pid, created)), safe_io.ProcessState.DEAD)
            with safe_io.bind_root(folder) as root:
                residue = safe_io.read_private_owned_file(root, ".cap", max_bytes=32)
                self.assertIsNotNone(residue)
                safe_io.remove_private_existing_file(root, ".cap", residue)
                self.assertFalse(Path(folder, ".cap").exists())


class PureContractTests(unittest.TestCase):
    def test_public_runtime_path_preflight_uses_native_component_bounds (self):
        self.assertEqual(
            safe_io.validate_runtime_relative(r"docs\plans\one.md"),
            "docs/plans/one.md",
        )
        for value in ("docs/./one.md", "docs/name:stream", "docs/" + "x" * 256):
            with self.subTest(value=value), self.assertRaises(safe_io.SafeIOError):
                safe_io.validate_runtime_relative(value)

    def test_markdown_projection_validates_html_leaf_and_readme_mapping (self):
        self.assertEqual(
            safe_io.project_markdown_runtime_relative("mirror/Docs/Guide.md"),
            ("mirror/Docs/Guide.md", "mirror/Docs/Guide.html"),
        )
        self.assertEqual(
            safe_io.project_markdown_runtime_relative("mirror/Docs/README.md"),
            ("mirror/Docs/README.md", "mirror/Docs/index.html"),
        )
        self.assertEqual(
            safe_io.project_markdown_runtime_relative("mirror/Docs/.md"),
            ("mirror/Docs/.md", "mirror/Docs/.md.html"),
        )
        self.assertEqual(
            safe_io.project_markdown_runtime_relative("mirror/Docs/.md.md"),
            ("mirror/Docs/.md.md", "mirror/Docs/.md.html"),
        )
        self.assertEqual(
            safe_io.project_mkdocs_runtime_relative(
                "story/release-one.markdown"),
            ("story/release-one.markdown", "story/release-one.html"),
        )
        self.assertEqual(
            safe_io.project_mkdocs_runtime_relative("story/index.html"),
            ("story/index.html", "story/index.html"),
        )
        supported = "R" * safe_io.CHRONICLE_REPO_ID_MAX
        self.assertEqual(
            safe_io.project_markdown_runtime_relative(
                f"changelog/{supported}.md")[1],
            f"changelog/{supported}.html",
        )
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.project_markdown_runtime_relative(
                f"changelog/{supported}X.md")
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.project_markdown_runtime_relative("assets/extra.css")

    def test_asset_authority_constants_and_mismatch (self):
        mermaid = safe_io.asset_spec("fetch-mermaid")
        self.assertEqual(
            (mermaid.name, mermaid.length, mermaid.sha256),
            ("mermaid-11.17.2.min.js", 3_572_661,
             "581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8"),
        )
        bootswatch = safe_io.asset_spec("fetch-bootswatch")
        self.assertEqual(
            (bootswatch.length, bootswatch.sha256),
            (232_704,
             "c4a7dc2470ce949905bd8375ae6986870c28f65959d8ceb1077d520344437580"),
        )
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.validate_asset("fetch-mermaid", b"wrong")
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.asset_spec("unknown")

    def test_origin_mapping_is_numeric_loopback_only (self):
        cases = {
            ("localhost", 8000): ("http://127.0.0.1:8000", "127.0.0.1"),
            ("0.0.0.0", 8001): ("http://127.0.0.1:8001", "127.0.0.1"),
            ("::", 8002): ("http://[::1]:8002", "::1"),
        }
        for arguments, expected in cases.items():
            with self.subTest(arguments=arguments):
                origin = safe_io.origin_from_bind(*arguments)
                self.assertIsNotNone(origin)
                self.assertEqual((origin.url, origin.host), expected)
                self.assertEqual(safe_io.normalize_tracker_origin(origin.url), origin)
        for host in ("example.com", "127.0.0.2", " localhost", "localhost "):
            self.assertIsNone(safe_io.origin_from_bind(host, 8000))
        for raw in (
            "https://127.0.0.1:8000", "http://localhost:8000",
            "http://127.0.0.1:08000", "http://127.0.0.1:65536",
            "http://127.0.0.1:8000/path", "http://user@127.0.0.1:8000",
        ):
            with self.subTest(raw=raw), self.assertRaises(safe_io.SafeIOError):
                safe_io.normalize_tracker_origin(raw)

    def test_tracker_targets_are_exact_and_do_not_normalize (self):
        expected = {
            safe_io.build_tracker_target("repos"): b"/api/repos",
            safe_io.build_tracker_target("stats", repo_id="repo_A"): b"/api/stats?repo=repo_A",
            safe_io.build_tracker_target("history", repo_id="repo_A", offset=500):
                b"/api/history?repo=repo_A&limit=500&offset=500",
            safe_io.build_tracker_target(
                "events", repo_id="repo_A", offset=0, day="2026-09-14",
                next_day="2026-09-15"):
                b"/api/events?repo=repo_A&since=2026-09-14T00%3A00%3A00Z&"
                b"until=2026-09-15T00%3A00%3A00Z&limit=500&offset=0",
        }
        for target in expected:
            self.assertEqual(safe_io.build_tracker_target_from_bytes(target), target)
        for length in (129, safe_io.CHRONICLE_REPO_ID_MAX):
            repo_id = "R" * length
            for token, arguments in (
                ("stats", {"repo_id": repo_id}),
                ("history", {"repo_id": repo_id, "offset": 0}),
                ("events", {
                    "repo_id": repo_id, "offset": 0,
                    "day": "2026-09-14", "next_day": "2026-09-15",
                }),
            ):
                with self.subTest(length=length, token=token):
                    target = safe_io.build_tracker_target(token, **arguments)
                    self.assertEqual(
                        safe_io.build_tracker_target_from_bytes(target), target)
        too_long = "R" * (safe_io.CHRONICLE_REPO_ID_MAX + 1)
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.build_tracker_target("stats", repo_id=too_long)
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.build_tracker_target_from_bytes(
                f"/api/stats?repo={too_long}".encode("ascii"))
        for target in (
            b"/api/history?repo=repo_A&limit=500&offset=0500",
            b"/api/history?repo=repo_A&offset=500&limit=500",
            b"/api/stats?repo=repo%5FA", b"/api/repos?x=1",
        ):
            with self.subTest(target=target), self.assertRaises(safe_io.SafeIOError):
                safe_io.build_tracker_target_from_bytes(target)

    @staticmethod
    def _response (payload):
        target = b"/api/repos"
        body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
        headers = [(b"Content-Type", b"application/json; charset=utf-8")]
        proof = response_mac(KEY, NONCE, target, 200, headers, body)
        return target, body, headers + [(b"X-KATLAB-Chronicle-MAC", proof)]

    def test_authenticated_envelope_accepts_only_exact_proven_json (self):
        payload = {
            "success": True, "data": [{"id": "r"}], "message": "",
            "timestamp": "2026-09-14T12:34:56.123456Z",
        }
        target, body, headers = self._response(payload)
        self.assertEqual(
            safe_io.verify_authenticated_response(
                KEY, NONCE, target, 200, headers, body),
            payload["data"],
        )
        tampered = body.replace(b'"id":"r"', b'"id":"x"')
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.verify_authenticated_response(
                KEY, NONCE, target, 200, headers, tampered)

    def test_authenticated_envelope_rejects_invalid_timestamp_and_infinity (self):
        invalid_time = {
            "success": True, "data": [], "message": "", "timestamp": "not-a-dateZ"}
        target, body, headers = self._response(invalid_time)
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.verify_authenticated_response(KEY, NONCE, target, 200, headers, body)

        body = (b'{"success":true,"data":1e999,"message":"",'
                b'"timestamp":"2026-09-14T00:00:00Z"}')
        original = [(b"Content-Type", b"application/json")]
        proof = response_mac(KEY, NONCE, target, 200, original, body)
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.verify_authenticated_response(
                KEY, NONCE, target, 200,
                original + [(b"X-KATLAB-Chronicle-MAC", proof)], body)

        body = (b'{"success":true,"data":"\\ud800","message":"",'
                b'"timestamp":"2026-09-14T00:00:00Z"}')
        proof = response_mac(KEY, NONCE, target, 200, original, body)
        with self.assertRaises(safe_io.SafeIOError):
            safe_io.verify_authenticated_response(
                KEY, NONCE, target, 200,
                original + [(b"X-KATLAB-Chronicle-MAC", proof)], body)

    def test_scoped_runtime_hook_and_asset_cli (self):
        self.assertIsNone(safe_io.require_transport_runtime())
        with patch.object(safe_io, "require_expected_interpreter") as interpreter:
            self.assertEqual(safe_io.main(["--unknown"]), 2)
            interpreter.assert_not_called()
        result = SimpleNamespace(canonical_path=r"C:\vendor\mermaid.js")
        with (patch.object(safe_io, "require_expected_interpreter"),
              patch.object(safe_io, "fetch_pinned_asset", return_value=result) as fetch):
            self.assertEqual(safe_io.main(["fetch-mermaid"]), 0)
            fetch.assert_called_once_with("fetch-mermaid")

    def test_pinned_https_fetch_and_atomic_raw_promotion (self):
        payload = b"fixture-asset"
        spec = safe_io.AssetSpec(
            "tiny", "tiny.css", "https://assets.example/tiny.css",
            len(payload), hashlib.sha256(payload).hexdigest())

        class FakeSocket:
            def settimeout (self, _value):
                pass

            def close (self):
                pass

        class FakeResponse:
            status = 200

            def __init__ (self):
                self.remaining = payload

            def getheaders (self):
                return [("Content-Length", str(len(payload))),
                        ("Content-Encoding", "identity")]

            def read (self, count):
                result, self.remaining = self.remaining[:count], self.remaining[count:]
                return result

            def close (self):
                pass

        class FakeConnection:
            def __init__ (self, *_args, **_kwargs):
                self.sock = None
                self.request_args = None

            def request (self, *args, **kwargs):
                self.request_args = (args, kwargs)

            def getresponse (self):
                # Real Connection: close responses detach HTTPSConnection.sock;
                # safe_io must retain and time-bound the actual TLS socket.
                self.sock = None
                return FakeResponse()

            def close (self):
                pass

        with tempfile.TemporaryDirectory() as folder, \
             patch.object(safe_io, "ASSETS", {"tiny": spec}), \
             patch.object(safe_io, "_connect_https", return_value=FakeSocket()), \
             patch.object(safe_io.http.client, "HTTPSConnection", FakeConnection):
            self.assertEqual(safe_io.download_pinned_asset("tiny"), payload)
            with safe_io.bind_root(folder) as root:
                installed = safe_io.fetch_pinned_asset("tiny", root)
                self.assertEqual(installed.data, payload)
                self.assertEqual(
                    Path(folder, "assets", "vendor", "tiny.css").read_bytes(),
                    payload,
                )

    def test_asset_failure_preserves_prior_vendor_bytes (self):
        payload = b"new"
        spec = safe_io.AssetSpec(
            "tiny", "tiny.css", "https://assets.example/tiny.css", 3,
            hashlib.sha256(payload).hexdigest())
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(safe_io, "ASSETS", {"tiny": spec}):
            with safe_io.bind_root(folder) as root:
                root.write_if_changed("assets/vendor/tiny.css", b"prior")
                with patch.object(
                        safe_io, "download_pinned_asset",
                        side_effect=safe_io.SafeIOError("network")):
                    with self.assertRaises(safe_io.SafeIOError):
                        safe_io.fetch_pinned_asset("tiny", root)
                self.assertEqual(
                    root.read("assets/vendor/tiny.css", max_bytes=16).data,
                    b"prior",
                )

    def test_pinned_https_rejects_redirect_before_body_acceptance (self):
        payload = b"abc"
        spec = safe_io.AssetSpec(
            "tiny", "tiny.css", "https://assets.example/tiny.css", 3,
            hashlib.sha256(payload).hexdigest())

        class FakeSocket:
            def settimeout (self, _value):
                pass

            def close (self):
                pass

        class Redirect:
            status = 302

            def getheaders (self):
                return [("Content-Length", "3"),
                        ("Location", "https://other.example/tiny.css")]

            def close (self):
                pass

        class FakeConnection:
            def __init__ (self, *_args, **_kwargs):
                self.sock = None

            def request (self, *_args, **_kwargs):
                pass

            def getresponse (self):
                return Redirect()

            def close (self):
                pass

        with patch.object(safe_io, "ASSETS", {"tiny": spec}), \
             patch.object(safe_io, "_connect_https", return_value=FakeSocket()), \
             patch.object(safe_io.http.client, "HTTPSConnection", FakeConnection):
            with self.assertRaises(safe_io.SafeIOError):
                safe_io.download_pinned_asset("tiny")

    def test_asset_absolute_deadline_interrupts_slow_headers (self):
        payload = b"abc"
        spec = safe_io.AssetSpec(
            "tiny", "tiny.css", "https://assets.example/tiny.css", 3,
            hashlib.sha256(payload).hexdigest())
        expired = threading.Event()
        entered_headers = threading.Event()

        class FakeSocket:
            def settimeout (self, _value):
                pass

            def shutdown (self, _how):
                expired.set()

            def close (self):
                pass

        class SlowConnection:
            def __init__ (self, *_args, **_kwargs):
                self.sock = None

            def request (self, *_args, **_kwargs):
                pass

            def getresponse (self):
                entered_headers.set()
                if not expired.wait(1):
                    raise AssertionError("absolute deadline did not stop header wait")
                raise OSError("deadline shutdown")

            def close (self):
                pass

        started = time.monotonic()
        with patch.object(safe_io, "ASSETS", {"tiny": spec}), \
             patch.object(safe_io, "CDN_TRANSFER_DEADLINE_SECONDS", 0.02), \
             patch.object(safe_io.ssl, "create_default_context",
                          return_value=object()), \
             patch.object(safe_io, "_connect_https", return_value=FakeSocket()), \
             patch.object(safe_io.http.client, "HTTPSConnection", SlowConnection):
            with self.assertRaises(safe_io.SafeIOError):
                safe_io.download_pinned_asset("tiny")
        self.assertTrue(entered_headers.is_set())
        self.assertTrue(expired.is_set())
        self.assertLess(time.monotonic() - started, 0.5)


if __name__ == "__main__":
    unittest.main()
