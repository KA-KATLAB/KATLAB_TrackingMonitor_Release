# KATLAB TrackingMonitor v0.2.0.1 — Release Notes

**Theme:** Report & Badge — the data leaves the tracker.

Thirteenth harvest cycle: two artifact features that let your tracking data travel. The plan survived a 14-pass CDD review loop (7 findings RV1–RV7 fixed in place, ending 5/5 consecutive clean) — including three honesty pins that matter in the final documents: every all-time section in a range report says so, the hero's commit count reads the range calendar (never the all-time total), and the badge's embed limits are stated plainly.

## Highlights

- **The Report:** one click ("Report ⬇" on the Overview, or Ctrl+K → "Export report — 7 days / 30 days") downloads a **self-contained KATLAB-branded HTML document** for the current scope: hero numbers, a momentum block with the honest delta rule, a daily-activity strip, your rhythm punch card, the identity donut, top tasks and files, and (on the 7-day report) your week's wrapped story. Sections built from all-time data are explicitly marked "(all-time)". It opens anywhere, prints to PDF from the browser, and needs no server to view.
- **The Badge:** every monitored repo can wear a live stats card — `http://127.0.0.1:8100/badge/<repo_id>.svg` renders a dark KATLAB card with the repo's last-7-days event count and its live status chip (CLEAN ✓ / N uncommitted / OFFLINE), refreshing within 5 minutes. **Honest limit:** it renders in *local* README previews (VS Code, local doc tools) — github.com cannot display it, since GitHub's image proxy can't reach your machine. The Installation Guideline gains an optional embed section; adding the badge to a README is each repo's own choice.

## Cross-repo

No database migration, no change to any existing endpoint, no new git calls — the backend diff is the version constant, one new root route, and the badge builder (one read-only COUNT query). Zero new dependencies (`package.json` untouched); no new localStorage keys. The Installation Guideline + Onboarding Prompt gain an **optional** README-badge section — the first cross-repo addition since v0.1.10.0, optional and never required.
