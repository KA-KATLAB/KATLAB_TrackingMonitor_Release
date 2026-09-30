// WebSocket client with auto-reconnect. F29: every (re)connect fires
// onSync so the app re-fetches a REST snapshot - events missed while
// disconnected (server restart) must not stay invisible.

export interface WsMessage {
  type: "event_resolved" | "task_updated" | "repo_status_changed" | "commit_detected" | "warning"
    | "activity_recorded" | "evidence_updated" | "readiness_updated";
  id: string;
  data: Record<string, unknown>;
}

export function connectWs (
  onMessage: (msg: WsMessage) => void,
  onSync: () => void,
): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retryMs = 1000;
  let retry: { handle: ReturnType<typeof setTimeout> | null } | null = null;

  const detach = (candidate: WebSocket) => {
    candidate.onopen = null;
    candidate.onmessage = null;
    candidate.onclose = null;
    candidate.onerror = null;
  };
  const scheduleRetry = () => {
    if (closed || retry !== null) return;
    const owner: { handle: ReturnType<typeof setTimeout> | null } = { handle: null };
    retry = owner;
    owner.handle = setTimeout(() => {
      if (closed || retry !== owner) return;
      retry = null;
      open();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 15000);
  };

  const open = () => {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const candidate = new WebSocket(`${proto}://${location.host}/ws`);
    socket = candidate;
    const isCurrent = () => !closed && socket === candidate;
    candidate.onopen = () => {
      if (!isCurrent()) return;
      retryMs = 1000;
      onSync(); // F29
    };
    candidate.onmessage = (raw) => {
      if (!isCurrent()) return;
      try {
        onMessage(JSON.parse(raw.data) as WsMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    candidate.onclose = () => {
      if (!isCurrent()) return;
      socket = null;
      detach(candidate);
      scheduleRetry();
    };
    candidate.onerror = () => {
      if (isCurrent()) candidate.close();
    };
  };

  open();
  const keepalive = setInterval(() => {
    if (!closed && socket?.readyState === WebSocket.OPEN) socket.send("ping");
  }, 25000);

  return () => {
    if (closed) return;
    closed = true;
    if (retry !== null && retry.handle !== null) clearTimeout(retry.handle);
    retry = null;
    clearInterval(keepalive);
    const candidate = socket;
    socket = null;
    if (candidate) {
      detach(candidate);
      try { candidate.close(); } catch { /* logical teardown remains complete */ }
    }
  };
}
