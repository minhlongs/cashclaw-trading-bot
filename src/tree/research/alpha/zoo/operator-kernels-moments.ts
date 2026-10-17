import { rolling, sumWin, type Series } from './operator-kernels-base';

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
