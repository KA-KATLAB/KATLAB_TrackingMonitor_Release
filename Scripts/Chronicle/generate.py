"""KATLAB Chronicle generator (PLAN v0.3.0.3).

Fetches the RUNNING tracker's REST API and emits the MkDocs site
sources into Chronicle/runtime/. Stdlib only. Laws implemented here:
RV10 all fetches before the first write; RV13 down-tick skip; RV14+
RV22 sweep vs the FULL expected set; RV18/RV19 calendar-diff
incremental ticks; RV26 loop lifecycle (heartbeat lock at the runtime
ROOT - RV28 - + self-exit on dark serve port); RV27 atomic writes;
RV33 UTF-8 at both ends; RV34 HTTP timeouts; RV35 --verify parity.
Console prints stay ASCII (the RV33 lesson applies to stdout too).
"""

# CLI validation intentionally precedes every repository-local import. Invalid or
# mixed modes therefore cannot execute pages.py/safe_io.py or touch repository data.
import math
import re
import sys


CLI_USAGE = (
    "Usage: generate.py [--build | --loop SECONDS [--build] | --view | --verify]"
)
_LOOP_SECONDS_RX = re.compile(r"^[0-9]+(?:\.[0-9]+)?$", re.ASCII)


def parse_cli (argv: list[str]):
    """Return ``(mode, seconds, build)`` for the one exact CLI grammar."""
    if argv == []:
        return "once", None, False
    if argv == ["--build"]:
        return "once", None, True
    if argv == ["--view"]:
        return "view", None, False
    if argv == ["--verify"]:
        return "verify", None, False
    if len(argv) in (2, 3) and argv[0] == "--loop":
        if len(argv) == 3 and argv[2] != "--build":
            return None
        raw_seconds = argv[1]
        if (_LOOP_SECONDS_RX.fullmatch(raw_seconds) is None
                or any(ord(character) > 0x7f for character in raw_seconds)):
            return None
        seconds = float(raw_seconds)
        if not math.isfinite(seconds) or not 10 <= seconds <= 3600:
            return None
        return "loop", seconds, len(argv) == 3
    return None


_PROCESS_CLI = None
if __name__ == "__main__":
    _PROCESS_CLI = parse_cli(sys.argv[1:])
    if _PROCESS_CLI is None:
        print(CLI_USAGE, file=sys.stderr)
        raise SystemExit(2)


import hashlib
import os
import secrets
import subprocess
import threading
import time
import webbrowser
from datetime import date, timedelta
from pathlib import Path

# Lexical absolute paths are passed to safe_io; resolving here would follow a
# link/junction before the native binder can reject that ancestor.  Add the repo
# root only after the process CLI has been validated so invalid invocations
# cannot execute repository packages.
SCRIPT_DIR = Path(os.path.abspath(__file__)).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from Scripts.Chronicle import pages, runtime, safe_io

# Lifecycle constants (module-level so the V7 battery can shrink them)
HTTP_TIMEOUT = 10.0          # RV34
BUILD_TIMEOUT = 120.0
BUILD_OUTPUT_LIMIT = 65_536
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

RUNTIME = REPO_ROOT / "Chronicle" / "runtime"
DOCS = RUNTIME / "docs"


TRACKER_PORT = 0
_build_pending = True


def fetch_paged (client, token: str, *, repo_id: str,
                 day: str | None = None,
                 next_day_value: str | None = None) -> tuple[list, bool]:
    """limit/offset walk, pages of PAGE_LIMIT, hard cap MAX_PAGES (D2)."""
    rows: list = []
    for page in range(MAX_PAGES):
        chunk = client.request(
            token, repo_id=repo_id, offset=page * PAGE_LIMIT,
            day=day, next_day=next_day_value,
        )
        rows.extend(chunk)
        if len(chunk) < PAGE_LIMIT:
            return rows, False
    return rows, True


def next_day (day: str) -> str:
    return (date.fromisoformat(day) + timedelta(days=1)).isoformat()


def fetch_model (cache: dict, runtime_root) -> dict:
    """EVERYTHING the build needs, fetched up front (RV10 - a failure
    here aborts with the previous site intact). cache: {(repo, day):
    (events, commits, minutes)} drives the RV19 calendar-diff rule."""
    source_snapshot = safe_io.capture_chronicle_sources(REPO_ROOT)
    mirror, diagrams = project_source_snapshot(source_snapshot)
    devlog_inventory = safe_io.inventory_runtime_tree(
        runtime_root, "docs/devlog", allow_missing=True,
    )
    existing_day_pages = set()
    if devlog_inventory is not None:
        existing_day_pages = {
            entry.relative_path for entry in devlog_inventory.entries
            if entry.kind == "file"
        }

    # Start the non-resettable authenticated-session budget only after all local
    # source/runtime preflight.  The client keeps key material private.
    with runtime.load_session(REPO_ROOT) as client:
        repos = client.request("repos")
        tasks = client.request("tasks")
        stats_all = client.request("stats")        # RV21: workspace figures
        stats_by = {r["id"]: client.request("stats", repo_id=r["id"])
                    for r in repos}                # scoped figures

        history_by: dict[str, tuple[list, bool]] = {}
        for r in repos:
            history_by[r["id"]] = fetch_paged(
                client, "history", repo_id=r["id"])

        origin = client.origin
        # Active day map per repo from the SCOPED calendars (D5 basis).
        day_triples: dict[tuple[str, str], tuple[int, int, int]] = {}
        for rid, st in stats_by.items():
            for d in st["activity_calendar"]:
                if d["events"] or d["commits"]:
                    day_triples[(rid, d["day"])] = (
                        d["events"], d["commits"], d["minutes"])
        # RV19: a day page rebuilds as a whole, so any changed involved
        # repository causes every involved repository's window to refetch.
        day_events: dict[tuple[str, str], tuple[list, bool]] = {}
        changed_days = {
            day for (rid, day), triple in day_triples.items()
            if cache.get((rid, day)) != triple
            or f"{day}.md" not in existing_day_pages
        }
        for rid, day in day_triples:
            if day in changed_days:
                day_events[(rid, day)] = fetch_paged(
                    client, "events", repo_id=rid, day=day,
                    next_day_value=next_day(day))

    return {"repos": repos, "tasks": tasks, "stats_all": stats_all,
            "stats_by": stats_by, "history_by": history_by,
             "day_triples": day_triples, "day_events": day_events,
             "mirror": mirror, "diagrams": diagrams,
             "source_snapshot_digest": source_snapshot.snapshot_digest,
             "origin": origin}


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


def project_source_snapshot (snapshot) -> tuple[dict[str, bytes], list]:
    """Project one immutable safe_io snapshot into mirror and diagram inputs."""
    paths = {entry.relative_path for entry in snapshot.entries}
    required = {"README.md", "LICENSE", "AGENTS.md"}
    if not required.issubset(paths) or "CLAUDE.md" in paths:
        raise safe_io.SafeIOError("Chronicle source snapshot membership is invalid")
    mirror: dict[str, bytes] = {}
    diagrams = []
    for entry in snapshot.entries:
        relative = entry.relative_path
        if relative.startswith("temp/Ref/") and relative.endswith(".mermaid"):
            text = entry.data.decode("utf-8", errors="strict")
            if text.strip():
                diagrams.append((Path(relative).name, text))
        else:
            mirror[relative] = entry.data
    diagrams.sort(key=lambda item: (item[0].casefold(), item[0]))
    return mirror, diagrams


def capture_vendor_assets () -> dict[str, bytes]:
    """Read only the two authoritative vendor names through safe_io."""
    selected: dict[str, bytes] = {}
    with safe_io.bind_root(SCRIPT_DIR) as script_root:
        for token in ("fetch-mermaid", "fetch-bootswatch"):
            spec = safe_io.asset_spec(token)
            try:
                bound = safe_io.read_existing_file(
                    script_root, f"assets/vendor/{spec.name}",
                    max_bytes=spec.length,
                )
                if bound is None:
                    continue
                source = safe_io.validate_asset(token, bound.data)
                selected[spec.name] = (
                    safe_io.sanitize_bootswatch(source)
                    if token == "fetch-bootswatch" else source
                )
            except safe_io.SafeIOError:
                print(f"[chronicle] invalid local {token} asset - using CDN")
    return selected


def recognized_story_pages (inventory) -> list[str]:
    """Return only the legacy top-level Markdown story page families."""
    if inventory is None:
        return []
    diary_rx = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
    result = []
    for entry in inventory.entries:
        name = entry.relative_path
        if (entry.kind == "file" and "/" not in name and name != "index.md"
                and name.endswith(".md")
                and (diary_rx.fullmatch(name)
                     or name.startswith("week-")
                     or name.startswith("release-"))):
            result.append(name)
    return sorted(result, key=lambda name: (name.casefold(), name))


def build_docs_nav (mirror: dict[str, bytes], has_diagrams: bool) -> list:
    """Build the Docs subtree from the already-captured source snapshot."""
    docs_children = [("README", "mirror/README.md"),
                     ("AGENTS", "mirror/AGENTS.md")]
    if has_diagrams:
        docs_children.append(("Architecture Diagrams", "architecture.md"))
    guides = [(Path(rel).name, f"mirror/{rel}")
              for rel in mirror
              if rel.startswith("Docs/") and "/Release_Notes/" not in rel]
    claude_info = [(Path(rel).name, f"mirror/{rel}")
                   for rel in mirror if rel.startswith("Claude_Info/")]
    codex_info = [(Path(rel).name, f"mirror/{rel}")
                  for rel in mirror if rel.startswith("Codex_Info/")]
    root_notes = [(Path(rel).name, f"mirror/{rel}")
                  for rel in mirror if rel.startswith("TrackingMonitor_v")]
    archive = [(Path(rel).name, f"mirror/{rel}")
               for rel in mirror
               if rel.startswith("Docs/Release_Notes/Archive/")]
    if guides:
        docs_children.append(("Guides", guides))
    if claude_info:
        docs_children.append(("Claude_Info", claude_info))
    if codex_info:
        docs_children.append(("Codex_Info", codex_info))
    if root_notes or archive:
        docs_children.append(("Release Notes", root_notes + archive))
    return docs_children


def build_and_write (model: dict, cache: dict,
                     runtime_root) -> tuple[int, int]:
    task_lookup = {(t["repo"], t["task_ref"]): t for t in model["tasks"]}
    expected: set[str] = set()
    written = 0

    # Fetch-first: every mutable runtime/source fact that controls output is
    # acquired before the first emit, so a later validation failure is clean.
    story_inventory = safe_io.inventory_runtime_tree(
        runtime_root, "docs/story", allow_missing=True,
    )
    story_pages = recognized_story_pages(story_inventory)
    diary_rx = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
    vendored = capture_vendor_assets()

    # Windows paths are case-insensitive and the legacy URL-preserving flatten
    # rule is not injective (a/b and a__b collide).  Preflight the complete plan
    # page set before the first write rather than partially overwriting one plan
    # with another.
    plans: dict[tuple[str, str], list] = {}
    for task in model["tasks"]:
        plans.setdefault((task["repo"], task["plan_file"]), []).append(task)
    plan_paths: dict[tuple[str, str], str] = {
        key: safe_io.project_markdown_runtime_relative(
            f"plans/{key[0]}/{pages.flatten_plan_path(key[1])}.md")[0]
        for key in plans
    }
    folded_plan_paths: dict[str, tuple[str, str]] = {}
    for key, relative in plan_paths.items():
        prior = folded_plan_paths.setdefault(relative.casefold(), key)
        if prior != key:
            raise safe_io.SafeIOError(
                "generated plan page paths collide on Windows"
            )

    # Repository ids also become Windows leaf names.  Validate the complete
    # changelog output set, including case-fold collisions, before index/devlog
    # can be emitted for an unusable model.
    changelog_paths: dict[str, str] = {}
    folded_changelog_paths: set[str] = set()
    for repo in model["repos"]:
        rid = repo["id"]
        relative, _destination = safe_io.project_markdown_runtime_relative(
            f"changelog/{rid}.md")
        folded = relative.casefold()
        if folded in folded_changelog_paths:
            raise safe_io.SafeIOError(
                "generated changelog page paths collide on Windows"
            )
        folded_changelog_paths.add(folded)
        changelog_paths[rid] = relative

    day_union: dict[str, list[int]] = {}
    for (rid, day), (ev, cm, _mn) in model["day_triples"].items():
        tot = day_union.setdefault(day, [0, 0])
        tot[0] += ev
        tot[1] += cm
    days_desc = sorted(day_union, reverse=True)

    # MkDocs 1.6 with use_directory_urls:false maps Markdown leaves to flat
    # HTML leaves, with README.md and index.md both becoming index.html.  Prove
    # every selected Markdown source and destination (including retained story
    # pages) before the first emit so an impossible or colliding site cannot
    # leave a partially refreshed docs tree.
    output_sources: dict[str, str] = {}
    output_destinations: dict[str, str] = {}

    def register_output (source: str, destination: str) -> str:
        folded_source = source.casefold()
        prior_source = output_sources.setdefault(folded_source, source)
        if prior_source != source:
            raise safe_io.SafeIOError(
                "generated source paths collide on Windows")
        folded_destination = destination.casefold()
        prior_destination = output_destinations.setdefault(
            folded_destination, source)
        if prior_destination != source:
            raise safe_io.SafeIOError(
                "generated MkDocs destinations collide on Windows")
        return source

    def preflight_markdown (relative: str) -> str:
        source, destination = safe_io.project_markdown_runtime_relative(relative)
        return register_output(source, destination)

    selected_markdown = ["index.md", "devlog/index.md"]
    selected_markdown.extend(f"devlog/{day}.md" for day in days_desc)
    selected_markdown.extend(plan_paths.values())
    selected_markdown.extend(changelog_paths.values())
    if story_pages:
        selected_markdown.append("story/index.md")
    if model["diagrams"]:
        selected_markdown.append("architecture.md")

    mirror_paths: dict[str, str] = {}
    for relative in model["mirror"]:
        source, destination = safe_io.project_mkdocs_runtime_relative(
            f"mirror/{relative}")
        mirror_paths[relative] = register_output(source, destination)
    if story_inventory is not None:
        for entry in story_inventory.entries:
            if entry.kind != "file" or entry.relative_path == "index.md":
                continue
            source, destination = safe_io.project_mkdocs_runtime_relative(
                f"story/{entry.relative_path}")
            register_output(source, destination)
    for relative in selected_markdown:
        preflight_markdown(relative)
    for destination in output_destinations:
        components = destination.split("/")
        for count in range(1, len(components)):
            if "/".join(components[:count]) in output_destinations:
                raise safe_io.SafeIOError(
                    "generated MkDocs file and directory destinations collide"
                )

    def emit (rel: str, content: str | None):
        nonlocal written
        expected.add(rel)
        if content is not None:
            written += runtime_root.write_if_changed(
                f"docs/{rel}", content.encode("utf-8"),
            )

    repos = model["repos"]
    # data-through = max served event/commit ts (RV2/RV29: never wall-clock)
    stamps = [r.get("last_event_ts") for r in repos if r.get("last_event_ts")]
    for rows, _tr in model["history_by"].values():
        stamps += [row["commit"]["ts"] for row in rows]
    data_through = max(stamps) if stamps else None

    emit("index.md", pages.build_overview(
        repos, model["stats_all"]["activity_calendar"], data_through))

    # ---- devlog ----
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
        rel = plan_paths[(rid, plan_file)]
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
        rel = changelog_paths[rid]
        emit(rel, pages.build_changelog(rid, entries, truncated))
        changelog_nav.append((rid, rel))

    # ---- story (PLAN v0.2.5.0 B.1: the Scribe's AI-written pages) ----
    # RV41/RV42: RECOGNIZED page patterns only - index.md excluded (a
    # naive *.md glob would count the generate-owned index itself),
    # alien files out of contract (never counted/indexed/deleted).
    if story_pages:  # RV35: hidden at zero pages - no index, no nav
        emit("story/index.md", pages.build_story_index(story_pages))

    # ---- diagrams + mirror ----
    if model["diagrams"]:
        emit("architecture.md", pages.build_architecture(model["diagrams"]))
    for rel, data in model["mirror"].items():
        generated_rel = mirror_paths[rel]
        expected.add(generated_rel)
        written += runtime_root.write_if_changed(f"docs/{generated_rel}", data)

    # ---- assets: exact names and hashes come only from safe_io ----
    for name, data in vendored.items():
        written += runtime_root.write_if_changed(
            f"docs/assets/vendor/{name}", data,
        )
    written += runtime_root.write_if_changed(
        "docs/assets/extra.css", pages.build_extra_css().encode("utf-8"),
    )
    written += runtime_root.write_if_changed(
        "docs/assets/nav.js", pages.build_nav_js().encode("utf-8"),
    )
    written += runtime_root.write_if_changed(
        "fix_windows_paths.py", pages.build_fix_hook().encode("utf-8"),
    )

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
    if changelog_nav:
        nav.append(("\U0001F4DC Changelog", changelog_nav))
    nav.append(("\U0001F3DB Docs",
                build_docs_nav(model["mirror"], bool(model["diagrams"]))))

    written += runtime_root.write_if_changed(
        "docs/assets/refresh.js", pages.build_refresh_js().encode("utf-8"),
    )
    mermaid_js = (f"assets/vendor/{safe_io.MERMAID_NAME}"
                  if safe_io.MERMAID_NAME in vendored
                  else safe_io.MERMAID_URL)
    bootswatch = (f"assets/vendor/{safe_io.BOOTSWATCH_NAME}"
                  if safe_io.BOOTSWATCH_NAME in vendored
                  else safe_io.BOOTSWATCH_URL)
    written += runtime_root.write_if_changed(
        "mkdocs.yml",
        pages.build_mkdocs_yml(
            nav, mermaid_js, bootswatch, f"{model['origin']}/chronicle/",
        ).encode("utf-8"),
    )

    # ---- sweep (RV14/RV22: vs the FULL expected set) ----
    removed = 0
    for owned in ("devlog", "plans", "changelog", "mirror"):
        prefix = owned + "/"
        owned_expected = {
            rel[len(prefix):] for rel in expected if rel.startswith(prefix)
        }
        removed += len(safe_io.sweep_runtime_tree(
            runtime_root, f"docs/{owned}", owned_expected,
        ))
    if "architecture.md" not in expected:
        removed += int(safe_io.remove_existing_file(
            runtime_root, "docs/architecture.md",
        ))
    # PLAN v0.2.5.0 RV35/RV41: the story INDEX is GENERATE-OWNED -
    # removed at zero recognized pages (story PAGES are never swept;
    # a stale index with dead links would strict-fail view.bat).
    if not story_pages:
        removed += int(safe_io.remove_existing_file(
            runtime_root, "docs/story/index.md",
        ))
    removed += len(safe_io.sweep_runtime_tree(
        runtime_root, "docs/assets/vendor", set(vendored),
    ))

    cache.clear()
    cache.update(model["day_triples"])
    return written, removed


def run_once (cache: dict, runtime_root) -> dict:
    model = fetch_model(cache, runtime_root)
    written, removed = build_and_write(model, cache, runtime_root)
    model["_changed"] = written + removed  # v0.2.6.0: the --build gate
    print(f"[chronicle] site current - {written} file(s) written, "
          f"{removed} removed")
    return model


def _remove_build_tree (runtime_root, relative: str) -> None:
    """Remove only a generator-created candidate/backup tree."""
    safe_io.remove_runtime_tree(runtime_root, relative, allow_missing=True)


def _cleanup_build_trees (runtime_root, relatives: tuple[str, ...]) -> None:
    first_error = None
    for relative in relatives:
        try:
            _remove_build_tree(runtime_root, relative)
        except Exception as exc:
            if first_error is None:
                first_error = exc
    if first_error is not None:
        raise first_error


def _validate_candidate (runtime_root, relative: str) -> None:
    inventory = safe_io.inventory_runtime_tree(runtime_root, relative)
    if inventory is None:
        raise safe_io.SafeIOError("MkDocs candidate is absent")
    files = {entry.relative_path: entry for entry in inventory.entries
             if entry.kind == "file"}
    index = files.get("index.html")
    if index is None or index.length is None or index.length <= 0:
        raise safe_io.SafeIOError("MkDocs candidate index is absent or empty")


def _run_mkdocs (command: list[str], cwd: str) -> tuple[int, str]:
    """Run one exact process while continuously draining bounded diagnostics."""
    process = subprocess.Popen(
        command, cwd=cwd, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert process.stdout is not None
    captured = bytearray()
    reader_failure = []

    def drain () -> None:
        try:
            while True:
                chunk = process.stdout.read(16_384)
                if not chunk:
                    break
                remaining = BUILD_OUTPUT_LIMIT - len(captured)
                if remaining > 0:
                    captured.extend(chunk[:remaining])
        except Exception as exc:
            reader_failure.append(exc)

    reader = threading.Thread(target=drain, name="chronicle-mkdocs-output",
                              daemon=True)
    reader.start()
    timed_out = False
    try:
        returncode = process.wait(timeout=BUILD_TIMEOUT)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        try:
            returncode = process.wait(timeout=10)
        except subprocess.TimeoutExpired as exc:
            raise safe_io.SafeIOError("MkDocs process could not be stopped") from exc
    finally:
        reader.join(timeout=10)
        process.stdout.close()
        if reader.is_alive():
            reader.join(timeout=1)
    if reader.is_alive() or reader_failure:
        raise safe_io.SafeIOError("MkDocs diagnostic stream did not close cleanly")
    detail = bytes(captured).decode("utf-8", errors="replace").strip()
    # Keep exception/console rendering single-line and modest even though the
    # underlying captured pipe has its own hard byte bound.
    detail = " ".join(detail.split())[:2_048]
    if timed_out:
        raise safe_io.SafeIOError(
            "MkDocs build timed out" + (f": {detail}" if detail else ""))
    return returncode, detail


def build_site (runtime_root, interpreter: runtime.BoundPython) -> None:
    """Strict-build a unique candidate and promote it without risking site/."""
    nonce = secrets.token_hex(16)
    candidate = f"site.candidate.{nonce}"
    backup = f"site.backup.{nonce}"
    config_path = str(runtime_root.path / "mkdocs.yml")
    site_path = str(runtime_root.path / candidate)
    # Build the fixed argv through the operation-bound interpreter before the
    # first candidate mutation; BoundPython.argv performs the native recheck.
    command = interpreter.argv(
        "-I", "-B", "-m", "mkdocs", "build", "--strict",
        "--config-file", config_path, "--site-dir", site_path,
    )
    runtime_root.ensure_directory(candidate)
    try:
        returncode, detail = _run_mkdocs(command, str(runtime_root.path))
        if returncode != 0:
            raise safe_io.SafeIOError(
                f"MkDocs strict build failed with exit code {returncode}"
                + (f": {detail}" if detail else "")
            )
        _validate_candidate(runtime_root, candidate)
    except BaseException:
        _remove_build_tree(runtime_root, candidate)
        raise

    try:
        runtime_root.swap_directories(candidate, "site", backup)
    except BaseException as exc:
        # A surviving backup means restoration failed or is ambiguous.  It may
        # be the sole recoverable prior site: preserve both directories and
        # report the failure.  When backup is absent, swap either never moved
        # the target or restored it, so only the rejected candidate is removed.
        backup_inventory = safe_io.inventory_runtime_tree(
            runtime_root, backup, allow_missing=True)
        if backup_inventory is None:
            _remove_build_tree(runtime_root, candidate)
            raise
        raise safe_io.SafeIOError(
            f"MkDocs promotion failed; prior site preserved at {backup}"
        ) from exc
    # Only a returned swap proves the new site is active and the backup is no
    # longer the sole recovery copy.
    _cleanup_build_trees(runtime_root, (candidate, backup))


def build_if_needed (model: dict, runtime_root,
                     interpreter: runtime.BoundPython) -> None:
    """Build-dirty latch: a failure survives unchanged ticks and restarts."""
    global _build_pending
    index = safe_io.read_existing_file(
        runtime_root, "site/index.html", max_bytes=16_777_216,
    )
    if model.get("_changed") or index is None:
        _build_pending = True
    if _build_pending:
        build_site(runtime_root, interpreter)
        _build_pending = False


def _offline_view_url (runtime_root) -> str:
    """Validate the actual selected config and both runtime asset bytes."""
    mermaid_spec = safe_io.asset_spec("fetch-mermaid")
    mermaid = safe_io.read_existing_file(
        runtime_root, f"docs/assets/vendor/{mermaid_spec.name}",
        max_bytes=mermaid_spec.length,
    )
    if mermaid is None:
        raise safe_io.SafeIOError("offline view needs the verified Mermaid asset")
    safe_io.validate_asset("fetch-mermaid", mermaid.data)

    bootswatch_spec = safe_io.asset_spec("fetch-bootswatch")
    bootswatch = safe_io.read_existing_file(
        runtime_root, f"docs/assets/vendor/{bootswatch_spec.name}",
        max_bytes=safe_io.BOOTSWATCH_LOCAL_LENGTH,
    )
    if (bootswatch is None
            or len(bootswatch.data) != safe_io.BOOTSWATCH_LOCAL_LENGTH
            or hashlib.sha256(bootswatch.data).hexdigest()
            != safe_io.BOOTSWATCH_LOCAL_SHA256):
        raise safe_io.SafeIOError(
            "offline view needs the verified import-free Bootswatch asset")

    config_file = safe_io.read_existing_file(
        runtime_root, "mkdocs.yml", max_bytes=16_777_216,
    )
    if config_file is None:
        raise safe_io.SafeIOError("offline view needs generated mkdocs.yml")
    try:
        config = config_file.data.decode("utf-8", errors="strict")
    except UnicodeError as exc:
        raise safe_io.SafeIOError("generated mkdocs.yml is not UTF-8") from exc
    lines = config.splitlines()
    mermaid_line = f"      javascript: {pages.yq(f'assets/vendor/{mermaid_spec.name}')}"
    bootswatch_line = f"  - {pages.yq(f'assets/vendor/{bootswatch_spec.name}')}"
    if (lines.count(mermaid_line) != 1 or lines.count(bootswatch_line) != 1
            or lines.count("  highlightjs: false") != 1):
        raise safe_io.SafeIOError(
            "offline view config does not select the exact local assets")

    site_lines = [line for line in lines if line.startswith("site_url: ")]
    if len(site_lines) != 1:
        raise safe_io.SafeIOError("offline view config has no unique site URL")
    match = re.fullmatch(r"site_url: '([^']+)'", site_lines[0], re.ASCII)
    if match is None or not match.group(1).endswith("/chronicle/"):
        raise safe_io.SafeIOError("offline view site URL is not canonical")
    view_url = match.group(1)
    origin_text = view_url[:-len("/chronicle/")]
    origin = safe_io.normalize_tracker_origin(origin_text)
    if view_url != f"{origin.url}/chronicle/":
        raise safe_io.SafeIOError("offline view site URL is not canonical")

    for line in lines:
        lowered = line.casefold()
        # Protocol-relative references are remote in a browser too.  The sole
        # allowed double slash is the already-validated canonical site_url.
        if "//" in lowered and line != site_lines[0]:
            raise safe_io.SafeIOError(
                "offline view config contains a remote UI dependency")
    return view_url


def _run_view () -> int:
    interpreter = _require_mutating_runtime()
    with runtime.load_session(REPO_ROOT) as client:
        if not client.tracker_alive():
            raise safe_io.TransportUnavailable(
                "authenticated tracker is unavailable for offline view")
        expected_url = f"{client.origin}/chronicle/"
        with safe_io.bind_root(RUNTIME) as runtime_root:
            try:
                with _acquire_with_retry(runtime_root, "writer") as writer:
                    writer.heartbeat()
                    view_url = _offline_view_url(runtime_root)
                    if view_url != expected_url:
                        raise safe_io.SafeIOError(
                            "offline view site URL does not match the authenticated tracker")
                    build_site(runtime_root, interpreter)
                    writer.heartbeat()
            except (safe_io.LeaseBusy, safe_io.LeaseResidue):
                print("[chronicle] writer lease unavailable")
                return 1
        if not client.tracker_alive():
            raise safe_io.TransportUnavailable(
                "authenticated tracker became unavailable during offline view build")
        if not webbrowser.open(view_url, new=2):
            raise safe_io.SafeIOError("local browser could not be opened")
    return 0


def port_alive (port: int) -> bool:
    del port  # origin comes only from the authenticated capability
    try:
        with runtime.load_session(REPO_ROOT) as client:
            return client.tracker_alive()
    except safe_io.SafeIOError:
        return False


def _require_mutating_runtime () -> runtime.BoundPython:
    runtime.ensure_production_mode()
    interpreter = runtime.require_current_chronicle_python()
    runtime.probe_chronicle_python(interpreter)
    return interpreter


def _acquire_with_retry (runtime_root, kind: str, heartbeat=None):
    """Apply the shared 30-second/15-minute live-owner contention bound."""
    waited = 0.0
    while True:
        try:
            return safe_io.acquire_chronicle_lease(runtime_root, kind)
        except safe_io.LeaseBusy:
            if waited >= LOCK_RETRY_BUDGET_S:
                raise
            if heartbeat is not None:
                heartbeat()
            time.sleep(LOCK_RETRY_S)
            waited += LOCK_RETRY_S
            if heartbeat is not None:
                heartbeat()


def loop (interval: float, dark_exit: int = DARK_TICKS_EXIT,
          stale_factor: int = LOCK_STALE_FACTOR,
          do_build: bool = False) -> int:
    """Run under the long singleton, taking the short writer per tick."""
    interpreter = _require_mutating_runtime()
    del stale_factor  # stale takeover is native-owner proof, never an mtime formula
    with safe_io.bind_root(RUNTIME, create=True) as runtime_root:
        try:
            singleton = _acquire_with_retry(runtime_root, "loop")
        except safe_io.LeaseBusy:
            print("[chronicle] loop lock still held - exiting")
            return 1
        except safe_io.LeaseResidue:
            print("[chronicle] unresolved loop-lock residue - exiting")
            return 1

        with singleton:
            dark = 0
            cache: dict = {}
            while True:
                singleton.heartbeat()
                model = None
                try:
                    with _acquire_with_retry(
                            runtime_root, "writer",
                            heartbeat=singleton.heartbeat) as writer:
                        writer.heartbeat()
                        model = run_once(cache, runtime_root)
                        writer.heartbeat()
                        if model is not None and do_build:
                            build_if_needed(model, runtime_root, interpreter)
                            writer.heartbeat()
                except safe_io.LeaseBusy:
                    print("[chronicle] writer busy - tick skipped")
                except safe_io.LeaseResidue:
                    print("[chronicle] unresolved writer-lock residue - exiting")
                    return 1
                except Exception as exc:  # down/failure keeps prior output whole
                    print(f"[chronicle] tick skipped ({exc.__class__.__name__})")
                singleton.heartbeat()
                if port_alive(TRACKER_PORT):
                    dark = 0
                else:
                    dark += 1
                    if dark >= dark_exit:
                        print("[chronicle] tracker port dark - loop exiting")
                        return 0
                time.sleep(interval)


def _run_one_shot (do_build: bool) -> int:
    """Hold the short writer from the first runtime fact through postchecks."""
    interpreter = _require_mutating_runtime()
    with safe_io.bind_root(RUNTIME, create=True) as runtime_root:
        try:
            with _acquire_with_retry(runtime_root, "writer") as writer:
                writer.heartbeat()
                model = run_once({}, runtime_root)
                if do_build:
                    build_if_needed(model, runtime_root, interpreter)
                writer.heartbeat()
                return 0
        except (safe_io.LeaseBusy, safe_io.LeaseResidue):
            print("[chronicle] writer lease unavailable")
            return 1


def verify () -> int:
    """Check devlog parity through a stable retained runtime inventory."""
    runtime.ensure_production_mode()
    try:
        with safe_io.bind_root(RUNTIME) as runtime_root:
            inventory = safe_io.inventory_runtime_tree(
                runtime_root, "docs/devlog", allow_missing=True,
            )
            index_file = safe_io.read_existing_file(
                runtime_root, "docs/devlog/index.md", max_bytes=16_777_216,
            )
    except safe_io.SafeIOError:
        print("[verify] generated site is unsafe or unavailable")
        return 1
    if inventory is None or index_file is None:
        print("[verify] no generated site found - run generate first")
        return 1
    day_files = {
        match.group(1)
        for entry in inventory.entries
        if entry.kind == "file"
        for match in [re.fullmatch(r"(\d{4}-\d{2}-\d{2})\.md",
                                   entry.relative_path, re.ASCII)]
        if match is not None
    }
    try:
        index = index_file.data.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        print("[verify] devlog index is not valid UTF-8")
        return 1
    links = set(re.findall(
        r"\]\((\d{4}-\d{2}-\d{2})\.md\)", index, re.ASCII,
    ))
    print(f"[verify] day pages: {len(day_files)} | index links: {len(links)}")
    if day_files == links:
        print("[verify] PARITY OK")
        return 0
    print(f"[verify] MISMATCH - files-not-linked: {sorted(day_files - links)}"
          f" | links-without-file: {sorted(links - day_files)}")
    return 1


def _run_mode (mode: str, seconds: float | None, do_build: bool) -> int:
    try:
        if mode == "verify":
            return verify()
        if mode == "view":
            return _run_view()
        if mode == "loop":
            assert seconds is not None
            return loop(seconds, do_build=do_build)
        return _run_one_shot(do_build)
    except safe_io.PrerequisiteError as exc:
        print(f"[ABORT] {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"[ABORT] Chronicle generation failed "
              f"({exc.__class__.__name__}: {exc})", file=sys.stderr)
        return 1


def main (argv: list[str]) -> int:
    parsed = parse_cli(argv)
    if parsed is None:
        print(CLI_USAGE, file=sys.stderr)
        return 2
    return _run_mode(*parsed)


if __name__ == "__main__":
    assert _PROCESS_CLI is not None
    sys.exit(_run_mode(*_PROCESS_CLI))
