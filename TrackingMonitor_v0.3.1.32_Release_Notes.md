# KATLAB TrackingMonitor v0.3.1.32 — AnyIO Security Baseline

Prevent older installations from retaining AnyIO below the reviewed security floor.

## Changed

- Backend requires `anyio>=4.14.2`, already a transitive Starlette dependency.
  Existing Starlette and other requirements, launcher failure handling and all
  application/API/UI contracts remain unchanged.
- The upstream patch corrects internationalized TLS hostname handling, worker
  stderr deadlock and supplementary process-group forwarding.
  [Maintainer release](https://github.com/agronholm/anyio/releases/tag/4.14.2).
- Focused installed-library regressions check IDNA2008 Unicode hostname handling,
  ASCII/punycode preservation, server/no-hostname and custom SSLContext paths.
  They use in-memory TLS objects and a mocked handshake, never a live connection.

## Deployment and verification boundaries

- The reviewed deployment selects 4.14.2 with temporary process-scoped constraints
  and an isolated exact-package test environment. Available 4.15.1 is not part of
  this deployment. The repository declares a minimum, not a permanent exact pin;
  ordinary later installations can resolve newer compatible versions.
- This is dependency hardening, not evidence of a Tracker compromise. No owned
  application runtime code directly calls the affected AnyIO process/TLS APIs.
  The group-forwarding advisory has differing upstream/database ranges and concerns POSIX behavior,
  not demonstrated exploitation on this Windows instance.
- No blanket or global Python upgrade, Chronicle package/asset replacement, or
  claim to clear all GitHub alerts. Chronicle's separately identified dependency
  findings still need their own compatibility review.
- Focused regressions, package-version queries and live API/artifact checks do
  not constitute a complete security audit, TLS attack test or native UI test.
