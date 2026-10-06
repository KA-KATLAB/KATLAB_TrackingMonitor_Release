"""Stale numeric ancestry regressions use snapshots and fake leases only."""

import ast
import copy
from dataclasses import replace
import hashlib
import json
import unittest
from unittest.mock import MagicMock, patch

from Scripts import lifecycle_process as owned
from Tests.test_lifecycle_process import (
    AUTHORITY, COMMAND, FakeLease, REPO, ROOT_IMAGE, records,
)


ORIGINAL_MODULE_SHA = "78a00b85fcfd4e63cc247f017064aca559776e3f36dec67e131e366b8314757a"
SOURCE = REPO / "Scripts/lifecycle_process.py"
ACTUAL_OPEN_VERIFIED = owned._open_verified
OLD_EDGE = """_record_identity(child)
if child.created < row.created:
    raise ProcessOwnershipError("Owned descendant parent was replaced")
visit(child, depth + 1)
"""
NEW_EDGE = """_record_identity(child)
if child.pid in visiting:
    raise ProcessOwnershipError("Owned process tree is cyclic or too deep")
if child.created // 10 < row.created // 10:
    continue
visit(child, depth + 1)
"""


def ast_value (node):
    """Preserve all AST fields except optional empty Python 3.12 type_params."""
    if isinstance(node, ast.AST):
        return [type(node).__name__, [
            [name, ast_value(value)] for name, value in ast.iter_fields(node)
            if not (name == "type_params" and value == [])]]
    if isinstance(node, list):
        return [ast_value(value) for value in node]
    if node is Ellipsis:
        return {"literal": "Ellipsis"}
    return node


def ast_sha (node):
    value = json.dumps(ast_value(node), ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def edge_loop (tree):
    selectors = [node for node in ast.walk(tree) if
                 isinstance(node, ast.FunctionDef) and node.name == "_select_processes"]
    if len(selectors) != 1:
        raise ValueError("Expected exactly one selector")
    visits = [node for node in ast.walk(selectors[0]) if
              isinstance(node, ast.FunctionDef) and node.name == "visit"]
    if len(visits) != 1:
        raise ValueError("Expected exactly one visit owner")
    loops = [node for node in ast.walk(visits[0]) if isinstance(node, ast.For)
             and isinstance(node.target, ast.Name) and node.target.id == "child"]
    if len(loops) != 1:
        raise ValueError("Expected exactly one child loop")
    return loops[0]


def restore_original_edge (tree):
    loop = edge_loop(tree)
    expected = ast.parse(NEW_EDGE).body
    if ast_value(loop.body) != ast_value(expected):
        raise ValueError("Expected exact reviewed identity/cycle/stale/visit statements")
    for guard in expected[1:3]:
        occurrences = [node for node in ast.walk(tree) if
                       isinstance(node, ast.If) and ast_value(node) == ast_value(guard)]
        if len(occurrences) != 1:
            raise ValueError("Expected exactly one reviewed guard")
    loop.body = ast.parse(OLD_EDGE).body
    return tree


def stale_records (parent=102):
    rows = records()
    rows[103] = owned._Process(103, 102, 40000, r"C:\Tools\child.exe", None)
    rows[200] = owned._Process(
        200, parent, rows[parent].created - 10, r"C:\Foreign\powershell.exe", None)
    rows[201] = owned._Process(201, 200, 50000, r"C:\Foreign\child.exe", None)
    return rows


class StaleParentTests(unittest.TestCase):
    def patched (self, *args, **kwargs):
        patcher = patch.object(*args, **kwargs)
        result = patcher.start()
        self.addCleanup(patcher.stop)
        return result

    def setUp (self):
        self.kernel = MagicMock(name="forbidden_native_kernel")
        self.patched(owned, "_kernel", self.kernel, create=True)
        self.patched(owned, "_require_windows", return_value=None)
        self.patched(owned, "_monotonic", return_value=1)
        self.patched(owned, "_authority", return_value=AUTHORITY)
        self.query = self.patched(
            owned, "_query_snapshot", side_effect=AssertionError("Real snapshot forbidden"))
        self.opened = self.patched(
            owned, "_open_verified", side_effect=AssertionError("Real handle forbidden"))
        self.spawn = self.patched(
            owned.subprocess, "Popen", side_effect=AssertionError("Process spawn forbidden"))

        def fixture_command (value):
            if value != COMMAND:
                raise owned.ProcessOwnershipError("Unexpected fixture command")
            return ROOT_IMAGE, "-u", "-m", "Backend.app.main"

        self.patched(owned, "_split_command", side_effect=fixture_command)

    def snapshot (self, rows):
        self.query.side_effect = None
        self.query.return_value = rows

    def tearDown (self):
        self.assertEqual(self.kernel.mock_calls, [])
        self.spawn.assert_not_called()

    def test_stale_selection_excludes_branch_and_keeps_genuine_descendants (self):
        for parent in (100, 102):
            with self.subTest(parent=parent):
                rows = stale_records(parent)
                # Even unknown metadata below the excluded branch is never acquired.
                rows[201] = replace(rows[201], created=None, image=None)
                roots, selected = owned._select_processes(rows, {101}, AUTHORITY)
                self.assertEqual(roots, (100,))
                self.assertEqual([row.pid for row in selected], [100, 101, 102, 103])
        self.query.assert_not_called()
        self.opened.assert_not_called()

    def test_stale_preparation_opens_and_stops_only_selected_fake_leases (self):
        rows, events, leases = stale_records(), [], {}
        self.snapshot(rows)

        def acquire (row, **kwargs):
            events.append(("open", row.pid))
            lease = leases[row.pid] = FakeLease(row.pid, row.created + 1, events)
            return lease

        self.opened.side_effect = acquire
        with owned.prepare_owned_processes(REPO, {101}, 10) as group:
            self.assertEqual(events, [("open", pid) for pid in (100, 101, 102, 103)])
            group.terminate_and_wait(10)
        self.assertEqual([pid for action, pid in events if action == "terminate"],
                         [100, 101, 102, 103])
        self.assertEqual([pid for action, pid in events if action == "wait"],
                         [100, 101, 102, 103])
        self.assertEqual([pid for action, pid in events if action == "close"],
                         [103, 102, 101, 100])
        self.assertTrue(all(lease.closed for lease in leases.values()))
        self.query.assert_called_once_with({101}, 10)
        self.assertEqual(self.opened.call_args_list[-1].kwargs,
                         {"essential": False, "allow_absent": True})

    def test_required_base_listener_and_mixed_foreign_listener_refuse_before_open (self):
        replaced_parent = stale_records()
        replaced_parent[100] = replace(replaced_parent[100], created=20001)
        for rows, pids in ((replaced_parent, {101}), (stale_records(), {101, 900})):
            with self.subTest(pids=pids, root_created=rows[100].created):
                self.snapshot(rows)
                with self.assertRaises(owned.ProcessOwnershipError):
                    with owned.prepare_owned_processes(REPO, pids, 10):
                        self.fail("Required or foreign listener must not yield")
        self.opened.assert_not_called()

    def test_stale_candidate_identity_is_validated_before_pruning (self):
        for changes in ({"created": None}, {"image": None}, {"image": "relative.exe"}):
            with self.subTest(changes=changes):
                rows = stale_records()
                rows[200] = replace(rows[200], **changes)
                self.snapshot(rows)
                with self.assertRaises(owned.ProcessOwnershipError):
                    with owned.prepare_owned_processes(REPO, {101}, 10):
                        self.fail("Unknown stale-candidate identity must not yield")
        self.opened.assert_not_called()

    def test_older_and_equal_cyclic_back_edges_are_not_pruned (self):
        for equal in (False, True):
            with self.subTest(equal=equal):
                rows = records()
                rows[100] = replace(rows[100], parent=102)
                if equal:
                    rows[101] = replace(rows[101], created=10000)
                    rows[102] = replace(rows[102], created=10000)
                self.snapshot(rows)
                with self.assertRaisesRegex(owned.ProcessOwnershipError, "cyclic or too deep"):
                    with owned.prepare_owned_processes(REPO, {101}, 10):
                        self.fail("A cyclic back edge must never yield")
        self.opened.assert_not_called()

    def test_equal_microsecond_bucket_is_selected_then_native_order_refuses (self):
        rows, events, leases = stale_records(), [], {}
        rows[101] = replace(rows[101], created=20009)
        rows[102] = replace(rows[102], created=20000)
        rows[200] = replace(rows[200], created=19990)
        roots, selected = owned._select_processes(rows, {101}, AUTHORITY)
        self.assertEqual(roots, (100,))
        self.assertEqual([row.pid for row in selected], [100, 101, 102, 103])
        self.snapshot(rows)

        def acquire (row, **kwargs):
            events.append(("open", row.pid))
            lease = leases[row.pid] = FakeLease(row.pid, row.created, events)
            return lease

        self.opened.side_effect = acquire
        with self.assertRaisesRegex(owned.ProcessOwnershipError, "Native process ancestry changed"):
            with owned.prepare_owned_processes(REPO, {101}, 10):
                self.fail("Full native creation ordering must still refuse")
        self.assertEqual([pid for action, pid in events if action == "open"],
                         [100, 101, 102, 103])
        self.assertTrue(all(lease.closed for lease in leases.values()))
        self.assertFalse(any(action in {"terminate", "wait"} for action, _ in events))

    def test_independently_proven_listener_root_is_not_lost_to_a_stale_edge (self):
        rows = stale_records(100)
        rows[200] = replace(rows[200], image=ROOT_IMAGE, command=COMMAND)
        roots, selected = owned._select_processes(rows, {101, 200}, AUTHORITY)
        self.assertEqual(roots, (100, 200))
        self.assertEqual([row.pid for row in selected], [100, 101, 102, 103, 200, 201])
        self.opened.assert_not_called()

    def test_selected_identity_change_closes_native_mock_and_prior_fake_leases (self):
        for image, stamp in ((ROOT_IMAGE, 30000), (r"C:\Tools\git.exe", 30010)):
            with self.subTest(image=image, stamp=stamp):
                events, leases = [], []
                self.snapshot(stale_records())
                kernel = MagicMock(name="controlled_native_api")
                kernel.OpenProcess.return_value = 24680
                kernel.CloseHandle.return_value = True

                def acquire (row, **kwargs):
                    if row.pid == 102:
                        return ACTUAL_OPEN_VERIFIED(row, **kwargs)
                    lease = FakeLease(row.pid, row.created, events)
                    leases.append(lease)
                    return lease

                self.opened.side_effect = acquire
                with (patch.object(owned, "_kernel", kernel),
                      patch.object(owned.ctypes, "set_last_error", create=True),
                      patch.object(owned, "_handle_identity",
                                   return_value=(owned._path_key(image), stamp))):
                    with self.assertRaisesRegex(owned.ProcessOwnershipError, "identity changed"):
                        with owned.prepare_owned_processes(REPO, {101}, 10):
                            self.fail("Changed selected identity must not yield")
                kernel.OpenProcess.assert_called_once_with(owned._QUERY_ACCESS, False, 102)
                kernel.CloseHandle.assert_called_once_with(24680)
                kernel.TerminateProcess.assert_not_called()
                kernel.WaitForSingleObject.assert_not_called()
                self.assertEqual(len(leases), 2)
                self.assertTrue(all(lease.closed for lease in leases))
                self.assertEqual(events, [("close", 101), ("close", 100)])


class StaleParentPreservationTests(unittest.TestCase):
    def test_exact_edge_restoration_retains_original_full_module_for_lf_and_crlf (self):
        source = SOURCE.read_text(encoding="utf-8")
        for newline in ("\n", "\r\n"):
            with self.subTest(newline=repr(newline)):
                tree = ast.parse(source.replace("\n", newline))
                self.assertEqual(ast_sha(restore_original_edge(tree)), ORIGINAL_MODULE_SHA)

    def test_missing_repeated_reordered_and_weakened_guards_are_rejected (self):
        source = ast.parse(SOURCE.read_text(encoding="utf-8"))
        for mutation in ("missing", "repeated", "order", "identity", "bucket", "equal", "action"):
            with self.subTest(mutation=mutation):
                tree = copy.deepcopy(source)
                loop = edge_loop(tree)
                if mutation == "missing":
                    del loop.body[1]
                elif mutation == "repeated":
                    loop.body.insert(1, copy.deepcopy(loop.body[1]))
                elif mutation == "order":
                    loop.body[1], loop.body[2] = loop.body[2], loop.body[1]
                elif mutation == "identity":
                    del loop.body[0]
                elif mutation == "bucket":
                    loop.body[2].test = ast.parse("child.created < row.created", mode="eval").body
                elif mutation == "equal":
                    loop.body[2].test.ops = [ast.LtE()]
                else:
                    loop.body[2].body = [ast.Pass()]
                with self.assertRaisesRegex(ValueError, "exact reviewed"):
                    restore_original_edge(tree)

    def test_duplicate_guard_elsewhere_and_unrelated_owner_changes_cannot_be_hidden (self):
        source = ast.parse(SOURCE.read_text(encoding="utf-8"))
        duplicate = copy.deepcopy(source)
        duplicate.body.append(copy.deepcopy(edge_loop(duplicate).body[1]))
        with self.assertRaisesRegex(ValueError, "exactly one reviewed guard"):
            restore_original_edge(duplicate)
        for marker in ("Native process ancestry changed", "Stop process cannot target itself"):
            with self.subTest(marker=marker):
                tree = copy.deepcopy(source)
                constants = [node for node in ast.walk(tree) if
                             isinstance(node, ast.Constant) and node.value == marker]
                self.assertEqual(len(constants), 1)
                constants[0].value += " altered"
                self.assertNotEqual(ast_sha(restore_original_edge(tree)), ORIGINAL_MODULE_SHA)
        source.body.append(ast.Pass())
        self.assertNotEqual(ast_sha(restore_original_edge(source)), ORIGINAL_MODULE_SHA)

    def test_portable_all_field_serialization_preserves_type_params_and_ellipsis (self):
        original = restore_original_edge(ast.parse(SOURCE.read_text(encoding="utf-8")))
        legacy, modern = copy.deepcopy(original), copy.deepcopy(original)
        kinds = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
        for node in ast.walk(legacy):
            if isinstance(node, kinds):
                node._fields = tuple(name for name in node._fields if name != "type_params")
        for node in ast.walk(modern):
            if isinstance(node, kinds):
                if "type_params" not in node._fields:
                    node._fields += ("type_params",)
                node.type_params = []
        self.assertEqual(ast_sha(legacy), ORIGINAL_MODULE_SHA)
        self.assertEqual(ast_sha(modern), ORIGINAL_MODULE_SHA)
        for value in ([ast.Name(id="T", ctx=ast.Load())], None, False, 0, ()):
            with self.subTest(type_params=repr(value)):
                changed = copy.deepcopy(modern)
                function = next(node for node in ast.walk(changed) if isinstance(node, ast.FunctionDef))
                function.type_params = value
                self.assertNotEqual(ast_sha(changed), ORIGINAL_MODULE_SHA)
        ellipses = [node for node in ast.walk(modern) if
                    isinstance(node, ast.Constant) and node.value is Ellipsis]
        self.assertGreater(len(ellipses), 0)
        self.assertEqual(ast_value(Ellipsis), {"literal": "Ellipsis"})
        ellipses[0].value = None
        self.assertNotEqual(ast_sha(modern), ORIGINAL_MODULE_SHA)


if __name__ == "__main__":
    unittest.main()
