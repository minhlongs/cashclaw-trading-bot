// Cross-sectional operator kernels (Phase 3 decision D2): rank, zscore,
// scale. Act across symbols at each timestamp. Pure, NaN→null at boundary.
// rank: average ties, percentile in (0,1]; zscore: ddof=1, zero std → null;
// scale: L1 normalize to target a, absSum==0 → null.

import type { Matrix } from './operator-kernels';

function columnValues(m: Matrix, t: number): { value: number; symbol: number }[] {
  const vals: { value: number; symbol: number }[] = [];
  for (let s = 0; s < m.length; s += 1) {
    const v = m[s][t];
    if (v !== null && Number.isFinite(v)) vals.push({ value: v, symbol: s });
  }
  return vals;
}

/** Cross-sectional percentile rank per timestamp; average ties; pct∈(0,1]. */
export function rankCross(m: Matrix): Matrix {
  const nT = m.length === 0 ? 0 : m[0].length;
  const out: (number | null)[][] = m.map((row) => new Array<number | null>(row.length).fill(null));
  for (let t = 0; t < nT; t += 1) {
    const vals = columnValues(m, t);
    if (vals.length === 0) continue;
    const sorted = [...vals].sort((p, q) => p.value - q.value);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k += 1) out[sorted[k].symbol][t] = avgRank / vals.length;
      i = j;
    }
  }
  return out;
}

/** Cross-sectional z-score per timestamp (ddof=1); zero/null std → null. */
export function zscoreCross(m: Matrix): Matrix {
  const nT = m.length === 0 ? 0 : m[0].length;
  const out: (number | null)[][] = m.map((row) => new Array<number | null>(row.length).fill(null));
  for (let t = 0; t < nT; t += 1) {
    const vals = columnValues(m, t);
    if (vals.length < 2) continue;
    const mean = vals.reduce((acc, p) => acc + p.value, 0) / vals.length;
    let ss = 0;
    for (const p of vals) ss += (p.value - mean) * (p.value - mean);
    const std = Math.sqrt(ss / (vals.length - 1));
    if (!(std > 0)) continue;
    for (const p of vals) out[p.symbol][t] = (p.value - mean) / std;
  }
  return out;
}

/** Cross-sectional L1 normalize per timestamp; absSum==0/all-null → null. */
export function scaleCross(m: Matrix, a: number): Matrix {
  const nT = m.length === 0 ? 0 : m[0].length;
  const out: (number | null)[][] = m.map((row) => new Array<number | null>(row.length).fill(null));
  for (let t = 0; t < nT; t += 1) {
    const vals = columnValues(m, t);
    const absSum = vals.reduce((acc, p) => acc + Math.abs(p.value), 0);
    if (vals.length === 0 || !(absSum > 0)) continue;
    for (const p of vals) out[p.symbol][t] = (p.value * a) / absSum;
  }
  return out;
}
