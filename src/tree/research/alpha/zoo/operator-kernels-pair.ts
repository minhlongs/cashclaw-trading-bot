// Pair-series operator kernels (Phase 3 decision D2): ts_corr, ts_cov,
// safe_div. Pure, causal, NaN→null at the boundary. Mirrors base.py.

import { fromFloat, hasNaN, sumWin, toFloat, type Series } from './operator-kernels';

/** Rolling Pearson correlation, min_periods=n; zero-variance window → null. */
export function tsCorr(x: Series, y: Series, n: number): Series {
  const a = toFloat(x);
  const b = toFloat(y);
  const len = Math.min(a.length, b.length);
  const out = new Float64Array(a.length).fill(Number.NaN);
  for (let t = n - 1; t < len; t += 1) {
    const s = t - n + 1;
    if (hasNaN(a, s, t) || hasNaN(b, s, t)) continue;
    const mx = sumWin(a, s, t) / n;
    const my = sumWin(b, s, t) / n;
    let cxy = 0;
    let vx = 0;
    let vy = 0;
    for (let i = s; i <= t; i += 1) {
      const dx = a[i] - mx;
      const dy = b[i] - my;
      cxy += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    const denom = Math.sqrt(vx * vy);
    out[t] = denom > 0 ? cxy / denom : Number.NaN;
  }
  return fromFloat(out);
}

/** Rolling sample covariance (ddof=1), min_periods=n. Constant window → 0. */
export function tsCov(x: Series, y: Series, n: number): Series {
  const a = toFloat(x);
  const b = toFloat(y);
  const len = Math.min(a.length, b.length);
  const out = new Float64Array(a.length).fill(Number.NaN);
  for (let t = n - 1; t < len; t += 1) {
    const s = t - n + 1;
    if (hasNaN(a, s, t) || hasNaN(b, s, t)) continue;
    const mx = sumWin(a, s, t) / n;
    const my = sumWin(b, s, t) / n;
    let cxy = 0;
    for (let i = s; i <= t; i += 1) cxy += (a[i] - mx) * (b[i] - my);
    out[t] = cxy / (n - 1);
  }
  return fromFloat(out);
}

/** a/(b+eps·sign(b)); b null or ==0 → null (never silent inf or 0). */
export function safeDiv(a: Series, b: Series, eps = 1e-12): Series {
  const x = toFloat(a);
  const y = toFloat(b);
  const len = Math.min(x.length, y.length);
  const out = new Float64Array(x.length).fill(Number.NaN);
  for (let i = 0; i < len; i += 1) {
    const bv = y[i];
    if (Number.isNaN(bv) || bv === 0) continue;
    const r = x[i] / (bv + eps * Math.sign(bv));
    out[i] = Number.isFinite(r) ? r : Number.NaN;
  }
  return fromFloat(out);
}
