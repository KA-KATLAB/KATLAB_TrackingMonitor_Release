"""Read-only release identity checks for the frontend served by both launchers."""

from html.parser import HTMLParser
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import urlsplit


MAX_INDEX_BYTES = 64 * 1024
_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+")
_ASSET = re.compile(r"/assets/([A-Za-z0-9][A-Za-z0-9_.-]*\.(js|css))")
_VOID = frozenset({"area", "base", "br", "col", "embed", "hr", "img", "input",
                   "link", "meta", "param", "source", "track", "wbr"})
_GUIDANCE = ("Stop tracker and demo before rebuilding: run npm run build in "
             "Frontend, then restart. Existing tabs need a reload.")


class FrontendBuildError(Exception):
    """A public-safe reason why the served entry cannot be accepted."""


def _fail () -> None:
    raise FrontendBuildError("Frontend build is missing, invalid or not current")


def _ordinary (path: Path, *, directory: bool, missing: bool = False):
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        if missing:
            return None
        _fail()
    except OSError:
        _fail()
    if (stat.S_ISLNK(metadata.st_mode)
            or getattr(metadata, "st_file_attributes", 0)
            & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)):
        _fail()
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected(metadata.st_mode):
        _fail()
    return metadata


def _identity (metadata) -> tuple:
    return (metadata.st_dev, metadata.st_ino, metadata.st_mode,
            metadata.st_size, metadata.st_mtime_ns)


def _read_index (path: Path, metadata) -> str:
    if not 0 < metadata.st_size <= MAX_INDEX_BYTES:
        _fail()
    try:
        with path.open("rb") as stream:
            before = os.fstat(stream.fileno())
            if _identity(before) != _identity(metadata):
                _fail()
            content = stream.read(MAX_INDEX_BYTES + 1)
            after = os.fstat(stream.fileno())
        current = _ordinary(path, directory=False)
        if (_identity(before) != _identity(after)
                or _identity(after) != _identity(current)
                or len(content) != after.st_size or len(content) > MAX_INDEX_BYTES):
            _fail()
        text = content.decode("utf-8-sig")
    except (OSError, UnicodeError):
        _fail()
    if not text.strip() or "\0" in text:
        _fail()
    return text


class _EntryParser(HTMLParser):
    def __init__ (self, version: str):
        super().__init__(convert_charrefs=True)
        self.version = version
        self.state = "before"
        self.stack = []
        self.markers = 0
        self.roots = 0
        self.scripts = []
        self.styles = []

    def parse_html_declaration (self, i: int) -> int:
        # Reject marked declarations before tolerant stdlib comment fallback.
        if self.rawdata.startswith("<![", i):
            _fail()
        return super().parse_html_declaration(i)

    def handle_starttag (self, tag: str, attrs) -> None:
        if tag in {"base", "plaintext"}:
            _fail()
        relevant = {"id"}
        relevant.update({"meta": {"name", "content"}, "script": {"type", "src"},
                         "link": {"rel", "href"}}.get(tag, set()))
        values = {}
        for name, value in attrs:
            if name in relevant and name in values:
                _fail()
            values[name] = value
        if tag == "html":
            if self.state != "before" or self.stack:
                _fail()
            self.state = "html"
        elif tag == "head":
            if self.state != "html" or self.stack != ["html"]:
                _fail()
            self.state = "head"
        elif tag == "body":
            if self.state != "after-head" or self.stack != ["html"]:
                _fail()
            self.state = "body"
        elif self.state not in {"head", "body"}:
            _fail()
        if values.get("id") == "root":
            if tag != "div" or self.stack != ["html", "body"]:
                _fail()
            self.roots += 1
        if tag == "meta" and (values.get("name") or "").lower() == "katlab-ui-version":
            if (self.state != "head" or self.stack != ["html", "head"]
                    or values.get("content") != self.version):
                _fail()
            self.markers += 1
        if tag == "script" and (values.get("type") or "").lower() == "module":
            if self.stack not in (["html", "head"], ["html", "body"]):
                _fail()
            self.scripts.append(self._asset(values.get("src"), "js"))
        if tag == "link" and "stylesheet" in (values.get("rel") or "").lower().split():
            if self.stack not in (["html", "head"], ["html", "body"]):
                _fail()
            href = values.get("href") or ""
            if href.startswith("https://fonts.googleapis.com/"):
                url = urlsplit(href)
                if url.netloc != "fonts.googleapis.com" or url.path != "/css2" or url.fragment:
                    _fail()
            else:
                self.styles.append(self._asset(href, "css"))
        if tag not in _VOID:
            self.stack.append(tag)

    def handle_startendtag (self, tag: str, attrs) -> None:
        if tag not in _VOID:
            _fail()
        self.handle_starttag(tag, attrs)

    def handle_endtag (self, tag: str) -> None:
        if not self.stack or self.stack[-1] != tag:
            _fail()
        self.stack.pop()
        if tag == "head":
            self.state = "after-head"
        elif tag == "body":
            self.state = "after-body"
        elif tag == "html":
            if self.state != "after-body":
                _fail()
            self.state = "done"

    def handle_data (self, data: str) -> None:
        if self.state not in {"head", "body"} and data.strip():
            _fail()

    @staticmethod
    def _asset (value, extension: str) -> str:
        match = _ASSET.fullmatch(value or "")
        if not match or match[2] != extension:
            _fail()
        return match[1]

    def finish (self) -> tuple[str, str]:
        self.close()
        if (self.state != "done" or self.stack or self.markers != 1 or self.roots != 1
                or len(self.scripts) != 1 or len(self.styles) != 1):
            _fail()
        return self.scripts[0], self.styles[0]


def validate_frontend (repo_root: Path, expected_version: str, *,
                       allow_missing: bool = False) -> bool:
    """True means current entry; False means explicitly allowed genuine absence.

    This is release identity, not source/chunk attestation or a build lock.
    """
    if not isinstance(expected_version, str) or not _VERSION.fullmatch(expected_version):
        _fail()
    try:
        root = Path(repo_root).resolve(strict=True)
        _ordinary(root, directory=True)
        frontend = root / "Frontend"
        _ordinary(frontend, directory=True)
        dist = frontend / "dist"
        if _ordinary(dist, directory=True, missing=True) is None:
            if allow_missing:
                return False
            _fail()
        assets = dist / "assets"
        asset_metadata = _ordinary(assets, directory=True, missing=True)
        index = dist / "index.html"
        metadata = _ordinary(index, directory=False, missing=True)
        if metadata is None:
            if allow_missing:
                return False
            _fail()
        parser = _EntryParser(expected_version)
        parser.feed(_read_index(index, metadata))
        filenames = parser.finish()
        if asset_metadata is None:
            _fail()
        for filename in filenames:
            file_metadata = _ordinary(assets / filename, directory=False)
            if file_metadata.st_size <= 0:
                _fail()
        return True
    except (OSError, ValueError, TypeError, RuntimeError, AssertionError):
        # HTMLParser uses AssertionError for malformed declaration tokens.
        _fail()


def main (argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv
    if arguments not in (["check"], ["check", "--allow-missing"]):
        print("[ABORT] Usage: python -m Scripts.frontend_build check [--allow-missing]",
              file=sys.stderr)
        return 1
    try:
        from Backend.app.version import __version__
        current = validate_frontend(Path(__file__).resolve().parents[1], __version__,
                                    allow_missing="--allow-missing" in arguments)
    except (FrontendBuildError, ImportError, SyntaxError, OSError):
        print(f"[ABORT] Frontend build is missing, invalid or not current. {_GUIDANCE}",
              file=sys.stderr)
        return 1
    print("Frontend build is current." if current else
          "Frontend index is absent; first-run bootstrap may proceed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
