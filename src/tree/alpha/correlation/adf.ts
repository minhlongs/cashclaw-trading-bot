// Simplified Engle-Granger cointegration test.
// No statsmodels dependency — uses a basic ADF approximation.

import type { IndicatorCandle } from '../indicator-types';
import { mean, stddev, olsResiduals } from './math-helpers';

/**
 * Simplified Engle-Granger cointegration test.
 * Steps: (1) OLS regression y ~ x, (2) ADF-style test on residuals.
 * Returns { cointegrated, pValue } where pValue is approximate.
 */
export function testCointegration(
  candles1: readonly IndicatorCandle[],
  candles2: readonly IndicatorCandle[],
): { cointegrated: boolean; pValue: number } {
  const closes1 = candles1.map((c) => c.close);
  const closes2 = candles2.map((c) => c.close);
  const n = Math.min(closes1.length, closes2.length);

  if (n < 10) return { cointegrated: false, pValue: 1 };

  const residuals = olsResiduals(closes1, closes2);

  // Constant residuals => perfect cointegration (zero spread variance)
  if (stddev(residuals) === 0) {
    return { cointegrated: true, pValue: 0 };
  }

  // ADF test: regress delta(res) on res_lag
  const resLag: number[] = [];
  const deltaRes: number[] = [];
  for (let i = 1; i < residuals.length; i++) {
    resLag.push(residuals[i - 1]);
    deltaRes.push(residuals[i] - residuals[i - 1]);
  }

  const mLag = mean(resLag);
  const mDelta = mean(deltaRes);
  let ssResLagDelta = 0;
  let ssResLag2 = 0;
  for (let i = 0; i < resLag.length; i++) {
    ssResLagDelta += (resLag[i] - mLag) * (deltaRes[i] - mDelta);
    ssResLag2 += (resLag[i] - mLag) ** 2;
  }
  const gamma = ssResLag2 === 0 ? 0 : ssResLagDelta / ssResLag2;

  // t-statistic for gamma
  const predDelta = resLag.map((rl) => mDelta + gamma * (rl - mLag));
  const sse = deltaRes.reduce((s, d, i) => s + (d - predDelta[i]) ** 2, 0);
  const mse = sse / (deltaRes.length - 2);
  const seGamma = ssResLag2 === 0 ? 0 : Math.sqrt(mse / ssResLag2);
  const tStat = seGamma === 0 ? 0 : gamma / seGamma;

  const pValue = adfApproxPValue(tStat);
  return { cointegrated: pValue < 0.05, pValue };
}

/**
 * Approximate ADF p-value using a simplified MacKinnon response surface.
 * ADF critical values (approx): 1% = -3.43, 5% = -2.86, 10% = -2.57
 */
function adfApproxPValue(tStat: number): number {
  const k = 1.8; // steepness
  const midpoint = -2.86; // 5% critical value
  return 1 / (1 + Math.exp(-k * (tStat - midpoint)));
}
