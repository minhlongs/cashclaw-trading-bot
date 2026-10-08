export function normCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0.0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t *
      (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  }
  const t = 1.0 / (1.0 - p * x);
  return c * Math.exp(-x * x / 2.0) * t *
    (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
}

export function black76(
  callPut: 'C' | 'P',
  f: number, // forward price
  k: number, // strike price
  t: number, // time to maturity
  r: number, // risk-free rate
  v: number  // volatility
): number {
  if (t <= 0 || v <= 0) {
    if (callPut === 'C') return Math.max(0, (f - k) * Math.exp(-r * 0));
    return Math.max(0, (k - f) * Math.exp(-r * 0));
  }
  
  const d1 = (Math.log(f / k) + (v * v / 2.0) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  const df = Math.exp(-r * t);

  if (callPut === 'C') {
    return df * (f * normCdf(d1) - k * normCdf(d2));
  } else {
    return df * (k * normCdf(-d2) - f * normCdf(-d1));
  }
}
