"""Focused stdlib checks for the executable Git read-only boundary."""

import ast
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from Backend.app import git_module


ROOT = Path(__file__).resolve().parents[1]


class GitAllowlistTests(unittest.TestCase):
    def test_run_rejects_every_non_allowlisted_verb_before_subprocess (self) -> None:
        with patch("Backend.app.git_module.subprocess.run") as run:
            with self.assertRaises(git_module.GitError):
                git_module._run(Path("synthetic"), "rev-parse", "HEAD")
            run.assert_not_called()

    def test_every_git_subprocess_vector_starts_with_allowed_verb (self) -> None:
        completed = subprocess.CompletedProcess([], 0, stdout="value\n", stderr="")
        with patch("Backend.app.git_module.subprocess.run", return_value=completed) as run:
            git_module.head_hash(Path("synthetic"))
        vector = run.call_args.args[0]
        self.assertEqual(vector[:3], ["git", "-C", "synthetic"])
        self.assertIn(vector[3], git_module.ALLOWED_GIT_VERBS)
        self.assertEqual(vector[3:], ["show", "-s", "--format=%H", "HEAD"])

    def test_status_parser_covers_branch_and_every_dirty_record (self) -> None:
        raw = "\0".join([
            "# branch.oid abcdef0123456789",
            "# branch.head feature/mission",
            "# branch.upstream origin/feature/mission",
            "# branch.ab +2 -1",
            "1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb Backend/app/db.py",
            "2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 Frontend/src/New Name.tsx",
            "Frontend/src/Old Name.tsx",
            "u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc conflicted.txt",
            "? new folder/new.txt",
            "",
        ])
        got = git_module.parse_status_porcelain_v2(raw, "2026-01-02T03:04:05Z")
        self.assertEqual(got["count"], 4)
        self.assertFalse(got["clean"])
        self.assertEqual(got["branch"], "feature/mission")
        self.assertEqual(got["dirty_paths"], [
            "Backend/app/db.py",
            "Frontend/src/New Name.tsx",
            "Frontend/src/Old Name.tsx",
            "conflicted.txt",
            "new folder/new.txt",
        ])
        self.assertTrue(got["paths_complete"])
        self.assertTrue(got["status_valid"])
        self.assertEqual(got["observed_at"], "2026-01-02T03:04:05Z")

    def test_dynamic_revisions_reject_before_the_git_boundary (self) -> None:
        invalid = (None, False, 7, b"HEAD", [], "", "HEAD\0PRIVATE_REF",
                   "-", "--", "-p", "--output=PRIVATE_FILE", "--ext-diff")
        calls = (
            lambda ref: git_module.commit_file_diff(Path("synthetic"), ref, "file.txt"),
            lambda ref: git_module.commit_info(Path("synthetic"), ref),
            lambda ref: list(git_module._commit_hash_pages(Path("synthetic"), ref, 3)),
        )
        for index, call in enumerate(calls):
            for ref in invalid:
                with self.subTest(helper=index, ref=ref), \
                     patch.object(git_module, "_run") as run, \
                     patch.object(git_module.subprocess, "run") as process:
                    with self.assertRaises(git_module.GitError) as raised:
                        call(ref)
                    self.assertEqual(str(raised.exception), "Invalid Git revision")
                    run.assert_not_called()
                    process.assert_not_called()

    def test_revision_guard_keeps_generator_lazy_but_precedes_first_process (self) -> None:
        with patch.object(git_module, "_run") as run:
            pages = git_module._commit_hash_pages(Path("synthetic"), "--output=PRIVATE", 3)
            run.assert_not_called()
            with self.assertRaisesRegex(git_module.GitError, "^Invalid Git revision$"):
                next(pages)
            run.assert_not_called()

    def test_normal_revision_arguments_are_not_rewritten_or_restricted_to_hashes (self) -> None:
        repo = Path("synthetic")
        revisions = ("a" * 40, "B" * 64, "a1b2c3d", "HEAD", "feature/review",
                     "HEAD~1", "HEAD^{commit}", "base..HEAD", "HEAD:path with spaces",
                     'HEAD:quote"name', "HEAD:line\nname")
        for ref in revisions:
            with self.subTest(ref=ref), patch.object(git_module, "_run") as run:
                run.return_value = "patch"
                self.assertEqual(git_module.commit_file_diff(repo, ref, "file.txt"), "patch")
                run.assert_called_once_with(repo, "show", "--format=", ref, "--", "file.txt")
                run.reset_mock()
                run.return_value = "hash\nparent\n2026-10-05T00:00:00+00:00\nsubject\nfile.txt\n"
                self.assertEqual(git_module.commit_info(repo, ref)["hash"], "hash")
                run.assert_called_once_with(repo, "show", "--name-only", "--no-renames",
                                            "--format=%H%n%P%n%cI%n%s", ref)
                run.reset_mock()
                run.return_value = "hash\n"
                self.assertEqual(list(git_module._commit_hash_pages(repo, ref, 3)), [["hash"]])
                run.assert_called_once_with(repo, "log", "--topo-order", "--max-count=3",
                                            "--skip=0", "--format=%H", ref)

    def test_dash_prefixed_paths_stay_after_the_file_separator (self) -> None:
        repo, path = Path("synthetic"), "--output=literal-file.txt"
        with patch.object(git_module, "_run", return_value="patch") as run:
            git_module.file_diff(repo, path)
            run.assert_called_once_with(repo, "diff", "HEAD", "--", path)
            run.reset_mock()
            git_module.commit_file_diff(repo, "HEAD", path)
            run.assert_called_once_with(repo, "show", "--format=", "HEAD", "--", path)
            run.reset_mock()
            run.return_value = "?? " + path
            self.assertEqual(git_module.file_state(repo, path), "untracked")
            run.assert_called_once_with(repo, "status", "--porcelain", "--ignored", "--", path)

    def test_status_parser_handles_detached_unborn_and_clean (self) -> None:
        detached = git_module.parse_status_porcelain_v2(
            "# branch.oid 0123456789abcdef\0# branch.head (detached)\0"
        )
        self.assertEqual(detached["branch"], "01234567")
        self.assertTrue(detached["clean"])

        unborn = git_module.parse_status_porcelain_v2(
            "# branch.oid (initial)\0# branch.head main\0"
        )
        self.assertEqual(unborn["branch"], "main")
        self.assertTrue(unborn["clean"])

    def test_status_parser_rejects_truncated_rename (self) -> None:
        raw = (
            "# branch.oid abcdef0123456789\0# branch.head main\0"
            "2 R. N... 100644 100644 100644 a b R100 destination.txt\0"
        )
        with self.assertRaises(git_module.GitError):
            git_module.parse_status_porcelain_v2(raw)

    def test_known_commit_catchup_pages_to_boundary_oldest_first (self) -> None:
        def pages (_repo, *args):
            revision = args[-1]
            skip = next(item for item in args if item.startswith("--skip="))
            if revision == "head":
                return {
                    "--skip=0": "new-5\nnew-4\nnew-3\n",
                    "--skip=3": "new-2\nnew-1\nknown\n",
                }[skip]
            self.assertEqual(revision, "known..head")
            return {
                "--skip=0": "new-5\nnew-4\nnew-3\n",
                "--skip=3": "new-2\nnew-1\n",
            }[skip]

        with patch("Backend.app.git_module._run", side_effect=pages) as run, \
             patch("Backend.app.git_module.commit_info",
                   side_effect=lambda _repo, value: {"hash": value}) as info:
            result = git_module.new_commits_since(
                Path("synthetic"), {"known"}, limit=3, head="head",
            )
        self.assertEqual([item["hash"] for item in result], [
            "new-1", "new-2", "new-3", "new-4", "new-5",
        ])
        self.assertEqual(run.call_count, 4)
        self.assertIn("--skip=0", run.call_args_list[0].args)
        self.assertIn("--skip=3", run.call_args_list[1].args)
        self.assertIn("known..head", run.call_args_list[2].args)
        self.assertEqual(info.call_count, 5)

    def test_known_boundary_does_not_hide_a_new_merged_sibling (self) -> None:
        pages = ["merge\nknown-head\nside\n", "merge\nside\n"]
        with patch("Backend.app.git_module._run", side_effect=pages), \
             patch("Backend.app.git_module.commit_info",
                   side_effect=lambda _repo, value: {"hash": value}):
            result = git_module.new_commits_since(
                Path("synthetic"), {"known-head"}, limit=3, head="head",
            )
        self.assertEqual([item["hash"] for item in result], ["side", "merge"])

    def test_empty_commit_baseline_reads_only_one_page (self) -> None:
        with patch("Backend.app.git_module._run", return_value="h3\nh2\nh1\n") as run, \
             patch("Backend.app.git_module.commit_info",
                   side_effect=lambda _repo, value: {"hash": value}):
            result = git_module.new_commits_since(
                Path("synthetic"), set(), limit=3, head="head",
            )
        self.assertEqual([item["hash"] for item in result], ["h1", "h2", "h3"])
        self.assertEqual(run.call_count, 1)

    def test_executable_git_calls_are_confined_to_git_module (self) -> None:
        offenders: list[str] = []
        for path in sorted((ROOT / "Backend").rglob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if not isinstance(node, (ast.List, ast.Tuple)):
                    continue
                values = node.elts
                if values and isinstance(values[0], ast.Constant) and values[0].value == "git":
                    if path != ROOT / "Backend" / "app" / "git_module.py":
                        offenders.append(str(path.relative_to(ROOT)))
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
