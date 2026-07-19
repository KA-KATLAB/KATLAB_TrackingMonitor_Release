// v0.1.5.0 D6 (D.2): Ctrl/Cmd+K command palette — hand-rolled subsequence
// fuzzy match (word-start + consecutive-run bonus), combobox/listbox ARIA,
// focus trap + restore, no dependency, no router. Suppressed while the
// Mermaid fullscreen overlay is open (RV3: body data-overlay-open marker).
// The palette is the ACTION INTEGRATOR — implemented after D.1/D.3 so its
// digest + notification actions call features that exist (ORDER RV25).

import { useEffect, useRef, useState } from "react";

export interface PaletteEntry {
  section: string;   // Views | Repos | Tasks | Actions
  label: string;
  hint?: string;
  run: () => void;
}

// Subsequence fuzzy: every query char must appear in order; word-start hits
// and consecutive runs score higher. null = no match.
function fuzzyScore (query: string, label: string): number | null {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (!q) return 0;
  let qi = 0, score = 0, run = 0;
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] === q[qi]) {
      run += 1;
      const wordStart = i === 0 || " /-_.".includes(l[i - 1]);
      score += 1 + run + (wordStart ? 3 : 0);
      qi += 1;
    } else {
      run = 0;
    }
  }
  return qi === q.length ? score : null;
}

export function CommandPalette ({ entries }: { entries: PaletteEntry[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (document.body.dataset.overlayOpen) return; // single-overlay rule
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      prevFocus.current?.focus?.(); // Esc/run restores focus (V9)
    }
  }, [open]);

  if (!open) return null;

  const matches = entries
    .map((entry) => ({ entry, score: fuzzyScore(query, entry.label) }))
    .filter((m): m is { entry: PaletteEntry; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  const clampedActive = Math.min(active, Math.max(0, matches.length - 1));

  const runEntry = (index: number) => {
    matches[index]?.entry.run();
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/70 p-4 pt-[10vh]"
      onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-lg rounded border border-slate-700 bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} value={query}
          role="combobox" aria-expanded="true" aria-controls="palette-list"
          aria-activedescendant={matches[clampedActive] ? `palette-opt-${clampedActive}` : undefined}
          placeholder="Type to search views, repos, tasks, actions…"
          className="w-full rounded-t border-b border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (matches.length ? (a + 1) % matches.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (matches.length ? (a - 1 + matches.length) % matches.length : 0));
            } else if (e.key === "Enter") { e.preventDefault(); runEntry(clampedActive); }
            else if (e.key === "Tab") e.preventDefault(); // focus trap while open
          }} />
        <ul ref={listRef} id="palette-list" role="listbox"
          className="max-h-72 overflow-y-auto p-1">
          {matches.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-slate-400">No matches.</li>
          )}
          {matches.map(({ entry }, i) => (
            <li key={`${entry.section}|${entry.label}`} id={`palette-opt-${i}`}
              role="option" aria-selected={i === clampedActive}
              onClick={() => runEntry(i)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
                i === clampedActive ? "bg-sky-700 text-white" : "text-slate-200"}`}>
              <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {entry.section}
              </span>
              <span className="truncate">{entry.label}</span>
              {entry.hint && (
                <span className="ml-auto shrink-0 text-[11px] text-slate-400">{entry.hint}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-800 px-3 py-1 text-[10px] text-slate-500">
          ↑↓ navigate · Enter run · Esc close
        </div>
      </div>
    </div>
  );
}
