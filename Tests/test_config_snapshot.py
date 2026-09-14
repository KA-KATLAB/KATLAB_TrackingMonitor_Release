"""Focused immutable, single-acquisition configuration snapshot tests."""

import hashlib
import json
import os
import tempfile
import unittest
from dataclasses import FrozenInstanceError
from pathlib import Path
from types import MappingProxyType
from unittest.mock import patch

from Backend.app import config as config_module
from Backend.app.config import (
    AppConfig,
    CheckDefinition,
    ConfigAuthoringError,
    ConfigSnapshot,
    RepoConfig,
    ServerConfig,
    load_config,
    load_config_snapshot,
)


class ConfigSnapshotTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        (self.repo / ".git").mkdir(parents=True)
        self.runtime = self.root / "runtime"
        self.config_path = self.root / "repos.yaml"
        self.checks_path = self.root / "checks.json"
        self.checks_path.write_text(json.dumps({
            "schema_version": 1,
            "checks": [{
                "id": "backend-test",
                "label": "Backend test",
                "repo_ids": ["Repo_A"],
                "cwd": ".",
                "commands": ["python -m unittest"],
                "accepted_exit_codes": [0],
                "evidence_sources": ["hook", "manual"],
            }],
        }), encoding="utf-8")
        self.raw = self._write_config("127.0.0.1")
        self.old_activity = os.environ.get(config_module.ACTIVITY_DIR_ENV)
        os.environ[config_module.ACTIVITY_DIR_ENV] = str(self.runtime)

    def tearDown (self) -> None:
        if self.old_activity is None:
            os.environ.pop(config_module.ACTIVITY_DIR_ENV, None)
        else:
            os.environ[config_module.ACTIVITY_DIR_ENV] = self.old_activity
        self.temp.cleanup()

    def _write_config (self, host: str) -> bytes:
        raw = (
            "server:\n"
            f"  host: {host}\n"
            "  port: 8100\n"
            "  status_poll_seconds: 30\n"
            "repos:\n"
            "  - id: Repo_A\n"
            "    name: Repo A\n"
            f"    path: '{self.repo}'\n"
            "    plan_globs:\n"
            "      - 'temp/Plan/PLAN_*.txt'\n"
        ).encode("utf-8")
        self.config_path.write_bytes(raw)
        return raw

    def test_snapshot_is_native_bound_exact_and_single_acquisition (self) -> None:
        from Scripts.Chronicle import safe_io

        with patch.object(
                safe_io, "read_bound_file", wraps=safe_io.read_bound_file) as acquire:
            snapshot = load_config_snapshot(self.config_path)

        self.assertIsInstance(snapshot, ConfigSnapshot)
        acquire.assert_called_once_with(
            self.config_path, max_bytes=config_module.CONFIG_MAX_BYTES,
        )
        self.assertEqual(snapshot.content_sha256, hashlib.sha256(self.raw).hexdigest())
        self.assertRegex(snapshot.file_identity.volume_serial, r"^[0-9a-f]{16}$")
        self.assertRegex(snapshot.file_identity.file_id, r"^[0-9a-f]{32}$")
        self.assertRegex(
            snapshot.file_identity.canonical_path_digest, r"^[0-9a-f]{64}$",
        )
        self.assertTrue(snapshot.canonical_path.startswith("\\\\?\\Volume{"))
        self.assertFalse(snapshot.canonical_path.endswith("\\"))
        encoded_path = snapshot.canonical_path.encode("utf-16le", errors="strict")
        expected_path_digest = hashlib.sha256(
            b"KATLAB-WINDOWS-CANONICAL-PATH-v1\x00"
            + len(encoded_path).to_bytes(4, "big") + encoded_path
        ).hexdigest()
        self.assertEqual(
            snapshot.file_identity.canonical_path_digest, expected_path_digest,
        )

    def test_snapshot_and_nested_configuration_are_immutable (self) -> None:
        snapshot = load_config_snapshot(self.config_path)
        config = snapshot.config
        self.assertIsInstance(config.repos, tuple)
        self.assertIsInstance(config.repos[0].plan_globs, tuple)
        self.assertIsInstance(config.checks, tuple)
        self.assertIsInstance(config.checks_by_id, MappingProxyType)
        self.assertIsInstance(config.checks[0].repo_ids, tuple)
        self.assertIsInstance(config.checks[0].commands, tuple)
        self.assertIsInstance(config.checks[0].accepted_exit_codes, tuple)
        self.assertIsInstance(config.checks[0].evidence_sources, tuple)
        with self.assertRaises(FrozenInstanceError):
            config.server.port = 9000
        with self.assertRaises(FrozenInstanceError):
            config.repos[0].offline = True
        with self.assertRaises(TypeError):
            config.checks_by_id["extra"] = config.checks[0]

    def test_demo_status_is_recursively_detached_and_immutable (self) -> None:
        source = {
            "clean": False,
            "count": 1,
            "branch": "demo",
            "dirty_paths": ["src/a.py"],
        }
        plan_globs = ["temp/Plan/PLAN_*.txt"]
        repo = RepoConfig(
            "Demo", "Demo", self.repo, demo_status=source,
            plan_globs=plan_globs,
        )
        repos = [repo]
        app = AppConfig(ServerConfig(), repos, self.runtime)
        source["dirty_paths"].append("src/b.py")
        plan_globs.append("Docs/**/*.md")
        repos.clear()
        self.assertIsInstance(app.repos, tuple)
        self.assertEqual(app.repos[0].plan_globs, ("temp/Plan/PLAN_*.txt",))
        self.assertIsInstance(app.repos[0].demo_status, MappingProxyType)
        self.assertEqual(app.repos[0].demo_status["dirty_paths"], ("src/a.py",))
        with self.assertRaises(TypeError):
            app.repos[0].demo_status["count"] = 2

    def test_direct_callers_cannot_retain_mutable_check_or_demo_values (self) -> None:
        repo_ids = ["Repo_A"]
        commands = ["python -m unittest"]
        exits = [0]
        sources = ["manual"]
        check = CheckDefinition(
            "backend-test", "Backend test", repo_ids, ".", commands,
            exits, sources, "0" * 64,
        )
        repo_ids.append("Repo_B")
        commands.append("python other.py")
        exits.append(1)
        sources.append("hook")
        self.assertEqual(check.repo_ids, ("Repo_A",))
        self.assertEqual(check.commands, ("python -m unittest",))
        self.assertEqual(check.accepted_exit_codes, (0,))
        self.assertEqual(check.evidence_sources, ("manual",))

        cyclic = {}
        cyclic["nested"] = cyclic
        for value in ({"nested": {"bad"}}, {"nested": object()}, cyclic):
            with self.subTest(value=type(value["nested"]).__name__):
                with self.assertRaises(ConfigAuthoringError):
                    RepoConfig("Bad", "Bad", self.repo, demo_status=value)

    def test_direct_constructors_reject_wrong_or_nested_mutable_fields (self) -> None:
        valid_repo = RepoConfig("Repo_A", "Repo A", self.repo)
        valid_check = CheckDefinition(
            "backend-test", "Backend test", ("Repo_A",), ".",
            ("python -m unittest",), (0,), ("manual",), "0" * 64,
        )
        invalid = (
            lambda: RepoConfig("Bad", "Bad", self.repo, plan_globs=[["nested"]]),
            lambda: RepoConfig("Bad", "Bad", self.repo, demo_status=[]),
            lambda: RepoConfig("Bad", "Bad", self.repo, offline=1),
            lambda: ServerConfig(host=[]),
            lambda: ServerConfig(port=True),
            lambda: CheckDefinition(
                "bad", "Bad", ("Repo_A",), ".", [["nested"]],
                (0,), ("manual",), "0" * 64,
            ),
            lambda: CheckDefinition(
                "bad", "Bad", ("Repo_A",), ".", ("command",),
                (True,), ("manual",), "0" * 64,
            ),
            lambda: AppConfig(ServerConfig(), [{}], self.runtime),
            lambda: AppConfig(ServerConfig(), (valid_repo,), [], (valid_check,)),
        )
        for construct in invalid:
            with self.subTest(construct=construct):
                with self.assertRaises(ConfigAuthoringError):
                    construct()

        snapshot = load_config_snapshot(self.config_path)
        with self.assertRaises(ConfigAuthoringError):
            ConfigSnapshot(
                {}, snapshot.canonical_path, snapshot.file_identity,
                snapshot.content_sha256,
            )

    def test_later_path_change_cannot_change_loaded_snapshot (self) -> None:
        snapshot = load_config_snapshot(self.config_path)
        self._write_config("localhost")
        self.assertEqual(snapshot.config.server.host, "127.0.0.1")
        self.assertEqual(snapshot.content_sha256, hashlib.sha256(self.raw).hexdigest())
        current = load_config(self.config_path)
        self.assertIsInstance(current, AppConfig)
        self.assertEqual(current.server.host, "localhost")


if __name__ == "__main__":
    unittest.main()
