# KATLAB TrackingMonitor v0.3.1.30 — Weekly Snapshot Visibility

Weekly summaries show which dates they describe and retain commit-only activity.

## Changed

- Momentum names the selected and preceding UTC windows and supplied coverage.
  Missing values are Unavailable; incomplete pairs omit comparison deltas and
  split sparklines. Complete zero-filled windows still mean measured zero.
- Weekly snapshot holds already accepted data while open, without claiming a
  fresh fetch. Its date labels come from its own supplied weekly rows.
- Zero capture events no longer hide commits, files or other supplied facts.
  Available zero-day rows retain their chart and exact-data table. Missing day
  data and missing calendar streak are explicitly unavailable.
- Calendar range labels share the existing report implementation. Normal sums,
  formatting, full-window comparison rules, daily labels, report output and
  shared dialog behavior are unchanged. No new dependency or backend API.

## Verification boundaries

- Date bounds describe supplied data, not freshness. Calendar streak describes
  its retained calendar; busiest-hour values use server-local time.
- Actual-component SSR and controlled hook/shell/disclosure tests are not native
  browser rendering, keyboard, focus or assistive-technology verification.
  Live HTTP/artifact checks are separate from those native interactions.
