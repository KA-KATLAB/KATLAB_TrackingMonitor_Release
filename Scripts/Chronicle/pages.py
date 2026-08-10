"""Markdown/YAML builders for the KATLAB Chronicle (PLAN v0.2.4.0).

Pure functions - no I/O, no clock (RV2/RV29: wall-clock never enters
emitted content; the one data-through stamp is passed IN and lands on
the Overview page only). Every interpolated data string passes
md_escape() or code_span() (D10) and every string interpolated into
the generated mkdocs.yml passes yq() (RV30). Builders receive SERVED
values only (D5) - no re-clustering, no derived effort.
"""

# D10: kills links/HTML/emphasis/code-outs; backslash-escaping covers
# CommonMark punctuation including < and > (blocks raw HTML).
_MD_ESCAPE = set("\\`*_{}[]()#!|<>")

STATUS_CHIP = {"done": "✓", "in-progress": "…", "pending": "•"}

FOOTER = "\n---\n\n*KATLAB Chronicle*\n"  # static everywhere (RV29); no version claim


def md_escape (value) -> str:
    return "".join(("\\" + ch) if ch in _MD_ESCAPE else ch for ch in str(value))


def code_span (value) -> str:
    """Monospace for path-ish data; falls back to escaping when the
    content itself could break out of a code span (D10 hostile case)."""
    text = str(value)
    if "`" in text or "\n" in text:
        return md_escape(text)
    return f"`{text}`"


def yq (value) -> str:
    """RV30: single-quoted YAML scalar with quote-doubling."""
    return "'" + str(value).replace("'", "''") + "'"


def fmt_minutes (minutes: int) -> str:
    return f"≈{minutes}m"  # D5: effort always ~-prefixed


def flatten_plan_path (plan_file: str) -> str:
    """RV8: full repo-relative path, separators -> __ (collision-free)."""
    return plan_file.replace("/", "__").replace("\\", "__")


def repo_status_text (repo: dict) -> str:
    """Mirrors the StatusBar wording exactly (Overview cards)."""
    if repo.get("offline"):
        return "OFFLINE"
    if repo.get("clean"):
        return "CLEAN ✓"
    return f"{repo.get('count', 0)} uncommitted"


def build_overview (repos: list[dict], calendar_all: list[dict],
                    data_through: str | None) -> str:
    lines = ["# \U0001F3E0 Overview", ""]
    for repo in repos:
        status = repo_status_text(repo)
        branch = repo.get("branch")
        branch_part = f" · ⎇ {code_span(branch)}" if branch else ""
        last = repo.get("last_event_ts") or "never"
        lines.append(f"- **{md_escape(repo.get('name', repo['id']))}** "
                     f"({code_span(repo['id'])}) — {status}{branch_part} "
                     f"· last capture {code_span(last)}")
    events = sum(d["events"] for d in calendar_all)
    commits = sum(d["commits"] for d in calendar_all)
    minutes = sum(d["minutes"] for d in calendar_all)
    lines += ["", "## Workspace totals (last 365d, UTC)", "",
              f"- {events:,} events · {commits:,} commits · "
              f"{fmt_minutes(minutes)}"]
    # RV29: the ONLY page carrying the data-through stamp; RV17: the
    # totals above read the UNSCOPED calendar (never summed scoped).
    if data_through:
        lines += ["", f"*data through {code_span(data_through)} (UTC)*"]
    return "\n".join(lines) + FOOTER


def build_devlog_index (day_totals: list[tuple[str, int, int]]) -> str:
    """day_totals: (day, events, commits) newest-first, active days only."""
    lines = ["# \U0001F4D3 Devlog", "", "*(last 365d, UTC)*", ""]
    if not day_totals:
        lines.append("no captures yet")  # RV31 honest empty state
        return "\n".join(lines) + FOOTER
    month = None
    for day, events, commits in day_totals:
        m = day[:7]
        if m != month:
            month = m
            lines += [f"## {month}", ""]
        lines.append(f"- [{day}]({day}.md) — {events} events · "
                     f"{commits} commits")
    return "\n".join(lines) + FOOTER


def build_day_page (day: str, sections: list[dict]) -> str:
    """sections: [{repo, minutes, groups, commits}] where groups =
    [(kind, ref, title, why, files)] with kind in task|stale|none and
    files = [(path, count)]; commits = [(short, message, ts)]."""
    lines = [f"# \U0001F4D3 {day} (UTC)", ""]
    for sec in sections:
        lines += [f"## {code_span(sec['repo'])} — "
                  f"{fmt_minutes(sec['minutes'])}", ""]
        for kind, ref, title, why, files in sec["groups"]:
            if kind == "none":
                lines.append("### (unattributed)")  # RV32
            elif kind == "stale":
                lines.append(f"### {code_span(ref)} *(plan no longer present)*")
            else:
                lines.append(f"### {code_span(ref)} — {md_escape(title)}")
                if why:
                    lines.append(f"*{md_escape(why)}*")
            lines.append("")
            for path, count in files:
                suffix = f" ×{count}" if count > 1 else ""
                lines.append(f"- {code_span(path)}{suffix}")
            lines.append("")
        if sec["commits"]:
            lines += ["**Commits**", ""]
            for short, message, ts in sec["commits"]:
                lines.append(f"- {code_span(short)} {md_escape(message)} "
                             f"— {code_span(ts)}")
            lines.append("")
    return "\n".join(lines) + FOOTER


def build_plan_page (repo: str, plan_file: str, tasks: list[dict]) -> str:
    done = sum(1 for t in tasks if t["status"] == "done")
    lines = [f"# \U0001F4CB {md_escape(plan_file)}", "",  # H1 = true path (RV8)
             f"Repo: {code_span(repo)} · {done}/{len(tasks)} done", ""]
    for t in tasks:
        chip = STATUS_CHIP.get(t["status"], "•")
        lines += [f"## {chip} {code_span(t['task_id'])} — "
                  f"{md_escape(t['title'])}", ""]
        if t.get("why"):
            lines += [f"*{md_escape(t['why'])}*", ""]
        for pattern in t.get("files", []):
            lines.append(f"- {code_span(pattern)}")
        if t.get("files"):
            lines.append("")
    return "\n".join(lines) + FOOTER


def build_changelog (repo: str, entries: list[dict], truncated: bool) -> str:
    """entries newest-first: {short, message, ts, reasons} with reasons =
    [(kind, ref, why, n_events)] and kind in task|stale|none."""
    lines = [f"# \U0001F4DC Changelog — {code_span(repo)}", "",
             "*commits newest-first, grouped by the REASON that caused "
             "them (task attribution)*", ""]
    if not entries:
        lines.append("(no commits recorded)")  # RV31
        return "\n".join(lines) + FOOTER
    for e in entries:
        lines += [f"## {code_span(e['short'])} — {code_span(e['ts'])}", "",
                  f"**{md_escape(e['message'])}**", ""]
        if not e["reasons"]:
            lines.append("- *(no linked captures)*")
        for kind, ref, why, n in e["reasons"]:
            if kind == "none":
                lines.append(f"- *(unattributed)* · {n} events")
            elif kind == "stale":  # RV9
                lines.append(f"- {code_span(ref)} *(plan no longer present)* "
                             f"· {n} events")
            else:
                lines.append(f"- {code_span(ref)} — {md_escape(why)} "
                             f"· {n} events")
        lines.append("")
    if truncated:
        lines.append("*older history truncated (fetch cap)*")  # D2
    return "\n".join(lines) + FOOTER


def build_architecture (sources: list[tuple[str, str]]) -> str:
    lines = ["# \U0001F3DB Architecture diagrams", "",
             "*embedded verbatim from temp/Ref — the design source "
             "of truth (machine-local)*", ""]
    for name, text in sources:
        lines += [f"## {md_escape(name)}", "", "```mermaid", text.strip(),
                  "```", ""]
    return "\n".join(lines) + FOOTER


def build_fix_hook () -> str:
    """IMPL-1 (the Live_arch fix_windows_paths lesson): mermaid2 builds
    its script path with os.path.relpath, which emits BACKSLASHES on
    Windows. This generated MkDocs hook normalizes any backslashed
    src/href attribute back to URL separators at build time."""
    return '''"""GENERATED by Scripts/Chronicle/generate.py - do not edit.
Normalizes Windows backslashes in src/href attributes (mermaid2 builds
its script path with os.path.relpath - the Live_arch diagnosed trap)."""

import re

_ATTR = re.compile(r'(src|href)="([^"]*\\\\[^"]*)"')


def on_post_page (output, **kwargs):
    return _ATTR.sub(
        lambda m: '{}="{}"'.format(m.group(1), m.group(2).replace("\\\\", "/")),
        output)
'''


def build_extra_css () -> str:
    """IMPL-3 (user 2026-08-06 'quick CSS enhance'): the KATLAB
    product look over Bootswatch dark (T5). DARK ONLY. Fonts follow
    the house fonts-with-fallback precedent: the @import fails
    silently offline and the system stacks take over."""
    return """/* KATLAB Chronicle - product-look stylesheet (generated - do not edit) */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Azeret+Mono:wght@400;600&display=swap');

:root {
  --k-bg: #020617;        /* slate-950 - the app body */
  --k-panel: #0f172a;     /* slate-900 - the app header/cards */
  --k-border: #1e293b;    /* slate-800 */
  --k-text: #cbd5e1;      /* slate-300 */
  --k-head: #f1f5f9;      /* slate-100 */
  --k-muted: #64748b;     /* slate-500 */
  --k-teal: #2dd4bf;
  --k-teal-soft: #5eead4;
  --k-sans: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
  --k-mono: 'Azeret Mono', Consolas, 'Courier New', monospace;
}

html { scroll-behavior: smooth; }
body {
  background:
    radial-gradient(1100px 500px at 15% -10%, rgba(45, 212, 191, 0.06), transparent 60%),
    var(--k-bg);
  color: var(--k-text);
  font-family: var(--k-sans);
  letter-spacing: 0.01em;
}
::selection { background: rgba(45, 212, 191, 0.25); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--k-bg); }
::-webkit-scrollbar-thumb { background: var(--k-border); border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: #334155; }

/* navbar - the app header. IMPL-3c: NO backdrop-filter - it creates
   a stacking/clipping context that traps the dropdown menus (they
   open invisible/unclickable); solid panel + explicit z-order. */
.navbar, .navbar.bg-primary, .navbar-dark {
  background: #0f172a !important;
  border-bottom: 1px solid var(--k-border);
  font-family: var(--k-sans);
  z-index: 1030;
}
.navbar .dropdown-menu { z-index: 1031; }
.navbar-brand { color: var(--k-teal) !important; font-weight: 800; }
.navbar .nav-link { color: var(--k-text) !important; font-weight: 600; }
.navbar .nav-link:hover, .navbar .nav-link.active { color: var(--k-teal-soft) !important; }
.dropdown-menu {
  background: var(--k-panel); border: 1px solid var(--k-border);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
.dropdown-item { color: var(--k-text); font-size: 0.9rem; }
.dropdown-item:hover { background: var(--k-border); color: var(--k-teal-soft); }
.dropdown-item.active { background: rgba(45, 212, 191, 0.12); color: var(--k-teal); }

/* main column */
[role="main"] { padding-top: 1rem; }
h1, h2, h3, h4 { font-family: var(--k-sans); color: var(--k-head); font-weight: 800; }
h1 {
  font-size: 2rem; margin-bottom: 1.25rem; padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--k-border);
}
h2 {
  font-size: 1.25rem; margin-top: 2.25rem;
  padding-left: 0.75rem; border-left: 3px solid var(--k-teal);
}
h3 { font-size: 1rem; color: #e2e8f0; margin-top: 1.5rem; }
h1 .headerlink, h2 .headerlink, h3 .headerlink { color: var(--k-border); text-decoration: none; }
a, a:visited { color: var(--k-teal); text-decoration: none; }
a:hover { color: var(--k-teal-soft); text-decoration: underline; }
em { color: var(--k-muted); }
hr { border-color: var(--k-border); opacity: 1; }

/* lists read as rows - the app card rhythm */
[role="main"] ul { padding-left: 1.1rem; }
[role="main"] > ul > li, [role="main"] h2 ~ ul > li {
  margin: 0.3rem 0; line-height: 1.65;
}
[role="main"] > ul {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--k-border); border-radius: 10px;
  padding: 0.9rem 1.2rem 0.9rem 2rem; list-style: none;
}
[role="main"] > ul > li::marker { color: var(--k-teal); }

/* code - the app mono voice */
code {
  font-family: var(--k-mono); font-size: 0.82em;
  color: var(--k-teal-soft); background: var(--k-panel);
  border: 1px solid var(--k-border); border-radius: 5px;
  padding: 0.1em 0.4em;
}
pre {
  background: #0b1220; border: 1px solid var(--k-border);
  border-radius: 10px; padding: 1rem;
}
pre code { background: transparent; border: 0; padding: 0; color: inherit; }

/* tables */
table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
th {
  background: var(--k-panel); color: var(--k-head); text-align: left;
  padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--k-border);
  font-family: var(--k-sans);
}
td { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--k-border); }
tr:hover td { background: rgba(15, 23, 42, 0.6); }

/* TOC sidebar - the stock theme ships it LIGHT and non-wrapping
   (IMPL-3b: the "top-left white rectangle" with overflowing task
   refs) - dark panel + wrap-anywhere for long code-ish headings */
.bs-sidebar {
  background: rgba(15, 23, 42, 0.55) !important;
  border: 1px solid var(--k-border); border-radius: 10px;
  padding: 0.75rem 0.5rem;
}
.bs-sidebar .nav > li > a {
  color: var(--k-muted); font-size: 0.78rem; line-height: 1.4;
  white-space: normal; overflow-wrap: anywhere; word-break: break-word;
  padding: 0.3rem 0.6rem; display: block;
}
.bs-sidebar .nav > li > a:hover,
.bs-sidebar .nav > li > a.active {
  color: var(--k-teal); background: transparent;
  border-left: 2px solid var(--k-teal);
}
.bs-sidebar .nav .nav { padding-left: 0.6rem; }

/* search + keyboard modals - Bootstrap ships them WHITE */
.modal-content {
  background: var(--k-panel); color: var(--k-text);
  border: 1px solid var(--k-border); border-radius: 12px;
}
.modal-header, .modal-footer { border-color: var(--k-border); }
.modal-title { color: var(--k-head); font-family: var(--k-sans); }
.modal-content .btn-close { filter: invert(1) grayscale(1); }
#mkdocs-search-results article { border-bottom: 1px solid var(--k-border); padding: 0.5rem 0; }
#mkdocs-search-results h3 a { color: var(--k-teal); }
kbd {
  background: var(--k-bg); color: var(--k-teal-soft);
  border: 1px solid var(--k-border); border-radius: 4px;
  font-family: var(--k-mono);
}

/* search input - default form-control is white */
input.form-control, .form-control:focus {
  background: var(--k-bg); color: var(--k-text);
  border: 1px solid var(--k-border); box-shadow: none;
}
.form-control::placeholder { color: var(--k-muted); }
.form-control:focus { border-color: var(--k-teal); }

/* nav dropdowns: long plan paths must wrap inside the box */
.dropdown-menu { max-width: min(520px, 92vw); }
.dropdown-item {
  white-space: normal; overflow-wrap: anywhere; word-break: break-word;
  font-family: var(--k-mono); font-size: 0.8rem; line-height: 1.45;
}

/* IMPL-3e: NESTED dropdowns as a CLICK-to-expand INLINE ACCORDION
   (replaces the IMPL-3d hover flyouts - hover geometry was fragile:
   pointer gaps + off-screen flyouts near the right edge / viewport
   bottom made items unclickable). No flyout geometry at all: the
   submenu expands IN PLACE inside the parent menu; assets/nav.js
   toggles .open in the CAPTURE phase so Bootstrap's autoClose never
   swallows the click. Long menus scroll - safe now that nothing is
   position:absolute inside them. */
.navbar .dropdown-menu { max-height: 78vh; overflow-y: auto; }
.dropdown-submenu > .dropdown-menu {
  position: static; display: none;
  margin: 0.15rem 0 0.35rem 0.9rem; padding: 0 0 0 0.4rem;
  border: 0; border-left: 1px solid var(--k-border); border-radius: 0;
  box-shadow: none; max-height: none; overflow: visible; max-width: none;
}
.dropdown-submenu.open > .dropdown-menu { display: block; }
.dropdown-submenu > a.dropdown-item::after {
  content: "\\00BB"; float: right; margin-left: 0.5rem;
  color: var(--k-muted); transition: transform 0.15s ease;
  display: inline-block;
}
.dropdown-submenu.open > a.dropdown-item::after {
  transform: rotate(90deg); color: var(--k-teal);
}
.dropdown-submenu > a.dropdown-item { font-weight: 600; }

/* mermaid diagrams breathe */
.mermaid { background: transparent; text-align: center; margin: 1.25rem 0; }

/* footer */
footer { color: var(--k-muted); border-top: 1px solid var(--k-border); margin-top: 3rem; }
"""


def build_nav_js () -> str:
    """IMPL-3e: click-to-expand accordion for nested nav levels.
    CAPTURE-phase listener so it runs BEFORE Bootstrap's document-level
    autoClose handler (registration order would otherwise close the
    whole menu before the toggle lands). Leaf items (li without the
    dropdown-submenu class) are untouched and navigate normally."""
    return """// GENERATED by Scripts/Chronicle/generate.py - do not edit.
// Click-to-expand accordion for nested navbar levels (IMPL-3e).
document.addEventListener('click', function (ev) {
  var a = ev.target && ev.target.closest
        ? ev.target.closest('.dropdown-submenu > a') : null;
  if (!a) return;
  ev.preventDefault();
  ev.stopPropagation();
  a.parentElement.classList.toggle('open');
}, true);
"""


def render_nav (items: list, indent: str = "  ") -> list[str]:
    """items: [(label, target_str | nested_items)] -> mkdocs nav lines.
    Every label and path goes through yq (RV30)."""
    lines: list[str] = []
    for label, target in items:
        if isinstance(target, str):
            lines.append(f"{indent}- {yq(label)}: {yq(target)}")
        else:
            lines.append(f"{indent}- {yq(label)}:")
            lines.extend(render_nav(target, indent + "  "))
    return lines


def build_mkdocs_yml (nav: list, mermaid_js: str, bootswatch_css: str,
                      site_url: str) -> str:
    """The generated config. T1 use_directory_urls false; T3 pairs with
    serve.bat; T6 (RV16): the fence MUST be mermaid2.fence_mermaid -
    the other forms render every diagram blank on a non-Material theme."""
    lines = [
        "# GENERATED by Scripts/Chronicle/generate.py - do not edit.",
        f"site_name: {yq('KATLAB Chronicle')}",
        f"site_description: {yq('Auto-written devlog, plans and reason-grouped changelog')}",
        f"site_url: {yq(site_url)}",  # D4: panzoom requirement
        "use_directory_urls: false",  # T1: file:// view.bat works
        "hooks:",
        f"  - {yq('fix_windows_paths.py')}",  # IMPL-1: backslash fix
        "theme:",
        "  name: mkdocs",
        "  nav_style: dark",
        "  navigation_depth: 3",
        "  highlightjs: true",
        "  hljs_style: github-dark",
        "extra_css:",
        f"  - {yq(bootswatch_css)}",  # T5: CSS-layer dark swap
        f"  - {yq('assets/extra.css')}",
        "extra_javascript:",
        f"  - {yq('assets/nav.js')}",  # IMPL-3e: accordion submenus
        "plugins:",
        "  - search",
        "  - mermaid2:",
        f"      javascript: {yq(mermaid_js)}",  # T2: UMD, never CDN ESM
        "      arguments:",
        "        theme: 'dark'",
        "  - panzoom:",
        "      key: 'alt'",
        "      hint_location: 'bottom'",
        "      full_screen: true",
        "markdown_extensions:",
        "  - tables",
        "  - pymdownx.superfences:",
        "      custom_fences:",
        "        - name: mermaid",
        "          class: mermaid",
        "          format: !!python/name:mermaid2.fence_mermaid",  # T6/RV16
        "nav:",
    ]
    lines.extend(render_nav(nav))
    return "\n".join(lines) + "\n"
