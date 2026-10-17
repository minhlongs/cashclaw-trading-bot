import { fromFloat, rolling, toFloat, type Series } from './operator-kernels-base';

export function delta(x: Series, d: number): Series {
  const a = toFloat(x);
  const out = new Float64Array(a.length).fill(Number.NaN);
  for (let t = d; t < a.length; t += 1) out[t] = a[t] - a[t - d];
  return fromFloat(out);
}

export function decayLinear(x: Series, n: number): Series {
  return rolling(x, n, (a, s, _e) => {
    const wsum = (n * (n + 1)) / 2;
    let acc = 0;
    for (let i = 0; i < n; i += 1) acc += (n - i) * a[s + i];
    return acc / wsum;
  });
}

export function signedPower(x: Series, p: number): Series {
  const a = toFloat(x);
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    const v = a[i];
    out[i] = Number.isNaN(v) ? Number.NaN : Math.sign(v) * Math.pow(Math.abs(v), p);
  }
  return fromFloat(out);
}
