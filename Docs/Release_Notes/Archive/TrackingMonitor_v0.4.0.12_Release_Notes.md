# KATLAB TrackingMonitor v0.4.0.12 - Unavailable View States

## Fixed

An open diff previously retained its content but lost Hide when its repository
went offline. Local Hide now remains available, including accepted empty diffs.
Offline context distinguishes retained content, pending work and recovery.
Loading/retrying still requires an available repository. Offline Hide returns
focus only from its own invoked button to the connected containing row.

Mission previously displayed successful-empty messages alongside failed session,
evidence and timeline reads. Errors now retain their existing Retry without those
contradictory claims. Exact data is hidden for failed timeline reads and a failed
session list with no activity rows. Independently accepted nonempty timeline data
remains available.

## Scope and verification

Actual-source controlled lifecycle, API and SSR regressions cover offline
transitions, owned focus, read failures/timeouts, successful empty results and
recovery. These checks do not establish native browser focus or rendered geometry.
Structural test oracles now share physical-CRLF normalization without changing
unaffected baseline hashes or product logic.
Native v0.4 acceptance remains pending. No new dependencies, request behavior,
polling, backend contracts or configuration. Existing dependency/chunk notices
and the earlier unconfirmed launcher-fixture transient are unchanged.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, verification, activation and publication evidence is recorded in
`temp/Plan/PLAN_v0.4.0.12_Unavailable_View_States.txt`.

Previous [v0.4.0.11 notes](TrackingMonitor_v0.4.0.11_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
