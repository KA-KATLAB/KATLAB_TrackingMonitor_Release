export type ChronicleState = "checking" | "missing" | "unavailable" | "ready";

interface ProbeRuntime {
  fetch: (input: string, init: RequestInit) => Promise<Pick<Response, "status">>;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (handle: number) => void;
}

const PROBE_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 10_000;
const browserRuntime: ProbeRuntime = {
  fetch: (input, init) => fetch(input, init),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

/** Probe only until a page is available; the opened reader owns its freshness. */
export function startChronicleProbe (
  onState: (state: ChronicleState) => void,
  runtime: ProbeRuntime = browserRuntime,
): () => void {
  let stopped = false;
  let retryTimer: number | undefined;
  let deadlineTimer: number | undefined;
  let activeController: AbortController | undefined;

  const probe = () => {
    if (stopped) return;
    retryTimer = undefined;
    const controller = new AbortController();
    activeController = controller;
    let settled = false;

    const finish = (state: ChronicleState) => {
      if (stopped || settled) return;
      settled = true;
      if (deadlineTimer !== undefined) runtime.clearTimeout(deadlineTimer);
      deadlineTimer = undefined;
      activeController = undefined;
      if (state === "ready") stopped = true;
      onState(state);
      if (!stopped) retryTimer = runtime.setTimeout(probe, RETRY_DELAY_MS);
    };

    deadlineTimer = runtime.setTimeout(() => {
      finish("unavailable");
      controller.abort();
    }, PROBE_TIMEOUT_MS);

    try {
      runtime.fetch("/chronicle/", {
        method: "HEAD", cache: "no-store", signal: controller.signal,
      }).then(
        (response) => finish(response.status === 200 ? "ready"
          : response.status === 404 ? "missing" : "unavailable"),
        () => finish("unavailable"),
      );
    } catch {
      finish("unavailable");
    }
  };

  probe();
  return () => {
    stopped = true;
    if (retryTimer !== undefined) runtime.clearTimeout(retryTimer);
    if (deadlineTimer !== undefined) runtime.clearTimeout(deadlineTimer);
    activeController?.abort();
    activeController = undefined;
  };
}
