import type { MrrSpreadParams, MrrSpreadResult } from './mrr-spread-types';

export function computeMrrSpread(p: MrrSpreadParams): MrrSpreadResult {
  const prices = p.prices, n = prices.length;
  if (n < 3) return { effectiveSpread: 0, adverseSelection: 0, orderProcessing: 0, tradeAutocorrelation: 0, sampleSize: 0 };
  const signs: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = p.tradeSigns?.[i] ?? (i === 0 ? 1 : prices[i]! > prices[i - 1]! ? 1 : prices[i]! < prices[i - 1]! ? -1 : signs[i - 1] ?? 1);
    signs.push(q);
  }
  let s1 = 0, s2 = 0, s12 = 0, count = 0;
  for (let t = 1; t < n; t++) {
    const dp = prices[t]! - prices[t - 1]!, qt = signs[t]!, prevQ = signs[t - 1]!;
    s1 += dp * qt; s2 += dp * prevQ; s12 += qt * prevQ; count++;
  }
  const gamma = Math.max(-0.99, Math.min(0.99, count > 0 ? s12 / count : 0));
  const det = Math.max(1e-4, 1 - gamma * gamma);
  const c1 = count > 0 ? (s1 / count - gamma * (s2 / count)) / det : 0;
  const c2 = count > 0 ? (s2 / count - gamma * (s1 / count)) / det : 0;
  const denom = Math.max(1e-4, 1 - gamma);
  const rawTheta = Math.max(0, (c1 + c2) / denom);
  const rawPhi = Math.max(0, c1 - rawTheta);
  const spread = 2 * (rawPhi + rawTheta);
  return { effectiveSpread: spread, adverseSelection: rawTheta, orderProcessing: rawPhi, tradeAutocorrelation: gamma, sampleSize: count };
}
