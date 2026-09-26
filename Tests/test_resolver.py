"""Hybrid-C attribution and bounded forecast matcher regression tests."""

import itertools
import unittest

from Backend.app.resolver import (
    GlobMatchStats,
    deterministic_glob_match,
    glob_to_regex,
    resolve,
)


def task (plan_file: str, task_id: str, status: str,
          patterns: list[str]) -> dict:
    return {
        "plan_file": plan_file,
        "task_id": task_id,
        "status": status,
        "files": patterns,
    }


class DeterministicGlobTests(unittest.TestCase):
    def test_exhaustive_short_pattern_and_path_parity (self) -> None:
        tokens = ("a", "é", "/", "\n", "*", "**", "**/", "?")
        paths = ["".join(parts) for width in range(5)
                 for parts in itertools.product(("a", "é", "/", "\n"), repeat=width)]
        patterns = ("".join(parts) for width in range(3)
                    for parts in itertools.product(tokens, repeat=width))
        for pattern in patterns:
            legacy = glob_to_regex(pattern)
            for path in paths:
                stats = GlobMatchStats()
                matched = deterministic_glob_match(pattern, path, stats)
                self.assertEqual(matched, bool(legacy.match(path)),
                                 (pattern, path))
                projected_cells = ((len(path.encode("utf-8")) + 1)
                                   * (len(pattern.encode("utf-8")) + 1))
                self.assertLessEqual(stats.state_visits, projected_cells)
                self.assertLessEqual(stats.peak_live_states,
                                     8 * (len(pattern) + 1))

    def test_unicode_newline_and_terminal_anchor_cases (self) -> None:
        cases = (
            ("src/**/test.py", "src/test.py"),
            ("src/**/test.py", "src/a/b/test.py"),
            ("src/**/test.py", "src/a\nb/test.py"),
            ("?/📈.py", "\n/📈.py"),
            ("**", "a\nb"),
            ("**", "a\n"),
            ("a", "a\n"),
            ("a", "a\n\n"),
            ("*a*a*a*a*a*z", "a" * 18),
            ("**/**/x", "a/b/x"),
            ("**/?", "\n"),
        )
        for pattern, path in cases:
            self.assertEqual(deterministic_glob_match(pattern, path),
                             bool(glob_to_regex(pattern).match(path)),
                             (pattern, path))

    def test_admitted_near_ten_million_cell_budget (self) -> None:
        path = "a" * 4095
        pattern = "*a" * 134 + "*z"
        pattern_count = 9
        projected_cells = ((len(path.encode("utf-8")) + 1)
                           * pattern_count * (len(pattern.encode("utf-8")) + 1))
        self.assertGreater(projected_cells, 9_900_000)
        self.assertLessEqual(projected_cells, 10_000_000)
        stats = GlobMatchStats()
        for _ in range(pattern_count):
            self.assertFalse(deterministic_glob_match(pattern, path, stats))
        self.assertLessEqual(stats.state_visits, projected_cells)
        self.assertLessEqual(stats.peak_live_states,
                             8 * (len(pattern) + 1))


class ResolutionTests(unittest.TestCase):
    def test_all_five_modes_and_relational_fields (self) -> None:
        one = task("temp/PLAN_A.txt", "A.1", "pending", ["src/*", "src/**"])
        two = task("temp/PLAN_B.txt", "B.1", "in-progress", ["src/*"])

        cases = (
            ("B", "src/x", [one], one, None),
            ("A_SCOPED", "src/x", [one, two], two, None),
            ("AMBIGUOUS", "src/x", [one, {**two, "status": "pending"}],
             None, [(one["plan_file"], one["task_id"]),
                    (two["plan_file"], two["task_id"])]),
            ("A_GLOBAL", "other/x", [one, two], two, None),
            ("UNKNOWN", "other/x", [one], None, None),
        )
        for mode, path, tasks, target, candidates in cases:
            for matcher in (None, deterministic_glob_match):
                outcome = resolve(path, tasks, matcher=matcher)
                self.assertEqual(outcome.mode, mode)
                self.assertEqual(outcome.candidate_keys, candidates)
                if target is None:
                    self.assertIsNone(outcome.task_ref)
                    self.assertIsNone(outcome.plan_file)
                    self.assertIsNone(outcome.task_id)
                else:
                    self.assertEqual(outcome.task_ref,
                                     f"{target['plan_file']} - {target['task_id']}")
                    self.assertEqual((outcome.plan_file, outcome.task_id),
                                     (target["plan_file"], target["task_id"]))
                if mode == "AMBIGUOUS":
                    self.assertEqual(len(outcome.candidates or []), 2)
                else:
                    self.assertIsNone(outcome.candidates)

    def test_ambiguous_display_collision_keeps_distinct_keys (self) -> None:
        first = task("temp/P - Q.txt", "A", "pending", ["src/*"])
        second = task("temp/P", "Q.txt - A", "pending", ["src/*"])
        result = resolve("src/x", [first, second],
                         matcher=deterministic_glob_match)
        self.assertEqual(result.mode, "AMBIGUOUS")
        self.assertEqual(result.candidates,
                         ["temp/P - Q.txt - A", "temp/P - Q.txt - A"])
        self.assertEqual(result.candidate_keys,
                         [("temp/P - Q.txt", "A"), ("temp/P", "Q.txt - A")])
        self.assertEqual(len(set(result.candidate_keys or [])), 2)

    def test_legacy_default_has_no_forecast_path_cap (self) -> None:
        path = "a" * 4097
        result = resolve(path, [task("temp/PLAN.txt", "A.1", "done", ["*"])])
        self.assertEqual(result.mode, "B")
        self.assertEqual(result.task_id, "A.1")


if __name__ == "__main__":
    unittest.main()
