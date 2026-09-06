import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DialogShell,
  hasOverlayLease,
  suppressOverlayFocusRestore,
} from "./dialog";
import {
  CollectionPager,
  getBoundedPageWindow,
  useBoundedPage,
} from "./ui";

export interface PaletteEntry {
  id: string;
  section: string;
  label: string;
  hint?: string;
  disabledReason?: string;
  opensDialog?: boolean;
  run: () => void;
}

export function paletteEntryId (...parts: string[]): string {
  return JSON.stringify(parts);
}

export function paletteOptionDomId (id: string): string {
  let encoded = "";
  for (let index = 0; index < id.length; index++) {
    encoded += id.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return "palette-opt-" + encoded;
}

export function assertUniquePaletteEntries (
  entries: readonly PaletteEntry[],
): Map<string, PaletteEntry> {
  const byId = new Map<string, PaletteEntry>();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new Error("Duplicate palette entry id: " + entry.id);
    byId.set(entry.id, entry);
  }
  return byId;
}

function normalizeQuery (value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim();
}

// Subsequence fuzzy: every query character must occur in order. Word-start
// hits and consecutive runs score higher; null means no match.
function fuzzyScore (normalizedQuery: string, label: string): number | null {
  const normalizedLabel = label.normalize("NFKC").toLocaleLowerCase("en-US");
  if (!normalizedQuery) return 0;
  let queryIndex = 0;
  let score = 0;
  let run = 0;
  for (
    let labelIndex = 0;
    labelIndex < normalizedLabel.length && queryIndex < normalizedQuery.length;
    labelIndex++
  ) {
    if (normalizedLabel[labelIndex] === normalizedQuery[queryIndex]) {
      run += 1;
      const wordStart = labelIndex === 0
        || " /-_.".includes(normalizedLabel[labelIndex - 1]);
      score += 1 + run + (wordStart ? 3 : 0);
      queryIndex += 1;
    } else {
      run = 0;
    }
  }
  return queryIndex === normalizedQuery.length ? score : null;
}

interface CommandPaletteProps {
  entries: PaletteEntry[];
  onStatus?: (message: string) => void;
}

export function CommandPalette ({
  entries,
  onStatus,
}: CommandPaletteProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const entriesById = useMemo(() => assertUniquePaletteEntries(entries), [entries]);
  const normalizedQuery = normalizeQuery(query);
  const matches = useMemo(() => entries
    .map((entry, ordinal) => ({
      entry,
      ordinal,
      score: fuzzyScore(normalizedQuery, entry.label),
    }))
    .filter((match): match is {
      entry: PaletteEntry;
      ordinal: number;
      score: number;
    } => match.score !== null)
    .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal),
  [entries, normalizedQuery]);
  const resultIdentity = JSON.stringify([
    normalizedQuery,
    matches.map((match) => match.entry.id),
  ]);
  const pager = useBoundedPage({
    identity: ["command-palette", resultIdentity],
    totalItems: matches.length,
    pageSize: 50,
  });
  const visibleMatches = matches.slice(pager.start, pager.end);
  const effectiveActiveId = visibleMatches.some(
    (match) => match.entry.id === activeId,
  )
    ? activeId
    : visibleMatches[0]?.entry.id ?? null;

  useEffect(() => {
    setActiveId(matches[0]?.entry.id ?? null);
  }, [resultIdentity]);

  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (openRef.current) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (hasOverlayLease()) return;
      event.preventDefault();
      setQuery("");
      setActiveId(null);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activate = (id: string | null): void => {
    if (!id) return;
    const entry = entriesById.get(id);
    if (!entry) return;
    if (entry.disabledReason) {
      onStatus?.(entry.disabledReason);
      return;
    }
    if (entry.opensDialog) suppressOverlayFocusRestore();
    entry.run();
    setOpen(false);
  };

  const changePage = (nextPage: number): void => {
    const page = getBoundedPageWindow(matches.length, nextPage, 50);
    pager.setPage(page.page);
    setActiveId(matches[page.start]?.entry.id ?? null);
  };

  if (!open) return null;

  return (
    <DialogShell
      title="Command palette"
      description="Search views, repositories, tasks, and actions."
      onClose={closePalette}
      initialFocusRef={inputRef}
      backdropClose
      closeLabel="Close command palette"
      panelClassName="max-w-lg"
      bodyClassName="p-0"
    >
      <label htmlFor="command-palette-query"
        className="block px-3 pt-3 text-xs font-medium text-ui-muted">
        Search commands
      </label>
      <input
        ref={inputRef}
        id="command-palette-query"
        value={query}
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-autocomplete="list"
        aria-activedescendant={
          effectiveActiveId ? paletteOptionDomId(effectiveActiveId) : undefined
        }
        placeholder="Type to search views, repos, tasks, actions…"
        className="ui-field w-full rounded-none border-x-0 border-t-0 px-3 py-2 text-sm"
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveId(null);
        }}
        onKeyDown={(event) => {
          const currentIndex = visibleMatches.findIndex(
            (match) => match.entry.id === effectiveActiveId,
          );
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (visibleMatches.length > 0) {
              const next = (currentIndex + 1) % visibleMatches.length;
              setActiveId(visibleMatches[next].entry.id);
            }
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (visibleMatches.length > 0) {
              const next = (currentIndex - 1 + visibleMatches.length)
                % visibleMatches.length;
              setActiveId(visibleMatches[next].entry.id);
            }
          } else if (event.key === "Enter") {
            event.preventDefault();
            activate(effectiveActiveId);
          }
        }}
      />
      <ul
        id="palette-list"
        role="listbox"
        aria-label="Command results"
        className="max-h-72 overflow-y-auto p-1"
      >
        {visibleMatches.length === 0 && (
          <li className="px-2 py-2 text-xs text-ui-muted">No matches.</li>
        )}
        {visibleMatches.map(({ entry }) => {
          const selected = entry.id === effectiveActiveId;
          return (
            <li
              key={entry.id}
              id={paletteOptionDomId(entry.id)}
              role="option"
              aria-selected={selected}
              aria-disabled={entry.disabledReason ? "true" : undefined}
              onClick={() => activate(entry.id)}
              onMouseEnter={() => setActiveId(entry.id)}
              className={
                "flex min-w-0 items-center gap-2 rounded-control px-2 py-2 text-sm "
                + (selected
                  ? "bg-ui-primary text-white"
                  : "text-ui-text hover:bg-ui-raised")
                + (entry.disabledReason ? " cursor-not-allowed opacity-70" : "")
              }
            >
              <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-ui-muted">
                {entry.section}
              </span>
              <span className="min-w-0 flex-1 break-words">{entry.label}</span>
              {(entry.disabledReason ?? entry.hint) && (
                <span className="max-w-44 shrink-0 text-right text-xs text-ui-muted">
                  {entry.disabledReason ?? entry.hint}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {matches.length > 50 && (
        <CollectionPager
          collectionLabel="Command results"
          controlsId="palette-list"
          page={pager}
          onPageChange={changePage}
          className="border-t border-ui-border px-3 py-2"
        />
      )}
      <div className="border-t border-ui-border px-3 py-1.5 text-xs text-ui-muted">
        ↑↓ navigate · Enter run · Tab move · Esc close
      </div>
    </DialogShell>
  );
}
