// Operator kernels base types & trailing-window helpers (Phase 3 decision D2).
// Internal float64 with NaN sentinel; every public boundary converts NaN/±Inf → null.
// All kernels are causal: output[t] depends only on input[0..t]. No I/O.

export type Series = readonly (number | null)[];
export type Matrix = readonly Series[]; // [symbol][time]

export function toFloat(s: Series): Float64Array {
  const out = new Float64Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const v = s[i];
    out[i] = v === null || !Number.isFinite(v) ? Number.NaN : v;
  }
  return out;
}

export function fromFloat(a: Float64Array): (number | null)[] {
  const out: (number | null)[] = new Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = Number.isFinite(a[i]) ? a[i] : null;
  return out;
}

export function hasNaN(a: Float64Array, start: number, end: number): boolean {
  for (let i = start; i <= end; i += 1) if (Number.isNaN(a[i])) return true;
  return false;
}

export function sumWin(a: Float64Array, start: number, end: number): number {
  let r = 0;
  for (let i = start; i <= end; i += 1) r += a[i];
  return r;
}

/** Trailing-window reducer with min_periods=n (any NaN in window → NaN). */
export function rolling(
  x: Series,
  n: number,
  reduce: (a: Float64Array, start: number, end: number) => number,
): (number | null)[] {
  const a = toFloat(x);
  const out = new Float64Array(a.length).fill(Number.NaN);
  for (let t = n - 1; t < a.length; t += 1) {
    const s = t - n + 1;
    if (hasNaN(a, s, t)) continue;
    out[t] = reduce(a, s, t);
  }
  return fromFloat(out);
}
