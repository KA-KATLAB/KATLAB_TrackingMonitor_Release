// v0.2.3.0 D2 (B.2): the health panel — the tracker audits itself
// (watcher liveness, hook line presence, capture freshness, DB and
// event-log stats). Observational only: no polling, no action buttons;
// STATIC fetch-at-open (the v0.1.6.0 RV17 rule — close/reopen refreshes).
// HealthBody is EXPORTED presentational (RV8 — the planBoard battery
// shape: renderToStaticMarkup runs no effects, batteries feed fixtures).

import { useEffect, useRef, useState } from "react";
import { api, HealthPayload } from "./api";
import { fmtMinutes, fmtRel, fmtTs } from "./format";

function fmtBytes (n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Row ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="w-40 shrink-0 text-slate-500">{label}</span>
      <span className="text-slate-200">{children}</span>
    </div>
  );
}

export function HealthBody ({ data }: { data: HealthPayload }) {
  const { server, repos } = data;
  const watchersOk = server.watchers_alive === server.watchers_total;
  const uptimeMin = Math.max(0, Math.round(
    (Date.now() - new Date(server.started_ts).getTime()) / 60_000));
  return (
    <div className="text-xs">
      <div className="mb-1 font-semibold text-slate-300">Server</div>
      <Row label="version">{server.version}</Row>
      <Row label="uptime">{fmtMinutes(uptimeMin)}</Row>
      {/* RV12: "—" on the modeled null (the jsonl convention) */}
      <Row label="database">{server.db_bytes === null ? "—" : fmtBytes(server.db_bytes)}</Row>
      <Row label="watchers">
        <span className={watchersOk ? "text-teal-300" : "text-rose-300"}>
          {server.watchers_alive}/{server.watchers_total} alive
        </span>
      </Row>
      {/* RV10: the HONEST wording — the text scan proves PRESENCE only */}
      <Row label="hook">
        <span title={server.hook_settings_path}
          className={server.hook_registered ? "text-teal-300" : "text-rose-300"}>
          {server.hook_registered ? "line present ✓" : "line missing ✗"}
        </span>
      </Row>
      <div className="mb-1 mt-3 font-semibold text-slate-300">Repos</div>
      {repos.map((r) => (
        <div key={r.id} className="flex items-baseline gap-2 py-0.5">
          <span className="w-40 shrink-0 truncate text-slate-500">
            {r.id}
            {r.offline && (
              <span className="ml-1 rounded bg-slate-800 px-1 text-[10px] text-amber-300">offline</span>
            )}
          </span>
          <span className="text-slate-200">
            {r.last_event_ts ? fmtRel(r.last_event_ts) : "never"}
          </span>
          {/* RV5: the mtime title = the ingest-lag hover; RV12: no title
              when mtime is null (never "last log write: null") */}
          <span className="text-slate-400"
            {...(r.events_jsonl_mtime
              ? { title: `last log write: ${fmtTs(r.events_jsonl_mtime)}` } : {})}>
            {r.events_jsonl_bytes === null ? "—" : fmtBytes(r.events_jsonl_bytes)}
          </span>
          <span className={r.warning_count > 0 ? "text-amber-300" : "text-slate-600"}>
            {r.warning_count} warning{r.warning_count === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HealthButton ({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="System health"
      className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      sys
    </button>
  );
}

export function HealthModal ({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState("");
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    api.health().then((d) => { if (alive) setData(d); },
      (exc) => { if (alive) setError(String(exc)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/70 p-4 pt-[12vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[70vh] w-full max-w-md flex-col rounded border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-2 text-sm">
          <span className="font-semibold text-slate-100">System health</span>
          <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="overflow-y-auto p-4">
          {error && <p className="text-xs text-rose-300">{error}</p>}
          {!data && !error && <p className="text-xs text-slate-400">Loading…</p>}
          {data && <HealthBody data={data} />}
        </div>
      </div>
    </div>
  );
}
