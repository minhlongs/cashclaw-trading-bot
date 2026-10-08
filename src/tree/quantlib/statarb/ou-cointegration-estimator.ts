// Ornstein-Uhlenbeck Process Estimation: dx_t = theta * (mu - x_t) * dt + sigma * dW_t
import type { OuProcessMetrics } from './statarb-types';

export function estimateOuParameters(series: readonly number[], dt = 1.0): OuProcessMetrics {
  const n = series.length;
  if (n < 3) {
    return {
      theta: 0,
      mu: series[0] ?? 0,
      sigma: 0,
      halfLifeBars: Infinity,
      equilibriumStd: 0,
    };
  }

  // Linear regression: x_t = a * x_{t-1} + b + epsilon
  let sumX = 0;
  let sumY = 0;
  let sumXx = 0;
  let sumXy = 0;

  for (let i = 1; i < n; i++) {
    const xPrev = series[i - 1];
    const xCurr = series[i];
    sumX += xPrev;
    sumY += xCurr;
    sumXx += xPrev * xPrev;
    sumXy += xPrev * xCurr;
  }

  const k = n - 1;
  const denominator = k * sumXx - sumX * sumX;

  if (Math.abs(denominator) < 1e-12) {
    return {
      theta: 0,
      mu: sumY / k,
      sigma: 0,
      halfLifeBars: Infinity,
      equilibriumStd: 0,
    };
  }

  const a = (k * sumXy - sumX * sumY) / denominator;
  const b = (sumY - a * sumX) / k;

  // Compute residuals variance
  let sumResSq = 0;
  for (let i = 1; i < n; i++) {
    const res = series[i] - (a * series[i - 1] + b);
    sumResSq += res * res;
  }
  const resVar = sumResSq / Math.max(1, k - 2);

  // Discrete to continuous conversion:
  // a = exp(-theta * dt) => theta = -ln(a) / dt
  if (a <= 0 || a >= 1.0) {
    // Non-stationary or explosive
    return {
      theta: 0,
      mu: b / (1 - a || 1),
      sigma: Math.sqrt(Math.max(0, resVar)),
      halfLifeBars: Infinity,
      equilibriumStd: 0,
    };
  }

  const theta = -Math.log(a) / dt;
  const mu = b / (1 - a);
  const sigma = Math.sqrt((resVar * 2 * theta) / (1 - a * a));
  const halfLifeBars = Math.log(2) / theta;
  const equilibriumStd = sigma / Math.sqrt(2 * theta);

  return {
    theta: Math.round(theta * 1e6) / 1e6,
    mu: Math.round(mu * 1e6) / 1e6,
    sigma: Math.round(sigma * 1e6) / 1e6,
    halfLifeBars: Math.round(halfLifeBars * 1e2) / 1e2,
    equilibriumStd: Math.round(equilibriumStd * 1e6) / 1e6,
  };
}
