// IC metric primitives (Phase 3, D4): Pearson IC, average-tie ranks,
// Spearman rankIC, summary stats, and IC information ratio.
// Pure, deterministic — no I/O, no randomness.

/** Pearson correlation of paired finite values; null when n<2 or zero variance. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Average-tie ranks (1-based): equal values share the mean of the rank
 * positions they occupy. Deterministic — ties resolved by value only.
 */
export function averageTieRanks(values: readonly number[]): readonly number[] {
  const n = values.length;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const ranks = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].v === order[i].v) j += 1;
    const avg = (i + j + 2) / 2; // mean of 1-based positions i+1..j+1
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation = Pearson of average-tie ranks. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  return pearson(averageTieRanks(xs), averageTieRanks(ys));
}

/** Mean/std (ddof=1) of a non-empty series; null when empty / std when n<2. */
export function meanStd(values: readonly number[]): { mean: number; std: number | null } | null {
  const n = values.length;
  if (n === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  if (n < 2) return { mean, std: null };
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  return { mean, std: Math.sqrt(ss / (n - 1)) };
}

/** IC information ratio = mean/std; null when <2 points or std==0/null. */
export function icInformationRatio(values: readonly number[]): number | null {
  const stats = meanStd(values);
  if (stats === null || stats.std === null || stats.std === 0) return null;
  return stats.mean / stats.std;
}
