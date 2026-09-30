export interface PreferenceToggleResult {
  enabled: boolean;
  persisted: boolean;
}

/** Optional persistence must not prevent the app from rendering. */
export function readPreference (key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** False means the caller must not claim that a choice was saved. */
export function writePreference (key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
