import { rolling, type Series } from './operator-kernels-base';

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

export function tsArgmax(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    let best = s;
    for (let i = s + 1; i <= e; i += 1) if (a[i] > a[best]) best = i;
    return best - s;
  });
}

export function tsArgmin(x: Series, n: number): Series {
  return rolling(x, n, (a, s, e) => {
    let best = s;
    for (let i = s + 1; i <= e; i += 1) if (a[i] < a[best]) best = i;
    return best - s;
  });
}
