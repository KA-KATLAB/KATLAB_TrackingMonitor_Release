"""Isolated tests for the hardened Chronicle generator entry surface."""

import hashlib
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "Scripts" / "Chronicle" / "generate.py"
PAGES = ROOT / "Scripts" / "Chronicle" / "pages.py"
VIEW_BAT = ROOT / "Scripts" / "Chronicle" / "view.bat"
GENERATE_BAT = ROOT / "Scripts" / "Chronicle" / "generate.bat"


class ChronicleGenerationTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.script_dir = self.root / "Scripts" / "Chronicle"
        self.script_dir.mkdir(parents=True)
        self.copy = self.script_dir / "generate.py"
        shutil.copyfile(GENERATOR, self.copy)
        (self.script_dir / "pages.py").write_text("", encoding="ascii")
        (self.script_dir / "safe_io.py").write_text("", encoding="ascii")

    def tearDown (self) -> None:
        self.temp.cleanup()

    def load_copy (self):
        # Give the source its real package context so generate/runtime/safe_io
        # share one module identity.  The copied executable remains reserved for
        # the pre-import invalid-CLI subprocess test below.
        name = f"Scripts.Chronicle._generation_test_{id(self)}_{time.time_ns()}"
        spec = importlib.util.spec_from_file_location(name, GENERATOR)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_cli_accepts_only_the_six_exact_modes (self) -> None:
        module = self.load_copy()
        accepted = {
            (): ("once", None, False),
            ("--build",): ("once", None, True),
            ("--loop", "10"): ("loop", 10.0, False),
            ("--loop", "60", "--build"): ("loop", 60.0, True),
            ("--view",): ("view", None, False),
            ("--verify",): ("verify", None, False),
        }
        for argv, expected in accepted.items():
            with self.subTest(argv=argv):
                self.assertEqual(module.parse_cli(list(argv)), expected)

    def test_package_imports_share_safe_io_and_runtime_module_identity (self) -> None:
        from Scripts.Chronicle import generate, runtime, safe_io

        self.assertIs(generate.safe_io, safe_io)
        self.assertIs(generate.runtime, runtime)
        self.assertIs(runtime.safe_io, safe_io)

    def test_cli_rejects_malformed_mixed_and_out_of_range_modes (self) -> None:
        module = self.load_copy()
        invalid = [
            ["--loop"], ["--loop", "9.999"], ["--loop", "3600.1"],
            ["--loop", ".5"], ["--loop", "10."], ["--loop", "1e2"],
            ["--loop", "NaN"], ["--loop", "inf"], ["--loop", "１0"],
            ["--build", "--loop", "60"], ["--loop", "60", "--verify"],
            ["--verify", "--build"], ["--view", "--build"],
            ["--build", "--build"], ["--unknown"], ["extra"],
        ]
        for argv in invalid:
            with self.subTest(argv=argv):
                self.assertIsNone(module.parse_cli(argv))

    def test_mutating_modes_fail_before_root_or_transport_fallback (self) -> None:
        module = self.load_copy()

        class PrerequisiteError(RuntimeError):
            pass

        touched: list[str] = []

        def unavailable ():
            touched.append("gate")
            raise PrerequisiteError("Chronicle runtime unavailable")

        module.runtime = SimpleNamespace(
            ensure_production_mode=unavailable,
            require_current_chronicle_python=lambda: touched.append("python"),
        )
        module.safe_io = SimpleNamespace(
            PrerequisiteError=PrerequisiteError, SafeIOError=RuntimeError,
            bind_root=lambda *_args, **_kwargs: touched.append("root"),
        )
        for argv in ([], ["--build"], ["--loop", "60"],
                     ["--loop", "60", "--build"], ["--view"], ["--verify"]):
            touched.clear()
            with self.subTest(argv=argv):
                self.assertEqual(module.main(argv), 1)
                self.assertNotIn("root", touched)
                self.assertEqual(touched, ["gate"])

    def test_missing_mkdocs_dependency_aborts_before_runtime_root (self) -> None:
        module = self.load_copy()
        touched = []
        prerequisite = type("PrerequisiteError", (RuntimeError,), {})
        interpreter = object()
        module.runtime = SimpleNamespace(
            ensure_production_mode=lambda: touched.append("gate"),
            require_current_chronicle_python=lambda: (
                touched.append("select") or interpreter),
            probe_chronicle_python=lambda selected: (
                touched.append("probe") or (_ for _ in ()).throw(
                    prerequisite("dependencies unavailable"))),
        )
        module.safe_io = SimpleNamespace(
            PrerequisiteError=prerequisite, SafeIOError=RuntimeError,
            bind_root=lambda *_args, **_kwargs: touched.append("root"),
        )
        self.assertEqual(module.main(["--build"]), 1)
        self.assertEqual(touched, ["gate", "select", "probe"])

    def test_build_rechecks_bound_interpreter_before_candidate_mutation (self) -> None:
        module = self.load_copy()
        touched = []
        prerequisite = type("PrerequisiteError", (RuntimeError,), {})

        class Root:
            path = self.root

            def ensure_directory (self, _relative):
                touched.append("candidate")

        class DriftingInterpreter:
            def argv (self, *_arguments):
                touched.append("recheck")
                raise prerequisite("interpreter changed")

        with self.assertRaises(prerequisite):
            module.build_site(Root(), DriftingInterpreter())
        self.assertEqual(touched, ["recheck"])

    def test_invalid_cli_exits_before_repository_import (self) -> None:
        marker = self.root / "pages-imported"
        (self.script_dir / "pages.py").write_text(
            f"from pathlib import Path\nPath({str(marker)!r}).write_text('bad')\n",
            encoding="ascii",
        )
        result = subprocess.run(
            [sys.executable, "-B", str(self.copy), "--verify", "--build"],
            cwd=self.root,
            capture_output=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(
            result.stderr.decode("ascii").replace("\r\n", "\n"),
            "Usage: generate.py [--build | --loop SECONDS [--build] | "
            "--view | --verify]\n",
        )
        self.assertFalse(marker.exists())

    def test_generated_css_uses_only_the_frozen_local_font_stacks (self) -> None:
        spec = importlib.util.spec_from_file_location("isolated_pages", PAGES)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        css = module.build_extra_css()
        self.assertEqual(
            css.count("--k-sans: 'Segoe UI', system-ui, sans-serif;"), 1,
        )
        self.assertEqual(
            css.count("--k-mono: Consolas, 'Courier New', monospace;"), 1,
        )
        lowered = css.casefold()
        self.assertNotIn("@import", lowered)
        self.assertNotIn("plus jakarta", lowered)
        self.assertNotIn("azeret", lowered)
        self.assertNotIn("fonts.googleapis", lowered)
        self.assertNotIn("fonts.gstatic", lowered)

    def test_view_batch_routes_only_to_the_reviewed_view_cli (self) -> None:
        source = VIEW_BAT.read_text(encoding="ascii")
        lowered = source.casefold()
        self.assertNotIn("mkdocs", lowered)
        self.assertNotIn("start ", lowered)
        fake = self.root / "python.cmd"
        fake.write_text("@echo off\necho PYTHON:%*\nexit /b 0\n", encoding="ascii")
        env = dict(os.environ)
        env["KATLAB_CHRONICLE_PYTHON"] = str(fake)
        result = subprocess.run(
            ["cmd.exe", "/d", "/c", "call", str(VIEW_BAT)],
            cwd=self.root,
            env=env,
            capture_output=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        output = result.stdout.decode("ascii").replace("\\", "/")
        self.assertIn("generate.py", output)
        self.assertTrue(output.rstrip().endswith("--view"))

    def test_generate_batch_preserves_no_argument_build_convenience (self) -> None:
        fake = self.root / "python.cmd"
        fake.write_text("@echo off\necho PYTHON:%*\nexit /b 0\n", encoding="ascii")
        env = dict(os.environ)
        env["KATLAB_CHRONICLE_PYTHON"] = str(fake)
        result = subprocess.run(
            ["cmd.exe", "/d", "/c", "call", str(GENERATE_BAT)],
            cwd=self.root, env=env, capture_output=True, timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        output = result.stdout.decode("ascii").replace("\\", "/")
        self.assertIn("generate.py", output)
        self.assertTrue(output.rstrip().endswith("--build"))
        invalid = subprocess.run(
            ["cmd.exe", "/d", "/c", "call", str(GENERATE_BAT), "extra"],
            cwd=self.root, env=env, capture_output=True, timeout=10,
            check=False,
        )
        self.assertEqual(invalid.returncode, 2)
        self.assertNotIn(b"PYTHON:", invalid.stdout)

    def test_batch_guards_precede_interpreter_execution (self) -> None:
        for launcher in (GENERATE_BAT, VIEW_BAT):
            with self.subTest(launcher=launcher.name, case="relative-python"):
                env = dict(os.environ)
                env.pop("KATLAB_TRACKER_CONFIG", None)
                env.pop("KATLAB_TRACKER_DEMO", None)
                env["KATLAB_CHRONICLE_PYTHON"] = "relative\\python.exe"
                result = subprocess.run(
                    ["cmd.exe", "/d", "/c", "call", str(launcher)],
                    cwd=self.root, env=env, capture_output=True, timeout=10,
                    check=False,
                )
                self.assertEqual(result.returncode, 1)
                self.assertIn(b"absolute path", result.stderr)
            with self.subTest(launcher=launcher.name, case="demo"):
                fake = self.root / f"{launcher.stem}-python.cmd"
                fake.write_text(
                    "@echo off\necho BAD-INTERPRETER-RAN\nexit /b 0\n",
                    encoding="ascii")
                env = dict(os.environ)
                env.pop("KATLAB_TRACKER_CONFIG", None)
                env["KATLAB_TRACKER_DEMO"] = "1"
                env["KATLAB_CHRONICLE_PYTHON"] = str(fake)
                result = subprocess.run(
                    ["cmd.exe", "/d", "/c", "call", str(launcher)],
                    cwd=self.root, env=env, capture_output=True, timeout=10,
                    check=False,
                )
                self.assertEqual(result.returncode, 1)
                self.assertNotIn(b"BAD-INTERPRETER-RAN", result.stdout)

    def test_source_snapshot_projects_agents_codex_info_and_diagrams (self) -> None:
        module = self.load_copy()
        module.safe_io = SimpleNamespace(SafeIOError=RuntimeError)
        entries = tuple(
            SimpleNamespace(relative_path=path, data=data)
            for path, data in [
                ("README.md", b"readme"),
                ("LICENSE", b"license"),
                ("AGENTS.md", b"agents"),
                ("Codex_Info/Repository_Guide.md", b"codex"),
                ("Claude_Info/Architecture_Notes.md", b"claude"),
                ("Docs/Guide.md", b"guide"),
                ("temp/Ref/architecture.mermaid", b"graph TD\n"),
            ]
        )
        mirror, diagrams = module.project_source_snapshot(
            SimpleNamespace(entries=entries),
        )
        self.assertEqual(diagrams, [("architecture.mermaid", "graph TD\n")])
        self.assertEqual(mirror["AGENTS.md"], b"agents")
        self.assertEqual(mirror["Codex_Info/Repository_Guide.md"], b"codex")
        docs_nav = module.build_docs_nav(mirror, bool(diagrams))
        self.assertIn(("AGENTS", "mirror/AGENTS.md"), docs_nav)
        self.assertIn(("Codex_Info", [
            ("Repository_Guide.md", "mirror/Codex_Info/Repository_Guide.md"),
        ]), docs_nav)

    def test_empty_diagram_sources_do_not_create_architecture_navigation (self) -> None:
        module = self.load_copy()
        module.safe_io = SimpleNamespace(SafeIOError=RuntimeError)
        entries = tuple(
            SimpleNamespace(relative_path=path, data=data)
            for path, data in [
                ("README.md", b"readme"), ("LICENSE", b"license"),
                ("AGENTS.md", b"agents"),
                ("temp/Ref/empty.mermaid", b" \r\n\t"),
            ]
        )
        mirror, diagrams = module.project_source_snapshot(
            SimpleNamespace(entries=entries))
        self.assertEqual(diagrams, [])
        self.assertNotIn(
            ("Architecture Diagrams", "architecture.md"),
            module.build_docs_nav(mirror, bool(diagrams)),
        )

    def test_colliding_plan_output_paths_fail_before_the_first_write (self) -> None:
        module = self.load_copy()
        module.capture_vendor_assets = lambda: {}
        module.safe_io = SimpleNamespace(
            SafeIOError=RuntimeError,
            inventory_runtime_tree=lambda *_args, **_kwargs: None,
            validate_runtime_relative=lambda value: value,
            project_markdown_runtime_relative=(
                lambda value: (value, value[:-3] + ".html")),
            project_mkdocs_runtime_relative=lambda value: (value, value),
        )
        tasks = [{
            "repo": "repo", "task_ref": ref, "plan_file": path,
        } for ref, path in (("T1", "a/b"), ("T2", "a__b"))]

        class Root:
            def write_if_changed (self, *_args, **_kwargs):
                raise AssertionError("write must not be reached")

        with self.assertRaisesRegex(RuntimeError, "collide"):
            module.build_and_write({"tasks": tasks}, {}, Root())

    def test_invalid_plan_output_path_fails_before_the_first_write (self) -> None:
        from Scripts.Chronicle import safe_io as native_safe_io

        module = self.load_copy()
        module.capture_vendor_assets = lambda: {}
        module.safe_io = SimpleNamespace(
            SafeIOError=native_safe_io.SafeIOError,
            inventory_runtime_tree=lambda *_args, **_kwargs: None,
            validate_runtime_relative=native_safe_io.validate_runtime_relative,
            project_markdown_runtime_relative=(
                native_safe_io.project_markdown_runtime_relative),
            project_mkdocs_runtime_relative=(
                native_safe_io.project_mkdocs_runtime_relative),
        )
        wrote = []

        class Root:
            def write_if_changed (self, *_args, **_kwargs):
                wrote.append(True)

        model = {"tasks": [{
            "repo": "repo", "task_ref": "T1", "plan_file": "con",
        }]}
        with self.assertRaises(native_safe_io.SafeIOError):
            module.build_and_write(model, {}, Root())
        self.assertEqual(wrote, [])

    def test_invalid_or_case_colliding_repo_changelogs_fail_before_first_write (self) -> None:
        from Scripts.Chronicle import safe_io as native_safe_io

        for repo_ids, message in (
                (["CON"], ""), (["A", "a"], "collide"),
                (["README", "index"], "destinations")):
            with self.subTest(repo_ids=repo_ids):
                module = self.load_copy()
                module.capture_vendor_assets = lambda: {}
                module.safe_io = SimpleNamespace(
                    SafeIOError=native_safe_io.SafeIOError,
                    inventory_runtime_tree=lambda *_args, **_kwargs: None,
                    validate_runtime_relative=(
                        native_safe_io.validate_runtime_relative),
                    project_markdown_runtime_relative=(
                        native_safe_io.project_markdown_runtime_relative),
                    project_mkdocs_runtime_relative=(
                        native_safe_io.project_mkdocs_runtime_relative),
                )
                wrote = []

                class Root:
                    def write_if_changed (self, *_args, **_kwargs):
                        wrote.append(True)

                model = {
                    "tasks": [],
                    "repos": [{"id": repo_id} for repo_id in repo_ids],
                    "day_triples": {}, "mirror": {}, "diagrams": [],
                }
                if message:
                    with self.assertRaisesRegex(
                            native_safe_io.SafeIOError, message):
                        module.build_and_write(model, {}, Root())
                else:
                    with self.assertRaises(native_safe_io.SafeIOError):
                        module.build_and_write(model, {}, Root())
                self.assertEqual(wrote, [])

    def test_all_markdown_html_destinations_are_preflighted_before_write (self) -> None:
        from Scripts.Chronicle import safe_io as native_safe_io

        long_stem = "P" * 251  # .md fits; the derived .html leaf does not.
        long_story = "release-" + "S" * 244 + ".md"
        cases = (
            ({"tasks": [{
                "repo": "repo", "task_ref": "T1", "plan_file": long_stem,
            }]}, None),
            ({"mirror": {f"Docs/{long_stem}.md": b"# long\n"}}, None),
            ({"mirror": {
                "Docs/README.md": b"# readme\n",
                "Docs/index.md": b"# index\n",
            }}, None),
            ({"mirror": {
                "Docs/a.md": b"# leaf\n",
                "Docs/a.html/b.md": b"# nested\n",
            }}, None),
            ({"mirror": {
                "Docs/.md": b"# dot\n",
                "Docs/.md.md": b"# dot extension\n",
            }}, None),
            ({}, SimpleNamespace(entries=(SimpleNamespace(
                relative_path=long_story, kind="file"),))),
            ({}, SimpleNamespace(entries=(
                SimpleNamespace(relative_path="README.md", kind="file"),
                SimpleNamespace(relative_path="release-one.md", kind="file"),
            ))),
            ({}, SimpleNamespace(entries=(
                SimpleNamespace(relative_path="index.html", kind="file"),
                SimpleNamespace(relative_path="release-one.md", kind="file"),
            ))),
            ({}, SimpleNamespace(entries=(
                SimpleNamespace(relative_path="release-one.md", kind="file"),
                SimpleNamespace(relative_path="release-one.markdown", kind="file"),
            ))),
        )
        for changes, story_inventory in cases:
            with self.subTest(changes=tuple(changes), story=story_inventory is not None):
                module = self.load_copy()
                module.capture_vendor_assets = lambda: {}
                module.safe_io = SimpleNamespace(
                    SafeIOError=native_safe_io.SafeIOError,
                    inventory_runtime_tree=(
                        lambda *_args, **_kwargs: story_inventory),
                    validate_runtime_relative=(
                        native_safe_io.validate_runtime_relative),
                    project_markdown_runtime_relative=(
                        native_safe_io.project_markdown_runtime_relative),
                    project_mkdocs_runtime_relative=(
                        native_safe_io.project_mkdocs_runtime_relative),
                )
                model = {
                    "repos": [], "tasks": [],
                    "stats_all": {"activity_calendar": []}, "stats_by": {},
                    "history_by": {}, "day_triples": {}, "day_events": {},
                    "mirror": {}, "diagrams": [],
                    "source_snapshot_digest": "0" * 64,
                    "origin": "http://127.0.0.1:8100",
                }
                model.update(changes)
                wrote = []

                class Root:
                    def write_if_changed (self, *_args, **_kwargs):
                        wrote.append(True)

                with self.assertRaises(native_safe_io.SafeIOError):
                    module.build_and_write(model, {}, Root())
                self.assertEqual(wrote, [])

    @unittest.skipUnless(sys.platform == "win32", "native generation is Windows-only")
    def test_repo_id_native_leaf_boundary_generates_and_strict_builds_through_250_only (self) -> None:
        from Scripts.Chronicle import safe_io as native_safe_io
        from Scripts.Chronicle import runtime as native_runtime

        module = self.load_copy()
        module.safe_io = native_safe_io
        module.capture_vendor_assets = lambda: {}
        global_python = shutil.which("python")
        self.assertIsNotNone(global_python)
        bound_python = native_safe_io.read_bound_file(
            global_python, max_bytes=native_runtime.EXECUTABLE_LIMIT)
        interpreter = native_runtime.BoundPython(
            global_python, bound_python.identity, bound_python.canonical_path)

        def model_for (repo_ids):
            repos = [{
                "id": repo_id, "name": repo_id, "offline": False,
                "clean": True, "count": 0, "branch": "main",
                "last_event_ts": None,
            } for repo_id in repo_ids]
            return {
                "repos": repos, "tasks": [],
                "stats_all": {"activity_calendar": []}, "stats_by": {},
                "history_by": {repo_id: ([], False) for repo_id in repo_ids},
                "day_triples": {}, "day_events": {},
                "mirror": {
                    "README.md": b"# Readme\n", "LICENSE": b"license\n",
                    "AGENTS.md": b"# Agents\n",
                },
                "diagrams": [], "source_snapshot_digest": "0" * 64,
                "origin": "http://127.0.0.1:8100",
            }

        supported = ["R" * 129, "S" * native_safe_io.CHRONICLE_REPO_ID_MAX]
        accepted_runtime = self.root / "rid-accepted"
        with native_safe_io.bind_root(accepted_runtime, create=True) as root:
            module.build_and_write(model_for(supported), {}, root)
            module.build_site(root, interpreter)
            for repo_id in supported:
                page = native_safe_io.read_existing_file(
                    root, f"docs/changelog/{repo_id}.md",
                    max_bytes=16_777_216)
                self.assertIsNotNone(page)
                rendered = native_safe_io.read_existing_file(
                    root, f"site/changelog/{repo_id}.html",
                    max_bytes=16_777_216)
                self.assertIsNotNone(rendered)

        rejected_runtime = self.root / "rid-rejected"
        with native_safe_io.bind_root(rejected_runtime, create=True) as root:
            with self.assertRaises(native_safe_io.SafeIOError):
                module.build_and_write(model_for([
                    "R" * (native_safe_io.CHRONICLE_REPO_ID_MAX + 1)
                ]), {}, root)
            self.assertIsNone(native_safe_io.inventory_runtime_tree(
                root, "docs", allow_missing=True))

    @unittest.skipUnless(sys.platform == "win32", "safe source capture is Windows-only")
    def test_safe_source_capture_feeds_the_exact_mirror_projection (self) -> None:
        from Scripts.Chronicle import safe_io as native_safe_io

        source_root = self.root / "source"
        for relative, data in {
            "README.md": b"readme\n",
            "LICENSE": b"license\n",
            "AGENTS.md": b"agents\n",
            "CLAUDE.md": b"excluded\n",
            "Claude_Info/Architecture.md": b"claude\n",
            "Codex_Info/Repository_Guide.md": b"codex\n",
            "Docs/Nested/Guide.md": b"guide\n",
            "temp/Ref/architecture.mermaid": b"graph TD\n",
        }.items():
            path = source_root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        snapshot = native_safe_io.capture_chronicle_sources(source_root)
        module = self.load_copy()
        module.safe_io = native_safe_io
        mirror, diagrams = module.project_source_snapshot(snapshot)
        self.assertNotIn("CLAUDE.md", mirror)
        self.assertEqual(mirror["AGENTS.md"], b"agents\n")
        self.assertEqual(
            mirror["Codex_Info/Repository_Guide.md"], b"codex\n",
        )
        self.assertEqual(diagrams, [("architecture.mermaid", "graph TD\n")])

    def test_vendor_selection_uses_only_safe_io_specs_and_validation (self) -> None:
        module = self.load_copy()
        observed: list[str] = []
        payloads = {"mermaid.js": b"mermaid", "bootswatch.css": b"source"}

        class Root:
            def __enter__ (self):
                return self

            def __exit__ (self, *_args):
                pass

        specs = {
            "fetch-mermaid": SimpleNamespace(name="mermaid.js", length=7),
            "fetch-bootswatch": SimpleNamespace(name="bootswatch.css", length=6),
        }

        def read_existing (_root, relative: str, *, max_bytes: int):
            observed.append(relative)
            data = payloads[Path(relative).name]
            self.assertEqual(len(data), max_bytes)
            return SimpleNamespace(data=data)

        module.safe_io = SimpleNamespace(
            bind_root=lambda *_args, **_kwargs: Root(),
            asset_spec=lambda token: specs[token],
            read_existing_file=read_existing,
            validate_asset=lambda _token, data: data,
            sanitize_bootswatch=lambda _data: b"sanitized",
            SafeIOError=RuntimeError,
        )
        self.assertEqual(module.capture_vendor_assets(), {
            "mermaid.js": b"mermaid",
            "bootswatch.css": b"sanitized",
        })
        self.assertEqual(observed, [
            "assets/vendor/mermaid.js", "assets/vendor/bootswatch.css",
        ])

    def test_fetch_model_uses_one_fresh_typed_runtime_session (self) -> None:
        module = self.load_copy()
        observed = []

        class Client:
            origin = "http://127.0.0.1:8100"

            def __enter__ (self):
                observed.append(("enter",))
                return self

            def __exit__ (self, *_args):
                observed.append(("exit",))

            def request (self, token, **kwargs):
                observed.append((token, kwargs))
                if token == "repos":
                    return [{"id": "repo"}]
                if token == "tasks":
                    return []
                if token == "stats" and kwargs.get("repo_id") == "repo":
                    return {"activity_calendar": [{
                        "day": "2026-09-14", "events": 1,
                        "commits": 0, "minutes": 2,
                    }]}
                if token == "stats":
                    return {"activity_calendar": []}
                if token in ("history", "events"):
                    return []
                raise AssertionError(token)

        snapshot = SimpleNamespace(entries=tuple(
            SimpleNamespace(relative_path=name, data=b"x")
            for name in ("README.md", "LICENSE", "AGENTS.md")
        ), snapshot_digest="d" * 64)
        module.safe_io = SimpleNamespace(
            capture_chronicle_sources=lambda _root: snapshot,
            inventory_runtime_tree=lambda *_args, **_kwargs: None,
            SafeIOError=RuntimeError,
        )
        module.runtime = SimpleNamespace(load_session=lambda _root: Client())
        model = module.fetch_model({}, object())
        self.assertEqual(model["origin"], Client.origin)
        self.assertEqual(model["day_triples"], {
            ("repo", "2026-09-14"): (1, 0, 2),
        })
        self.assertEqual([item[0] for item in observed], [
            "enter", "repos", "tasks", "stats", "stats", "history",
            "events", "exit",
        ])

    def test_run_once_does_not_restore_the_retired_scribe_timestamp (self) -> None:
        module = self.load_copy()
        model = {"day_triples": {}}
        module.fetch_model = lambda _cache, _root: model
        module.build_and_write = lambda _model, _cache, _root: (0, 0)
        result = module.run_once({}, object())
        self.assertNotIn("_fetched_at", result)
        self.assertEqual(result["_changed"], 0)

    def test_story_inventory_keeps_only_legacy_markdown_families (self) -> None:
        module = self.load_copy()
        inventory = SimpleNamespace(entries=tuple(
            SimpleNamespace(relative_path=name, kind=kind)
            for name, kind in [
                ("2026-09-14.md", "file"),
                ("week-2026-W37.md", "file"),
                ("release-TM-v0.3.0.3.md", "file"),
                ("week-trap.log", "file"),
                ("release-trap.tmp", "file"),
                ("nested/week-hidden.md", "file"),
                ("week-directory.md", "directory"),
                ("index.md", "file"),
            ]
        ))
        self.assertEqual(module.recognized_story_pages(inventory), [
            "2026-09-14.md",
            "release-TM-v0.3.0.3.md",
            "week-2026-W37.md",
        ])

    @unittest.skipUnless(sys.platform == "win32", "safe build transaction is Windows-only")
    def test_render_and_real_strict_mkdocs_build_preserve_site_on_failure (self) -> None:
        from Scripts.Chronicle import runtime as native_runtime
        from Scripts.Chronicle import safe_io as native_safe_io

        module = self.load_copy()
        module.safe_io = native_safe_io
        module.capture_vendor_assets = lambda: {}
        module.secrets = SimpleNamespace(token_hex=lambda _length: "c" * 32)
        global_python = shutil.which("python")
        self.assertIsNotNone(global_python)
        bound_python = native_safe_io.read_bound_file(
            global_python, max_bytes=native_runtime.EXECUTABLE_LIMIT)
        interpreter = native_runtime.BoundPython(
            global_python, bound_python.identity, bound_python.canonical_path)
        runtime_path = self.root / "runtime"
        model = {
            "repos": [{
                "id": "repo", "name": "Repo", "offline": False,
                "clean": True, "count": 0, "branch": "main",
                "last_event_ts": None,
            }],
            "tasks": [],
            "stats_all": {"activity_calendar": []},
            "stats_by": {},
            "history_by": {"repo": ([], False)},
            "day_triples": {}, "day_events": {},
            "mirror": {
                "README.md": b"# Readme\n", "LICENSE": b"license\n",
                "AGENTS.md": b"# Agents\n",
            },
            "diagrams": [], "source_snapshot_digest": "0" * 64,
            "origin": "http://127.0.0.1:8100",
        }
        with native_safe_io.bind_root(runtime_path, create=True) as root:
            written, _removed = module.build_and_write(model, {}, root)
            self.assertGreater(written, 0)
            module.build_site(root, interpreter)
            prior = native_safe_io.read_existing_file(
                root, "site/index.html", max_bytes=16_777_216)
            self.assertIsNotNone(prior)
            root.write_if_changed("mkdocs.yml", b"not: [valid\n")
            with self.assertRaisesRegex(
                    native_safe_io.SafeIOError, "strict build failed") as raised:
                module.build_site(root, interpreter)
            self.assertLessEqual(len(str(raised.exception)), 2_200)
            self.assertIn("config", str(raised.exception).casefold())
            after = native_safe_io.read_existing_file(
                root, "site/index.html", max_bytes=16_777_216)
            self.assertIsNotNone(after)
            self.assertEqual(after.data, prior.data)
            self.assertIsNone(native_safe_io.inventory_runtime_tree(
                root, "site.candidate." + "c" * 32, allow_missing=True))
            self.assertIsNone(native_safe_io.inventory_runtime_tree(
                root, "site.backup." + "c" * 32, allow_missing=True))

    @unittest.skipUnless(sys.platform == "win32", "safe build transaction is Windows-only")
    def test_empty_repositories_omit_changelog_and_strict_build (self) -> None:
        from Scripts.Chronicle import runtime as native_runtime
        from Scripts.Chronicle import safe_io as native_safe_io

        module = self.load_copy()
        module.safe_io = native_safe_io
        module.capture_vendor_assets = lambda: {}
        module.secrets = SimpleNamespace(token_hex=lambda _length: "e" * 32)
        global_python = shutil.which("python")
        self.assertIsNotNone(global_python)
        bound_python = native_safe_io.read_bound_file(
            global_python, max_bytes=native_runtime.EXECUTABLE_LIMIT)
        interpreter = native_runtime.BoundPython(
            global_python, bound_python.identity, bound_python.canonical_path)
        model = {
            "repos": [], "tasks": [],
            "stats_all": {"activity_calendar": []},
            "stats_by": {}, "history_by": {},
            "day_triples": {}, "day_events": {},
            "mirror": {
                "README.md": b"# Readme\n", "LICENSE": b"license\n",
                "AGENTS.md": b"# Agents\n",
            },
            "diagrams": [], "source_snapshot_digest": "0" * 64,
            "origin": "http://127.0.0.1:8100",
        }
        runtime_path = self.root / "empty-runtime"
        with native_safe_io.bind_root(runtime_path, create=True) as root:
            module.build_and_write(model, {}, root)
            config = native_safe_io.read_existing_file(
                root, "mkdocs.yml", max_bytes=16_777_216)
            self.assertIsNotNone(config)
            self.assertNotIn(b"Changelog", config.data)
            module.build_site(root, interpreter)
            index = native_safe_io.read_existing_file(
                root, "site/index.html", max_bytes=16_777_216)
            self.assertIsNotNone(index)
            self.assertGreater(len(index.data), 0)

    def test_build_dirty_latch_retries_unchanged_and_is_pending_after_reload (self) -> None:
        module = self.load_copy()
        calls = []
        module.safe_io = SimpleNamespace(
            read_existing_file=lambda *_args, **_kwargs: SimpleNamespace(data=b"old"),
        )

        interpreter = object()

        def fail_then_succeed (_root, selected):
            self.assertIs(selected, interpreter)
            calls.append("build")
            if len(calls) == 1:
                raise RuntimeError("failed")

        module.build_site = fail_then_succeed
        module._build_pending = True
        with self.assertRaisesRegex(RuntimeError, "failed"):
            module.build_if_needed({"_changed": 1}, object(), interpreter)
        module.build_if_needed({"_changed": 0}, object(), interpreter)
        module.build_if_needed({"_changed": 0}, object(), interpreter)
        self.assertEqual(calls, ["build", "build"])

        restarted = self.load_copy()
        restarted.safe_io = module.safe_io
        restarted_calls = []
        restarted.build_site = lambda _root, selected: (
            self.assertIs(selected, interpreter), restarted_calls.append("build"))
        restarted.build_if_needed({"_changed": 0}, object(), interpreter)
        self.assertEqual(restarted_calls, ["build"])

    def test_failed_promotion_restore_preserves_the_only_prior_backup (self) -> None:
        module = self.load_copy()
        nonce = "d" * 32
        candidate = "site.candidate." + nonce
        backup = "site.backup." + nonce
        state = {"site": b"old-site"}
        removed = []

        class Root:
            path = self.root

            def ensure_directory (self, relative):
                state[relative] = b"candidate"

            def swap_directories (self, new, target, old):
                state[old] = state.pop(target)
                if new != candidate:
                    raise AssertionError("unexpected candidate")
                raise RuntimeError("promotion and restore failed")

        module.secrets = SimpleNamespace(token_hex=lambda _length: nonce)
        interpreter = SimpleNamespace(argv=lambda *_args: [sys.executable])
        module._run_mkdocs = lambda *_args: (0, "")
        module.safe_io = SimpleNamespace(
            SafeIOError=RuntimeError,
            inventory_runtime_tree=lambda _root, relative, **_kwargs: (
                SimpleNamespace(entries=()) if relative in state else None),
            remove_runtime_tree=lambda _root, relative, **_kwargs: (
                removed.append(relative), state.pop(relative, None)),
        )
        module._validate_candidate = lambda *_args: None
        with self.assertRaisesRegex(RuntimeError, "prior site preserved") as raised:
            module.build_site(Root(), interpreter)
        self.assertIn(backup, str(raised.exception))
        self.assertEqual(state[backup], b"old-site")
        self.assertEqual(state[candidate], b"candidate")
        self.assertNotIn("site", state)
        self.assertEqual(removed, [])

    def test_offline_view_rejects_old_cdn_config_even_when_assets_are_present (self) -> None:
        module = self.load_copy()
        mermaid = b"mermaid"
        bootswatch = b"bootswatch"
        specs = {
            "fetch-mermaid": SimpleNamespace(name="mermaid.js", length=len(mermaid)),
            "fetch-bootswatch": SimpleNamespace(name="bootswatch.css", length=20),
        }
        files = {
            "docs/assets/vendor/mermaid.js": mermaid,
            "docs/assets/vendor/bootswatch.css": bootswatch,
        }

        def read (_root, relative, *, max_bytes):
            del max_bytes
            data = files.get(relative)
            return None if data is None else SimpleNamespace(data=data)

        module.safe_io = SimpleNamespace(
            SafeIOError=RuntimeError,
            asset_spec=lambda token: specs[token],
            read_existing_file=read,
            validate_asset=lambda token, data: (
                data if token == "fetch-mermaid" and data == mermaid
                else (_ for _ in ()).throw(RuntimeError("bad asset"))
            ),
            BOOTSWATCH_LOCAL_LENGTH=len(bootswatch),
            BOOTSWATCH_LOCAL_SHA256=hashlib.sha256(bootswatch).hexdigest(),
            normalize_tracker_origin=lambda value: SimpleNamespace(url=value),
        )
        files["mkdocs.yml"] = module.pages.build_mkdocs_yml(
            [], "https://cdn.example/mermaid.js",
            "https://cdn.example/bootswatch.css",
            "http://127.0.0.1:8100/chronicle/",
        ).encode("utf-8")
        with self.assertRaisesRegex(RuntimeError, "exact local assets"):
            module._offline_view_url(object())

        files["mkdocs.yml"] = module.pages.build_mkdocs_yml(
            [], "assets/vendor/mermaid.js", "assets/vendor/bootswatch.css",
            "http://127.0.0.1:8100/chronicle/",
        ).encode("utf-8")
        self.assertEqual(
            module._offline_view_url(object()),
            "http://127.0.0.1:8100/chronicle/",
        )

        local_config = files["mkdocs.yml"].decode("utf-8")
        files["mkdocs.yml"] = local_config.replace(
            "extra_javascript:\n",
            "extra_javascript:\n  - '//cdn.example/rogue.js'\n",
        ).encode("utf-8")
        with self.assertRaisesRegex(RuntimeError, "remote UI dependency"):
            module._offline_view_url(object())

    def test_view_never_opens_browser_after_build_failure (self) -> None:
        module = self.load_copy()

        class Capability:
            def __enter__ (self):
                return self

            def __exit__ (self, *_args):
                return None

            def heartbeat (self):
                return None

        class Client(Capability):
            origin = "http://127.0.0.1:8100"

            def tracker_alive (self):
                return True

        module.runtime = SimpleNamespace(
            ensure_production_mode=lambda: None,
            require_current_chronicle_python=lambda: object(),
            probe_chronicle_python=lambda _interpreter: None,
            load_session=lambda _root: Client(),
        )
        module.safe_io = SimpleNamespace(
            SafeIOError=RuntimeError,
            PrerequisiteError=type("PrerequisiteError", (RuntimeError,), {}),
            TransportUnavailable=type(
                "TransportUnavailable", (RuntimeError,), {}),
            LeaseBusy=type("LeaseBusy", (RuntimeError,), {}),
            LeaseResidue=type("LeaseResidue", (RuntimeError,), {}),
            bind_root=lambda *_args, **_kwargs: Capability(),
        )
        module._acquire_with_retry = lambda *_args, **_kwargs: Capability()
        module._offline_view_url = lambda _root: "http://127.0.0.1:8100/chronicle/"
        module.build_site = lambda _root, _interpreter: (_ for _ in ()).throw(
            RuntimeError("build failed"))
        opener = mock.Mock(return_value=True)
        module.webbrowser = SimpleNamespace(open=opener)
        self.assertEqual(module.main(["--view"]), 1)
        opener.assert_not_called()

    def test_view_requires_current_live_capability_origin_through_browser_open (self) -> None:
        scenarios = (
            ("missing-capability", "missing", "http://127.0.0.1:8100", [], 0, 0),
            ("dead-capability", None, "http://127.0.0.1:8100", [False], 0, 0),
            ("stale-origin", None, "http://127.0.0.1:8101", [True], 0, 0),
            ("death-during-build", None, "http://127.0.0.1:8100",
             [True, False], 1, 0),
            ("positive", None, "http://127.0.0.1:8100", [True, True], 1, 1),
        )
        for (name, load_failure, origin, liveness,
             expected_builds, expected_opens) in scenarios:
            with self.subTest(name=name):
                module = self.load_copy()
                events = []
                transport_error = type(
                    "TransportUnavailable", (RuntimeError,), {})

                class Context:
                    def __enter__ (self):
                        return self

                    def __exit__ (self, *_args):
                        return None

                    def heartbeat (self):
                        events.append("heartbeat")

                class Client(Context):
                    def __init__ (self):
                        self.origin = origin
                        self._liveness = iter(liveness)

                    def tracker_alive (self):
                        value = next(self._liveness)
                        events.append(f"live:{value}")
                        return value

                def load_session (_root):
                    events.append("load-session")
                    if load_failure:
                        raise transport_error("capability unavailable")
                    return Client()

                interpreter = object()
                module._require_mutating_runtime = lambda: (
                    events.append("runtime") or interpreter)
                module.runtime = SimpleNamespace(load_session=load_session)
                module.safe_io = SimpleNamespace(
                    SafeIOError=RuntimeError,
                    PrerequisiteError=type(
                        "PrerequisiteError", (RuntimeError,), {}),
                    TransportUnavailable=transport_error,
                    LeaseBusy=type("LeaseBusy", (RuntimeError,), {}),
                    LeaseResidue=type("LeaseResidue", (RuntimeError,), {}),
                    bind_root=lambda *_args, **_kwargs: (
                        events.append("bind-root") or Context()),
                )
                module._acquire_with_retry = lambda *_args, **_kwargs: Context()
                module._offline_view_url = lambda _root: (
                    "http://127.0.0.1:8100/chronicle/")
                module.build_site = lambda _root, selected: (
                    self.assertIs(selected, interpreter), events.append("build"))
                opener = mock.Mock(return_value=True)
                module.webbrowser = SimpleNamespace(open=opener)

                expected_exit = 0 if name == "positive" else 1
                self.assertEqual(module.main(["--view"]), expected_exit)
                self.assertEqual(events.count("build"), expected_builds)
                self.assertEqual(opener.call_count, expected_opens)
                if expected_opens:
                    self.assertEqual(events[-1], "live:True")
                    opener.assert_called_once_with(
                        "http://127.0.0.1:8100/chronicle/", new=2)

    @unittest.skipUnless(sys.platform == "win32", "safe runtime I/O is Windows-only")
    def test_verify_uses_retained_inventory_and_bounded_index_read (self) -> None:
        from Scripts.Chronicle import safe_io as native_safe_io

        module = self.load_copy()
        runtime = self.root / "Chronicle" / "runtime"
        with native_safe_io.bind_root(runtime, create=True) as root:
            root.write_if_changed(
                "docs/devlog/index.md", b"[2026-09-14](2026-09-14.md)\n",
            )
            root.write_if_changed("docs/devlog/2026-09-14.md", b"# day\n")
        module.safe_io = native_safe_io
        module.RUNTIME = runtime
        self.assertEqual(module.verify(), 0)
        with native_safe_io.bind_root(runtime) as root:
            root.write_if_changed("docs/devlog/2026-09-13.md", b"# stale\n")
        self.assertEqual(module.verify(), 1)

    def test_one_shot_and_loop_use_the_independent_lease_lifetimes (self) -> None:
        module = self.load_copy()
        events: list[str] = []

        class Capability:
            def __init__ (self, name: str):
                self.name = name

            def __enter__ (self):
                events.append(f"enter:{self.name}")
                return self

            def __exit__ (self, *_args):
                events.append(f"exit:{self.name}")

            def heartbeat (self):
                events.append(f"heartbeat:{self.name}")

        root = Capability("root")

        def acquire (_root, kind: str):
            events.append(f"acquire:{kind}")
            return Capability(kind)

        module.safe_io = SimpleNamespace(
            bind_root=lambda *_args, **_kwargs: root,
            acquire_chronicle_lease=acquire,
            LeaseBusy=type("LeaseBusy", (Exception,), {}),
            LeaseResidue=type("LeaseResidue", (Exception,), {}),
        )
        interpreter = object()
        module._require_mutating_runtime = lambda: (
            events.append("select") or interpreter)
        module.run_once = lambda _cache, _root: (
            events.append("run") or {"_changed": 1}
        )
        module.build_if_needed = lambda _model, _root, selected: (
            self.assertIs(selected, interpreter), events.append("build"))
        self.assertEqual(module._run_one_shot(True), 0)
        self.assertEqual(events, [
            "select", "enter:root", "acquire:writer", "enter:writer",
            "heartbeat:writer", "run", "build", "heartbeat:writer",
            "exit:writer", "exit:root",
        ])

        events.clear()
        module.port_alive = lambda _port: False
        self.assertEqual(module.loop(60, dark_exit=1, do_build=True), 0)
        self.assertEqual(events, [
            "select", "enter:root", "acquire:loop", "enter:loop", "heartbeat:loop",
            "acquire:writer", "enter:writer", "heartbeat:writer", "run",
            "heartbeat:writer", "build", "heartbeat:writer", "exit:writer",
            "heartbeat:loop", "exit:loop", "exit:root",
        ])


if __name__ == "__main__":
    unittest.main()
