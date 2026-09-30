# KATLAB TrackingMonitor v0.3.1.25 — Backend Security Floor

Keep older installations from retaining an unreviewed Starlette dependency.

## Changed

- Require `starlette>=1.3.1` explicitly alongside the unchanged backend
  requirements. This existing FastAPI dependency uses the already-tested
  deployed version as the reviewed floor, not a new runtime subsystem.
- The old manifest allowed older pairs affected by the publisher's Windows
  StaticFiles advisory. Its first patched version is 1.1.0; the project adopts
  the already-deployed 1.3.1 baseline.
  [Upstream advisory](https://github.com/Kludex/starlette/security/advisories/GHSA-wqp7-x3pw-xc5r).
- Normal and demo installers retain their existing constraint resolution and
  failure handling. No blanket upgrade, Chronicle dependency change, application
  route/API/UI change or security suppression.

## Verification boundaries

- The current runtime was already patched. This is installation-policy hardening,
  not evidence of current compromise or a claim to clear GitHub's separate
  default-branch alerts or every transitive dependency advisory.
- Manifest tests and actual StaticFiles guard checks use isolated local fixtures
  with filesystem I/O blocked for rejected UNC-style inputs. No live attack,
  SMB request, credential access or vulnerable-package execution is performed.
- Resolver dry-runs verify constraints and Python3.10-target compatibility, not a
  Python3.10 runtime installation. Current-runtime tests and HTTP/artifact smoke
  remain distinct from native browser interaction and a complete security audit.
