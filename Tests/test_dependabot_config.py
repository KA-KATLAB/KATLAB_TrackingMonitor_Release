"""The reviewed security-only update configuration, not GitHub settings evidence."""

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]


class DependabotConfigurationTests(unittest.TestCase):
    def setUp (self):
        self.config = yaml.safe_load(
            (ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8"))

    def test_exact_ecosystems_match_existing_manifests (self):
        self.assertEqual(set(self.config), {"version", "updates"})
        self.assertIs(type(self.config["version"]), int)
        self.assertEqual(self.config["version"], 2)
        entries = self.config["updates"]
        self.assertEqual(len(entries), 3)
        self.assertEqual(
            [(entry["package-ecosystem"], entry["directory"]) for entry in entries],
            [("npm", "/Frontend"), ("pip", "/Backend"), ("pip", "/Scripts/Chronicle")],
        )
        for entry in entries:
            manifest = "package.json" if entry["package-ecosystem"] == "npm" else "requirements.txt"
            self.assertTrue((ROOT / entry["directory"].lstrip("/") / manifest).is_file())

    def test_only_security_updates_are_grouped_without_version_prs (self):
        expected_names = ("frontend-security", "backend-security", "chronicle-security")
        for entry, name in zip(self.config["updates"], expected_names):
            with self.subTest(directory=entry["directory"]):
                self.assertEqual(set(entry), {
                    "package-ecosystem", "directory", "schedule",
                    "open-pull-requests-limit", "groups",
                })
                self.assertEqual(entry["schedule"], {"interval": "weekly"})
                self.assertIs(type(entry["open-pull-requests-limit"]), int)
                self.assertEqual(entry["open-pull-requests-limit"], 0)
                self.assertEqual(entry["groups"], {
                    name: {"applies-to": "security-updates", "patterns": ["*"]},
                })


if __name__ == "__main__":
    unittest.main()
