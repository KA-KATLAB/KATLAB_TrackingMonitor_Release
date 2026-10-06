# KATLAB TrackingMonitor v0.4.0.20 - Honest History Graph States

## Fixed

History's Commit graph distinguishes loading, unavailable and preparation from
accepted empty data. Pending or failed reads no longer claim No commits or offer
zero-row exact data. Successful empty reads retain their original explanation;
accepted same-repository graph rows/SVG remain useful through later read failures.

Automatic online-repository fallback cannot reuse the previous repository's
empty/exhausted state or relabel its graph, failure or caption. The existing
graph host stays mounted but hidden for absent/mismatched ownership or empty SVG,
including the interval before its passive clear/adoption effect. The main-list
empty copy also waits for hydration and matching loaded ownership.

Safe restart also excludes a provably older, unrelated process subtree whose
stale parent PID now points at an owned tracker descendant. Windows documents
this [PID reuse limitation](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process).
Cycle and unknown-identity refusal stay intact; equal microsecond timestamps
still require native chronology validation. No arbitrary process is stopped.

## Scope and verification

The History UI fix is render-only: existing API/deadline/cancellation/generation/recovery
owners, 20-commit graph, 50-row presentation and 500-entry fetch limits remain.
No new role, live region, request, helper, dependency, schema or clipboard action.
Graph module failure retains Reload; ordinary graph recovery and History Retry
continue to use their original owners.

The restart correction changes only ownership-forest selection. Initial listener
and command proof, all selected native handles, identity/liveness/ancestry checks,
unchanged listener-set recheck, one deadline and cleanup remain. Mocked stale-edge
tests never target live processes; a portable whole-module fingerprint restores
only the exact reviewed guard and protects unrelated lifecycle code.

Controlled tests run actual callbacks, API handling, derived state and graph
JSX with the real structured DisclosureTable. A controlled host/adoption-effect
model checks clear/adopt ordering, not native SVG paint. Original complete History
pre-render and App-outside-graph fingerprints stay fixed; only two exact bottom
gate additions are reversed for the latter. The reviewed graph is pinned
separately. Callback/SSR/static/HTTP evidence is not native layout, keyboard or
assistive acceptance. Native v0.4 acceptance remains pending under the continuing
independent-delivery override; earlier launcher-fixture limits remain explicit.

The unused synthetic runtime row from the earlier probe remains held for
separately authorized cleanup. This release does not hand-edit runtime data.
The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm);
no dependency major migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Evidence and publication details are recorded in
`temp/Plan/PLAN_v0.4.0.20_Honest_History_Graph_States.txt`.

Previous [v0.4.0.19 notes](TrackingMonitor_v0.4.0.19_Release_Notes.md)
retain their historical scope with only the two move-affected links rebased.
