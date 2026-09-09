# Impeccable-Informed Design Intelligence

## 1. Purpose and authority

This guide preserves the material lessons from `pbakaus/impeccable` that can
improve KATLAB TrackingMonitor. It is an advisory reasoning guide, not an
installation record, executable skill, command set, or second design system.

Apply sources in the repository's established order:

1. Current user request and explicit rulings.
2. Root [`AGENTS.md`](../AGENTS.md) and
   [`Repository_Guide.md`](Repository_Guide.md).
3. Task-relevant normative contracts under `Docs/`, especially
   [`UI_Design_System.md`](../Docs/UI_Design_System.md).
4. Current implementation and configuration.
5. Design and architecture history under `Claude_Info/`.
6. Current and archived release notes for version-specific intent.

An active plan records task-local intent but never outranks current user rulings
or normative contracts. Do not create parallel `PRODUCT.md`, `DESIGN.md`, or
`.impeccable/` authorities for this repository.

## 2. Research snapshot

- Reviewed: 2026-09-09.
- Repository: `https://github.com/pbakaus/impeccable`.
- Default branch at review time: `main`.
- Pinned commit: `12ffee04c2a3682e0ccf09bf34d6711951dd551d`.
- Repository API `pushed_at` observed: `2026-09-08T19:15:50Z`.
- During the review, `main` advanced once from `d25059e...` to the pinned commit.
  The compared release commit changed 51 files; only `package.json` was in the
  focused manifest, and its change was limited to CLI/platform-package versions.
  The manifest byte total and all material conclusions remained unchanged.
- The recursive Git tree contained 3,644 entries and 3,097 blobs. Reproduce the
  count from `GET /repos/pbakaus/impeccable/git/trees/{sha}?recursive=1` by
  counting all `tree` items and those whose `type` is `blob`.
- The focused manifest in section 12 contains exactly 60 files and 764,761 bytes
  at that commit. `LICENSE` and `NOTICE.md` were verified separately.
- The pinned README advertises one skill, 23 commands, and 61 deterministic
  checks. The 23 command names were independently reconciled with
  `skill/scripts/command-metadata.json`; 61 remains an upstream snapshot claim
  because its detector was not installed or executed against KATLAB.
- Upstream is Apache-2.0. Its notice attributes the iOS/Android platform guidance
  to `ehmo/platform-design-skills` under MIT. This guide paraphrases ideas and
  copies no upstream code, assets, or long prose.

Pinned sources matter: upstream can change while this guidance remains stable.
A later refresh must use section 11 instead of silently importing the latest
rules.

## 3. Disposition vocabulary

| Disposition | Meaning |
|---|---|
| Adopt | Use the principle directly in future KATLAB work. |
| Map | The benefit already exists locally; strengthen or route to its authority. |
| Defer | Preserve as a future idea requiring its own approved workflow. |
| Reject | Inapplicable or conflicting material that must not alter KATLAB. |

## 4. Source-to-advantage traceability ledger

This ledger is the finite record of every distinct material advantage found in
the focused review. Similar rules are grouped once rather than counted as new
advantages merely because several upstream files repeat them. A dedicated
`skill/reference/*.md` filename identifies its topic section; parenthetical topic
names identify the relevant sections in larger multi-topic documents.

| Upstream source path / topic section | Distinct advantage | Disposition and KATLAB rationale/authority |
|---|---|---|
| `README.md`, `skill/SKILL.src.md`, `skill/reference/routing.md`, `skill/scripts/command-metadata.json` | One discoverable skill routes a broad design vocabulary to small, task-specific references, reducing prompt/context load. | **Adopt:** keep `AGENTS.md` compact and route depth here; load only task-relevant lenses after startup. |
| `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `init.md`, `document.md`, `new-work.md` | Product truth, durable visual rules, machine-readable tokens, and surface-local direction are distinct concerns. | **Map:** use the local hierarchy in section 1. A future machine mirror must be generated or drift-checked, never hand-maintained as equal truth. |
| `CLAUDE.md`, `doctor.md` | Cheap bounded context checks are separated from expensive version, schema, registry, and truth-drift diagnosis; results are structured and throttled. | **Adopt conceptually:** keep startup concise and reserve deep maintenance checks for relevant work. Do not add upstream tooling. |
| `skill/SKILL.src.md`, `craft.md`, `new-work.md` | The deprecated craft alias adds no separate behavior, while refinement, new-surface work, and redesign have different preservation and approval boundaries; missing docs do not make mature software greenfield. | **Adopt:** route by the actual work class in section 5 instead of treating `craft` as a distinct workflow. |
| `shape.md`, `new-work.md`, `visualize.md` | Material UI work is shaped before code using only decision-changing questions, real content, and genuinely different structural options. | **Adopt:** put the direction contract in the active plan; do not make routine fixes ceremonial. |
| `operate.md` | Surface mode determines quality priorities instead of applying one aesthetic recipe to every product. | **Adopt:** TrackingMonitor is Operate-first; use the mode map in section 6. |
| `craft-floor.md` | Accessibility, state coverage, focus, overflow, clear copy, real content, and requirement coverage are a shipping floor, not optional polish. | **Map:** `Docs/UI_Design_System.md` is the normative implementation contract. |
| `critique.md` | A fresh human-first critique examines specificity, hierarchy, cognitive load, emotion, discoverability, personas, and heuristics before mechanical evidence anchors judgment. | **Adopt:** review-only unless implementation is explicitly requested; use the finding format in section 8. |
| `audit.md`, `audit.native.md` | Technical UI review separately examines accessibility, performance, responsiveness, theming, and implementation integrity. | **Adopt for web scope:** use local checks and evidence. Native rules remain rejected until a native product exists. |
| `polish.md` | Defects are triaged before visual micro-detail, and finishing is bounded instead of becoming endless redesign. | **Adopt:** use the priority order in section 8 and preserve scope. |
| `clarify.md`, `harden.md`, `onboard.md` | Clear state, truthful recovery, production edge cases, useful empty states, and contextual first-use guidance form one resilient user path. | **Map:** preserve backend truth, English-only scope, existing onboarding, and all required error/stale/offline paths. |
| `adapt.md`, `adapt.native.md`, `android.md`, `ios.md` | Adaptation accounts for layout, input, zoom, orientation, safe areas, platform conventions, bandwidth, and real-device evidence rather than pixel scaling. | **Map web principles** to the local responsive contract; **reject** native navigation/component prescriptions for the current React app. |
| `animate.md` | Motion must explain feedback, state, relationship, or an earned focal moment and include interruption and reduced-motion behavior. | **Map:** local motion rules, durations, cancellation, and reduced-motion sources remain authoritative. |
| `colorize.md` | Color works as a semantic role system with non-color cues and measured contrast, not decoration scattered across a page. | **Map:** retain the KATLAB palette and six attribution colors. |
| `typeset.md`, `layout.md` | Role-based typography, hierarchy, reading order, rhythm, focus order, content stress, and density are reviewed together. | **Map:** retain the local fonts, 4px rhythm, responsive shell, and bounded overflow. |
| `bolder.md`, `quieter.md`, `distill.md` | Intensity can be raised, lowered, or simplified locally without erasing identity or necessary expert complexity. | **Adopt:** scope is sovereign; preserve operational density and neighboring surfaces. |
| `delight.md`, `overdrive.md` | Delight is earned and repeat-safe; an operational product becomes exceptional first through speed, legibility, scale, and resilience rather than spectacle. | **Adopt selectively:** reserve expression for truthful KATLAB moments; ambitious effects require explicit tradeoff approval and fallback. |
| `optimize.md` | Performance work starts with a measured bottleneck and compares before/after evidence. | **Adopt:** preserve complete-model behavior, lazy boundaries, and mounted-item limits. |
| `extract.md` | Shared primitives are extracted from repeated same-intent patterns instead of speculative abstraction. | **Map:** prefer small helpers and roughly three demonstrated uses; do not invent a component framework. |
| `docs/ENGINE.md` (architecture/checks), `crates/core/src/checks/rules.rs`, `text_rules.rs` | A self-contained deterministic core can serve source, static HTML, browser, WASM, and CI adapters with measurable rules, JSON output, exit codes, and false-positive guards, without an LLM/API key at runtime. | **Defer:** potentially valuable future tooling; the current task installs or runs none of it. A KATLAB plan must prove applicability and development/toolchain cost first. |
| `docs/ENGINE.md` | Namespaced rule packs extend checks without forking the core while preserving built-in behavior and common waiver handling. | **Defer:** useful only if KATLAB first approves a detector and its maintenance/security cost. |
| `hooks.md`, `.impeccable/config.json`, `README.md` (hooks/configuration) | Fast per-edit checks plus a deduplicated deeper finish check provide timely evidence; shared/local config, bounded output, and timestamped rule/value/file waivers are safer than disabling rule classes. A verified before-edit baseline can suppress confirmed pre-existing findings and distinguish `new` from `attribution unknown`; unknown does not prove the current session caused a finding. | **Defer hooks, adopt evidence discipline:** checks must be proportional, output bounded, exceptions precise, and causal attribution no stronger than the baseline proves. Hooks may execute outside model approval. |
| `README.md`, `live.md`, `live-setup.md`, `docs/adr-live-variant-mode.md` | A browser selection/variant loop can retain application state through HMR, compare materially different options, tune the selected option, and apply inspectable source. | **Defer:** do not imply this facility exists. Any future experiment must be isolated and independently planned. |
| `live.md`, `live-setup.md`, `docs/adr-live-variant-mode.md` | Journals, explicit phases, idempotent resume/cleanup, rollback, path-bounded access, authenticated localhost sessions, and CSP consent make long visual loops recoverable and safer. | **Adopt recovery/security principles; defer runtime.** Never weaken production CSP or allow broad source access. |
| `skill/agents/impeccable-asset-producer.md`, `impeccable-finish-reviewer.md`, `impeccable-documenter.md` | Bounded asset production, read-only finish review, and post-ship documentation reduce anchoring, scope creep, and unverifiable handoffs. | **Adopt role boundaries when delegation is authorized:** local agent policy wins; a fresh sequential pass is valid when working solo. |
| `skill/agents/impeccable-manual-edit-applier.md` | External edit batches are treated as untrusted data; exact-source locks, per-entry atomicity, rollback, strict output, and no Git/release authority prevent partial or injected edits. | **Adopt the safety model** for any future edit bridge; no such bridge is added now. |
| `tests/oracle/README.md`, `tests/oracle/DELTAS.md` | Behavioral oracles compare exit status, streams, files, normalized host noise, and frozen vectors; reviewed deltas prevent regenerating expectations around a bug. | **Defer formal oracle, adopt evidence rule:** expected-output changes need human rationale, not automatic acceptance. |
| `tests/skill-behavior/README.md` (protocol/full-workflow/E2E) | Tests assert tool traces, references read, write boundaries, question order, artifacts, and real host loading; cheap protocol checks are separated from expensive browser workflows. | **Adopt conceptually:** verify behavior and side effects, not only prose/syntax, with checks proportional to risk. |
| `docs/COMP-FIDELITY.md` | Region, geometry, palette, material, and artifact comparison yields structured visual evidence and phase gates instead of model self-grading. | **Defer tooling, adopt measurement:** valid screenshots and human meaning/usability review remain necessary. |
| `AGENTS.md`, `CLAUDE.md` (generated distributions), `docs/HARNESSES.md`, `package.json` | Canonical source can generate provider-specific artifacts with capability-aware degradation, stale-output checks, independent component versions, and ordered release gates. | **Defer generation machinery, adopt source ownership:** local canonical/generated boundaries and release workflow remain authoritative. |
| `docs/RUNTIME-ENV.md`, `CLAUDE.md` (launcher/runtime context), `live.md` | Explicit app/repository/context roots and independently re-anchored helpers avoid accidental dependence on the current working directory. | **Adopt the contract principle, defer runtime machinery:** document resolution/fallback behavior and verify current code because these upstream sources presently disagree. |
| `CLAUDE.md`, `docs/ENGINE.md`, `package.json` | Reproducible releases check worktree/publication state, generated artifacts, platform packages, checksums, signatures, and dependency order. | **Defer external machinery:** borrow only through a future plan; never bypass KATLAB's Git authorization rules. |
| `CLAUDE.md`, `tests/skill-behavior/README.md` | Checkout-specific process markers, process-group cleanup, time limits, and leak tests prevent one test from killing another user's service. | **Adopt:** any KATLAB background-process test must own and clean only its exact processes. |
| `docs/STYLE.md`, `CLAUDE.md` | Mechanical editorial checks are paired with a human checklist for problems regex cannot judge. | **Adopt:** automation may flag patterns; a person/agent still judges clarity and context. |
| `tests/skill-behavior/README.md`, `docs/COMP-FIDELITY.md` | Failures, flakes, unmeasured cases, sample size, and 2–4x workflow costs are reported rather than converted into success claims. | **Adopt:** report limitations and cost with measured benefit; protocol success is not end-to-end proof. |
| `LICENSE`, `NOTICE.md` | Explicit licensing and third-party attribution make provenance auditable. | **Adopt:** retain this pinned record; re-check license/notice before any future code or content reuse. |

## 5. Mandatory KATLAB UI-work protocol

This protocol augments the repository's mandatory plan/review/implementation/
verification workflow; it does not replace or shorten it.

1. Classify the request before editing.
2. Select the relevant surface mode from section 6.
3. Obey the local authority hierarchy and preserve explicit scope.
4. Select only the useful lenses from section 7; all 23 are optional.
5. For material new UI, put a direction contract in the active plan: user job,
   hierarchy, first viewport, real data/proof, key states, responsive behavior,
   preserved boundaries, and finish evidence.
6. Separate human critique, technical audit, deterministic evidence, and rendered
   evidence. One cannot silently stand in for another.
7. Verify the affected built path, states, inputs, widths, and failure modes.
8. Do not represent Impeccable commands, detector, hooks, or live mode as
   installed or approved.

### Work classes

| Class | Meaning | Authorization boundary |
|---|---|---|
| Review/diagnosis | Explain current UX, defects, risks, or options without changing files. | Report only unless the user also requests implementation. |
| Refinement | Improve a bounded existing surface while preserving identity, behavior, copy, and out-of-scope neighbors. | Normal requested implementation scope; it is not redesign permission. |
| New surface | Add a missing major view/workflow while inheriting product truth, shell, design system, shared primitives, behavior, and accessibility. | Requires a direction contract before implementation; does not authorize a new product identity. |
| Redesign | Preserve product truth/function while intentionally replacing the visual world. | Requires explicit current user approval and a confirmed direction. |

When direction is already concrete, do not ask redundant questions. When it is
open and consequential, compare two or three truly different structural options,
state tradeoffs, and obtain the user's choice.

## 6. Surface-mode map

| Mode | Primary concerns | TrackingMonitor use |
|---|---|---|
| Operate | Task completion, scanability, density, familiar controls, semantic state, fast feedback, resilient adaptation. | Default for the React shell and all operational views, including the Chronicle host. |
| Read | Comprehension, prose hierarchy, readable measure, and wayfinding. | Generated Chronicle reading experience; its generated runtime remains outside the React design-system scope. |
| Experience | The expressive artifact is part of the product value. | Bounded City, Focus Mode, Wrapped, Kat, and meaningful celebration moments only. |
| Persuade | Brand/conversion narrative and action framing. | Generally inapplicable to this local operations product; never use by default. |

## 7. The 23 advisory lenses

These are reasoning labels only. They are not bundled slash commands, and no
agent must use all of them.

| Lens | Purpose in KATLAB | Safe-use boundary |
|---|---|---|
| `craft` **(deprecated)** | Compatibility label for a general design request. | Do not create a separate workflow; route by the actual task and local authorities. |
| `init` | Discover missing product, audience, and design context. | TrackingMonitor is established; read its CDD/normative sources instead of regenerating product truth. |
| `document` | Record an implemented visual system for future agents. | Update the existing normative document only after an approved durable change; never create a competing authority or canonize a defect. |
| `extract` | Consolidate repeated same-intent controls, patterns, and tokens. | Require roughly three real uses; keep helpers small and avoid a speculative framework. |
| `live` | Explore alternatives rapidly in an isolated development preview. | Concept only: never assume upstream hot-swap tooling, mutate runtime data, or execute a validator without explicit approval. |
| `adapt` | Make a surface work across width, input, zoom, orientation, safe areas, and relevant output contexts. | Preserve canonical views, complete functionality, labelled local scrollers, and the existing drawer/rail strategy. |
| `animate` | Explain feedback, state change, and continuity with purposeful motion. | Keep it short, interruptible, reduced-motion safe, and inside the local opacity/color/transform contract; add no polish dependency. |
| `audit` | Review accessibility, performance, responsiveness, theming, and technical UI risks. | Use local evidence; an audit request authorizes findings, not unrequested edits or identity changes. |
| `bolder` | Give one named region stronger hierarchy using KATLAB's vocabulary. | Do not restyle neighbors or invent colors, fonts, motifs, or primitives without approval. |
| `clarify` | Make labels, readiness, errors, empty states, and recovery immediately understandable. | Preserve backend truth and domain terms; never invent a cause, success state, or unusable remedy. |
| `colorize` | Strengthen hierarchy and state through semantic color. | Preserve the slate/sky/teal identity and attribution colors; meet contrast and never rely on color alone. |
| `critique` | Evaluate UX with a fresh human lens before adding rendered and mechanical evidence. | Scores are diagnostic, not release proof; a review request remains report-only. |
| `delight` | Add KATLAB-specific character at meaningful mastery, milestone, or recovery moments. | Never delay work, fake progress, obscure status, exhaust repeat users, or play unapproved sound. |
| `distill` | Remove redundancy, noise, needless variants, and avoidable steps. | Preserve expert density, necessary complexity, complete-model calculations, accessibility, and all six views. |
| `harden` | Cover long/empty/large data, error/stale states, timeouts, overflow, cancellation, and async races. | Follow the current web/English/API truth; do not import auth, native, light-theme, or broad i18n requirements unasked. |
| `onboard` | Improve first-use orientation and useful empty states. | Keep help contextual and skippable; avoid forced tours, duplicated docs, or invented setup capability. |
| `layout` | Turn status, action, explanation, grouping, and density into a clear path. | Retain the 4px rhythm, responsive shell, DOM/focus order, and bounded overflow; layout work is not redesign. |
| `optimize` | Improve measured loading, rendering, interaction, animation, or bundle bottlenecks. | Measure first; preserve complete-model behavior, lazy boundaries, and mounted-item limits. |
| `overdrive` | Pursue exceptional functional quality through speed, scale, or fluid data interaction. | Requires explicit option/tradeoff approval; prefer performance to spectacle and provide a progressive fallback. |
| `polish` | Finish a complete path by correcting states, consistency, alignment, and micro-detail. | Fix functional/accessibility defects first, preserve identity, verify rendered states, and stop accidental churn. |
| `quieter` | Reduce competing accents, decoration, and motion in an overstimulating region. | Preserve warning salience, live-state clarity, accessibility contrast, useful density, and KATLAB personality. |
| `shape` | Define a significant new view or flow before implementation. | Require a confirmed direction and active plan for material UX work, not ceremony for routine local fixes. |
| `typeset` | Maintain a readable, stable hierarchy for UI, paths, counters, timers, and tabular data. | Preserve Plus Jakarta Sans/Azeret Mono, role floors, zoom, wrapping, and offline fallbacks; add no font casually. |

## 8. Quality, review, and evidence

### KATLAB identity that wins

- Dark-only slate precision dashboard with restrained KATLAB personality.
- Sky primary/focus, teal live, emerald success, amber warning, rose danger, and
  the six stable attribution colors.
- Plus Jakarta Sans for UI; Azeret Mono for code, paths, counters, timers, and
  tabular numbers.
- 4px spacing rhythm, 6px controls, 8px panels, and border-first elevation.
- Density 7/10 and motion 3/10. The normative 150–220ms range applies to
  disclosure/drawer transitions.
- Six canonical views, shared dialogs, exact-data alternatives, safe areas,
  explicit 360/390/768/1024/1440px checks, 200% zoom, and reduced motion.
- No governed semantic row/item collection mounts more than 50 items unless the
  normative contract records a source-backed exemption.
- Existing data-bearing cards, goal rings, sparklines, ramps, emoji personality,
  grid atmosphere, City, Kat, Wrapped, and bounded celebrations are legitimate.

### Anti-generic discipline

Prefer product-specific hierarchy, real operational content, concise actions,
specific errors, and working recovery. Be suspicious of interchangeable SaaS
templates, nested-card scaffolds, decorative metrics, unexplained glow/gradient/
glass effects, fake technical ornament, and gratuitous section labels.

These are judgment prompts, not blanket bans. A functional KATLAB component
supported by the normative design system remains valid even if generic guidance
dislikes that component category.

### Independent evidence lenses

1. Human critique: product specificity, hierarchy, information architecture,
   cognitive load, emotion, copy, discoverability, heuristics, and persona paths.
2. Technical audit: accessibility, performance, responsive behavior, theming,
   data/state integrity, and implementation quality.
3. Deterministic evidence: measurable source/render findings with exact locations
   and narrow reasoned waivers. A clean scan is evidence, never proof.
4. Rendered evidence: the real built surface across states, widths, inputs, zoom,
   and reduced motion. Validate screenshots before relying on them.

When comparing changed and pre-existing findings, record whether the baseline is
verified. `Attribution unknown` never proves that the current agent/session caused
the issue.

Use a fresh review to reduce builder anchoring. Follow current KATLAB delegation
policy; when working solo, use a separate sequential pass with a different lens.

### Finding format

Every actionable finding states:

- severity (`P0` blocker/data loss, `P1` major task/accessibility failure, `P2`
  meaningful quality/risk issue, or `P3` minor polish);
- exact surface/location;
- evidence and user impact;
- narrowest coherent fix;
- verification that can falsify the fix.

Record positive evidence as well as defects so later work does not remove a
successful pattern.

### Fix order

1. Blocked tasks, data loss, misleading state, inaccessible paths.
2. Missing loading, empty, error, success, disabled, and permission states.
3. Flow, hierarchy, responsive behavior, and design-system drift.
4. Visual and motion inconsistency.
5. Cleanup and optional polish.

### KATLAB hardening matrix

Exercise long Windows paths/IDs/messages; zero and large collections; partial or
additive API payloads; malformed JSONL; offline repositories; restart/replay;
transient Git failure; stale async completion; rapid repeated actions; long-lived
sessions; keyboard-only and coarse-pointer use; reduced motion toggled at load
and during motion; 200% zoom; both orientations; safe areas; local overflow; and
bounded DOM behavior.

Do not add currently out-of-scope authentication, localization/RTL, native,
offline-cache, or marketing requirements merely because upstream mentions them.

### Rendered finish discipline

- Inspect the built path rather than source intent alone.
- Batch representative widths and states, fix a coherent group, and re-check.
- Verify keyboard/focus order, coarse targets, non-color meaning, and live
  reduced-motion changes.
- Stress real and extreme content, not lorem ipsum.
- Document durable shipped behavior only after verification; never describe a
  bug as a design rule because it happens to exist.
- KATLAB's mandatory CDD/CFT 5/5 gates remain unchanged by upstream's bounded
  subjective-polish loop.

## 9. Deferred engineering opportunities

The following ideas may improve KATLAB later, but none is approved by this guide:

- A dependency-free deterministic UI checker with source and rendered adapters,
  structured output, clear exit codes, KATLAB-specific namespaced rules, and
  narrow evidence-bearing waivers.
- Fast changed-file feedback plus a deduplicated full finish check.
- A trusted-local browser variant loop with HMR, authenticated localhost control,
  path-bounded reads, journaled phases, atomic apply/rollback, and idempotent
  resume/cleanup.
- Behavior oracles and reviewed delta ledgers for stable CLI/hook contracts.
- Tool-trace tests that verify reads, writes, questions, commands, and artifacts.
- Measured screenshot/region comparison with valid capture checks and explicit
  phase gates.
- Canonical guidance transformed into provider-specific artifacts with a
  capability matrix, stale-output gate, and explicit degraded behavior.
- Checkout-owned background-process markers and leak tests.
- Mechanical editorial checks plus a separate human-judgment checklist.

Each needs a new idea workflow, applicability/security/license/Windows review,
detailed plan, CDD 5/5, implementation, CFT 5/5, focused/full verification, and
final plan update. Performance claims must include baseline, after-result, sample
size, unmeasured cases, failures, and time/token/runtime cost.

## 10. Explicit exclusions, risks, and upstream drift

Do not import:

- Neo-Kinpaku gold/patina/lacquer styling, Alumni/Albert fonts, texture assets,
  light mode, OKLCH-only enforcement, or upstream radii.
- Generic bottom/hamburger navigation, table-to-card conversion, arbitrary
  visible-information caps, sidebar removal, or one-goal simplification that contradicts the
  local operational model.
- Raster material production, new motion/icon/font dependencies, blur-heavy
  styling, layout motion, shaders, WebGL, or long choreography.
- Native iOS/Android rules while this is a React web product.
- Mandatory dual-agent review, upstream command syntax, hidden storage, concept
  dice, or a comp-fidelity state machine.
- Any detector, binary, hook, live server, extension, rule pack, generated asset,
  or provider distribution without a separately approved implementation plan.

Security and operational cautions:

- Upstream hooks may download and execute an engine independently of model tool
  approval. Review manifests, signatures/checksums, provenance, failure modes,
  privacy, and supply chain before considering them.
- Upstream includes a `--chosen` choice-ping for API-provided concept rolls. Its
  documentation says it honors `DO_NOT_TRACK` and `IMPECCABLE_NO_TELEMETRY` and
  does not fire for locally provided choices. Any future install/execution review
  must verify current telemetry, network destinations, payload, consent, and
  opt-out behavior before approval.
- Live mode is for trusted local web projects. Its optional validator executes a
  project command with user permissions. Never weaken production CSP.
- If any future installer edits host configuration, it must parse and validate
  first, preserve unrelated entries, fail safely on malformed input, require an
  explicit override for backup/recovery behavior, and be idempotent.
- Native detector results are heuristic; adapters can disagree and cross-origin
  CSS may be unreadable. Rendered/manual verification remains necessary.
- Web detector/live/hook ideas do not apply to `.mq5`/`.mqh` without a separately
  designed MQL rule pack.

Known upstream drift at the pinned commit:

- `DESIGN.md` and `.impeccable/design.json` disagree about live-picker treatment,
  primary-button height, and some type sizes.
- `docs/HARNESSES.md` is explicitly point-in-time and conflicts with newer
  README/hook guidance about Codex on Windows.
- `docs/RUNTIME-ENV.md` and `CLAUDE.md` disagree about launcher-exported values.
- The live-mode ADR describes an older Node implementation while current engine
  guidance describes Rust.
- Model/version descriptions vary across upstream instructions and tests.
- The test/fidelity record includes incomplete or held runs, small samples,
  routing/compliance failures, and substantially higher workflow cost.

Therefore, never copy upstream as a single unquestioned authority. Reconcile
conflicts against current upstream implementation and KATLAB's local contracts.

## 11. Future upstream refresh checklist

1. Record review date, default branch, exact HEAD SHA, repository `pushed_at`, and
   license/notice changes.
2. Query the recursive Git tree at that SHA; record total entries and blobs.
3. Re-fetch every path in section 12, record missing/new canonical sources, and
   count files/bytes. Add new command/reference/engine/security/test sources only
   after explaining why they are material.
4. Reconcile command metadata with canonical skill routing; record distinct
   command names and deprecations without assuming they are installed.
5. Recheck detector-count claims against the generated registry/build evidence;
   if not independently run, keep the number qualified as upstream-reported.
6. Compare human and machine design sources for drift.
7. Compare current engine/live/hooks docs with older ADR/runtime/harness docs.
8. For each new or changed advantage, update the ledger with source, disposition,
   rationale, and governing local authority. Record rejected material too.
9. Confirm local UI design, stack, Git, workflow, security, dependency, and agent
   policies still win.
10. Use the mandatory KATLAB workflow before changing this guide or adopting any
    executable capability.

## 12. Focused 60-file source manifest

Paths are relative to the pinned upstream repository root:

```text
.impeccable/config.json
.impeccable/design.json
AGENTS.md
CLAUDE.md
crates/core/src/checks/rules.rs
crates/core/src/checks/text_rules.rs
DESIGN.md
docs/adr-live-variant-mode.md
docs/COMP-FIDELITY.md
docs/ENGINE.md
docs/HARNESSES.md
docs/RUNTIME-ENV.md
docs/STYLE.md
package.json
PRODUCT.md
README.md
skill/agents/impeccable-asset-producer.md
skill/agents/impeccable-documenter.md
skill/agents/impeccable-finish-reviewer.md
skill/agents/impeccable-manual-edit-applier.md
skill/reference/adapt.md
skill/reference/adapt.native.md
skill/reference/android.md
skill/reference/animate.md
skill/reference/audit.md
skill/reference/audit.native.md
skill/reference/bolder.md
skill/reference/clarify.md
skill/reference/colorize.md
skill/reference/craft.md
skill/reference/craft-floor.md
skill/reference/critique.md
skill/reference/delight.md
skill/reference/distill.md
skill/reference/doctor.md
skill/reference/document.md
skill/reference/extract.md
skill/reference/harden.md
skill/reference/hooks.md
skill/reference/init.md
skill/reference/ios.md
skill/reference/layout.md
skill/reference/live.md
skill/reference/live-setup.md
skill/reference/new-work.md
skill/reference/onboard.md
skill/reference/operate.md
skill/reference/optimize.md
skill/reference/overdrive.md
skill/reference/polish.md
skill/reference/quieter.md
skill/reference/routing.md
skill/reference/shape.md
skill/reference/typeset.md
skill/reference/visualize.md
skill/scripts/command-metadata.json
skill/SKILL.src.md
tests/oracle/DELTAS.md
tests/oracle/README.md
tests/skill-behavior/README.md
```

Additional provenance files verified separately: `LICENSE`, `NOTICE.md`.

## 13. Pinned upstream references

- [README](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/README.md)
- [Canonical skill router](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/skill/SKILL.src.md)
- [Operate mode](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/skill/reference/operate.md)
- [Craft quality floor](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/skill/reference/craft-floor.md)
- [Critique method](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/skill/reference/critique.md)
- [Engine architecture](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/docs/ENGINE.md)
- [Comp-fidelity evidence](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/docs/COMP-FIDELITY.md)
- [Apache-2.0 license](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/LICENSE)
- [Third-party notice](https://github.com/pbakaus/impeccable/blob/12ffee04c2a3682e0ccf09bf34d6711951dd551d/NOTICE.md)
