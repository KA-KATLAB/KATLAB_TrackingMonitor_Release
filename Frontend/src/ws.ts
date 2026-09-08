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

  const open = () => {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/ws`);
    socket.onopen = () => {
      retryMs = 1000;
      onSync(); // F29
    };
    socket.onmessage = (raw) => {
      try {
        onMessage(JSON.parse(raw.data) as WsMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      if (!closed) {
        setTimeout(open, retryMs);
        retryMs = Math.min(retryMs * 2, 15000);
      }
    };
    socket.onerror = () => socket?.close();
  };

  open();
  const keepalive = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
  }, 25000);

  return () => {
    closed = true;
    clearInterval(keepalive);
    socket?.close();
  };
}
