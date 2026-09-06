import type { StatsData } from "./charts";

export const IDENTITY_PALETTE = [
  "#14b8a6", "#0284c7", "#4f46e5", "#f59e0b",
  "#a855f7", "#f43f5e", "#059669", "#64748b",
] as const;
export const IDENTITY_OTHER_COLOR = "#334155";

export interface IdentitySlice {
  key: string;
  label: string;
  count: number;
  color: string;
  sourceOrdinal: number;
}

export interface IdentityData {
  total: number;
  slices: IdentitySlice[];
  presentation: "donut" | "bar";
}

/** One shared identity slice/order/remainder/palette decision for app and report. */
export function buildIdentityData (identity: StatsData["identity"]): IdentityData {
  const total = Math.max(0, identity.ext_total);
  const extensionTotal = identity.extensions.reduce((sum, row) => sum + row.count, 0);
  const slices: IdentitySlice[] = identity.extensions
    .map((row, sourceOrdinal) => ({
      key: JSON.stringify(["extension", sourceOrdinal, row.ext]),
      label: row.ext || "(no ext)",
      count: row.count,
      color: IDENTITY_PALETTE[sourceOrdinal % IDENTITY_PALETTE.length],
      sourceOrdinal,
    }))
    .filter((slice) => slice.count > 0);
  const remainder = Math.max(0, total - extensionTotal);
  if (remainder > 0) {
    slices.push({
      key: JSON.stringify(["remainder", "other"]),
      label: "other",
      count: remainder,
      color: IDENTITY_OTHER_COLOR,
      sourceOrdinal: identity.extensions.length,
    });
  }
  return {
    total,
    slices,
    presentation: slices.length > 5 ? "bar" : "donut",
  };
}
