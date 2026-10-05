declare const __KATLAB_UI_VERSION__: string;

export const UI_BUILD_VERSION = __KATLAB_UI_VERSION__;

export function decodeAppVersion (value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\d+\.\d+\.\d+\.\d+$/.exec(value);
  return match && match[0] === value ? value : null;
}
