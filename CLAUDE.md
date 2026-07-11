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

- **Capture**: PostToolUse hook (tiny Python script) in each monitored repo → appends raw events to `events.jsonl` (durable, works even if server is down)
- **Server**: FastAPI single process — `watchfiles` watchers, hybrid-C resolver, git module, SQLite (events · tasks · commits), REST + WebSocket
- **UI**: React + Vite + Tailwind (English) — status bar (CLEAN / N uncommitted), task sidebar, changes-grouped-by-task with why + diff viewer + AMBIGUOUS manual-pick queue, History tab (commit → tasks → events)

**Design source of truth**: `Ref/system_architecture.mermaid` + `Ref/hybrid_C_resolution_flow.mermaid`. See [Architecture_Notes.md](Claude_Info/Architecture_Notes.md).

## 🚨 **CRITICAL: DIVIDE-AND-CONQUER PRINCIPLE** 🚨

**This repo is the SINGLE SOURCE OF TRUTH** for the tracking system:

- Server + UI + hook script + installation guideline ALL live HERE
- Monitored repos install ONLY the minimum needed (hook registration per the guideline) — NO logic duplication
- **NEVER edit monitored repos directly from this repo.** Instead, maintain the **Installation Guideline** doc; the Claude Code instance inside each monitored repo reads it and self-installs
- Multi-repo by design: tracks N repos at the same time (see [Monitored_Repos.md](Claude_Info/Monitored_Repos.md))

## 📋 **PLAN FORMAT**

The "reason" for every change comes from KATLAB PLAN files (`temp/**/PLAN_v*.txt` in monitored repos). Current formats + the enhanced tracker-ready format are documented in [Plan_Format_Notes.md](Claude_Info/Plan_Format_Notes.md). Format enhancement is designed HERE and propagated to other repos via the guideline.

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

**Run the tracker**: double-click `Scripts/start_tracking_monitor.bat` → UI at `http://127.0.0.1:8100` (host/port in `Config/repos.yaml`)

**Stop / restart the tracker**: double-click `Scripts/stop_tracking_monitor.bat` / `Scripts/restart_tracking_monitor.bat` (stop kills whatever LISTENs on the configured port; restart = stop + fresh start in its own window)

**Demo mode (zero real repos)**: double-click `Scripts/start_demo.bat` → self-generated scratch data → UI at `http://127.0.0.1:8101` (coexists with the real tracker; regenerated fresh each launch under gitignored `Demo/runtime/`)

## 🧹 **CLEAN CODE STANDARDS**

- UI text, docs, code comments: **English only**
- Python: type hints, small focused modules, no dead code
- Always maintain a blank line at the end of every file
