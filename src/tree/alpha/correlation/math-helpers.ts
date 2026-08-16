// Internal math helpers shared across the correlation module.

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** OLS regression: fit y = beta * x + alpha. Returns residuals. */
export function olsResiduals(x: number[], y: number[]): number[] {
  const n = Math.min(x.length, y.length);
  if (n < 2) return [];
  const mx = mean(x);
  const my = mean(y);
  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (x[i] - mx) * (y[i] - my);
    ssXX += (x[i] - mx) ** 2;
  }
  const beta = ssXX === 0 ? 0 : ssXY / ssXX;
  const alpha = my - beta * mx;
  return x.slice(0, n).map((xi, i) => y[i] - (beta * xi + alpha));
}
