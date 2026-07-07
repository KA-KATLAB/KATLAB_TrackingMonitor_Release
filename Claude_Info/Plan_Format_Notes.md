# Plan Format Notes

The "reason" for every tracked change comes from KATLAB PLAN files. This doc records the formats found in the wild (CDD survey 2026-07-07) and what the tracker's resolver needs from the enhanced format.

## 1. Where plans live today

- **EA repo (Dev WS)**: `temp\Main_EA\`, `temp\Client_EA\`, `temp\Indicator\` — `PLAN_v<4-part-version>_<Name>.txt` (e.g. `PLAN_v5.6.0.0_Chart_Capture_Telegram.txt`); also `Traceability\Plan\`
- **UM repo**: `temp\Plan\PLAN_v*.txt` (e.g. `PLAN_v0.4.3.0_Chart_Capture_Telegram.txt`)
- Plain text `.txt`, `====` / `----` section dividers, 80-col style

## 2. Current format — two generations observed

### 2.1 Modern format (reference: EA `temp\Main_EA\PLAN_v5.6.0.0_Chart_Capture_Telegram.txt`)

```
================================================================================
PLAN: v5.6.0.0  <one-line title>
================================================================================
Source:     <user request / brainstorm decisions + dates>
Workspace:  <repo, branch, base commit>
Created:    <date>
Status:     <lifecycle log: REVIEW COMPLETE → IMPLEMENTED → COMMITTED <hash> → REMAINING: ...>
Scope:      <what's in>
Cross-repo: <paired plan in the other repo + deploy order>
================================================================================
DESIGN      <locked decisions, pipeline description with file:line refs>
ITEMS       <lettered groups A..I; checkbox sub-items "[✓] A.1 ..." / "[ ] ...">
DECISIONS   <D1..Dn — LOCKED / PRE-RESOLVED>
VERIFICATION<V1..Vn checkboxes with live-test evidence>
FILES TOUCHED (planned)   ← file list — the resolver's <files> source
OUT-OF-SCOPE
```

### 2.2 Older format (reference: `Traceability\Plan\PLAN_Traceability_Phase2.txt`)

Numbered TOC sections: PROBLEM STATEMENT → AS-IS ANALYSIS → CHANGE STRATEGY → DETAILED CHANGES PER FILE → RISK ANALYSIS → TESTING CHECKLIST → ROLLBACK PLAN. Header carries `Commit ID:`, `Status:`.

## 3. What the resolver needs (drives the format enhancement)

The hybrid-C resolver (see [Architecture_Notes.md](Architecture_Notes.md) §2) needs, per task, machine-parseable:

1. **Task identity** — stable ID (plan file + item ID like `A.1`, `G.2`) + human title → the UI's "why" + link
2. **File declarations** — path patterns per task (today: prose in ITEMS + one flat `FILES TOUCHED` list per plan, not per-task)
3. **Status** — `in-progress` signal per task (today: `[✓]`/`[ ]` checkboxes + a prose `Status:` line per plan; no explicit per-task in-progress marker)

**Gap summary**: today's format is human-first — parseable-ish (`[✓]`/`[ ]`, FILES TOUCHED) but file declarations are per-PLAN not per-TASK, and "in-progress" is implicit. The enhanced format closes exactly these gaps.

## 4. Enhancement — DESIGNED ✅

- **Normative spec: [Docs/Plan_Format_Spec.md](../Docs/Plan_Format_Spec.md)** (task blocks, column-0 rule, required/optional matrix, encodings, glob semantics)
- Propagated to monitored repos via the **[Installation Guideline](../Docs/Installation_Guideline.md)**
- **DECISION (user, 2026-07-07): NO backward compatibility.** Existing plans are FORMAT REFERENCE ONLY — the resolver parses the NEW enhanced format exclusively; tracking starts with new-format plans
