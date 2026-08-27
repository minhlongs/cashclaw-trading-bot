// IC metric primitives (Phase 3, D4): Pearson IC, average-tie ranks,
// Spearman rankIC, summary stats, rolling sign-consistency stability, and
// regime-conditioned grouping. Pure, deterministic — no I/O, no randomness.
//
// CAUSALITY NOTE (binding): every IC here correlates point-in-time scores
// with FORWARD returns — future data by definition. IC is therefore an
// EVALUATION metric only (how well past scores predicted realized returns);
// it must never be used for signal construction.

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

/**
 * IC stability — BINDING definition (D4): rolling-window sign consistency.
 * Over W consecutive VALID IC observations, count trailing windows whose mean
 * shares the sign of the full-sample mean IC; stability = matches/windows.
 * Null when fewer than 2 windows or full-sample mean == 0.
 */
export function signConsistencyStability(
  values: readonly number[],
  window: number,
): number | null {
  if (!Number.isInteger(window) || window < 1) {
    throw new Error(`signConsistencyStability: window must be a positive integer, got ${window}`);
  }
  const stats = meanStd(values);
  if (stats === null || stats.mean === 0) return null;
  const windowCount = values.length - window + 1;
  if (windowCount < 2) return null;
  let matches = 0;
  for (let start = 0; start < windowCount; start++) {
    let sum = 0;
    for (let k = start; k < start + window; k++) sum += values[k];
    const windowMean = sum / window;
    if ((windowMean > 0 && stats.mean > 0) || (windowMean < 0 && stats.mean < 0)) matches += 1;
  }
  return matches / windowCount;
}

/** Per-regime IC summary: mean + count for each observed label. */
export interface RegimeIcSummary {
  readonly label: string;
  readonly icMean: number;
  readonly count: number;
}

/**
 * Group valid IC observations by injected regime labels (regime-breakdown
 * pattern: labels arrive precomputed, keyed by timestamp; this module never
 * computes regimes itself). Unlabeled timestamps are skipped. Length
 * mismatch throws (fail-closed).
 */
export function regimeIcBreakdown(
  timestamps: readonly number[],
  icValues: readonly (number | null)[],
  labels: Readonly<Record<number, string>>,
): RegimeIcSummary[] {
  if (timestamps.length !== icValues.length) {
    throw new Error(
      `regimeIcBreakdown: timestamps.length (${timestamps.length}) !== icValues.length (${icValues.length})`,
    );
  }
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < timestamps.length; i++) {
    const ic = icValues[i];
    if (ic === null) continue;
    const label = labels[timestamps[i]];
    if (label === undefined) continue;
    const bucket = buckets.get(label);
    if (bucket === undefined) buckets.set(label, [ic]);
    else bucket.push(ic);
  }
  return [...buckets.entries()]
    .map(([label, values]) => ({
      label,
      // Buckets are only ever created by pushing a value, so never empty.
      icMean: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
