"""KATLAB Chronicle generator (PLAN v0.2.4.0).

Fetches the RUNNING tracker's REST API and emits the MkDocs site
sources into Chronicle/runtime/. Stdlib only. Laws implemented here:
RV10 all fetches before the first write; RV13 down-tick skip; RV14+
RV22 sweep vs the FULL expected set; RV18/RV19 calendar-diff
incremental ticks; RV26 loop lifecycle (heartbeat lock at the runtime
ROOT - RV28 - + self-exit on dark serve port); RV27 atomic writes;
RV33 UTF-8 at both ends; RV34 HTTP timeouts; RV35 --verify parity.
Console prints stay ASCII (the RV33 lesson applies to stdout too).
"""

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import pages

# Lifecycle constants (module-level so the V7 battery can shrink them)
HTTP_TIMEOUT = 10.0          # RV34
PAGE_LIMIT = 500             # D2/RV12
MAX_PAGES = 20               # D2/RV12: hard cap per call-site
RECENT_NAV_DAYS = 14         # D9/RV12
DARK_TICKS_EXIT = 10         # RV26
LOCK_STALE_FACTOR = 3        # RV26
DEFAULT_LOOP_SECONDS = 60
# PLAN v0.2.6.0 RV16: a LIVE-lock rejection retries (a crashed
# tracker's orphan loop holds the lock up to ~10min; the restarted
# tracker's child must not exit instantly and leave it loop-less).
LOCK_RETRY_S = 30.0
LOCK_RETRY_BUDGET_S = 900.0

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
RUNTIME = REPO_ROOT / "Chronicle" / "runtime"
DOCS = RUNTIME / "docs"
LOCK_FILE = RUNTIME / ".chronicle_loop.lock"   # RV28: OUTSIDE docs_dir
VENDOR_SRC = SCRIPT_DIR / "assets" / "vendor"

CDN_BOOTSWATCH = ("https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/"
                  "dist/darkly/bootstrap.min.css")
CDN_MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"


def base_url () -> str:
    override = os.environ.get("KATLAB_TRACKER_URL")
    if override:
        return override.rstrip("/")
    host, port = "127.0.0.1", "8100"
    try:  # the hook's stdlib-regex precedent on the server block
        text = (REPO_ROOT / "Config" / "repos.yaml").read_text(encoding="utf-8")
        m = re.search(r"^\s*host:\s*(\S+)", text, re.M)
        if m:
            host = m.group(1)
        m = re.search(r"^\s*port:\s*(\d+)", text, re.M)
        if m:
            port = m.group(1)
    except OSError:
        pass
    return f"http://{host}:{port}"


BASE = base_url()
# PLAN v0.2.6.0 B.1: 8200 is retired - the loop's dark-port self-exit
# watches the TRACKER's own port (F10: from the config via BASE), and
# the site_url points at the tracker's /chronicle/ mount.
TRACKER_PORT = urlsplit(BASE).port or 8100


def http_json (path: str):
    with urllib.request.urlopen(BASE + path, timeout=HTTP_TIMEOUT) as resp:
        payload = json.loads(resp.read().decode("utf-8"))  # RV33
    if not payload.get("success"):
        raise RuntimeError(f"API error on {path}: {payload.get('message')}")
    return payload["data"]


def fetch_paged (path: str) -> tuple[list, bool]:
    """limit/offset walk, pages of PAGE_LIMIT, hard cap MAX_PAGES (D2)."""
    rows: list = []
    for page in range(MAX_PAGES):
        chunk = http_json(f"{path}&limit={PAGE_LIMIT}"
                          f"&offset={page * PAGE_LIMIT}")
        rows.extend(chunk)
        if len(chunk) < PAGE_LIMIT:
            return rows, False
    return rows, True


def next_day (day: str) -> str:
    return (date.fromisoformat(day) + timedelta(days=1)).isoformat()


def fetch_model (cache: dict) -> dict:
    """EVERYTHING the build needs, fetched up front (RV10 - a failure
    here aborts with the previous site intact). cache: {(repo, day):
    (events, commits, minutes)} drives the RV19 calendar-diff rule."""
    repos = http_json("/api/repos")
    tasks = http_json("/api/tasks")
    stats_all = http_json("/api/stats")            # RV21: workspace figures
    stats_by = {r["id"]: http_json(f"/api/stats?repo={r['id']}")
                for r in repos}                    # scoped figures

    history_by: dict[str, tuple[list, bool]] = {}
    for r in repos:
        history_by[r["id"]] = fetch_paged(f"/api/history?repo={r['id']}")
    # active day map per repo from the SCOPED calendars (D5 basis)
    day_triples: dict[tuple[str, str], tuple[int, int, int]] = {}
    for rid, st in stats_by.items():
        for d in st["activity_calendar"]:
            if d["events"] or d["commits"]:
                day_triples[(rid, d["day"])] = (d["events"], d["commits"],
                                                d["minutes"])
    # RV19: refetch iff the calendar triple changed vs the cache (cold
    # cache = fetch all); unchanged days keep their pages. CFT-1: the
    # decision is DAY-granular - a day page rebuilds as a WHOLE, so
    # when ANY involved repo's triple changed (or the page file is
    # missing) EVERY involved repo's window for that day refetches;
    # per-(repo,day) refetch would rebuild the page with the unchanged
    # repo's section EMPTY (its events were never fetched).
    day_events: dict[tuple[str, str], tuple[list, bool]] = {}
    changed_days = {day for (rid, day), triple in day_triples.items()
                    if cache.get((rid, day)) != triple
                    or not (DOCS / "devlog" / f"{day}.md").exists()}
    for rid, day in day_triples:
        if day in changed_days:
            day_events[(rid, day)] = fetch_paged(
                f"/api/events?repo={rid}&since={day}T00:00:00Z"
                f"&until={next_day(day)}T00:00:00Z")

    mirror: dict[str, bytes] = {}  # read in the fetch phase (RV10 spirit)
    sources = [REPO_ROOT / "README.md", REPO_ROOT / "LICENSE"]
    sources += sorted(REPO_ROOT.glob("TrackingMonitor_v*_Release_Notes.md"))
    sources += sorted((REPO_ROOT / "Claude_Info").glob("*.md"))
    sources += sorted((REPO_ROOT / "Docs").rglob("*.md"))
    for src in sources:
        if src.is_file():  # CLAUDE.md deliberately never in this list
            rel = src.relative_to(REPO_ROOT).as_posix()
            mirror[rel] = src.read_bytes()  # byte-verbatim (D5)

    diagrams = [(p.name, p.read_text(encoding="utf-8"))
                for p in sorted((REPO_ROOT / "temp" / "Ref").glob("*.mermaid"))
                if p.is_file()] if (REPO_ROOT / "temp" / "Ref").is_dir() else []

    return {"repos": repos, "tasks": tasks, "stats_all": stats_all,
            "stats_by": stats_by, "history_by": history_by,
            "day_triples": day_triples, "day_events": day_events,
            "mirror": mirror, "diagrams": diagrams}


def group_reasons (events: list, task_lookup: dict, repo: str) -> list:
    """(kind, ref, why, n) per task_ref: task | stale (RV9) | none."""
    counts: dict = {}
    for e in events:
        counts[e.get("task_ref")] = counts.get(e.get("task_ref"), 0) + 1
    reasons = []
    for ref, n in sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0]))):
        if ref is None:
            reasons.append(("none", None, None, n))
        elif (repo, ref) in task_lookup:
            reasons.append(("task", ref, task_lookup[(repo, ref)]["why"], n))
        else:
            reasons.append(("stale", ref, None, n))  # RV9
    return reasons


def write_if_changed (path: Path, data: bytes) -> bool:
    """RV27 atomic + T4 write-if-changed; UTF-8 callers only (RV33)."""
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp~")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return True


def build_and_write (model: dict, cache: dict) -> tuple[int, int]:
    task_lookup = {(t["repo"], t["task_ref"]): t for t in model["tasks"]}
    expected: set[Path] = set()
    written = 0

    def emit (rel: str, content: str | None):
        nonlocal written
        path = DOCS / rel
        expected.add(path.resolve())
        if content is not None:
            written += write_if_changed(path, content.encode("utf-8"))

    repos = model["repos"]
    # data-through = max served event/commit ts (RV2/RV29: never wall-clock)
    stamps = [r.get("last_event_ts") for r in repos if r.get("last_event_ts")]
    for rows, _tr in model["history_by"].values():
        stamps += [row["commit"]["ts"] for row in rows]
    data_through = max(stamps) if stamps else None

    emit("index.md", pages.build_overview(
        repos, model["stats_all"]["activity_calendar"], data_through))

    # ---- devlog ----
    day_union: dict[str, list[int]] = {}
    for (rid, day), (ev, cm, _mn) in model["day_triples"].items():
        tot = day_union.setdefault(day, [0, 0])
        tot[0] += ev
        tot[1] += cm
    days_desc = sorted(day_union, reverse=True)
    emit("devlog/index.md", pages.build_devlog_index(
        [(d, day_union[d][0], day_union[d][1]) for d in days_desc]))

    commits_by_day: dict[tuple[str, str], list] = {}
    for rid, (rows, _tr) in model["history_by"].items():
        for row in rows:
            c = row["commit"]
            commits_by_day.setdefault((rid, c["ts"][:10]), []).append(
                (c["hash"][:7], c["message"], c["ts"]))
    for day in days_desc:
        # rebuild only refetched days (RV18/RV19); others keep their file
        involved = [rid for rid in (r["id"] for r in repos)
                    if (rid, day) in model["day_triples"]]
        if not any((rid, day) in model["day_events"] for rid in involved):
            emit(f"devlog/{day}.md", None)
            continue
        sections = []
        for rid in involved:
            events = model["day_events"].get((rid, day), ([], False))[0]
            groups = []
            for kind, ref, why, _n in group_reasons(events, task_lookup, rid):
                sub = [e for e in events if e.get("task_ref") == ref]
                files: dict[str, int] = {}
                for e in sub:
                    files[e["file"]] = files.get(e["file"], 0) + 1
                title = (task_lookup[(rid, ref)]["title"]
                         if kind == "task" else None)
                groups.append((kind, ref, title, why,
                               sorted(files.items(), key=lambda kv: -kv[1])))
            sections.append({
                "repo": rid,
                "minutes": model["day_triples"][(rid, day)][2],  # served (D5)
                "groups": groups,
                "commits": sorted(commits_by_day.get((rid, day), []),
                                  key=lambda c: c[2]),
            })
        emit(f"devlog/{day}.md", pages.build_day_page(day, sections))

    # ---- plans ----
    plans: dict[tuple[str, str], list] = {}
    for t in model["tasks"]:
        plans.setdefault((t["repo"], t["plan_file"]), []).append(t)

    # the plan-board sort law: active plans first, then max(last_event_ts)
    # DESC with nulls LAST; deterministic (repo, plan_file) tiebreak.
    # Staged stable sorts express "DESC ts + nulls last" cleanly.
    ordered_plans = sorted(plans.items(), key=lambda item: item[0])
    ordered_plans.sort(
        key=lambda item: max((t.get("last_event_ts") or ""
                              for t in item[1]), default=""),
        reverse=True)  # "" (null) is smallest -> lands LAST under reverse
    ordered_plans.sort(
        key=lambda item: 0 if any(t["status"] != "done"
                                  for t in item[1]) else 1)
    plan_nav_by_repo: dict[str, list] = {}
    for (rid, plan_file), tasks in ordered_plans:
        rel = f"plans/{rid}/{pages.flatten_plan_path(plan_file)}.md"
        emit(rel, pages.build_plan_page(rid, plan_file, tasks))
        # RV37: label = the full relative path (never the basename)
        plan_nav_by_repo.setdefault(rid, []).append((plan_file, rel))

    # ---- changelog ----
    changelog_nav = []
    for r in repos:
        rid = r["id"]
        rows, truncated = model["history_by"][rid]
        entries = [{
            "short": row["commit"]["hash"][:7],
            "message": row["commit"]["message"],
            "ts": row["commit"]["ts"],
            "reasons": group_reasons(row["events"], task_lookup, rid),
        } for row in rows]
        rel = f"changelog/{rid}.md"
        emit(rel, pages.build_changelog(rid, entries, truncated))
        changelog_nav.append((rid, rel))

    # ---- story (PLAN v0.2.5.0 B.1: the Scribe's AI-written pages) ----
    # RV41/RV42: RECOGNIZED page patterns only - index.md excluded (a
    # naive *.md glob would count the generate-owned index itself),
    # alien files out of contract (never counted/indexed/deleted).
    story_root = DOCS / "story"
    diary_rx = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
    story_pages = []
    if story_root.is_dir():
        for f in sorted(story_root.glob("*.md")):
            if f.name != "index.md" and (
                    diary_rx.match(f.name)
                    or f.name.startswith("week-")
                    or f.name.startswith("release-")):
                story_pages.append(f.name)
    if story_pages:  # RV35: hidden at zero pages - no index, no nav
        emit("story/index.md", pages.build_story_index(story_pages))

    # ---- diagrams + mirror ----
    if model["diagrams"]:
        emit("architecture.md", pages.build_architecture(model["diagrams"]))
    for rel, data in model["mirror"].items():
        path = DOCS / "mirror" / rel
        expected.add(path.resolve())
        written += write_if_changed(path, data)

    # ---- assets (outside owned dirs - never swept) ----
    # CFT-4: zero-byte vendor residue (a failed/killed curl) must never
    # be wired in - the CDN fallback takes over instead.
    vendored = ({p.name for p in VENDOR_SRC.glob("*")
                 if p.is_file() and p.stat().st_size > 0}
                if VENDOR_SRC.is_dir() else set())
    for name in vendored:
        written += write_if_changed(DOCS / "assets" / "vendor" / name,
                                    (VENDOR_SRC / name).read_bytes())
    written += write_if_changed(DOCS / "assets" / "extra.css",
                                pages.build_extra_css().encode("utf-8"))
    written += write_if_changed(DOCS / "assets" / "nav.js",  # IMPL-3e
                                pages.build_nav_js().encode("utf-8"))
    written += write_if_changed(RUNTIME / "fix_windows_paths.py",  # IMPL-1
                                pages.build_fix_hook().encode("utf-8"))

    # ---- mkdocs.yml ----
    nav = [("\U0001F3E0 Overview", "index.md")]
    devlog_children = [("All days", "devlog/index.md")]
    devlog_children += [(d, f"devlog/{d}.md")
                        for d in days_desc[:RECENT_NAV_DAYS]]  # RV12
    nav.append(("\U0001F4D3 Devlog", devlog_children))
    if story_pages:  # PLAN v0.2.5.0 RV8: index + DIARIES cap-14 only
        # (weeklies/releases are reached via the index - the devlog
        # >14 precedent; un-nav'd pages are mkdocs INFO, strict-safe)
        story_diaries = sorted((n for n in story_pages
                                if diary_rx.match(n)), reverse=True)
        story_children = [("All entries", "story/index.md")]
        story_children += [(n[:-3], f"story/{n}")
                           for n in story_diaries[:RECENT_NAV_DAYS]]
        nav.append(("\U0001F4D6 Story", story_children))
    if plan_nav_by_repo:  # repo groups in CONFIG order (the /repos order)
        nav.append(("\U0001F4CB Plans",
                    [(r["id"], plan_nav_by_repo[r["id"]]) for r in repos
                     if r["id"] in plan_nav_by_repo]))
    nav.append(("\U0001F4DC Changelog", changelog_nav))
    docs_children = [("README", "mirror/README.md")]
    if model["diagrams"]:
        docs_children.append(("Architecture Diagrams", "architecture.md"))
    guides = [(Path(rel).name, f"mirror/{rel}")
              for rel in model["mirror"]
              if rel.startswith("Docs/") and "/Release_Notes/" not in rel]
    claude_info = [(Path(rel).name, f"mirror/{rel}")
                   for rel in model["mirror"] if rel.startswith("Claude_Info/")]
    root_notes = [(Path(rel).name, f"mirror/{rel}")
                  for rel in model["mirror"]
                  if rel.startswith("TrackingMonitor_v")]
    archive = [(Path(rel).name, f"mirror/{rel}")
               for rel in model["mirror"]
               if rel.startswith("Docs/Release_Notes/Archive/")]
    if guides:
        docs_children.append(("Guides", guides))
    if claude_info:
        docs_children.append(("Claude_Info", claude_info))
    if root_notes or archive:  # IMPL-3d: archive FLATTENED into the
        # Release Notes submenu - the extra "Archive" nest made a
        # depth-4 chain, the least reliable dropdown level (RV20's
        # never-a-flat-TOP-nav intent is preserved: one submenu)
        docs_children.append(("Release Notes", root_notes + archive))
    nav.append(("\U0001F3DB Docs", docs_children))

    written += write_if_changed(DOCS / "assets" / "refresh.js",
                                pages.build_refresh_js().encode("utf-8"))
    mermaid_js = ("assets/vendor/mermaid.min.js"
                  if "mermaid.min.js" in vendored else CDN_MERMAID)
    bootswatch = ("assets/vendor/bootswatch-darkly.css"
                  if "bootswatch-darkly.css" in vendored else CDN_BOOTSWATCH)
    written += write_if_changed(RUNTIME / "mkdocs.yml",
                                pages.build_mkdocs_yml(
                                    nav, mermaid_js, bootswatch,
                                    f"{BASE}/chronicle/")
                                .encode("utf-8"))

    # ---- sweep (RV14/RV22: vs the FULL expected set) ----
    removed = 0
    for owned in ("devlog", "plans", "changelog", "mirror"):
        root = DOCS / owned
        if not root.is_dir():
            continue
        for f in sorted(root.rglob("*"), reverse=True):
            if f.is_file() and f.resolve() not in expected:
                f.unlink()
                removed += 1
            elif f.is_dir() and not any(f.iterdir()):
                f.rmdir()
    single = DOCS / "architecture.md"
    if single.exists() and single.resolve() not in expected:
        single.unlink()
        removed += 1
    # PLAN v0.2.5.0 RV35/RV41: the story INDEX is GENERATE-OWNED -
    # removed at zero recognized pages (story PAGES are never swept;
    # a stale index with dead links would strict-fail view.bat).
    story_index = DOCS / "story" / "index.md"
    if not story_pages and story_index.exists():
        story_index.unlink()
        removed += 1

    cache.clear()
    cache.update(model["day_triples"])
    return written, removed


def run_once (cache: dict) -> dict:
    # PLAN v0.2.5.0 RV31: the PRE-FETCH stamp gates scribe candidates
    # (internal key - never emitted into any page).
    fetched_at = datetime.now(timezone.utc).isoformat()
    model = fetch_model(cache)          # RV10: everything before any write
    model["_fetched_at"] = fetched_at
    written, removed = build_and_write(model, cache)
    model["_changed"] = written + removed  # v0.2.6.0: the --build gate
    print(f"[chronicle] site current - {written} file(s) written, "
          f"{removed} removed")
    return model


def build_site () -> None:
    """PLAN v0.2.6.0 B.1 (RV7/RV9): non-strict `mkdocs build` into
    site.new, then the ATOMIC RENAME-FIRST swap - the old site is
    renamed WHOLE (an open handle fails the rename wholesale, never
    half) before the new one takes its place; any failure leaves a
    complete site serving and retries next tick."""
    site = RUNTIME / "site"
    site_new = RUNTIME / "site.new"
    site_old = RUNTIME / "site.old"
    r = subprocess.run([sys.executable, "-m", "mkdocs", "build",
                        "-f", str(RUNTIME / "mkdocs.yml"),
                        "-d", str(site_new)],
                       capture_output=True, text=True, encoding="utf-8",
                       # R-BD: never a window, even from a windowless
                       # parent (output is piped - nothing is lost)
                       creationflags=subprocess.CREATE_NO_WINDOW)
    if r.returncode != 0:
        tail = (r.stderr or r.stdout or "").strip().splitlines()
        print("[chronicle] build failed - keeping the current site"
              + (f" ({tail[-1]})" if tail else ""))
        return
    try:
        if site_old.exists():
            shutil.rmtree(site_old)  # leftover of a prior partial swap
        if site.exists():
            os.replace(site, site_old)   # WHOLE-or-not-at-all rename
        os.replace(site_new, site)
        print("[chronicle] site built + swapped")
    except OSError as exc:
        if not site.exists() and site_old.exists():
            try:
                os.replace(site_old, site)  # rollback - never site-less
            except OSError:
                pass
        print(f"[chronicle] swap failed - old site keeps serving "
              f"({exc.__class__.__name__}); retry next tick")
        return
    try:
        if site_old.exists():
            shutil.rmtree(site_old)
    except OSError:
        pass  # orphan dir; the next swap's pre-clean removes it


def build_if_needed (model: dict) -> None:
    """--build: after a changed tick, or when the site is missing."""
    if model.get("_changed") or not (RUNTIME / "site" / "index.html").is_file():
        build_site()


def port_alive (port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=2):
            return True
    except OSError:
        return False


def loop (interval: float, dark_exit: int = DARK_TICKS_EXIT,
          stale_factor: int = LOCK_STALE_FACTOR,
          do_build: bool = False) -> int:
    """RV26-class lifecycle: single-instance heartbeat lock (mtime),
    self-exit after dark_exit consecutive ticks with the TRACKER port
    dark (v0.2.6.0: 8200 retired - the tracker owns this loop, and a
    dead tracker means nothing to regenerate for)."""
    RUNTIME.mkdir(parents=True, exist_ok=True)
    # PLAN v0.2.6.0 RV16: a LIVE lock retries instead of instant-exit
    # (a crashed tracker's orphan holds the lock up to ~10min; the
    # restarted tracker's spawned child must inherit the loop when
    # the orphan self-exits - the tracker never respawns it).
    def lock_alive () -> bool:
        # CFT-13: stat INSIDE try - the designed RV16 scenario is an
        # orphan whose self-exit unlinks the lock BETWEEN our checks;
        # a bare exists()+stat() pair crashes the child on that gap
        # (FileNotFoundError) and re-opens the loop-less hole.
        try:
            return (time.time() - LOCK_FILE.stat().st_mtime
                    < stale_factor * interval)
        except OSError:
            return False  # lock gone (or unreadable) - free to acquire

    waited = 0.0
    while lock_alive():
        if waited == 0:
            print("[chronicle] another regen loop holds the lock - "
                  "retrying for up to 15m (RV16)")
        if waited >= LOCK_RETRY_BUDGET_S:
            print("[chronicle] lock still held - exiting")
            return 0
        time.sleep(LOCK_RETRY_S)
        waited += LOCK_RETRY_S
    LOCK_FILE.write_text("chronicle regen loop heartbeat\n", encoding="utf-8")
    dark = 0
    cache: dict = {}
    try:
        while True:
            os.utime(LOCK_FILE)  # heartbeat (outside docs_dir - RV28)
            model = None
            try:
                model = run_once(cache)
            except Exception as exc:  # RV13/RV34: skip, retry next tick
                print(f"[chronicle] tick skipped - tracker unavailable "
                      f"({exc.__class__.__name__})")
            os.utime(LOCK_FILE)  # CFT-2: a slow cold tick (many timed-out
            # calls) must never look STALE to a second instance mid-run
            if model is not None:
                if do_build:  # v0.2.6.0 B.1: build BEFORE the scribe -
                    # a fresh story page lands in the NEXT tick's build
                    build_if_needed(model)
                    os.utime(LOCK_FILE)  # a ~1s build must not age it
                # PLAN v0.2.5.0 RV22: LAZY import (a module-top import
                # would be circular - scribe imports generate); RV36:
                # the lock-utime callable keeps the lock fresh during
                # the scribe spawn (auto_tick contains its own errors).
                import scribe
                scribe.auto_tick(model,
                                 heartbeat=lambda: os.utime(LOCK_FILE))
            if port_alive(TRACKER_PORT):
                dark = 0
            else:
                dark += 1
                if dark >= dark_exit:
                    print("[chronicle] tracker port dark - loop exiting")
                    return 0
            time.sleep(interval)
    finally:
        try:
            LOCK_FILE.unlink()
        except OSError:
            pass


def verify () -> int:
    """RV35: devlog index links == emitted day pages (V2 parity)."""
    if not (DOCS / "devlog" / "index.md").is_file():
        print("[verify] no generated site found - run generate first")
        return 1
    day_files = {p.stem for p in (DOCS / "devlog").glob("????-??-??.md")}
    index = (DOCS / "devlog" / "index.md").read_text(encoding="utf-8")
    links = set(re.findall(r"\]\((\d{4}-\d{2}-\d{2})\.md\)", index))
    print(f"[verify] day pages: {len(day_files)} | index links: {len(links)}")
    if day_files == links:
        print("[verify] PARITY OK")
        return 0
    print(f"[verify] MISMATCH - files-not-linked: {sorted(day_files - links)}"
          f" | links-without-file: {sorted(links - day_files)}")
    return 1


def main (argv: list[str]) -> int:
    if "--verify" in argv:
        return verify()
    do_build = "--build" in argv  # v0.2.6.0 B.1
    if "--loop" in argv:
        idx = argv.index("--loop")
        seconds = (float(argv[idx + 1]) if idx + 1 < len(argv)
                   and argv[idx + 1].replace(".", "", 1).isdigit()
                   else DEFAULT_LOOP_SECONDS)
        return loop(seconds, do_build=do_build)
    try:
        model = run_once({})
        if do_build:  # a manual one-shot refreshes the served site
            build_if_needed(model)
        return 0
    except Exception as exc:
        print(f"[ABORT] tracker not reachable at {BASE} - start the "
              f"server first ({exc.__class__.__name__}: {exc})")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
