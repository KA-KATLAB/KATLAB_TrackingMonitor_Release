"""Actual-file and isolated CLI checks for the frontend release identity gate."""

import contextlib
import io
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from Scripts import frontend_build as frontend


VERSION = "0.4.0.2"
ENTRY = "/assets/index-test.js"
CSS = "/assets/index-test.css"
MARKER = f'<meta name="katlab-ui-version" content="{VERSION}">'
MODULE = f'<script type="module" crossorigin src="{ENTRY}"></script>'
STYLE = f'<link rel="stylesheet" crossorigin href="{CSS}">'
HTML = (f'<!doctype html><html lang="en"><head>{MARKER}'
        '<meta charset="UTF-8"><meta name="viewport" content="width=device-width">'
        '<link rel="icon" href="/favicon.svg">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Font&amp;display=swap">'
        f'<title>KATLAB Tracking Monitor</title>{MODULE}{STYLE}</head>'
        '<body><div id="root"></div></body></html>')


def metadata_copy (original, **changes):
    fields = {name: getattr(original, name) for name in (
        "st_dev", "st_ino", "st_mode", "st_size", "st_mtime_ns")}
    fields["st_file_attributes"] = getattr(original, "st_file_attributes", 0)
    fields.update(changes)
    return SimpleNamespace(**fields)


class FrontendBuildTests(unittest.TestCase):
    def setUp (self):
        self.scratch = tempfile.TemporaryDirectory(prefix="katlab-ui-identity-")
        self.addCleanup(self.scratch.cleanup)
        self.repo = Path(self.scratch.name)
        self.dist = self.repo / "Frontend" / "dist"
        self.assets = self.dist / "assets"
        self.assets.mkdir(parents=True)
        self.index = self.dist / "index.html"
        self.index.write_text(HTML, encoding="utf-8")
        (self.assets / "index-test.js").write_text("export {};", encoding="utf-8")
        (self.assets / "index-test.css").write_text("body{}", encoding="utf-8")

    def validate (self, **kwargs):
        return frontend.validate_frontend(self.repo, VERSION, **kwargs)

    def assert_invalid_html (self, value):
        self.index.write_text(value, encoding="utf-8")
        for missing in (False, True):
            with self.subTest(allow_missing=missing):
                with self.assertRaises(frontend.FrontendBuildError):
                    self.validate(allow_missing=missing)

    def test_current_entry_with_external_fonts_and_local_css_is_accepted (self):
        self.assertTrue(self.validate())
        self.assertTrue(self.validate(allow_missing=True))

    def test_bom_crlf_void_slashes_and_nested_root_are_supported (self):
        body = HTML.replace('<meta charset="UTF-8">', '<meta charset="UTF-8" />')
        body = body.replace('<div id="root"></div>', '<div id="root"><span>Loading</span></div>')
        self.index.write_bytes(b"\xef\xbb\xbf" + body.replace(
            "><", ">\r\n<").encode("utf-8"))
        self.assertTrue(self.validate())

    def test_missing_index_only_succeeds_when_explicitly_allowed (self):
        self.index.unlink()
        self.assertFalse(self.validate(allow_missing=True))
        with self.assertRaises(frontend.FrontendBuildError):
            self.validate()

    def test_absent_dist_retains_first_run_but_missing_frontend_does_not (self):
        fresh = self.repo / "fresh"
        (fresh / "Frontend").mkdir(parents=True)
        self.assertFalse(frontend.validate_frontend(fresh, VERSION, allow_missing=True))
        with self.assertRaises(frontend.FrontendBuildError):
            frontend.validate_frontend(fresh, VERSION)
        empty = self.repo / "empty"
        empty.mkdir()
        with self.assertRaises(frontend.FrontendBuildError):
            frontend.validate_frontend(empty, VERSION, allow_missing=True)

    def test_non_directory_parent_never_counts_as_absence (self):
        for leaf in ("Frontend", "dist", "assets"):
            with self.subTest(leaf=leaf), tempfile.TemporaryDirectory() as scratch:
                repo = Path(scratch)
                path = repo
                for part in ("Frontend", "dist", "assets"):
                    path /= part
                    if part == leaf:
                        path.write_text("not a directory", encoding="utf-8")
                        break
                    path.mkdir()
                with self.assertRaises(frontend.FrontendBuildError):
                    frontend.validate_frontend(repo, VERSION, allow_missing=True)

    def test_reparse_ancestors_index_and_assets_are_rejected (self):
        original = Path.lstat
        for target in (self.repo / "Frontend", self.dist, self.assets, self.index,
                       self.assets / "index-test.js", self.assets / "index-test.css"):
            with self.subTest(target=target.name):
                def attributes (path, *args, **kwargs):
                    value = original(path, *args, **kwargs)
                    return metadata_copy(value, st_file_attributes=0x400) if path == target else value
                with patch.object(Path, "lstat", attributes):
                    with self.assertRaises(frontend.FrontendBuildError):
                        self.validate(allow_missing=True)

    def test_symlink_index_is_not_missing_even_if_dangling (self):
        original = Path.lstat
        def symbolic (path, *args, **kwargs):
            value = original(path, *args, **kwargs)
            return metadata_copy(value, st_mode=stat.S_IFLNK) if path == self.index else value
        with patch.object(Path, "lstat", symbolic):
            with self.assertRaises(frontend.FrontendBuildError):
                self.validate(allow_missing=True)

    def test_directory_index_and_denied_reads_fail_closed (self):
        self.index.unlink()
        self.index.mkdir()
        with self.assertRaises(frontend.FrontendBuildError):
            self.validate(allow_missing=True)
        self.index.rmdir()
        self.index.write_text(HTML, encoding="utf-8")
        with patch.object(Path, "open", side_effect=PermissionError("PRIVATE_FILE")):
            with self.assertRaises(frontend.FrontendBuildError) as raised:
                self.validate(allow_missing=True)
        self.assertNotIn("PRIVATE_FILE", str(raised.exception))

    def test_empty_oversized_invalid_utf8_and_nul_index_fail (self):
        for data in (b"", b" \n", b"x" * (frontend.MAX_INDEX_BYTES + 1),
                     b"\xff" + HTML.encode(), HTML.replace("Monitor", "Mon\0itor").encode()):
            with self.subTest(size=len(data)):
                self.index.write_bytes(data)
                with self.assertRaises(frontend.FrontendBuildError):
                    self.validate(allow_missing=True)

    def test_exact_bound_is_accepted_and_oversize_does_not_open (self):
        data = HTML.encode()
        self.index.write_bytes(data + b" " * (frontend.MAX_INDEX_BYTES - len(data)))
        self.assertTrue(self.validate())
        self.index.write_bytes(data + b" " * (frontend.MAX_INDEX_BYTES + 1 - len(data)))
        with patch.object(Path, "open") as opened:
            with self.assertRaises(frontend.FrontendBuildError):
                self.validate()
        opened.assert_not_called()

    def test_marker_requires_exact_ascii_expected_version (self):
        for value in ("0.4.0", "v0.4.0.2", "0.4.0.3", "٠.4.0.2", "0.4.0.2 "):
            with self.subTest(value=value):
                self.assert_invalid_html(HTML.replace(VERSION, value))
        self.index.write_text(HTML, encoding="utf-8")
        for expected in ("٠.4.0.2", "0.4.0.2\n", "v0.4.0.2", None):
            with self.subTest(expected=expected), self.assertRaises(frontend.FrontendBuildError):
                frontend.validate_frontend(self.repo, expected)

    def test_missing_duplicate_outside_head_and_nested_markers_fail (self):
        for document in (
            HTML.replace(MARKER, ""), HTML.replace(MARKER, MARKER * 2),
            HTML.replace(MARKER, "").replace("<body>", "<body>" + MARKER),
            HTML.replace(MARKER, "<template>" + MARKER + "</template>"),
        ):
            with self.subTest(document=document):
                self.assert_invalid_html(document)

    def test_duplicate_relevant_attributes_fail (self):
        for needle, replacement in (
            ('name="katlab-ui-version"', 'name="other" name="katlab-ui-version"'),
            (f'content="{VERSION}"', f'content="{VERSION}" CONTENT="{VERSION}"'),
            ('type="module"', 'type="module" type="module"'),
            (f'src="{ENTRY}"', f'src="{ENTRY}" src="{ENTRY}"'),
            (f'href="{CSS}"', f'href="{CSS}" href="{CSS}"'),
            ('id="root"', 'id="other" id="root"'),
        ):
            with self.subTest(needle=needle):
                self.assert_invalid_html(HTML.replace(needle, replacement))

    def test_missing_truncated_duplicate_and_unordered_structure_fail (self):
        for document in (
            HTML[:HTML.index("</head>")], HTML[:-7], HTML.replace("</body>", ""),
            HTML.replace("</div>", ""), HTML.replace('<div id="root"></div>', ""),
            HTML.replace('<div id="root"></div>', '<div id="root"/>'),
            HTML.replace('<div id="root"></div>', '<div id="root"></div>' * 2),
            HTML.replace("<head>", "<head><head>"),
            HTML.replace("</head><body>", "<body></head>"),
            HTML + '<div id="root"></div>', HTML.replace("<html", "stray<html", 1),
            HTML.replace('<div id="root">', '<span id="root">').replace("</div>", "</span>"),
        ):
            with self.subTest(document=document):
                self.assert_invalid_html(document)

    def test_entry_counts_and_inline_or_external_module_fail (self):
        for document in (
            HTML.replace(MODULE, ""), HTML.replace(MODULE, MODULE * 2),
            HTML.replace(MODULE, '<script type="module">export {}</script>'),
            HTML.replace(STYLE, ""), HTML.replace(STYLE, STYLE * 2),
            HTML.replace(ENTRY, "https://example.invalid/entry.js"),
        ):
            with self.subTest(document=document):
                self.assert_invalid_html(document)

    def test_inert_markup_cannot_supply_the_live_root_or_entry_assets (self):
        for container in ("template", "noscript", "textarea", "title", "select", "svg"):
            for entry in (MODULE, STYLE, '<div id="root"></div>'):
                with self.subTest(container=container, entry=entry):
                    self.assert_invalid_html(HTML.replace(
                        entry, f"<{container}>{entry}</{container}>"))

    def test_unsafe_entry_urls_never_become_file_paths (self):
        for source, extension in ((ENTRY, "js"), (CSS, "css")):
            for value in (f"assets/index.{extension}", f"/assets/../index.{extension}",
                          f"/assets/sub/index.{extension}", f"/assets/index.{extension}?v=1",
                          f"/assets/index.{extension}#x", f"/assets/%69ndex.{extension}",
                          f"/assets/..\\index.{extension}", f"//assets/index.{extension}",
                          f"/assets/индекс.{extension}", "/src/main.tsx"):
                with self.subTest(value=value):
                    self.assert_invalid_html(HTML.replace(source, value))

    def test_base_cannot_redirect_local_entry_urls (self):
        for tag in ('<base href="https://example.invalid/">', '<base href="/">', '<base target="_blank">'):
            with self.subTest(tag=tag):
                self.assert_invalid_html(HTML.replace("<head>", "<head>" + tag))

    def test_plaintext_cannot_hide_the_remaining_document_from_the_browser (self):
        self.assert_invalid_html(HTML.replace("<body>", "<body><plaintext></plaintext>"))

    def test_malformed_declarations_fail_with_public_error_not_parser_traceback (self):
        for declaration in ("<![PRIVATE_TOKEN]>", "<![]>"):
            with self.subTest(declaration=declaration):
                self.assert_invalid_html(declaration + HTML)
                with (patch.object(frontend, "__file__", str(self.repo / "Scripts" / "frontend_build.py")),
                      contextlib.redirect_stderr(io.StringIO()) as errors):
                    self.assertEqual(frontend.main(["check"]), 1)
                self.assertIn("[ABORT]", errors.getvalue())
                self.assertNotIn("PRIVATE_TOKEN", errors.getvalue())
                self.assertNotIn("Traceback", errors.getvalue())

    def test_missing_empty_or_directory_entry_asset_fails (self):
        for leaf in ("index-test.js", "index-test.css"):
            path = self.assets / leaf
            prior = path.read_bytes()
            for kind in ("absent", "empty", "directory"):
                with self.subTest(leaf=leaf, kind=kind):
                    path.unlink()
                    if kind == "empty":
                        path.write_bytes(b"")
                    elif kind == "directory":
                        path.mkdir()
                    with self.assertRaises(frontend.FrontendBuildError):
                        self.validate(allow_missing=True)
                    if path.is_dir():
                        path.rmdir()
                    path.write_bytes(prior)

    def test_index_descriptor_or_postread_identity_change_fails (self):
        original = os.fstat
        for field in ("st_ino", "st_size", "st_mtime_ns"):
            for change_at in (1, 2):
                calls = 0
                def changing (descriptor):
                    nonlocal calls
                    calls += 1
                    value = original(descriptor)
                    if calls == change_at:
                        return metadata_copy(value, **{field: getattr(value, field) + 1})
                    return value
                with self.subTest(field=field, change_at=change_at):
                    with patch.object(os, "fstat", changing):
                        with self.assertRaises(frontend.FrontendBuildError):
                            self.validate()

    def test_index_path_replacement_or_disappearance_after_read_fails (self):
        original = Path.lstat
        for missing in (False, True):
            calls = 0
            def changing (path, *args, **kwargs):
                nonlocal calls
                value = original(path, *args, **kwargs)
                if path == self.index:
                    calls += 1
                    if calls == 2:
                        if missing:
                            raise FileNotFoundError("PRIVATE_PATH")
                        return metadata_copy(value, st_ino=value.st_ino + 1)
                return value
            with self.subTest(missing=missing), patch.object(Path, "lstat", changing):
                with self.assertRaises(frontend.FrontendBuildError):
                    self.validate(allow_missing=True)

    def test_error_cli_is_sanitized_and_never_runs_build_tools (self):
        with (patch.object(frontend, "validate_frontend", side_effect=frontend.FrontendBuildError("PRIVATE_PATH")),
              patch.object(subprocess, "run") as run,
              contextlib.redirect_stderr(io.StringIO()) as errors):
            self.assertEqual(frontend.main(["check"]), 1)
        self.assertNotIn("PRIVATE_PATH", errors.getvalue())
        self.assertIn("Stop tracker and demo", errors.getvalue())
        run.assert_not_called()

    def test_invalid_cli_arguments_do_not_echo_values_or_validate (self):
        with (patch.object(frontend, "validate_frontend") as validate,
              contextlib.redirect_stderr(io.StringIO()) as errors):
            self.assertEqual(frontend.main(["PRIVATE_ARGUMENT"]), 1)
        self.assertNotIn("PRIVATE_ARGUMENT", errors.getvalue())
        validate.assert_not_called()

    def test_real_cli_works_without_site_packages_in_isolated_repository (self):
        scripts = self.repo / "Scripts"
        scripts.mkdir()
        (scripts / "__init__.py").write_text("", encoding="utf-8")
        (scripts / "frontend_build.py").write_bytes(Path(frontend.__file__).read_bytes())
        package = self.repo / "Backend" / "app"
        package.mkdir(parents=True)
        (package.parent / "__init__.py").write_text("", encoding="utf-8")
        (package / "__init__.py").write_text("", encoding="utf-8")
        (package / "version.py").write_text(f'__version__ = "{VERSION}"\n', encoding="utf-8")
        command = [sys.executable, "-S", "-B", "-m", "Scripts.frontend_build", "check"]
        kwargs = dict(cwd=self.repo, capture_output=True, text=True, timeout=10,
                      creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        current = subprocess.run(command, **kwargs)
        self.assertEqual(current.returncode, 0, current.stderr)
        self.assertIn("current", current.stdout)
        self.index.write_text(HTML.replace(VERSION, "0.0.0.0"), encoding="utf-8")
        stale = subprocess.run(command, **kwargs)
        self.assertEqual(stale.returncode, 1)
        self.assertIn("[ABORT]", stale.stderr)
        self.assertNotIn("Traceback", stale.stderr)
        self.index.unlink()
        missing = subprocess.run(command + ["--allow-missing"], **kwargs)
        self.assertEqual(missing.returncode, 0, missing.stderr)
        self.assertIn("absent", missing.stdout)


if __name__ == "__main__":
    unittest.main()
