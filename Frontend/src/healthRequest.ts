import type { ActionDeadline, HealthPayload } from "./api";

export type HealthRequestResult =
  | { ok: true; data: HealthPayload }
  | { ok: false; error: string };

/** One owned request; cleanup and deadline settlement never wait for transport. */
export function startHealthRequest ({ action, request, onResult }: {
  action: ActionDeadline;
  request: (signal: AbortSignal) => Promise<HealthPayload>;
  onResult: (result: HealthRequestResult) => void;
}): () => void {
  let settled = false;
  const release = (): void => {
    action.clear();
    action.signal.removeEventListener("abort", onAbort);
  };
  const finish = (result: HealthRequestResult): void => {
    if (settled) return;
    settled = true;
    release();
    onResult(result);
  };
  const onAbort = (): void => {
    if (action.didTimeout()) {
      finish({ ok: false, error: "System health timed out after 10 seconds." });
    } else {
      settled = true;
      release();
    }
  };
  action.signal.addEventListener("abort", onAbort, { once: true });
  if (action.signal.aborted) {
    onAbort();
  } else {
    try {
      void request(action.signal).then(
        (data) => finish({ ok: true, data }),
        (errorValue) => finish({
          ok: false,
          error: `System health failed: ${String(errorValue).slice(0, 120)}`,
        }),
      );
    } catch (errorValue) {
      finish({
        ok: false,
        error: `System health failed: ${String(errorValue).slice(0, 120)}`,
      });
    }
  }
  return () => {
    if (settled) return;
    settled = true;
    release();
    action.controller.abort();
  };
}
