"""Actual frontend entry-dispatch regressions and immutable-source preservation.

These bounded stdlib/file/CLI fixtures do not certify rendered or native UI,
general HTML/security validation, source freshness or cross-process build locks.
OLD tolerant acceptance is research evidence, not a portable test prerequisite.
"""

import ast
from contextlib import contextmanager
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from Backend.app.version import __version__
from Scripts import frontend_build as frontend
from Tests import test_frontend_build as original_fixture


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "Scripts" / "frontend_build.py"
ORIGINAL_TEST_PATH = ROOT / "Tests" / "test_frontend_build.py"
ORIGINAL_RAW_SHA = "24f61c486f0885acd9ab5b48c4b800a63cce4bb4c190da1b2e75131770759c81"
ORIGINAL_LF_SHA = "354b5b482ef8e463792ac5b07b6e2508196cc34a635486b354abdb9ab6f59dd9"
ORIGINAL_TEST_SHA = "afa88821b33ea9b4ad081a541d6a66a1ae7750b9e2c249366c9bc9b46b21af8d"
METHOD = (
    "    def parse_html_declaration (self, i: int) -> int:\n"
    "        # Reject marked declarations before tolerant stdlib comment fallback.\n"
    "        if self.rawdata.startswith(\"<![\", i):\n"
    "            _fail()\n"
    "        return super().parse_html_declaration(i)\n\n"
)
BEFORE_METHOD = "        self.styles = []\n\n"
AFTER_METHOD = "    def handle_starttag (self, tag: str, attrs) -> None:\n"
TOKENS = ("<![PRIVATE_TOKEN]>", "<![]>", "<![CDATA[PRIVATE_TOKEN]]>")
PAIR = ("index-test.js", "index-test.css")


def sha (value) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def replace_once (text: str, before: str, after: str) -> str:
    assert text.count(before) == 1, "one complete physical fixture window"
    return text.replace(before, after, 1)


HTML = replace_once(original_fixture.HTML, original_fixture.VERSION, __version__)


def restore_declaration_dispatch (text: str) -> str:
    """Preservation only: remove the unique reviewed direct method, nothing else."""
    assert isinstance(text, str) and not text.startswith("\ufeff"), "no source BOM"
    eol = "\r\n" if "\r\n" in text else "\n"
    bare = text.replace("\r\n", "")
    assert "\r" not in bare and (eol == "\n" or "\n" not in bare), "uniform source EOL"
    tree = ast.parse(text)
    owners = [node for node in tree.body
              if isinstance(node, ast.ClassDef) and node.name == "_EntryParser"]
    assert len(owners) == 1, "one complete actual _EntryParser owner"
    owner = owners[0]
    methods = [node for node in owner.body if isinstance(node, ast.FunctionDef)
               and node.name == "parse_html_declaration"]
    assert len(methods) == 1, "one direct declaration-dispatch method"
    method = methods[0]
    assert owner.body.index(method) == 1, "dispatch method follows __init__ directly"
    assert isinstance(owner.body[0], ast.FunctionDef) and owner.body[0].name == "__init__"
    assert isinstance(owner.body[2], ast.FunctionDef) and owner.body[2].name == "handle_starttag"
    expected = ast.parse("class Fixture:\n" + METHOD).body[0].body[0]
    assert ast.dump(method, include_attributes=False) == ast.dump(expected, include_attributes=False), \
        "complete reviewed dispatch signature, condition and delegation"
    assert method.col_offset == 4 and not method.decorator_list, "direct original method role"
    lines = text.splitlines(keepends=True)
    start = sum(map(len, lines[:method.lineno - 1]))
    window = METHOD.replace("\n", eol)
    before = BEFORE_METHOD.replace("\n", eol)
    after = AFTER_METHOD.replace("\n", eol)
    assert text.count(window) == 1, "one complete physical dispatch window"
    assert text[start:start + len(window)] == window, "exact method line, comment, indent and EOF"
    assert text[start - len(before):start] == before, "original __init__ adjacency"
    assert text[start + len(window):start + len(window) + len(after)] == after, \
        "original handle_starttag adjacency"
    restored = text[:start] + text[start + len(window):]
    ast.parse(restored)
    return restored


def parse_entry (document: str, pieces: bool = False) -> tuple[str, str]:
    subject = frontend._EntryParser(__version__)
    for piece in document if pieces else [document]:
        subject.feed(piece)
    return subject.finish()


def at_site (document: str, token: str, site: str) -> str:
    if site == "before":
        return token + document
    if site == "after":
        return document + token
    tag = "<head>" if site == "head" else "<body>"
    assert site in {"head", "body"}
    return replace_once(document, tag, tag + token)


@contextmanager
def entry_fixture (document: str):
    with tempfile.TemporaryDirectory(prefix="katlab-marked-entry-") as directory:
        root = Path(directory)
        assets = root / "Frontend" / "dist" / "assets"
        assets.mkdir(parents=True)
        (assets.parent / "index.html").write_text(document, encoding="utf-8")
        (assets / PAIR[0]).write_text("export {};", encoding="utf-8")
        (assets / PAIR[1]).write_text("body{}", encoding="utf-8")
        yield root


class FrontendMarkedDeclarationTests(unittest.TestCase):
    def test_active_marked_tokens_fail_at_every_site_in_whole_and_split_feeds (self):
        for token in TOKENS:
            for site in ("before", "head", "body", "after"):
                for pieces in (False, True):
                    with self.subTest(token=token, site=site, pieces=pieces):
                        with self.assertRaises(frontend.FrontendBuildError) as raised:
                            parse_entry(at_site(HTML, token, site), pieces)
                        self.assertEqual(str(raised.exception),
                                         "Frontend build is missing, invalid or not current")
                        self.assertNotIn("PRIVATE_TOKEN", str(raised.exception))

    def test_comments_doctype_and_raw_text_controls_retain_exact_asset_pairs (self):
        controls = (
            HTML,
            "<!--ordinary-->" + HTML,
            "<!--[PRIVATE_TOKEN]-->" + HTML,
            replace_once(HTML, "<!doctype html>", "<!DOCTYPE html>"),
            replace_once(HTML, "</script>", 'const text="<![PRIVATE_TOKEN]>";</script>'),
            replace_once(HTML, "<head>", '<head><style>body::after{content:"<![]>"}</style>'),
            replace_once(HTML, '<div id="root"></div>', '<div id="root"><span>Loading</span></div>'),
            HTML.replace("><", ">\r\n<"),
        )
        for index, document in enumerate(controls):
            for pieces in (False, True):
                with self.subTest(control=index, pieces=pieces):
                    self.assertEqual(parse_entry(document, pieces), PAIR)
            with entry_fixture(document) as root:
                for allow_missing in (False, True):
                    self.assertTrue(frontend.validate_frontend(root, __version__,
                                                               allow_missing=allow_missing))

    def test_actual_file_validation_rejects_marked_tokens_even_when_missing_is_allowed (self):
        for token in TOKENS:
            for site in ("before", "head", "body", "after"):
                with entry_fixture(at_site(HTML, token, site)) as root:
                    for allow_missing in (False, True):
                        with self.subTest(token=token, site=site, allow_missing=allow_missing):
                            with self.assertRaises(frontend.FrontendBuildError) as raised:
                                frontend.validate_frontend(root, __version__, allow_missing=allow_missing)
                            self.assertNotIn("PRIVATE_TOKEN", str(raised.exception))

    def test_real_stdlib_only_cli_uses_matching_canonical_version_and_public_errors (self):
        self.assertIn(f'content="{__version__}"', HTML)
        with entry_fixture(HTML) as root:
            scripts = root / "Scripts"
            scripts.mkdir()
            (scripts / "__init__.py").write_text("", encoding="utf-8")
            (scripts / "frontend_build.py").write_bytes(SOURCE_PATH.read_bytes())
            package = root / "Backend" / "app"
            package.mkdir(parents=True)
            (package.parent / "__init__.py").write_text("", encoding="utf-8")
            (package / "__init__.py").write_text("", encoding="utf-8")
            (package / "version.py").write_text(f'__version__ = "{__version__}"\n', encoding="utf-8")
            command = [sys.executable, "-X", "utf8", "-S", "-B", "-m", "Scripts.frontend_build", "check"]
            index = root / "Frontend" / "dist" / "index.html"
            for document in (HTML, "<![PRIVATE_TOKEN]>" + HTML, "<![]>" + HTML,
                             "<![CDATA[PRIVATE_TOKEN]]>" + HTML):
                index.write_text(document, encoding="utf-8")
                for allow_missing in (False, True):
                    with self.subTest(document=document[:32], allow_missing=allow_missing):
                        result = subprocess.run(
                            command + (["--allow-missing"] if allow_missing else []),
                            cwd=root, stdin=subprocess.DEVNULL, capture_output=True,
                            text=True, timeout=10,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                        )
                        if document == HTML:
                            self.assertEqual(result.returncode, 0, result.stderr)
                            self.assertIn("Frontend build is current.", result.stdout)
                            self.assertEqual(result.stderr, "")
                        else:
                            self.assertEqual(result.returncode, 1)
                            self.assertIn("[ABORT]", result.stderr)
                            self.assertNotIn("PRIVATE_TOKEN", result.stderr)
                            self.assertNotIn("Traceback", result.stderr)

    def test_strict_inverse_retains_whole_original_source_and_outside_bytes_in_lf_crlf (self):
        source = SOURCE_PATH.read_bytes().decode("utf-8").replace("\r\n", "\n")
        for eol in ("\n", "\r\n"):
            current = source.replace("\n", eol)
            restored = restore_declaration_dispatch(current)
            self.assertEqual(sha(restored.replace("\r\n", "\n")), ORIGINAL_LF_SHA)
            if eol == "\r\n":
                self.assertEqual(sha(restored), ORIGINAL_RAW_SHA)
            before = BEFORE_METHOD.replace("\n", eol)
            start = current.index(before) + len(before)
            self.assertEqual(restored[:start], current[:start])
            self.assertEqual(restored[start:], current[start + len(METHOD.replace("\n", eol)):])

    def test_inverse_rejects_valid_missing_duplicate_wrong_owner_site_and_partial_variants (self):
        source = SOURCE_PATH.read_bytes().decode("utf-8").replace("\r\n", "\n")
        without = replace_once(source, METHOD, "")
        variants = [
            without,
            replace_once(source, METHOD, METHOD + METHOD),
            without + "\nclass WrongOwner:\n" + METHOD,
            replace_once(without, "    def __init__ (self, version: str):\n",
                         METHOD + "    def __init__ (self, version: str):\n"),
            replace_once(source, METHOD, METHOD.replace("parse_html_declaration (self", "wrong_declaration (self")),
            replace_once(source, METHOD, METHOD.replace('startswith("<![", i)', 'startswith("<!", i)')),
            replace_once(source, METHOD, METHOD.replace('startswith("<![", i)', 'startswith("<![", i + 0)')),
            replace_once(source, METHOD, METHOD.replace("i: int", "i: object")),
            replace_once(source, METHOD, METHOD.replace("-> int", "-> object")),
            replace_once(source, METHOD, METHOD.replace("# Reject", "# Changed rejection:")),
            replace_once(source, METHOD, METHOD.replace('"<!["', "'<!['")),
            replace_once(source, METHOD, METHOD.replace("        return super()", "        pass\n        return super()")),
            replace_once(source, "class _EntryParser(HTMLParser):", "class WrongEntryParser(HTMLParser):"),
            source + "\nclass _EntryParser:\n    pass\n",
            source + '\n"""\n' + METHOD + '"""\n',
        ]
        for ordinal, value in enumerate(variants):
            ast.parse(value)  # Each negative violates the inverse, not Python syntax.
            for eol in ("\n", "\r\n"):
                with self.subTest(variant=ordinal, eol=eol):
                    with self.assertRaises(AssertionError):
                        restore_declaration_dispatch(value.replace("\n", eol))

    def test_inverse_retains_unrelated_valid_owner_and_outside_changes (self):
        source = SOURCE_PATH.read_bytes().decode("utf-8").replace("\r\n", "\n")
        changes = (("        self.markers = 0", "        self.markers = 1"),
                   ("MAX_INDEX_BYTES = 64 * 1024", "MAX_INDEX_BYTES = 65 * 1024"))
        for before, after in changes:
            for eol in ("\n", "\r\n"):
                current = replace_once(source, before, after).replace("\n", eol)
                ast.parse(current)
                restored = restore_declaration_dispatch(current)
                self.assertIn(after, restored)
                self.assertNotEqual(sha(restored.replace("\r\n", "\n")), ORIGINAL_LF_SHA)

    def test_original_frontend_suite_is_wholly_immutable_and_not_rediscovered_here (self):
        original = ORIGINAL_TEST_PATH.read_bytes()
        self.assertEqual(sha(original), ORIGINAL_TEST_SHA)
        self.assertEqual(original.count(b"\n"), 343)
        self.assertTrue(all(value is not original_fixture.FrontendBuildTests
                            for value in globals().values()))


if __name__ == "__main__":
    unittest.main()
