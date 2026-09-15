// Alpha Attribution Engine — regime helpers

import { RegimeLabel } from '@/tree/regime/types';

export function emptyRegimeBreakdown(): Record<RegimeLabel, { trades: number; pnl: number; winRate: number }> {
  const out: Partial<Record<RegimeLabel, { trades: number; pnl: number; winRate: number }>> = {};
  for (const label of Object.values(RegimeLabel)) {
    out[label] = { trades: 0, pnl: 0, winRate: 0 };
  }
  return out as Record<RegimeLabel, { trades: number; pnl: number; winRate: number }>;
}

/** Build a sorted regime lookup map from timestamp -> label. */
export function buildRegimeLookup(
  regimes: { timestamp: number; label: RegimeLabel }[],
): Map<number, RegimeLabel> {
  const sorted = [...regimes].sort((a, b) => a.timestamp - b.timestamp);
  const lookup = new Map<number, RegimeLabel>();
  for (const r of sorted) {
    lookup.set(r.timestamp, r.label);
  }
  return lookup;
}

/** Return the active regime label at a given timestamp. */
export function regimeAt(
  ts: number,
  regimeLookup: Map<number, RegimeLabel>,
): RegimeLabel {
  let result = RegimeLabel.UNKNOWN;
  for (const [t, label] of regimeLookup) {
    if (t <= ts) result = label;
    else break;
  }
  return result;
}
