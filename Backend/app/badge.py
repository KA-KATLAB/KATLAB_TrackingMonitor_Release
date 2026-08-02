"""v0.2.0.1 D2 (B.2): the live stats badge - one dark SVG card per repo,
served at /badge/{repo_id}.svg (the main.py root route). Data = the
tracker's in-memory status (the /api/repos source) + ONE read-only COUNT
(events in the last 7 UTC days, the calendar's substr day-bucket law -
parity proven in review Pass 3). The interpolated repo id is XML-escaped
(RV6). Deterministic output for identical inputs; system font stacks
only (an SVG artifact never loads webfonts).

HONEST LIMIT (documented in the Installation Guideline): github.com
READMEs cannot render this badge - the camo proxy cannot reach
127.0.0.1. It lives in LOCAL previews (VS Code markdown, local docs).
"""

from __future__ import annotations

import datetime
from xml.sax.saxutils import escape

from .db import get_conn

FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif"


def events_last_7d (repo_id: str) -> int:
    """COUNT over the last 7 UTC day-buckets (today inclusive) - mirrors
    the served calendar's [-7:] window exactly."""
    today = datetime.datetime.now(datetime.timezone.utc).date()
    since = (today - datetime.timedelta(days=6)).isoformat()
    row = get_conn().execute(
        "SELECT COUNT(*) FROM events WHERE repo_id = ? AND substr(ts, 1, 10) >= ?",
        (repo_id, since)).fetchone()
    return int(row[0])


def build_badge (repo_id: str, clean: bool, offline: bool, count: int,
                 events_7d: int) -> str:
    """The 380x80 card: slate-950 rounded rect, the teal ring mark (the
    PWA icon motif), repo id, the 7d count, and the StatusBar-palette
    status chip (CLEAN emerald / N uncommitted amber / OFFLINE zinc)."""
    rid = escape(repo_id)
    if offline:
        chip_fill, chip_text, chip_fg, chip_w = "#52525b", "OFFLINE", "#ffffff", 64
    elif clean:
        chip_fill, chip_text, chip_fg, chip_w = "#059669", "CLEAN ✓", "#ffffff", 64
    else:
        chip_text = f"{count:,} uncommitted"
        chip_fill, chip_fg = "#f59e0b", "#020617"
        chip_w = 24 + 7 * len(chip_text)
    n = f"{events_7d:,}"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="380" height="80" viewBox="0 0 380 80">
<rect x="0.5" y="0.5" width="379" height="79" rx="10" fill="#020617" stroke="#334155"/>
<circle cx="40" cy="40" r="17" fill="none" stroke="#14b8a6" stroke-width="7"/>
<text x="72" y="34" font-family="{FONT}" font-size="16" font-weight="700" fill="#f1f5f9">{rid}</text>
<text x="72" y="56" font-family="{FONT}" font-size="12" fill="#94a3b8">{n} events · last 7d (UTC)</text>
<rect x="{372 - chip_w}" y="14" width="{chip_w}" height="20" rx="4" fill="{chip_fill}"/>
<text x="{372 - chip_w / 2}" y="28" font-family="{FONT}" font-size="10" font-weight="700" fill="{chip_fg}" text-anchor="middle">{chip_text}</text>
<text x="372" y="66" font-family="{FONT}" font-size="9" fill="#475569" text-anchor="end">KATLAB TrackingMonitor</text>
</svg>
"""
