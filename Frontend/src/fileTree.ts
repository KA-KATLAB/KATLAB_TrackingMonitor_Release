// v0.1.4.0 D6 (B.3): "changed files by folder" — build a monospace
// ├──/└──/│ tree from the uncommitted events' repo-relative paths, one leaf
// per FILE with an edit-count badge (churn hotspots). Pure data helper —
// no DOM, no fetch. Leaves are NEUTRAL this release (per-file git intent
// needs an endpoint that does not exist — plan D6).

import type { TrackedEvent } from "./api";

interface Dir {
  dirs: Map<string, Dir>;
  files: Map<string, number>; // file name -> event count
}

export interface TreeLine {
  text: string; // connectors + name, pre-formatted (render with white-space: pre)
  count?: number; // edit-count badge, present on file leaves only
}

export function buildFileTree (events: TrackedEvent[]): TreeLine[] {
  const root: Dir = { dirs: new Map(), files: new Map() };
  for (const e of events) {
    const parts = e.file.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = dir.dirs.get(part) ??
        dir.dirs.set(part, { dirs: new Map(), files: new Map() }).get(part)!;
    }
    const name = parts[parts.length - 1];
    dir.files.set(name, (dir.files.get(name) ?? 0) + 1);
  }

  const out: TreeLine[] = [];
  const walk = (dir: Dir, prefix: string) => {
    const entries: { name: string; isDir: boolean }[] = [
      ...[...dir.dirs.keys()].sort().map((n) => ({ name: n, isDir: true })),
      ...[...dir.files.keys()].sort().map((n) => ({ name: n, isDir: false })),
    ];
    entries.forEach((entry, i) => {
      const last = i === entries.length - 1;
      const branch = last ? "└── " : "├── ";
      if (entry.isDir) {
        out.push({ text: `${prefix}${branch}${entry.name}/` });
        walk(dir.dirs.get(entry.name)!, prefix + (last ? "    " : "│   "));
      } else {
        out.push({ text: `${prefix}${branch}${entry.name}`, count: dir.files.get(entry.name) });
      }
    });
  };
  walk(root, "");
  return out;
}
