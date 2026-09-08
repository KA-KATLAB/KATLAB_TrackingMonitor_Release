# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 💬 **CONVERSATION STYLE**

**IMPORTANT**: Keep conversations short and concise - no overthinking, no assumption, no wasting tokens! Get straight to the point.

## 📚 **SESSION STARTUP PROTOCOL: CDD METHODOLOGY**

### **CDD - Careful, Deep, Detailed Documentation Review**

When starting a new session, ALWAYS read documentation with CDD methodology:

- **Careful**: Read every section thoroughly, don't skim
- **Deep**: Understand the reasoning and context behind each rule
- **Detailed**: Note specific file locations, line numbers, and examples

**Startup Checklist:**

1. Read CLAUDE.md completely (CDD approach)
2. Read ALL referenced Claude_Info/*.md documents listed in CLAUDE.md
3. List down all files read for user verification
4. Confirm understanding of: system architecture, monitored repos, plan format, critical rules

## 🎯 **PROJECT OVERVIEW**

**KATLAB TrackingMonitor** — a local, English, user-friendly web UI that tracks ALL Claude Code file changes across the KATLAB workspace repos, attributes each change to its REASON (the plan task that caused it, with a link), counts uncommitted changes per repo, and reports **CLEAN ✓** once everything is committed.

**Stack (locked by design docs in `Ref/`):**

- **Capture**: ONE user-scope PostToolUse hook (tiny Python script, registered once per PC in `C:\Users\ADMIN\.claude\settings.json`) → fires in every Claude Code session, routes each event to the edited FILE's repo, captures only repos in `Config/repos.yaml` (allowlist, fail-open) → appends raw events to that repo's `events.jsonl` (durable, works even if server is down)
- **Server**: FastAPI single process — `watchfiles` watchers, hybrid-C resolver, git module, SQLite (events · tasks · commits), REST + WebSocket
- **UI**: React + Vite + Tailwind (English) — status bar (CLEAN / N uncommitted), task sidebar, changes-grouped-by-task with why + diff viewer + AMBIGUOUS manual-pick queue, History tab (commit → tasks → events)

**Design source of truth**: `Ref/system_architecture.mermaid` + `Ref/hybrid_C_resolution_flow.mermaid`. See [Architecture_Notes.md](Claude_Info/Architecture_Notes.md).

## 🚨 **CRITICAL: DIVIDE-AND-CONQUER PRINCIPLE** 🚨

**This repo is the SINGLE SOURCE OF TRUTH** for the tracking system:

- Server + UI + hook script + installation guideline ALL live HERE
- Monitored repos install ONLY the minimum needed (gitignore + plan rules per the guideline; hook registration is USER-SCOPE, once per PC — v0.1.1.0) — NO logic duplication
- **NEVER edit monitored repos directly from this repo.** Instead, maintain the **Installation Guideline** doc; the Claude Code instance inside each monitored repo reads it and self-installs
- Multi-repo by design: tracks N repos at the same time (see [Monitored_Repos.md](Claude_Info/Monitored_Repos.md))

## 📋 **PLAN FORMAT**

The "reason" for every change comes from KATLAB PLAN files (`temp/**/PLAN_v*.txt` in monitored repos). Current formats + the enhanced tracker-ready format are documented in [Plan_Format_Notes.md](Claude_Info/Plan_Format_Notes.md). Format enhancement is designed HERE and propagated to other repos via the guideline.

## 🔒 **MANDATORY CHANGE WORKFLOW**

Apply this workflow to **every** idea, feature, enhancement, refactor, bug fix,
hotfix, and other repository change. Do not skip, combine, or reorder stages
unless the user explicitly instructs otherwise:

1. **Entry:** idea → brainstorm; issue → reproduce → root-cause analysis.
2. **Detailed plan creation.**
3. **CDD detailed-plan review:** reach 5 consecutive clean reviews. Fix every
   finding directly in the plan and reset the clean streak, including for minor
   findings.
4. **Implementation:** begin only after the CDD gate passes.
5. **CFT:** reach 5 consecutive clean code-flow reviews. Fix every finding in
   the implementation and corresponding plan point, then reset the clean streak.
6. **Focused and full verification:** run both at the scope appropriate to the
   change and record the actual results.
7. **Final plan update:** record the final implementation, verification evidence,
   disposition, and status.

Canonical sequence: **Idea (Brainstorm) / Issue (Reproduce → Root cause) →
Detailed Plan creation → CDD detailed-plan review 5/5 → Implementation → CFT
5/5 → Focused/Full verification → Final plan update.**

## **Working Mode — Solo**

This workspace runs **SOLO by default** — work directly; do NOT spin up a multi-agent team (or auto-spawn agents) for routine tasks. Match effort to task.

**GIT — HARD RULE (overrides any other git guidance in this repo)**: ONLY READ-ONLY git commands are permitted: `git status`, `git diff`, `git log`, `git show`, `git rev-parse` (user-approved 2026-07-07 — the tracking server needs log/show for commit detection). ALL mutation commands (`add`, `commit`, `push`, `branch`, `checkout`, `reset`, `merge`, `rebase`, `tag`, `stash`, `cherry-pick`, `restore`, `amend`, `clean`, ...) are **FORBIDDEN**. When changes are ready, report them — never invoke git mutations. If the user explicitly requests a one-off git command in a specific turn, execute exactly that and do NOT generalize.

## 📖 **CLAUDE_INFO DOCUMENTATION ARCHITECTURE**

Detailed docs live in `Claude_Info/` (mirrors the EA + UM repo pattern):

- [Architecture_Notes.md](Claude_Info/Architecture_Notes.md) — full system architecture + hybrid-C resolution decision tree
- [Version_Notes.md](Claude_Info/Version_Notes.md) — release notes per version (v0.1.0.0 foundation)
- [Monitored_Repos.md](Claude_Info/Monitored_Repos.md) — registry of tracked repos + how to add more
- [Plan_Format_Notes.md](Claude_Info/Plan_Format_Notes.md) — existing PLAN formats found in EA/UM repos + enhancement spec

**Normative specs in `Docs/`**: [Plan_Format_Spec.md](Docs/Plan_Format_Spec.md) (the enhanced format) · [Installation_Guideline.md](Docs/Installation_Guideline.md) (repo onboarding contract)

**Release notes convention (every release)**: current version = `TrackingMonitor_v<X.Y.Z.W>_Release_Notes.md` at the REPO ROOT; on each new release, MOVE the previous one to `Docs/Release_Notes/Archive/`. Format mirrors the UM repo (Theme → intro → Highlights → Cross-repo).

**Run the tracker**: double-click `Scripts/start_tracking_monitor.bat` → UI at `http://127.0.0.1:8100` · Chronicle at `http://127.0.0.1:8100/chronicle/` (host/port in `Config/repos.yaml`; v0.2.6.0: the server runs HIDDEN — no persistent window; logs at `data/logs/`; the server owns the Chronicle regen loop)

**Stop / restart the tracker**: double-click `Scripts/stop_tracking_monitor.bat` / `Scripts/restart_tracking_monitor.bat` (stop kills whatever LISTENs on the configured port — the Chronicle loop dies with it; restart = stop + silent fresh start)

**Demo mode (zero real repos)**: double-click `Scripts/Demo/start_demo.bat` → self-generated scratch data → UI at `http://127.0.0.1:8101`, also hidden (log: `data/logs/demo.log`; coexists with the real tracker; regenerated fresh each launch under gitignored `Demo/runtime/`; the demo never spawns the Chronicle loop). Stop / restart: `Scripts/Demo/stop_demo.bat` / `Scripts/Demo/restart_demo.bat`

## 🧹 **CLEAN CODE STANDARDS**

- UI text, docs, code comments: **English only**
- Python: type hints, small focused modules, no dead code
- Always maintain a blank line at the end of every file
