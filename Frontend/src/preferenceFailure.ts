export interface PreferenceFailure {
  readonly persisted: boolean;
}

export interface PreferenceFailureStore {
  getSnapshot (): PreferenceFailure | null;
  subscribe (listener: () => void): () => void;
  publish (persisted: boolean): void;
  clear (): void;
}

export interface PreferenceFeedback {
  enabled: boolean;
  message: string;
  failed: boolean;
}

type PreferenceChannel = "sound" | "notify";

/** One bounded fact per channel; subscribers always read the current snapshot. */
export function createPreferenceFailureStore (): PreferenceFailureStore {
  let snapshot: PreferenceFailure | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try { listener(); } catch { /* one consumer cannot suppress another */ }
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe (listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish (persisted) {
      snapshot = Object.freeze({ persisted });
      emit();
    },
    clear () {
      if (snapshot === null) return;
      snapshot = null;
      emit();
    },
  };
}

/** Subscribe before reading, covering failures that occurred before mounting. */
export function observePreferenceFailure (store: PreferenceFailureStore,
  accept: (failure: PreferenceFailure) => void): () => void {
  let active = true;
  const report = () => {
    if (!active) return;
    const failure = store.getSnapshot();
    if (failure) {
      try { accept(failure); } catch { /* observation must not break the producer */ }
    }
  };
  const unsubscribe = store.subscribe(report);
  report();
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
}

export function backgroundPreferenceFeedback (channel: PreferenceChannel,
  failure: PreferenceFailure): PreferenceFeedback {
  const reason = channel === "sound"
    ? "Sounds are off for this page: audio activation or playback could not be confirmed."
    : "OS alerts are off for this page: browser notification access or delivery could not be confirmed.";
  return {
    enabled: false,
    failed: true,
    message: reason + " Check browser settings, then retry to opt in."
      + (failure.persisted ? "" : " Saving failed. An older opt-in may return after reload."),
  };
}

/** Background failure can arrive between native completion and its UI callback. */
export function withBackgroundPreferenceFailure (channel: PreferenceChannel,
  failure: PreferenceFailure | null, normal: PreferenceFeedback): PreferenceFeedback {
  return failure ? backgroundPreferenceFeedback(channel, failure) : normal;
}
