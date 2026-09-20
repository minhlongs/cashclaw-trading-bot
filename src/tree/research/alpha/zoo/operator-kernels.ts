// Operator kernels — pure numeric functions mirroring zoo base.py semantics
// (Phase 3 decision D2). Internal float64 with NaN sentinel; every public
// boundary converts NaN/±Inf → null (fail-closed, never fabricated). All
// kernels are causal: output[t] depends only on input[0..t]. No I/O.
// This file: single-series rolling domain operators. Base types/helpers live
// in operator-kernels-base.ts.

import {
  fromFloat,
  hasNaN,
  rolling,
  sumWin,
  toFloat,
  type Matrix,
  type Series,
} from './operator-kernels-base';

export {
  fromFloat,
  hasNaN,
  rolling,
  sumWin,
  toFloat,
  type Matrix,
  type Series,
};

export function tsMean(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => sumWin(a, s, e) / (e - s + 1));
}

export function tsStd(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    const cnt = e - s + 1;
    const mean = sumWin(a, s, e) / cnt;
    let ss = 0;
    for (let i = s; i <= e; i += 1) ss += (a[i] - mean) * (a[i] - mean);
    return cnt >= 2 ? Math.sqrt(ss / (cnt - 1)) : Number.NaN;
  });
}

export function tsMax(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    let m = a[s];
    for (let i = s + 1; i <= e; i += 1) if (a[i] > m) m = a[i];
    return m;
  });
}

export function tsMin(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    let m = a[s];
    for (let i = s + 1; i <= e; i += 1) if (a[i] < m) m = a[i];
    return m;
  });
}

/** Percentile (average-tie) rank of x[t] within trailing window; pct∈(0,1]. */
export function tsRank(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    const last = a[e];
    let less = 0;
    let eq = 0;
    for (let i = s; i <= e; i += 1) {
      if (a[i] < last) less += 1;
      else if (a[i] === last) eq += 1;
    }
    return (less + 0.5 * (eq + 1)) / (e - s + 1);
  });
}

/** 0-based offset from window start of the max; ties → first occurrence. */
export function tsArgmax(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    let best = s;
    for (let i = s + 1; i <= e; i += 1) if (a[i] > a[best]) best = i;
    return best - s;
  });
}

/** 0-based offset from window start of the min; ties → first occurrence. */
export function tsArgmin(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    let best = s;
    for (let i = s + 1; i <= e; i += 1) if (a[i] < a[best]) best = i;
    return best - s;
  });
}

/** First difference at lag d: x[t] − x[t−d]; d≥1 enforced by the parser. */
export function delta(x: Series, d: number): Series {
  const a = toFloat(x);
  const out = new Float64Array(a.length).fill(Number.NaN);
  for (let t = d; t < a.length; t += 1) out[t] = a[t] - a[t - d];
  return fromFloat(out);
}

/** Linear decay-weighted mean, weights n..1 (oldest..newest) normalized. */
export function decayLinear(x: Series, n: number): Series {
  return rolling(x, n, (a, s, _e) => {
    const wsum = (n * (n + 1)) / 2;
    let acc = 0;
    for (let i = 0; i < n; i += 1) acc += (n - i) * a[s + i];
    return acc / wsum;
  });
}

/** sign(x)·|x|^p — preserves sign; never produces complex output. */
export function signedPower(x: Series, p: number): Series {
  const a = toFloat(x);
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    const v = a[i];
    out[i] = Number.isNaN(v) ? Number.NaN : Math.sign(v) * Math.pow(Math.abs(v), p);
  }
  return fromFloat(out);
}
